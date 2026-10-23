import asyncio
import io
import os
import shutil
import tempfile
import unittest

import pymupdf
from fastapi import HTTPException, UploadFile

from backend.api.main import route_document_endpoint
from backend.db.connection import Database
from backend.db.repository import init_db
from backend.ingest.service import process_upload_stream
from backend.pipeline.router import (
    PageVerdict,
    classify_page,
    route_document,
    text_sanity,
)
from backend.storage.vault import LocalVaultStorage


def create_digital_pdf() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    text = (
        "All India Council for Technical Education (AICTE). "
        "Application for Extension of Approval (EoA) Renewal for Academic Year 2026-2027. "
        "Institute ID: 1-123456789. Faculty and Infrastructure verification checklist."
    )
    page.insert_text((50, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


def create_scanned_pdf() -> bytes:
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 100, 100), 0)
    pix.set_rect(pix.irect, (230, 230, 230))
    png_bytes = pix.tobytes("png")

    doc = pymupdf.open()
    page = doc.new_page(width=400, height=600)
    page.insert_image(pymupdf.Rect(0, 0, 400, 600), stream=png_bytes)
    data = doc.tobytes()
    doc.close()
    return data


def create_hybrid_pdf() -> bytes:
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 100, 100), 0)
    pix.set_rect(pix.irect, (200, 200, 200))
    png_bytes = pix.tobytes("png")

    doc = pymupdf.open()
    page = doc.new_page(width=500, height=500)
    # Visible text >= 80 chars
    text = (
        "Certificate of Municipal Fire Safety Compliance and No Objection Certificate. "
        "Issued by Department of Fire Services for Technical Campus Building Block A."
    )
    page.insert_text((50, 50), text)
    # Embedded image covering >= 25% of the page area (e.g. 300x300 = 90,000 / 250,000 = 36%)
    page.insert_image(pymupdf.Rect(50, 150, 350, 450), stream=png_bytes)
    data = doc.tobytes()
    doc.close()
    return data


def create_vector_drawing_pdf() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page(width=500, height=500)
    for i in range(50):
        page.draw_line((i * 10, 50), (i * 10, 450))
    data = doc.tobytes()
    doc.close()
    return data


def create_blank_pdf() -> bytes:
    doc = pymupdf.open()
    doc.new_page(width=500, height=500)
    data = doc.tobytes()
    doc.close()
    return data


def create_mixed_pdf() -> bytes:
    doc = pymupdf.open()
    # Page 1: Digital
    p1 = doc.new_page(width=595, height=842)
    p1.insert_text((50, 72), "Extension of Approval Cover Letter with clear born-digital typography and details. AICTE approval process compliance.")

    # Page 2: Scanned image
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 100, 100), 0)
    pix.set_rect(pix.irect, (220, 220, 220))
    png_bytes = pix.tobytes("png")
    p2 = doc.new_page(width=400, height=600)
    p2.insert_image(pymupdf.Rect(0, 0, 400, 600), stream=png_bytes)

    # Page 3: Hybrid
    p3 = doc.new_page(width=500, height=500)
    p3.insert_text((50, 50), "Building Safety Affidavit document with authorized officer signature stamp attached below.")
    p3.insert_image(pymupdf.Rect(50, 150, 350, 450), stream=png_bytes)

    data = doc.tobytes()
    doc.close()
    return data


def create_garbled_pdf() -> bytes:
    doc = pymupdf.open()
    p = doc.new_page(width=500, height=500)
    # Corrupt / cid-like text with low sanity
    garbled_text = "(cid:10) (cid:11) (cid:12) (cid:13) (cid:14) (cid:15) bcdfghjklmnpqrstvwxyz \ufffd\ufffd\ufffd \ue001\ue002" * 5
    p.insert_text((50, 50), garbled_text)
    data = doc.tobytes()
    doc.close()
    return data


SAMPLE_PNG = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
SAMPLE_JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9"


