"""
Docling Offline Extraction Engine (Guide §8.3, §8.4).

Wraps Docling converters with pinned options and strict offline isolation:
- artifacts_path checked before execution (default /models/docling or DOCLING_ARTIFACTS_PATH)
- enable_remote_services forced to False
- HF_HUB_OFFLINE set to 1
- TableFormer ACCURATE mode
- Coordinate normalization mapped back to original page raster via map_bbox_to_source (§8.4)
- Explicit DoclingModelsMissingError raised when models are not provisioned
"""

import os
from typing import Any
import numpy as np

from backend.pipeline.preprocess import map_bbox_to_source


class DoclingUnavailableError(Exception):
    """Raised when docling library is not installed in the environment."""
    pass


class DoclingModelsMissingError(Exception):
    """Raised when required offline model weights are missing from artifacts_path."""
    pass


def get_artifacts_path() -> str:
    """Resolve artifacts directory for Docling models."""
    return os.environ.get("DOCLING_ARTIFACTS_PATH", "/models/docling")


def check_docling_available() -> tuple[bool, str]:
    """Check if docling library and pre-provisioned offline models are present."""
    try:
        import docling # noqa: F401
    except ImportError:
        return False, "docling_library_not_installed"

    artifacts_path = get_artifacts_path()
    if not os.path.exists(artifacts_path) or not os.listdir(artifacts_path):
        return False, f"docling_models_missing: Models missing in {artifacts_path}; run 'aicte models pull'"

    return True, "ready"


def convert_with_docling(
    file_path: str,
    ocr: bool = False,
    full_page: bool = False,
    langs: list[str] | None = None,
    metas: list[dict[str, Any] | None] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str, float]:
    """
    Execute Docling conversion on input document.
    Enforces offline isolation (enable_remote_services=False, HF_HUB_OFFLINE=1).
    Maps coordinates back to original un-preprocessed page raster via norm() (Guide §8.4).
    """
    ready, reason = check_docling_available()
    if not ready:
        if "not_installed" in reason:
            raise DoclingUnavailableError(reason)
        raise DoclingModelsMissingError(reason)

    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["DOCLING_ARTIFACTS_PATH"] = get_artifacts_path()

    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
    try:
        from docling.datamodel.pipeline_options import RapidOcrOptions
    except ImportError:
        RapidOcrOptions = None

    artifacts = get_artifacts_path()
    opts = PdfPipelineOptions(artifacts_path=artifacts)
    opts.do_ocr = ocr
    opts.do_table_structure = True
    opts.document_timeout = 120
    opts.enable_remote_services = False
    opts.table_structure_options.mode = TableFormerMode.ACCURATE

    if ocr and RapidOcrOptions is not None:
        opts.ocr_options = RapidOcrOptions(force_full_page_ocr=full_page)

    converter = DocumentConverter(
        format_options={"pdf": PdfFormatOption(pipeline_options=opts)}
    )

    result = converter.convert(file_path)
    doc = result.document

    tables = []
    blocks = []
    engine_name = "docling_rapidocr" if ocr else "docling_no_ocr"

    # Extract tables
    for idx, table in enumerate(doc.tables):
        t_id = f"T{idx + 1}"
        page_no = 1
        bbox_norm = [0.0, 0.0, 1.0, 1.0]

        if table.prov and len(table.prov) > 0:
            p = table.prov[0]
            page_no = p.page_no
            # Normalise bounding box
            pg = doc.pages[page_no]
            b = p.bbox.to_top_left_origin(pg.size.height)
            box = [
                float(b.l / pg.size.width),
                float(b.t / pg.size.height),
                float(b.r / pg.size.width),
                float(b.b / pg.size.height)
            ]
            meta = metas[page_no - 1] if metas and (page_no - 1) < len(metas) else None
            bbox_norm = map_bbox_to_source(box, meta) if meta is not None else box

        # Extract cells
        cells = []
        n_rows = table.num_rows
        n_cols = table.num_cols
        for cell in table.cells:
            cells.append({
                "r": cell.row_span.start,
                "c": cell.col_span.start,
                "raw": cell.text or "",
                "value": cell.text or "",
                "kind": "text",
                "repaired": False
            })

        tables.append({
            "table_id": t_id,
            "page": page_no,
            "bbox_norm": [round(x, 4) for x in bbox_norm],
            "bbox_precision": "table",
            "n_rows": n_rows,
            "n_cols": n_cols,
            "cells": cells,
            "markdown": table.export_to_markdown(),
            "engine": engine_name
        })

    # Extract text items
    for idx, item in enumerate(doc.texts):
        b_id = f"B{idx + 1}"
        page_no = 1
        bbox_norm = [0.0, 0.0, 1.0, 1.0]
        if item.prov and len(item.prov) > 0:
            p = item.prov[0]
            page_no = p.page_no
            pg = doc.pages[page_no]
            b = p.bbox.to_top_left_origin(pg.size.height)
            box = [
                float(b.l / pg.size.width),
                float(b.t / pg.size.height),
                float(b.r / pg.size.width),
                float(b.b / pg.size.height)
            ]
            meta = metas[page_no - 1] if metas and (page_no - 1) < len(metas) else None
            bbox_norm = map_bbox_to_source(box, meta) if meta is not None else box

        blocks.append({
            "id": b_id,
            "page": page_no,
            "label": getattr(item, "label", "text"),
            "text": item.text or "",
            "bbox_norm": [round(x, 4) for x in bbox_norm],
            "bbox_precision": "block",
            "engine": engine_name
        })

    markdown_view = doc.export_to_markdown()
    confidence = float(getattr(result, "confidence", 0.90))
    return tables, blocks, markdown_view, confidence
