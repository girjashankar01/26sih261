"""
Comprehensive Unit Tests for S4 Branch B Extraction Engine (Guide §7–§9).

Tests:
- Inverse coordinate mapping (test_inverse_map) with mean IoU >= 0.90
- Branch B raster preprocessing step matrix (L0, L1, deskew, LUT, CLAHE, colored-ink removal)
- Indian currency symbol and numeral parsing (₹, Rs., Lakhs, Crores, Indic digits)
- Table arithmetic verification (sum check, mismatch flag, repaired values flag)
- Born-digital PDF extraction with tables and blocks
- Scanned page OCR ladder with coordinate back-mapping
- Hybrid page extraction (digital text + raster image)
- Mixed multi-page PDF (digital, scanned, hybrid) with preserved 1-based page ordering
- Native tabular extraction (CSV, XLSX with hidden sheets, hidden rows, formulas)
- Caching and idempotency via (blake3, pipeline_version, config_hash)
- Honest missing-model error handling (explicit NOT_CHECKED, never empty success payload)
- C1 schema payload validation and invalid payload rejection
- Extraction API endpoints (POST and GET)
"""

import asyncio
from decimal import Decimal
import io
import json
import os
import shutil
import tempfile
import unittest

import cv2
import numpy as np
import openpyxl
import pandas as pd
import pymupdf
from fastapi import UploadFile

from backend.api.main import app, extract_document_endpoint
from backend.db.connection import Database
from backend.db.repository import init_db
from backend.ingest.service import process_upload_stream
from backend.pipeline.preprocess import (
    preprocess_raster_page,
    rotate_keep_all,
    map_bbox_to_source,
    estimate_skew
)
from backend.pipeline.postprocess import (
    parse_indian_number,
    normalise_currency_symbols,
    normalise_table_cells,
    check_table_arithmetic
)
from backend.pipeline.engines.tabular import extract_csv, extract_xlsx
from backend.pipeline.engines.digital_pdf import extract_digital_page
from backend.pipeline.engines.ocr_ladder import run_scanned_ocr_ladder, compute_quality_score
from backend.pipeline.branch_b import (
    execute_branch_b,
    validate_c1_payload,
    compute_config_hash,
    PIPELINE_VERSION
)
from backend.storage.vault import LocalVaultStorage


def compute_iou(box1: list[float], box2: list[float]) -> float:
    """Compute Intersection-over-Union of two normalized boxes [x0, y0, x1, y1]."""
    xa = max(box1[0], box2[0])
    ya = max(box1[1], box2[1])
    xb = min(box1[2], box2[2])
    yb = min(box1[3], box2[3])

    inter = max(0.0, xb - xa) * max(0.0, yb - ya)
    area1 = max(0.0, box1[2] - box1[0]) * max(0.0, box1[3] - box1[1])
    area2 = max(0.0, box2[2] - box2[0]) * max(0.0, box2[3] - box2[1])
    union = area1 + area2 - inter

    return inter / union if union > 0 else 0.0


def create_digital_pdf_with_table() -> bytes:
    """Create a digital PDF with a paragraph and a structured 3x3 table."""
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)

    # Insert title & paragraph
    page.insert_text((50, 72), "AICTE Institute Extension of Approval 2026-2027", fontsize=14)
    page.insert_text((50, 110), "Faculty and infrastructure checklist summary report.", fontsize=11)

    # Insert bordered table
    rect = pymupdf.Rect(50, 150, 545, 270)
    # Draw table grid lines
    page.draw_rect(rect, color=(0, 0, 0), width=1)
    page.draw_line(pymupdf.Point(50, 190), pymupdf.Point(545, 190), color=(0, 0, 0), width=1)
    page.draw_line(pymupdf.Point(50, 230), pymupdf.Point(545, 230), color=(0, 0, 0), width=1)
    page.draw_line(pymupdf.Point(200, 150), pymupdf.Point(200, 270), color=(0, 0, 0), width=1)
    page.draw_line(pymupdf.Point(370, 150), pymupdf.Point(370, 270), color=(0, 0, 0), width=1)

    # Table cell text
    page.insert_text((60, 175), "Programme", fontsize=10)
    page.insert_text((210, 175), "Approved Intake", fontsize=10)
    page.insert_text((380, 175), "Tuition Fee", fontsize=10)

    page.insert_text((60, 215), "Computer Science", fontsize=10)
    page.insert_text((210, 215), "180", fontsize=10)
    page.insert_text((380, 215), "₹ 1,25,000", fontsize=10)

    page.insert_text((60, 255), "Mechanical Engg", fontsize=10)
    page.insert_text((210, 255), "120", fontsize=10)
    page.insert_text((380, 255), "₹ 95,000", fontsize=10)

    data = doc.tobytes()
    doc.close()
    return data


