import asyncio
import io
import os
import shutil
import tempfile
import unittest
import pymupdf
import qrcode
from PIL import Image, ExifTags
from fastapi import HTTPException

from backend.api.main import forensics_document_endpoint
from backend.db.connection import Database
from backend.db.repository import init_db, insert_blob, insert_upload
from backend.forensics.runner import run_forensics
from backend.storage.vault import LocalVaultStorage


class TestForensics(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_forensics_")
        self.vault_dir = os.path.join(self.test_dir, "vault")
        os.makedirs(self.vault_dir, exist_ok=True)
        self.vault = LocalVaultStorage(root_dir=self.vault_dir)
        self.db_path = os.path.join(self.test_dir, "test.db")
        self.db = Database(f"sqlite:///{self.db_path}")
        init_db(self.db)

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def _create_minimal_pdf(
        self,
        creator: str = "Test Suite",
        producer: str = "PyMuPDF",
        append_eof: bool = False,
    ) -> bytes:
        doc = pymupdf.open()
        page = doc.new_page(width=300, height=300)
        page.insert_text((50, 50), "AICTE Sample Verification Content")
        doc.set_metadata({
            "creator": creator,
            "producer": producer,
            "title": "Sample NOC",
            "creationDate": "D:20260315103000Z",
            "modDate": "D:20260315103000Z",
        })
        pdf_bytes = doc.tobytes()
        doc.close()
        if append_eof:
            # Simulate incremental update revision marker
            pdf_bytes += b"\n% Additional Revision Data\n%%EOF\n"
        return pdf_bytes

    def test_clean_pdf_no_flags(self):
        pdf_bytes = self._create_minimal_pdf(creator="Karnataka Fire Dept", producer="ReportLab")
        res = run_forensics(
            raw_bytes=pdf_bytes,
            media_type="application/pdf",
            document_id="doc_clean",
            application_id="APP-001",
            blake3="dummy_b3",
            sha256="dummy_sha",
            storage_key="b3/00/00/dummy",
        )
        self.assertEqual(res.pipeline_stage, "S2_FORENSICS")
        self.assertEqual(res.flags, [])
        self.assertEqual(res.meta["producer"], "ReportLab")
        self.assertEqual(res.meta["creator"], "Karnataka Fire Dept")
        self.assertEqual(res.meta["incremental_updates_count"], 1)
        self.assertEqual(res.meta["signatures"], [])
        self.assertTrue(res.advisory)
        self.assertTrue(res.simulated)

        # Check completed detectors
        completed = [d["name"] for d in res.detectors if d["status"] == "COMPLETED"]
        self.assertIn("pdf_metadata", completed)
        self.assertIn("pdf_signature", completed)
        self.assertIn("qr_decode", completed)

    def test_editor_tool_in_metadata_flag(self):
        pdf_bytes = self._create_minimal_pdf(creator="Canva Design Studio", producer="iLovePDF Online")
        res = run_forensics(
            raw_bytes=pdf_bytes,
            media_type="application/pdf",
            document_id="doc_canva",
            application_id="APP-001",
            blake3="dummy_b3",
            sha256="dummy_sha",
            storage_key="b3/00/00/dummy",
        )
        flag_codes = [f["code"] for f in res.flags]
        self.assertIn("EDITING_TOOL_IN_METADATA", flag_codes)
        edit_flag = next(f for f in res.flags if f["code"] == "EDITING_TOOL_IN_METADATA")
        self.assertEqual(edit_flag["severity"], "medium")
        self.assertTrue(edit_flag["advisory"])
        self.assertTrue(edit_flag["requires_human_review"])
        self.assertEqual(edit_flag["detector"]["name"], "pdf_metadata")

    def test_incremental_updates_flag(self):
        pdf_bytes = self._create_minimal_pdf(append_eof=True)
        res = run_forensics(
            raw_bytes=pdf_bytes,
            media_type="application/pdf",
            document_id="doc_inc",
            application_id="APP-001",
            blake3="dummy_b3",
            sha256="dummy_sha",
            storage_key="b3/00/00/dummy",
        )
        flag_codes = [f["code"] for f in res.flags]
        self.assertIn("INCREMENTAL_UPDATE_PRESENT", flag_codes)
        inc_flag = next(f for f in res.flags if f["code"] == "INCREMENTAL_UPDATE_PRESENT")
        self.assertEqual(inc_flag["severity"], "low")
        self.assertTrue(inc_flag["advisory"])
        self.assertGreater(res.meta["incremental_updates_count"], 1)

    def test_unsigned_pdf_is_not_a_flag(self):
        pdf_bytes = self._create_minimal_pdf()
        res = run_forensics(
            raw_bytes=pdf_bytes,
            media_type="application/pdf",
            document_id="doc_unsigned",
            application_id="APP-001",
            blake3="dummy_b3",
            sha256="dummy_sha",
            storage_key="b3/00/00/dummy",
        )
        # Guide §5.2: "An unsigned PDF is not a flag."
        sig_flags = [f for f in res.flags if "SIG_" in f["code"]]
        self.assertEqual(sig_flags, [])
        self.assertEqual(res.meta["signatures"], [])

    def test_intact_signature(self):
        # Construct synthetic PDF with /ByteRange covering entire file
        base_pdf = self._create_minimal_pdf()
        sig_block = b"\n/Type /Sig /ByteRange [ 0 100 100 200 ]\n"
        signed_pdf = base_pdf + sig_block
        # Patch byte range to match exact length
        total_len = len(signed_pdf)
        p1, l1 = 0, total_len // 2
        p2, l2 = l1, total_len - l1
        br_str = f"/ByteRange [ {p1} {l1} {p2} {l2} ]".encode("ascii")
        signed_pdf = signed_pdf.replace(b"/ByteRange [ 0 100 100 200 ]", br_str.ljust(len("/ByteRange [ 0 100 100 200 ]".encode("ascii"))))

        res = run_forensics(
            raw_bytes=signed_pdf,
            media_type="application/pdf",
            document_id="doc_signed",
            application_id="APP-001",
            blake3="dummy_b3",
            sha256="dummy_sha",
            storage_key="b3/00/00/dummy",
        )
        self.assertGreater(len(res.meta["signatures"]), 0)
        sig = res.meta["signatures"][0]
        self.assertEqual(sig["integrity"], "INTACT_FULL_COVERAGE")
        self.assertEqual(sig["trust"], "demo")
        flag_codes = [f["code"] for f in res.flags]
        self.assertIn("SIG_INTACT", flag_codes)

    def test_signature_modified_after_signing(self):
        base_pdf = self._create_minimal_pdf()
        sig_block = b"\n/Type /Sig /ByteRange [ 0 50 50 100 ]\n"
        signed_pdf = base_pdf + sig_block
        # Append extra trailing modification bytes beyond covered length (150)
        tampered_pdf = signed_pdf + b"\n% Extra Tampered Form Data Appended\n"

        res = run_forensics(
            raw_bytes=tampered_pdf,
            media_type="application/pdf",
            document_id="doc_tampered_sig",
            application_id="APP-001",
            blake3="dummy_b3",
            sha256="dummy_sha",
            storage_key="b3/00/00/dummy",
        )
        sig = res.meta["signatures"][0]
        self.assertEqual(sig["integrity"], "MODIFIED_AFTER_SIGNING")
        self.assertEqual(sig["trust"], "untrusted")
        flag_codes = [f["code"] for f in res.flags]
        self.assertIn("SIG_MODIFIED_AFTER_SIGNING", flag_codes)
        mod_flag = next(f for f in res.flags if f["code"] == "SIG_MODIFIED_AFTER_SIGNING")
        self.assertEqual(mod_flag["severity"], "high")

    def test_image_exif_and_geo(self):
        # Create an in-memory JPEG with EXIF GPS and camera make
        img = Image.new("RGB", (100, 100), color="blue")
        exif = img.getexif()
        exif[ExifTags.Base.Make] = "Nikon"
        exif[ExifTags.Base.Model] = "D850"
        exif[ExifTags.Base.DateTimeOriginal] = "2026:01:10 14:30:00"

        # GPS IFD
        gps_ifd = exif.get_ifd(ExifTags.IFD.GPSInfo)
        gps_ifd[ExifTags.GPS.GPSLatitude] = (12.0, 58.0, 23.4)
        gps_ifd[ExifTags.GPS.GPSLatitudeRef] = "N"
        gps_ifd[ExifTags.GPS.GPSLongitude] = (77.0, 35.0, 45.6)
        gps_ifd[ExifTags.GPS.GPSLongitudeRef] = "E"

        buf = io.BytesIO()
        img.save(buf, format="JPEG", exif=exif)
        jpeg_bytes = buf.getvalue()

        res = run_forensics(
            raw_bytes=jpeg_bytes,
            media_type="image/jpeg",
            document_id="doc_photo",
            application_id="APP-001",
            blake3="dummy_b3",
            sha256="dummy_sha",
            storage_key="b3/00/00/dummy",
        )
        self.assertEqual(res.geo["make"], "Nikon")
        self.assertEqual(res.geo["model"], "D850")
        self.assertIsNotNone(res.geo["latitude"])
        self.assertIsNotNone(res.geo["longitude"])
        self.assertAlmostEqual(res.geo["latitude"], 12.973167, places=4)
        self.assertAlmostEqual(res.geo["longitude"], 77.596, places=2)

    def test_image_editing_software_flag(self):
        img = Image.new("RGB", (50, 50), color="red")
        exif = img.getexif()
        exif[ExifTags.Base.Software] = "Adobe Photoshop 2026"

        buf = io.BytesIO()
        img.save(buf, format="JPEG", exif=exif)
        jpeg_bytes = buf.getvalue()

        res = run_forensics(
            raw_bytes=jpeg_bytes,
            media_type="image/jpeg",
            document_id="doc_ps",
            application_id="APP-001",
            blake3="dummy_b3",
            sha256="dummy_sha",
            storage_key="b3/00/00/dummy",
        )
        flag_codes = [f["code"] for f in res.flags]
        self.assertIn("EDITING_SOFTWARE_SIGNATURE", flag_codes)

    def test_qr_decode_allowlisted_mock_fire(self):
        # Generate QR code matching Appendix B worked run
        target_url = "https://verify.mock-issuer.example/fire/FIRE/KA/2024/00123"
        qr = qrcode.QRCode(box_size=10, border=2)
        qr.add_data(target_url)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white")

        buf = io.BytesIO()
        qr_img.save(buf, format="PNG")
        png_bytes = buf.getvalue()

        res = run_forensics(
            raw_bytes=png_bytes,
            media_type="image/png",
            document_id="doc_qr_fire",
            application_id="APP-2026-0007",
            blake3="dummy_b3",
            sha256="dummy_sha",
            storage_key="b3/00/00/dummy",
        )
        self.assertIsNotNone(res.qr)
        self.assertTrue(res.qr["detected"])
        self.assertEqual(res.qr["issuer"], "MOCK_FIRE")
        self.assertEqual(res.qr["reference"], "FIRE/KA/2024/00123")
        self.assertEqual(res.flags, [])

    def test_qr_decode_unrecognized_pattern(self):
        # Unknown/untrusted domain QR code
        untrusted_url = "https://malicious-external-site.example/steal?id=123"
        qr = qrcode.QRCode(box_size=10, border=2)
        qr.add_data(untrusted_url)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white")

        buf = io.BytesIO()
        qr_img.save(buf, format="PNG")
        png_bytes = buf.getvalue()

        res = run_forensics(
            raw_bytes=png_bytes,
            media_type="image/png",
            document_id="doc_qr_unknown",
            application_id="APP-001",
            blake3="dummy_b3",
            sha256="dummy_sha",
            storage_key="b3/00/00/dummy",
        )
        self.assertIsNotNone(res.qr)
        self.assertTrue(res.qr["detected"])
        self.assertIsNone(res.qr["issuer"])
        flag_codes = [f["code"] for f in res.flags]
        self.assertIn("QR_NOT_RECOGNISED", flag_codes)
        qr_flag = next(f for f in res.flags if f["code"] == "QR_NOT_RECOGNISED")
        self.assertEqual(qr_flag["severity"], "info")
        self.assertTrue(qr_flag["advisory"])

    def test_deferred_detectors_recorded_as_not_checked(self):
        pdf_bytes = self._create_minimal_pdf()
        res = run_forensics(
            raw_bytes=pdf_bytes,
            media_type="application/pdf",
            document_id="doc_deferred",
            application_id="APP-001",
            blake3="dummy_b3",
            sha256="dummy_sha",
            storage_key="b3/00/00/dummy",
        )
        not_checked = {d["name"]: d["reason"] for d in res.detectors if d["status"] == "NOT_CHECKED"}
        self.assertIn("font_inconsistency", not_checked)
        self.assertIn("ela_jpeg", not_checked)
        self.assertIn("mark_reuse", not_checked)
        self.assertIn("text_layer_ocr_mismatch", not_checked)

    def test_api_forensics_endpoint(self):
        import hashlib
        from unittest.mock import patch
        import blake3

        # Seed test document in isolated test vault and database
        pdf_bytes = self._create_minimal_pdf(creator="Karnataka Fire Dept", producer="ReportLab")
        b3_hex = blake3.blake3(pdf_bytes).hexdigest()
        sha_hex = hashlib.sha256(pdf_bytes).hexdigest()
        storage_key = f"b3/{b3_hex[:2]}/{b3_hex[2:4]}/{b3_hex}"

        self.vault.put_bytes(storage_key, pdf_bytes, if_absent=False)

        with self.db.transaction() as conn:
            insert_blob(
                conn,
                blake3=b3_hex,
                sha256=sha_hex,
                byte_size=len(pdf_bytes),
                media_type="application/pdf",
                storage_key=storage_key,
                created_at="2026-10-24T00:00:00Z",
                database=self.db,
            )
            insert_upload(
                conn,
                id="doc_forensics_api_test",
                application_id="APP-2026-0007",
                blake3=b3_hex,
                doc_slot="FIRE_NOC",
                idempotency_key="idemp_forensics_api_test",
                created_at="2026-10-24T00:00:00Z",
                database=self.db,
            )

        # Test forensics_document_endpoint with patched vault and database
        with patch("backend.api.main.default_vault", self.vault), patch("backend.api.main.default_db", self.db):
            data = asyncio.run(
                forensics_document_endpoint(
                    application_id="APP-2026-0007",
                    document_id="doc_forensics_api_test",
                )
            )
        self.assertEqual(data["pipeline_stage"], "S2_FORENSICS")
        self.assertEqual(data["application_id"], "APP-2026-0007")
        self.assertEqual(data["document_id"], "doc_forensics_api_test")
        self.assertEqual(data["detected_media_type"], "application/pdf")
        self.assertEqual(data["meta"]["producer"], "ReportLab")
        self.assertTrue(data["simulated"])
        self.assertTrue(data["advisory"])

    def test_api_forensics_document_not_found(self):
        from unittest.mock import patch
        with patch("backend.api.main.default_vault", self.vault), patch("backend.api.main.default_db", self.db):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    forensics_document_endpoint(
                        application_id="APP-NONEXISTENT",
                        document_id="doc_does_not_exist",
                    )
                )
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail["error_code"], "DOCUMENT_NOT_FOUND")


if __name__ == "__main__":
    unittest.main()
