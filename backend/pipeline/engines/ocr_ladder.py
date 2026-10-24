"""
Scanned Page OCR Ladder (Guide §8.6).

Implements the multi-level offline OCR ladder for scanned pages:
- start_level: L1 if colour/light overlay or uneven background, else L0
- Engine order: offline [Docling+RapidOCR]
- Coordinate back-mapping: map_bbox_to_source(b, meta)
- Engine-specific quality scoring: text_sanity x word_density (uncalibrated)
- Honest failure handling: returns explicit NOT_CHECKED / NEEDS_REVIEW_OCR when models/engines are missing
"""

import math
from typing import Any
import numpy as np

from backend.pipeline.preprocess import preprocess_raster_page, map_bbox_to_source
from backend.pipeline.router import text_sanity
from backend.pipeline.engines.docling_engine import (
    convert_with_docling,
    check_docling_available,
    DoclingModelsMissingError,
    DoclingUnavailableError
)


def compute_quality_score(text: str, page_area_px: float) -> tuple[float, str, bool]:
    """
    Compute engine-specific quality score (Guide §8.6).
    Uses text_sanity * min(1.0, word_density * factor).
    Returns: (score, method, calibrated=False)
    """
    if not text or not text.strip():
        return 0.0, "text_sanity_density", False
        
    sanity = text_sanity(text)
    words = len(text.split())
    # Standard A4 at 300 DPI is ~2480x3508 ~= 8.7M px; ~400 words is standard dense text
    expected_density = words / max(1.0, page_area_px / 1_000_000.0)
    density_factor = min(1.0, expected_density / 40.0)
    
    score = round(max(0.0, min(1.0, sanity * density_factor)), 3)
    return score, "text_sanity_density", False


def run_scanned_ocr_ladder(
    page_bgr: np.ndarray,
    page_index: int, # 1-based page index
    dpi: int = 300,
    synthetic_ocr_fn: Any | None = None, # Optional test injector
) -> dict[str, Any]:
    """
    Execute OCR ladder on a single scanned page raster.
    Returns structured page payload result:
      {
        "status": "SUCCESS" | "NEEDS_REVIEW_OCR" | "NOT_CHECKED",
        "error_class": str | None,
        "reason": str,
        "level": int,
        "quality": {"score": float, "method": str, "calibrated": bool},
        "preprocess": meta,
        "tables": list[dict],
        "blocks": list[dict],
        "markdown": str
      }
    """
    sh, sw = page_bgr.shape[:2]
    page_area_px = float(sw * sh)

    # 1. Run preprocessing (start_level L0 or L1 based on overlays)
    gray_prep, prep_meta = preprocess_raster_page(page_bgr, dpi=dpi)
    start_level = prep_meta["level"]

    # 2. Check engine availability
    docling_ready, docling_reason = check_docling_available()
    
    # If a synthetic/injected OCR test runner is provided (for offline testing without 2GB weights)
    if synthetic_ocr_fn is not None:
        try:
            res = synthetic_ocr_fn(gray_prep, prep_meta, page_index)
            # Map boxes back to original source raster
            mapped_blocks = []
            for b in res.get("blocks", []):
                mb = dict(b)
                mb["bbox_norm"] = map_bbox_to_source(b["bbox_norm"], prep_meta)
                mapped_blocks.append(mb)

            mapped_tables = []
            for t in res.get("tables", []):
                mt = dict(t)
                mt["bbox_norm"] = map_bbox_to_source(t["bbox_norm"], prep_meta)
                mapped_tables.append(mt)

            q_score, q_method, q_cal = compute_quality_score(res.get("text", ""), page_area_px)
            return {
                "status": "SUCCESS",
                "error_class": None,
                "reason": "Synthetic OCR ladder accepted",
                "level": start_level,
                "quality": {"score": q_score, "method": q_method, "calibrated": q_cal},
                "preprocess": prep_meta,
                "tables": mapped_tables,
                "blocks": mapped_blocks,
                "markdown": res.get("markdown", "")
            }
        except Exception as e:
            return {
                "status": "NOT_CHECKED",
                "error_class": "ocr_engine_failure",
                "reason": f"Synthetic OCR function error: {str(e)}",
                "level": start_level,
                "quality": {"score": 0.0, "method": "none", "calibrated": False},
                "preprocess": prep_meta,
                "tables": [],
                "blocks": [],
                "markdown": ""
            }

    if not docling_ready:
        # Honest reporting per Guide §8.6 and §20.1
        return {
            "status": "NOT_CHECKED",
            "error_class": "docling_models_missing" if "models_missing" in docling_reason else "docling_not_installed",
            "reason": docling_reason,
            "level": start_level,
            "quality": {"score": 0.0, "method": "none", "calibrated": False},
            "preprocess": prep_meta,
            "tables": [],
            "blocks": [],
            "markdown": ""
        }

    # If Docling is fully installed and models are present
    import tempfile
    import cv2
    with tempfile.NamedTemporaryFile(suffix=".png", delete=True) as tmp:
        cv2.imwrite(tmp.name, gray_prep)
        try:
            tables, blocks, md, conf = convert_with_docling(
                tmp.name,
                ocr=True,
                full_page=True,
                metas=[prep_meta]
            )
            # Fix page indexing to page_index
            for t in tables:
                t["page"] = page_index
            for b in blocks:
                b["page"] = page_index

            full_text = " ".join(b["text"] for b in blocks)
            q_score, q_method, q_cal = compute_quality_score(full_text, page_area_px)

            status = "SUCCESS" if q_score >= 0.50 else "NEEDS_REVIEW_OCR"
            return {
                "status": status,
                "error_class": None if status == "SUCCESS" else "low_ocr_quality",
                "reason": "OCR ladder completed" if status == "SUCCESS" else "Please upload a clearer scan (low OCR quality score)",
                "level": start_level,
                "quality": {"score": q_score, "method": q_method, "calibrated": q_cal},
                "preprocess": prep_meta,
                "tables": tables,
                "blocks": blocks,
                "markdown": md
            }
        except Exception as e:
            return {
                "status": "NOT_CHECKED",
                "error_class": "docling_execution_error",
                "reason": f"Docling execution failed: {str(e)}",
                "level": start_level,
                "quality": {"score": 0.0, "method": "none", "calibrated": False},
                "preprocess": prep_meta,
                "tables": [],
                "blocks": [],
                "markdown": ""
            }