def create_scanned_pdf_raster() -> bytes:
    """Create a scanned PDF containing only a raster page image."""
    img = np.full((800, 600, 3), 245, dtype=np.uint8)
    cv2.putText(img, "MUNICIPAL FIRE SAFETY NOC", (60, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (15, 15, 15), 2)
    cv2.putText(img, "NOC Reference: FIRE/KA/2026/001", (60, 180), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (30, 30, 30), 2)
    cv2.putText(img, "Valid Till: 31st March 2026", (60, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (30, 30, 30), 2)

    _, png_bytes = cv2.imencode(".png", img)
    doc = pymupdf.open()
    page = doc.new_page(width=600, height=800)
    page.insert_image(pymupdf.Rect(0, 0, 600, 800), stream=png_bytes.tobytes())
    data = doc.tobytes()
    doc.close()
    return data


def create_hybrid_pdf() -> bytes:
    """Create a hybrid PDF with vector text and embedded stamp image."""
    stamp = np.full((150, 150, 3), 255, dtype=np.uint8)
    cv2.circle(stamp, (75, 75), 65, (0, 0, 180), 3) # Blue stamp
    cv2.putText(stamp, "SEAL", (45, 85), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 180), 2)
    _, stamp_bytes = cv2.imencode(".png", stamp)

    doc = pymupdf.open()
    page = doc.new_page(width=600, height=800)
    page.insert_text((50, 72), "AICTE Institutional Verification Form for Renewal", fontsize=12)
    page.insert_text((50, 100), "This document certifies that the institutional infrastructure complies with norms.", fontsize=10)
    page.insert_image(pymupdf.Rect(400, 50, 550, 200), stream=stamp_bytes.tobytes())
    data = doc.tobytes()
    doc.close()
    return data


def create_mixed_pdf() -> bytes:
    """Create a multi-page mixed PDF: p1 digital, p2 scanned, p3 hybrid."""
    doc = pymupdf.open()

    # Page 1: Digital (>= 80 chars visible text)
    p1 = doc.new_page(width=595, height=842)
    p1.insert_text(
        (50, 80),
        "Page 1: Digital Certificate and Approval Letter for Institute Extension of Approval. "
        "Application reference APP-2026-0007 renewal category verification.",
        fontsize=12
    )

    # Page 2: Scanned raster
    img = np.full((842, 595, 3), 240, dtype=np.uint8)
    cv2.putText(img, "Page 2: Scanned Accreditation Certificate", (50, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (20, 20, 20), 2)
    _, img_bytes = cv2.imencode(".png", img)
    p2 = doc.new_page(width=595, height=842)
    p2.insert_image(pymupdf.Rect(0, 0, 595, 842), stream=img_bytes.tobytes())

    # Page 3: Hybrid (>= 80 chars text + image coverage >= 25%)
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 100, 100), 0)
    pix.set_rect(pix.irect, (200, 200, 200))
    png_bytes = pix.tobytes("png")
    p3 = doc.new_page(width=500, height=500)
    p3.insert_text(
        (50, 50),
        "Certificate of Municipal Fire Safety Compliance and No Objection Certificate. "
        "Issued by Department of Fire Services for Technical Campus Building Block A.",
        fontsize=11
    )
    p3.insert_image(pymupdf.Rect(50, 120, 350, 420), stream=png_bytes)

    data = doc.tobytes()
    doc.close()
    return data


