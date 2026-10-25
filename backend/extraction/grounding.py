"""
S6b Grounding and Bounding-Box Refinement Engine (Guide §11.3).

Implements provenance-first grounding:
- Provenance first: matched block_id or table cell restricts candidate pool.
- Ambiguous match prevention: repeated values without provenance return AMBIGUOUS_MATCH (grounded=False).
- Word-precision refinement: searches original PDF page with PyMuPDF clipped to block bbox.
"""

import difflib
from typing import Any
import pymupdf


def ground(
    raw: str,
    blocks: list[dict[str, Any]],
    *,
    block_id: str | None = None,
    cell: Any | None = None,
    page_hint: int | None = None,
    min_ratio: int = 85,
    pdf_bytes: bytes | None = None,
) -> dict[str, Any]:
    """
    Ground raw extracted string to source page and bounding box.
    Returns: {
        "grounded": bool,
        "page": int | None,
        "bbox_norm": [x0, y0, x1, y1] | None,
        "bbox_precision": "word" | "block" | None,
        "score": float,
        "source_ref": str | None,
        "reason": str | None,
        "candidates": list[str] | None
    }
    """
    if not raw or not raw.strip():
        return {"grounded": False, "reason": "EMPTY_INPUT", "page": None, "bbox_norm": None, "bbox_precision": None, "score": 0.0, "source_ref": None}

    v = raw.strip().lower()

    # 1. Pool selection: Provenance first
    if cell:
        # Table cell provenance: cell is (table_id, r, c) or dict
        cell_ref = f"T_{cell[0]}_R{cell[1]}_C{cell[2]}" if isinstance(cell, (list, tuple)) else str(cell)
        pool = [b for b in blocks if b.get("id") == cell_ref or b.get("source_ref") == cell_ref]
        if not pool:
            # Fallback to page hint
            pool = [b for b in blocks if not page_hint or b.get("page") == page_hint]
    elif block_id:
        pool = [b for b in blocks if b.get("id") == block_id]
    else:
        pool = [b for b in blocks if not page_hint or b.get("page") == page_hint]

    # 2. Substring matching in pool
    hits = [b for b in pool if v in b.get("text", "").lower()]

    if len(hits) == 1 or (hits and (block_id or cell)):
        hit = hits[0]
        score = 100.0
    elif len(hits) > 1:
        # Same value in several blocks and no provenance: do NOT guess (Guide §11.3)
        return {
            "grounded": False,
            "reason": "AMBIGUOUS_MATCH",
            "candidates": [b.get("id", "") for b in hits],
            "page": hits[0].get("page"),
            "bbox_norm": None,
            "bbox_precision": None,
            "score": 0.0,
            "source_ref": None
        }
    elif len(v) >= 6:
        # Fuzzy fallback only for long strings, only inside pool
        best_b = None
        best_score = 0.0
        for b in pool:
            b_text = b.get("text", "").lower()
            ratio = difflib.SequenceMatcher(None, v, b_text).ratio() * 100.0
            if ratio > best_score:
                best_score = ratio
                best_b = b

        if best_score >= min_ratio and best_b is not None:
            hit = best_b
            score = round(best_score, 1)
        else:
            hit = None
            score = 0.0
    else:
        hit = None
        score = 0.0

    if not hit:
        return {
            "grounded": False,
            "reason": "NOT_FOUND",
            "page": None,
            "bbox_norm": None,
            "bbox_precision": None,
            "score": 0.0,
            "source_ref": None
        }

    # Base block-level coordinates
    page_num = hit.get("page", 1)
    bbox_norm = hit.get("bbox_norm")
    bbox_precision = hit.get("bbox_precision", "block")
    source_ref = cell_ref if cell else hit.get("id")

    # 3. Word-precision refinement on digital pages (Guide §11.3)
    if pdf_bytes and page_num:
        try:
            doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
            if page_num <= len(doc):
                page_obj = doc[page_num - 1]
                pw, ph = page_obj.rect.width, page_obj.rect.height
                
                # Clip search to block bbox if present
                clip_rect = None
                if bbox_norm and len(bbox_norm) == 4:
                    clip_rect = pymupdf.Rect(
                        bbox_norm[0] * pw,
                        bbox_norm[1] * ph,
                        bbox_norm[2] * pw,
                        bbox_norm[3] * ph
                    )
                
                rects = page_obj.search_for(raw.strip(), clip=clip_rect)
                if not rects:
                    # Retry without clip
                    rects = page_obj.search_for(raw.strip())

                if rects:
                    r = rects[0]
                    bbox_norm = [
                        round(max(0.0, min(1.0, r.x0 / pw)), 4),
                        round(max(0.0, min(1.0, r.y0 / ph)), 4),
                        round(max(0.0, min(1.0, r.x1 / pw)), 4),
                        round(max(0.0, min(1.0, r.y1 / ph)), 4)
                    ]
                    bbox_precision = "word"
        except Exception:
            pass

    return {
        "grounded": True,
        "page": page_num,
        "bbox_norm": bbox_norm,
        "bbox_precision": bbox_precision,
        "score": score,
        "source_ref": source_ref,
        "reason": None
    }
