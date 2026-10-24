"""
Born-Digital PDF Extraction Engine (Guide §8.1).

Extracts vector text blocks and structured tables directly from born-digital PDF pages:
- Uses PyMuPDF's layout and table finders without OCR
- Normalizes coordinates to [0, 1] with top-left origin
- Preserves 1-based page indexing
- Generates structured C1 tables and text blocks
"""

from typing import Any
import pymupdf


def extract_digital_page(
    doc: pymupdf.Document,
    page_index: int, # 1-based page number
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str]:
    """
    Extract digital blocks and tables from a single page of a PDF document.
    Returns: (tables, blocks, page_markdown)
    """
    page = doc[page_index - 1]
    pw, ph = float(page.rect.width), float(page.rect.height)
    if pw <= 0 or ph <= 0:
        pw, ph = 1.0, 1.0

    tables = []
    blocks = []
    md_lines = [f"# Page {page_index}"]

    # 1. Extract tables using PyMuPDF find_tables()
    table_bboxes = []
    try:
        tabs = page.find_tables()
        for idx, tab in enumerate(tabs):
            t_id = f"T{page_index}_{idx + 1}"
            r_rect = tab.bbox # (x0, y0, x1, y1)
            t_bbox = [
                round(max(0.0, min(1.0, r_rect[0] / pw)), 4),
                round(max(0.0, min(1.0, r_rect[1] / ph)), 4),
                round(max(0.0, min(1.0, r_rect[2] / pw)), 4),
                round(max(0.0, min(1.0, r_rect[3] / ph)), 4)
            ]
            table_bboxes.append(r_rect)

            tab_data = tab.extract()
            n_rows = len(tab_data)
            n_cols = max((len(r) for r in tab_data), default=0)

            cells = []
            for r_idx, r in enumerate(tab_data):
                for c_idx, cell_text in enumerate(r):
                    raw_str = (cell_text or "").strip()
                    cells.append({
                        "r": r_idx,
                        "c": c_idx,
                        "raw": raw_str,
                        "value": raw_str,
                        "kind": "text",
                        "repaired": False
                    })

            # Markdown representation of the table
            t_md_lines = []
            if n_rows > 0:
                t_md_lines.append("| " + " | ".join((c or "").strip() for c in tab_data[0]) + " |")
                t_md_lines.append("| " + " | ".join(["---"] * n_cols) + " |")
                for r in tab_data[1:]:
                    t_md_lines.append("| " + " | ".join((c or "").strip().replace("\n", " ") for c in r) + " |")
            t_md = "\n".join(t_md_lines)

            tables.append({
                "table_id": t_id,
                "page": page_index,
                "bbox_norm": t_bbox,
                "bbox_precision": "table",
                "n_rows": n_rows,
                "n_cols": n_cols,
                "cells": cells,
                "markdown": t_md,
                "engine": "docling_no_ocr"
            })
            md_lines.append(t_md)
    except Exception:
        # Fallback if find_tables fails on complex or unbordered tables
        pass

    # 2. Extract text blocks (excluding regions already captured by tables)
    text_blocks = page.get_text("blocks") or []
    b_count = 1
    for b in text_blocks:
        bx0, by0, bx1, by1, btext, bno, btype = b[:7]
        # Skip image blocks (btype == 1)
        if btype == 1:
            continue
        
        clean_text = btext.strip()
        if not clean_text:
            continue

        # Check if this text block overlaps heavily with any extracted table
        overlaps_table = False
        for trect in table_bboxes:
            if bx0 >= trect[0] - 5 and bx1 <= trect[2] + 5 and by0 >= trect[1] - 5 and by1 <= trect[3] + 5:
                overlaps_table = True
                break

        if overlaps_table:
            continue

        b_id = f"B{page_index}_{b_count}"
        b_count += 1
        norm_bbox = [
            round(max(0.0, min(1.0, bx0 / pw)), 4),
            round(max(0.0, min(1.0, by0 / ph)), 4),
            round(max(0.0, min(1.0, bx1 / pw)), 4),
            round(max(0.0, min(1.0, by1 / ph)), 4)
        ]

        label = "title" if len(clean_text) < 60 and by0 < (ph * 0.20) else "text"
        blocks.append({
            "id": b_id,
            "page": page_index,
            "label": label,
            "text": clean_text,
            "bbox_norm": norm_bbox,
            "bbox_precision": "block",
            "engine": "docling_no_ocr"
        })
        md_lines.append(clean_text)

    return tables, blocks, "\n\n".join(md_lines)
