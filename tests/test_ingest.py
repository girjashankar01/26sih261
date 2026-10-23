import asyncio
import hashlib
import io
import os
import tempfile
import unittest
import blake3
from fastapi import UploadFile

from backend.api.main import upload_document
from backend.api.schemas import DocumentIngestResponseModel
from backend.ingest.service import (
    IngestError,
    process_upload_stream,
    sniff_format,
    check_pdf_encryption,
)

SAMPLE_PDF = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
190
%%EOF"""

SAMPLE_ENCRYPTED_PDF = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>
endobj
4 0 obj
<< /Filter /Standard /V 2 /R 3 /O (xxxx) /U (yyyy) /P -4 >>
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000185 00000 n 
trailer
<< /Size 5 /Root 1 0 R /Encrypt 4 0 R >>
startxref
260
%%EOF"""

SAMPLE_PNG = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"

SAMPLE_JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9"


def make_upload_file(data: bytes, filename: str = "document.bin") -> UploadFile:
    return UploadFile(filename=filename, file=io.BytesIO(data))


class TestIngestionGateway(unittest.TestCase):
    def setUp(self):
        self.scratch_dir = tempfile.mkdtemp(prefix="test_scratch_")

    def tearDown(self):
        if os.path.exists(self.scratch_dir):
            for f in os.listdir(self.scratch_dir):
                os.unlink(os.path.join(self.scratch_dir, f))
            os.rmdir(self.scratch_dir)

    def test_pdf_upload_success(self):
        f = make_upload_file(SAMPLE_PDF, "fire_noc.pdf")
        res = asyncio.run(
            process_upload_stream(
                f,
                application_id="DEMO-CLEAN-001",
                doc_slot="fire_noc",
                scratch_dir=self.scratch_dir,
            )
        )
        self.assertEqual(res.application_id, "DEMO-CLEAN-001")
        self.assertEqual(res.detected_kind, "pdf")
        self.assertEqual(res.detected_media_type, "application/pdf")
        self.assertEqual(res.byte_size, len(SAMPLE_PDF))
        self.assertEqual(res.blake3, blake3.blake3(SAMPLE_PDF).hexdigest())
        self.assertEqual(res.ocr_status, "NOT_RUN")
        self.assertEqual(res.persistence_status, "VAULT_LOCAL")
        self.assertEqual(res.processing_state, "PERSISTED")
        self.assertTrue(res.storage_key.startswith("b3/"))
        # Ensure scratch directory was cleaned up
        self.assertEqual(len(os.listdir(self.scratch_dir)), 0)

    def test_png_upload_success(self):
        f = make_upload_file(SAMPLE_PNG, "site_plan.png")
        res = asyncio.run(
            process_upload_stream(
                f,
                application_id="DEMO-CLEAN-001",
                doc_slot="site_plan",
                scratch_dir=self.scratch_dir,
            )
        )
        self.assertEqual(res.detected_kind, "png")
        self.assertEqual(res.detected_media_type, "image/png")
        self.assertEqual(res.byte_size, len(SAMPLE_PNG))
        self.assertEqual(res.blake3, blake3.blake3(SAMPLE_PNG).hexdigest())
        self.assertEqual(res.sha256, hashlib.sha256(SAMPLE_PNG).hexdigest())
        self.assertEqual(len(os.listdir(self.scratch_dir)), 0)

    def test_jpeg_upload_success(self):
        f = make_upload_file(SAMPLE_JPEG, "building_photo.jpg")
        res = asyncio.run(
            process_upload_stream(
                f,
                application_id="DEMO-CLEAN-001",
                doc_slot="building_photo",
                scratch_dir=self.scratch_dir,
            )
        )
        self.assertEqual(res.detected_kind, "jpeg")
        self.assertEqual(res.detected_media_type, "image/jpeg")
        self.assertEqual(res.byte_size, len(SAMPLE_JPEG))
        self.assertEqual(res.blake3, blake3.blake3(SAMPLE_JPEG).hexdigest())
        self.assertEqual(res.sha256, hashlib.sha256(SAMPLE_JPEG).hexdigest())
        self.assertEqual(len(os.listdir(self.scratch_dir)), 0)

    def test_unsupported_magic_bytes_rejected(self):
        # Spoofed file: extension says .pdf, content is plain text
        spoofed = b"This is not a real PDF file."
        f = make_upload_file(spoofed, "fake.pdf")
        with self.assertRaises(IngestError) as ctx:
            asyncio.run(
                process_upload_stream(
                    f,
                    application_id="DEMO-CLEAN-001",
                    scratch_dir=self.scratch_dir,
                )
            )
        self.assertEqual(ctx.exception.status_code, 415)
        self.assertEqual(ctx.exception.detail["error_code"], "UNSUPPORTED_MEDIA_TYPE")
        # Ensure uploaded data is not in error message
        self.assertNotIn("This is not a real PDF", str(ctx.exception.detail))
        # Ensure scratch directory was cleaned up on failure
        self.assertEqual(len(os.listdir(self.scratch_dir)), 0)

    def test_empty_file_rejected(self):
        f = make_upload_file(b"", "empty.pdf")
        with self.assertRaises(IngestError) as ctx:
            asyncio.run(
                process_upload_stream(
                    f,
                    application_id="DEMO-CLEAN-001",
                    scratch_dir=self.scratch_dir,
                )
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail["error_code"], "EMPTY_FILE")
        self.assertEqual(len(os.listdir(self.scratch_dir)), 0)

    def test_size_limit_enforced_during_stream(self):
        # Limit to 100 bytes, pass 500 bytes
        large_data = b"A" * 500
        f = make_upload_file(large_data, "large.bin")
        with self.assertRaises(IngestError) as ctx:
            asyncio.run(
                process_upload_stream(
                    f,
                    application_id="DEMO-CLEAN-001",
                    max_size=100,
                    scratch_dir=self.scratch_dir,
                )
            )
        self.assertEqual(ctx.exception.status_code, 413)
        self.assertEqual(ctx.exception.detail["error_code"], "FILE_TOO_LARGE")
        self.assertEqual(ctx.exception.detail["max_size_bytes"], 100)
        self.assertEqual(len(os.listdir(self.scratch_dir)), 0)

    def test_encrypted_pdf_rejected(self):
        f = make_upload_file(SAMPLE_ENCRYPTED_PDF, "locked.pdf")
        with self.assertRaises(IngestError) as ctx:
            asyncio.run(
                process_upload_stream(
                    f,
                    application_id="DEMO-CLEAN-001",
                    scratch_dir=self.scratch_dir,
                )
            )
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(ctx.exception.detail["error_code"], "ENCRYPTED_PDF_REJECTED")
        self.assertEqual(len(os.listdir(self.scratch_dir)), 0)

    def test_fastapi_endpoint_upload_document(self):
        f = make_upload_file(SAMPLE_PDF, "affidavit.pdf")
        res = asyncio.run(
            upload_document(
                application_id="DEMO-CLEAN-001",
                file=f,
                doc_slot="affidavit",
            )
        )
        validated = DocumentIngestResponseModel.model_validate(res.__dict__)
        self.assertEqual(validated.application_id, "DEMO-CLEAN-001")
        self.assertEqual(validated.doc_slot, "affidavit")
        self.assertEqual(validated.detected_kind, "pdf")
        self.assertEqual(validated.pipeline_stage, "S1_INGESTION_GATEWAY")


if __name__ == "__main__":
    unittest.main()