class TestDocumentRouter(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_router_")
        self.vault_dir = os.path.join(self.test_dir, "vault")
        self.scratch_dir = os.path.join(self.test_dir, "scratch")
        os.makedirs(self.vault_dir, exist_ok=True)
        os.makedirs(self.scratch_dir, exist_ok=True)

        self.vault = LocalVaultStorage(root_dir=self.vault_dir)
        self.db_path = os.path.join(self.test_dir, "test.db")
        self.db = Database(f"sqlite:///{self.db_path}")
        init_db(self.db)

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_text_sanity_scoring(self):
        # Clean text
        clean = "This is a clean, perfectly readable document from the technical council."
        self.assertGreaterEqual(text_sanity(clean), 0.9)

        # Empty text
        self.assertEqual(text_sanity(""), 0.0)

        # Garbled text with (cid:..) and \ufffd
        bad = "(cid:12) (cid:14) \ufffd \ufffd bcdfghjk"
        self.assertLess(text_sanity(bad), 0.6)

    def test_selectable_text_pdf_routes_to_branch_a(self):
        pdf_bytes = create_digital_pdf()
        res = route_document(
            raw_bytes=pdf_bytes,
            media_type="application/pdf",
            document_id="doc_dig_1",
            application_id="APP-001",
            doc_slot="fire_noc",
            blake3="a" * 64,
            sha256="b" * 64,
            storage_key="b3/aa/bb/test",
        )
        self.assertEqual(res.routing_outcome, "BRANCH_A_DIGITAL")
        self.assertEqual(res.total_pages, 1)
        self.assertEqual(res.page_counts["digital"], 1)
        self.assertEqual(res.page_verdicts[0]["label"], "digital")
        self.assertEqual(res.ocr_status, "NOT_RUN")
        self.assertEqual(res.classification_status, "NOT_RUN")
        self.assertEqual(res.processing_state, "ROUTED")

    def test_scanned_pdf_routes_to_branch_b(self):
        pdf_bytes = create_scanned_pdf()
        res = route_document(
            raw_bytes=pdf_bytes,
            media_type="application/pdf",
            document_id="doc_scan_1",
            application_id="APP-001",
            doc_slot="land_deed",
            blake3="a" * 64,
            sha256="b" * 64,
            storage_key="b3/aa/bb/test",
        )
        self.assertEqual(res.routing_outcome, "BRANCH_B_SCANNED")
        self.assertEqual(res.total_pages, 1)
        self.assertEqual(res.page_counts["scanned"], 1)
        self.assertEqual(res.page_verdicts[0]["label"], "scanned")
        self.assertEqual(res.ocr_status, "NOT_RUN")

    def test_hybrid_pdf_classification(self):
        pdf_bytes = create_hybrid_pdf()
        res = route_document(
            raw_bytes=pdf_bytes,
            media_type="application/pdf",
            document_id="doc_hyb_1",
            application_id="APP-001",
            doc_slot="affidavit",
            blake3="a" * 64,
            sha256="b" * 64,
            storage_key="b3/aa/bb/test",
        )
        self.assertEqual(res.page_verdicts[0]["label"], "hybrid")
        self.assertEqual(res.page_counts["hybrid"], 1)
        self.assertEqual(res.routing_outcome, "MIXED")

    def test_vector_drawing_pdf(self):
        pdf_bytes = create_vector_drawing_pdf()
        res = route_document(
            raw_bytes=pdf_bytes,
            media_type="application/pdf",
            document_id="doc_vec_1",
            application_id="APP-001",
            doc_slot="site_plan",
            blake3="a" * 64,
            sha256="b" * 64,
            storage_key="b3/aa/bb/test",
        )
        self.assertEqual(res.routing_outcome, "VECTOR_DRAWING")
        self.assertEqual(res.page_verdicts[0]["label"], "vector_drawing")

    def test_blank_pdf(self):
        pdf_bytes = create_blank_pdf()
        res = route_document(
            raw_bytes=pdf_bytes,
            media_type="application/pdf",
            document_id="doc_blank_1",
            application_id="APP-001",
            doc_slot="extra",
            blake3="a" * 64,
            sha256="b" * 64,
            storage_key="b3/aa/bb/test",
        )
        self.assertEqual(res.routing_outcome, "BLANK_DOCUMENT")
        self.assertEqual(res.page_verdicts[0]["label"], "blank")

    def test_mixed_pdf_routing(self):
        pdf_bytes = create_mixed_pdf()
        res = route_document(
            raw_bytes=pdf_bytes,
            media_type="application/pdf",
            document_id="doc_mix_1",
            application_id="APP-001",
            doc_slot="eoa_package",
            blake3="a" * 64,
            sha256="b" * 64,
            storage_key="b3/aa/bb/test",
        )
        self.assertEqual(res.routing_outcome, "MIXED")
        self.assertEqual(res.total_pages, 3)
        self.assertEqual(res.page_counts["digital"], 1)
        self.assertEqual(res.page_counts["scanned"], 1)
        self.assertEqual(res.page_counts["hybrid"], 1)

    def test_raster_png_routing(self):
        res = route_document(
            raw_bytes=SAMPLE_PNG,
            media_type="image/png",
            document_id="doc_png_1",
            application_id="APP-001",
            doc_slot="building_photo",
            blake3="a" * 64,
            sha256="b" * 64,
            storage_key="b3/aa/bb/test",
        )
        self.assertEqual(res.routing_outcome, "BRANCH_B_SCANNED")
        self.assertEqual(res.total_pages, 1)
        self.assertEqual(res.detected_kind, "png")
        self.assertEqual(res.page_verdicts[0]["label"], "scanned")

    def test_raster_jpeg_routing(self):
        res = route_document(
            raw_bytes=SAMPLE_JPEG,
            media_type="image/jpeg",
            document_id="doc_jpg_1",
            application_id="APP-001",
            doc_slot="building_photo",
            blake3="a" * 64,
            sha256="b" * 64,
            storage_key="b3/aa/bb/test",
        )
        self.assertEqual(res.routing_outcome, "BRANCH_B_SCANNED")
        self.assertEqual(res.total_pages, 1)
        self.assertEqual(res.detected_kind, "jpeg")
        self.assertEqual(res.page_verdicts[0]["label"], "scanned")

    def test_garbled_cid_text_routes_to_scanned(self):
        pdf_bytes = create_garbled_pdf()
        res = route_document(
            raw_bytes=pdf_bytes,
            media_type="application/pdf",
            document_id="doc_garb_1",
            application_id="APP-001",
            doc_slot="affidavit",
            blake3="a" * 64,
            sha256="b" * 64,
            storage_key="b3/aa/bb/test",
        )
        self.assertEqual(res.routing_outcome, "BRANCH_B_SCANNED")
        self.assertEqual(res.page_verdicts[0]["label"], "scanned")

    def test_corrupt_input_handled(self):
        corrupt_bytes = b"Not a valid PDF and not a valid image file at all"
        res = route_document(
            raw_bytes=corrupt_bytes,
            media_type="application/pdf",
            document_id="doc_corr_1",
            application_id="APP-001",
            doc_slot="fire_noc",
            blake3="a" * 64,
            sha256="b" * 64,
            storage_key="b3/aa/bb/test",
        )
        self.assertEqual(res.routing_outcome, "CORRUPT_DOCUMENT")
        self.assertEqual(res.total_pages, 0)

    def test_empty_input_handled(self):
        res = route_document(
            raw_bytes=b"",
            media_type="application/pdf",
            document_id="doc_empty_1",
            application_id="APP-001",
            doc_slot="fire_noc",
            blake3="a" * 64,
            sha256="b" * 64,
            storage_key="b3/aa/bb/test",
        )
        self.assertEqual(res.routing_outcome, "EMPTY_DOCUMENT")
        self.assertEqual(res.total_pages, 0)

    def test_storage_backed_route_integration(self):
        # 1. Ingest a digital document into vault and db
        pdf_bytes = create_digital_pdf()
        f = UploadFile(filename="eoa_renewal.pdf", file=io.BytesIO(pdf_bytes))
        ingest_res = asyncio.run(
            process_upload_stream(
                f,
                application_id="APP-ROUTE-001",
                doc_slot="fire_noc",
                scratch_dir=self.scratch_dir,
                vault=self.vault,
                database=self.db,
            )
        )
        self.assertEqual(ingest_res.processing_state, "PERSISTED")
        doc_id = ingest_res.document_id

        # 2. Call route endpoint with patched default_vault and default_db
        from unittest.mock import patch
        with patch("backend.api.main.default_vault", self.vault), patch("backend.api.main.default_db", self.db):
            route_res = asyncio.run(
                route_document_endpoint(
                    application_id="APP-ROUTE-001",
                    document_id=doc_id,
                )
            )

        self.assertEqual(route_res["document_id"], doc_id)
        self.assertEqual(route_res["application_id"], "APP-ROUTE-001")
        self.assertEqual(route_res["routing_outcome"], "BRANCH_A_DIGITAL")
        self.assertEqual(route_res["total_pages"], 1)
        self.assertEqual(route_res["processing_state"], "ROUTED")
        self.assertEqual(route_res["pipeline_stage"], "S3_ROUTER")
        self.assertEqual(route_res["ocr_status"], "NOT_RUN")
        self.assertEqual(route_res["classification_status"], "NOT_RUN")

    def test_route_document_not_found(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                route_document_endpoint(
                    application_id="APP-NONEXISTENT",
                    document_id="doc_does_not_exist",
                )
            )
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