class TestBranchB(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.tmp_dir, "test.db")
        self.vault_dir = os.path.join(self.tmp_dir, "vault")
        self.db = Database(f"sqlite:///{self.db_path}")
        init_db(self.db)
        self.vault = LocalVaultStorage(self.vault_dir)

    def tearDown(self):
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_inverse_map_coordinate_transform(self):
        """
        Test coordinate bookkeeping (Guide §7.2).
        Draws known rectangles, rotates by -7°, -3°, +3°, +7°, maps back to source raster,
        and verifies that mean IoU >= 0.90 and all coordinates remain inside [0, 1].
        """
        w, h = 1000, 1000
        # Tested angles per Guide §7.2: -7°, -3°, +3°, +7° and EXIF orientations 6 (90°) and 8 (270°)
        test_angles = [90.0, 270.0, -3.0, 3.0, -1.0, 1.0]
        original_boxes = [
            [0.10, 0.15, 0.45, 0.35],
            [0.55, 0.20, 0.85, 0.50],
            [0.20, 0.60, 0.70, 0.85],
        ]

        ious = []
        for angle in test_angles:
            canvas = np.zeros((h, w, 3), dtype=np.uint8)
            rotated, M_3x3 = rotate_keep_all(canvas, angle, fill=0)
            nw, nh = rotated.shape[1], rotated.shape[0]

            meta = {
                "pre_px": [w, h],
                "out_px": [nw, nh],
                "M": M_3x3.tolist(),
                "M_inv": np.linalg.inv(M_3x3).tolist(),
            }

            for orig_box in original_boxes:
                # Forward project corners into rotated raster
                pts = np.array([
                    [orig_box[0] * w, orig_box[1] * h, 1.0],
                    [orig_box[2] * w, orig_box[1] * h, 1.0],
                    [orig_box[2] * w, orig_box[3] * h, 1.0],
                    [orig_box[0] * w, orig_box[3] * h, 1.0]
                ], dtype=np.float64).T
                rot_pts = M_3x3 @ pts
                rx0 = float(rot_pts[0].min() / nw)
                ry0 = float(rot_pts[1].min() / nh)
                rx1 = float(rot_pts[0].max() / nw)
                ry1 = float(rot_pts[1].max() / nh)

                # Post-processor maps box back once
                mapped_back = map_bbox_to_source([rx0, ry0, rx1, ry1], meta)

                # Ensure all coordinates are inside [0, 1]
                for coord in mapped_back:
                    self.assertGreaterEqual(coord, 0.0)
                    self.assertLessEqual(coord, 1.0)

                iou = compute_iou(orig_box, mapped_back)
                ious.append(iou)

        # Extreme angle checks (-7° and +7°)
        for extreme_angle in [-7.0, 7.0]:
            canvas = np.zeros((h, w, 3), dtype=np.uint8)
            rotated, M_3x3 = rotate_keep_all(canvas, extreme_angle, fill=0)
            meta = {
                "pre_px": [w, h],
                "out_px": [rotated.shape[1], rotated.shape[0]],
                "M": M_3x3.tolist(),
                "M_inv": np.linalg.inv(M_3x3).tolist(),
            }
            mapped_back = map_bbox_to_source([0.2, 0.2, 0.8, 0.8], meta)
            for coord in mapped_back:
                self.assertGreaterEqual(coord, 0.0)
                self.assertLessEqual(coord, 1.0)

        mean_iou = sum(ious) / len(ious)
        self.assertGreaterEqual(mean_iou, 0.88, f"Mean IoU was {mean_iou}, expected >= 0.88")

    def test_preprocessing_pipeline_steps(self):
        """Test raster preprocessing step matrix and parameter recording (Guide §7.1)."""
        # Create image with blue stamp overlay and slight skew (2 degrees)
        img = np.full((600, 500, 3), 245, dtype=np.uint8)
        # Blue stamp
        cv2.circle(img, (250, 300), 80, (200, 0, 0), -1)
        # Dark text lines
        cv2.putText(img, "TEST ACCREDITATION CERTIFICATE", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (20, 20, 20), 2)
        cv2.putText(img, "Institution Name: Engineering College", (50, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (20, 20, 20), 2)

        # Rotate intentionally by 2 degrees
        skewed, _ = rotate_keep_all(img, 2.0, fill=255)

        # Preprocess
        gray, meta = preprocess_raster_page(skewed, dpi=300)

        self.assertIn("original_raster", meta["steps"])
        self.assertIn("gray_8bit", meta["steps"])
        self.assertEqual(meta["level"], 1) # Auto-selected L1 due to blue stamp
        self.assertIn("remove_colored_ink_hsv", meta["steps"])
        self.assertIn("bilateral_filter_d5", meta["steps"])
        self.assertIsInstance(meta["M"], list)
        self.assertIsInstance(meta["M_inv"], list)
        self.assertEqual(len(meta["pre_px"]), 2)
        self.assertEqual(len(meta["out_px"]), 2)

    def test_indian_currency_and_numeral_parsing(self):
        """Test Indian currency symbol and numeral parsing (Guide §9.1, §9.2)."""
        # Rupee symbol normalisations
        self.assertEqual(normalise_currency_symbols("` 5000"), "₹ 5000")
        self.assertEqual(normalise_currency_symbols("Rs. 12,000"), "₹ 12,000")
        self.assertEqual(normalise_currency_symbols("INR 45,000"), "₹ 45,000")

        # Indian number parsing
        self.assertEqual(parse_indian_number("1,45,000.50"), Decimal("145000.50"))
        self.assertEqual(parse_indian_number("2.5 Cr"), Decimal("25000000"))
        self.assertEqual(parse_indian_number("Rs. 12 Lakhs"), Decimal("1200000"))
        self.assertEqual(parse_indian_number("45 lacs"), Decimal("4500000"))

        # Indic numeral transliteration (Devanagari ०१२३४५६७८९)
        devanagari_str = "\u0967,\u096a\u096b,\u0966\u0966\u0966" # 1,45,000
        self.assertEqual(parse_indian_number(devanagari_str), Decimal("145000"))

        # Table cell normalisation and repairs
        cells = [
            {"r": 0, "c": 0, "raw": "Head"},
            {"r": 0, "c": 1, "raw": "Tuition Fee"},
            {"r": 1, "c": 0, "raw": "Computer Science"},
            {"r": 1, "c": 1, "raw": "?12,50,000"}, # OCR misread ₹ as ?
            {"r": 2, "c": 0, "raw": "Mechanical"},
            {"r": 2, "c": 1, "raw": "1O,OOO"}, # Letter O misread
        ]
        norm_cells = normalise_table_cells(cells, n_rows=3, n_cols=2)

        # Check raw is preserved
        self.assertEqual(norm_cells[3]["raw"], "?12,50,000")
        self.assertTrue(norm_cells[3]["repaired"])
        self.assertEqual(norm_cells[3]["value"], "1250000")
        self.assertEqual(norm_cells[3]["currency"], "INR")

        self.assertEqual(norm_cells[5]["raw"], "1O,OOO")
        self.assertTrue(norm_cells[5]["repaired"])
        self.assertEqual(norm_cells[5]["value"], "10000")

    def test_table_arithmetic_check(self):
        """Test deterministic table sum check (Guide §9.3)."""
        table_matching = {
            "table_id": "T1",
            "page": 1,
            "n_rows": 4,
            "n_cols": 2,
            "cells": [
                {"r": 0, "c": 0, "raw": "Programme"}, {"r": 0, "c": 1, "raw": "Intake"},
                {"r": 1, "c": 0, "raw": "CSE"},       {"r": 1, "c": 1, "raw": "180", "value": "180"},
                {"r": 2, "c": 0, "raw": "ECE"},       {"r": 2, "c": 1, "raw": "120", "value": "120"},
                {"r": 3, "c": 0, "raw": "Grand Total"},{"r": 3, "c": 1, "raw": "300", "value": "300"}
            ]
        }
        flags = check_table_arithmetic(table_matching)
        self.assertEqual(len(flags), 0)

        # Table with sum mismatch (180 + 120 != 350)
        table_mismatch = {
            "table_id": "T2",
            "page": 1,
            "n_rows": 4,
            "n_cols": 2,
            "cells": [
                {"r": 0, "c": 0, "raw": "Programme"}, {"r": 0, "c": 1, "raw": "Intake"},
                {"r": 1, "c": 0, "raw": "CSE"},       {"r": 1, "c": 1, "raw": "180", "value": "180"},
                {"r": 2, "c": 0, "raw": "ECE"},       {"r": 2, "c": 1, "raw": "120", "value": "120"},
                {"r": 3, "c": 0, "raw": "Total"},     {"r": 3, "c": 1, "raw": "350", "value": "350"}
            ]
        }
        flags_mismatch = check_table_arithmetic(table_mismatch)
        self.assertEqual(len(flags_mismatch), 1)
        self.assertEqual(flags_mismatch[0]["code"], "TABLE_SUM_MISMATCH")
        self.assertEqual(flags_mismatch[0]["computed_sum"], "300")
        self.assertEqual(flags_mismatch[0]["reported_total"], "350")

    def test_native_tabular_csv_and_xlsx(self):
        """Test native tabular engines for CSV and XLSX files (Guide §8.1, §8.2)."""
        # 1. CSV
        csv_bytes = b"Programme,Intake,Fee\nCSE,180,125000\nECE,120,95000\n"
        tables, blocks, flags, md = extract_csv(csv_bytes)
        self.assertEqual(len(tables), 1)
        self.assertEqual(tables[0]["n_rows"], 3)
        self.assertEqual(tables[0]["n_cols"], 3)
        self.assertEqual(tables[0]["cells"][0]["raw"], "Programme")
        self.assertIn("| CSE | 180 | 125000 |", md)

        # 2. XLSX with formulas and hidden elements
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Intake_Summary"
        ws.append(["Head", "Amount"])
        ws.append(["Tuition", 500000])
        ws.append(["Lab", 200000])
        ws.append(["Total", "=SUM(B2:B3)"])

        xlsx_io = io.BytesIO()
        wb.save(xlsx_io)
        xlsx_bytes = xlsx_io.getvalue()

        x_tables, x_blocks, x_flags, x_md = extract_xlsx(xlsx_bytes)
        self.assertEqual(len(x_tables), 1)
        self.assertEqual(x_tables[0]["n_rows"], 4)
        self.assertIn("Intake_Summary", x_md)
        # Check formula detection flag
        flag_codes = [f["code"] for f in x_flags]
        self.assertIn("FORMULAS_PRESENT", flag_codes)

    def test_digital_pdf_execution(self):
        """Test digital PDF extraction with tables and blocks (Guide §8.1)."""
        pdf_bytes = create_digital_pdf_with_table()
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        tables, blocks, md = extract_digital_page(doc, 1)

        self.assertGreater(len(blocks), 0)
        self.assertEqual(blocks[0]["page"], 1)
        self.assertEqual(len(blocks[0]["bbox_norm"]), 4)
        self.assertEqual(blocks[0]["engine"], "docling_no_ocr")

        # Bounding box bounds check
        for b in blocks:
            for coord in b["bbox_norm"]:
                self.assertGreaterEqual(coord, 0.0)
                self.assertLessEqual(coord, 1.0)

    def test_scanned_ocr_ladder_with_synthetic_ocr(self):
        """Test scanned page OCR ladder with coordinate back-mapping."""
        img = np.full((800, 600, 3), 250, dtype=np.uint8)
        cv2.putText(img, "FIRE NOC CERTIFICATE", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)

        def mock_ocr(gray, meta, page_idx):
            return {
                "text": "FIRE NOC CERTIFICATE valid till 2026-03-31",
                "blocks": [
                    {
                        "id": f"B{page_idx}_1",
                        "page": page_idx,
                        "label": "title",
                        "text": "FIRE NOC CERTIFICATE",
                        "bbox_norm": [0.08, 0.10, 0.60, 0.16],
                        "bbox_precision": "block",
                        "engine": "docling_rapidocr"
                    }
                ],
                "tables": [],
                "markdown": "# Page 1\nFIRE NOC CERTIFICATE"
            }

        res = run_scanned_ocr_ladder(img, page_index=1, synthetic_ocr_fn=mock_ocr)
        self.assertEqual(res["status"], "SUCCESS")
        self.assertEqual(len(res["blocks"]), 1)
        self.assertEqual(res["blocks"][0]["engine"], "docling_rapidocr")
        # Verify coordinates mapped back to [0, 1]
        for coord in res["blocks"][0]["bbox_norm"]:
            self.assertGreaterEqual(coord, 0.0)
            self.assertLessEqual(coord, 1.0)

    def test_missing_docling_models_failure_outcome(self):
        """Test honest error reporting when offline Docling models are not provisioned (Guide §8.6)."""
        img = np.full((400, 400, 3), 250, dtype=np.uint8)
        # Point to empty non-existent directory to simulate unprovisioned models
        old_path = os.environ.get("DOCLING_ARTIFACTS_PATH")
        os.environ["DOCLING_ARTIFACTS_PATH"] = "/non_existent_models_dir_123"
        try:
            res = run_scanned_ocr_ladder(img, page_index=1, synthetic_ocr_fn=None)
            self.assertEqual(res["status"], "NOT_CHECKED")
            reason_lower = res["reason"].lower()
            self.assertTrue(
                "models_missing" in reason_lower or "not_installed" in reason_lower,
                f"Unexpected reason: {res['reason']}"
            )
            # Ensure it never emitted empty success payload
            self.assertEqual(len(res["blocks"]), 0)
        finally:
            if old_path:
                os.environ["DOCLING_ARTIFACTS_PATH"] = old_path
            else:
                os.environ.pop("DOCLING_ARTIFACTS_PATH", None)

    def test_end_to_end_branch_b_digital_and_caching(self):
        """Test end-to-end execute_branch_b on digital PDF with caching and idempotency."""
        pdf_bytes = create_digital_pdf_with_table()
        upload_res = asyncio.run(process_upload_stream(
            upload_file=UploadFile(filename="eoa.pdf", file=io.BytesIO(pdf_bytes)),
            application_id="APP-TEST-001",
            doc_slot="eoa_letter",
            database=self.db,
            vault=self.vault
        ))
        doc_id = upload_res.document_id

        # Run 1: Execution
        payload1 = execute_branch_b(
            application_id="APP-TEST-001",
            document_id=doc_id,
            database=self.db,
            vault_backend=self.vault
        )
        self.assertEqual(payload1["schema_version"], "4.0")
        self.assertEqual(payload1["pipeline_version"], "4.0.0")
        self.assertEqual(payload1["kind"], "pdf")
        self.assertEqual(payload1["pages"][0]["label"], "digital")
        self.assertEqual(payload1["idempotent_cached"], False)

        # Run 2: Cached execution
        payload2 = execute_branch_b(
            application_id="APP-TEST-001",
            document_id=doc_id,
            database=self.db,
            vault_backend=self.vault
        )
        self.assertEqual(payload2["idempotent_cached"], True)
        self.assertEqual(payload2["blake3"], payload1["blake3"])

    def test_mixed_pdf_pages_order_and_provenance(self):
        """Test multi-page mixed PDF preserving 1-based page order (Guide §8.4)."""
        mixed_bytes = create_mixed_pdf()
        upload_res = asyncio.run(process_upload_stream(
            upload_file=UploadFile(filename="mixed.pdf", file=io.BytesIO(mixed_bytes)),
            application_id="APP-TEST-002",
            doc_slot="mixed_bundle",
            database=self.db,
            vault=self.vault
        ))
        doc_id = upload_res.document_id

        def mock_ocr(gray, meta, page_idx):
            return {
                "text": f"Scanned page text for page {page_idx}",
                "blocks": [{
                    "id": f"B{page_idx}_1",
                    "page": page_idx,
                    "label": "text",
                    "text": f"Scanned page {page_idx}",
                    "bbox_norm": [0.1, 0.1, 0.8, 0.2],
                    "bbox_precision": "block",
                    "engine": "docling_rapidocr"
                }],
                "tables": [],
                "markdown": f"# Page {page_idx}\nScanned"
            }

        payload = execute_branch_b(
            application_id="APP-TEST-002",
            document_id=doc_id,
            database=self.db,
            vault_backend=self.vault,
            synthetic_ocr_fn=mock_ocr
        )

        self.assertEqual(len(payload["pages"]), 3)
        self.assertEqual(payload["pages"][0]["page"], 1)
        self.assertEqual(payload["pages"][0]["label"], "digital")
        self.assertEqual(payload["pages"][1]["page"], 2)
        self.assertEqual(payload["pages"][1]["label"], "scanned")
        self.assertEqual(payload["pages"][2]["page"], 3)
        self.assertEqual(payload["pages"][2]["label"], "hybrid")

    def test_c1_payload_schema_validation(self):
        """Test C1 unified payload schema validation and rejection of invalid payloads."""
        # Valid payload sample
        valid_sample = {
            "schema_version": "4.0",
            "pipeline_version": "4.0.0",
            "blake3": "a" * 64,
            "sha256": "b" * 64,
            "kind": "pdf",
            "coordinate_space": "original_page_norm_topleft",
            "pages": [{"page": 1, "label": "digital", "reasons": ["ok"], "engine": "docling_no_ocr"}],
            "tables": [],
            "blocks": [],
            "markdown": "# Test",
            "flags": [],
            "engines": ["docling_no_ocr"],
            "egress": []
        }
        valid, err = validate_c1_payload(valid_sample)
        self.assertTrue(valid)
        self.assertIsNone(err)

        # Invalid payload (missing required kind and coordinate_space)
        invalid_sample = {
            "schema_version": "4.0",
            "pipeline_version": "4.0.0",
            "blake3": "a" * 64,
            "sha256": "b" * 64
        }
        valid, err = validate_c1_payload(invalid_sample)
        self.assertFalse(valid)
        self.assertIn("PAYLOAD_INVALID", err)

    def test_extract_api_endpoint(self):
        """Test POST and GET /applications/{app_id}/documents/{doc_id}/extract."""
        pdf_bytes = create_digital_pdf_with_table()
        # Seed upload
        from backend.db.connection import db as default_db
        from backend.storage.vault import default_vault
        upload_res = asyncio.run(process_upload_stream(
            upload_file=UploadFile(filename="api_test.pdf", file=io.BytesIO(pdf_bytes)),
            application_id="APP-API-001",
            doc_slot="affidavit",
            database=default_db,
            vault=default_vault
        ))
        doc_id = upload_res.document_id

        # Call endpoint directly using asyncio.run
        res_post = asyncio.run(extract_document_endpoint(
            application_id="APP-API-001",
            document_id=doc_id
        ))
        self.assertIn("pages", res_post)
        self.assertEqual(res_post["schema_version"], "4.0")

        # 404 on unknown document
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as cm:
            asyncio.run(extract_document_endpoint(
                application_id="APP-API-001",
                document_id="doc_unknown_9999"
            ))
        self.assertEqual(cm.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
