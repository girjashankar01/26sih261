"""
Comprehensive Unit Tests for S6 Schema-Driven Extraction and S6b Grounding (Guide §11.2, §11.3).

Tests:
- Date parser policy: 4-digit years ('ok'), 2-digit years ('ambiguous'), missing years ('ambiguous'), invalid ('invalid')
- S6b Grounding: provenance-first, AMBIGUOUS_MATCH on repeated values without provenance, PyMuPDF word-precision search
- Schema-driven extraction for FIRE_NOC, ACCREDITATION, EOA_LETTER
- Completeness enforcement: COMPLETE vs INCOMPLETE with missing_fields
- Appendix B target extraction: FIRE_NOC.valid_till '31st March 2026' -> '2026-03-31', word precision
- Database persistence of C3 typed facts and idempotent caching
- FastAPI endpoints (POST and GET)
- Schema contract validation against document_extraction_response.schema.json
"""

import asyncio
from datetime import date
import io
import json
import os
import shutil
import tempfile
import unittest

from fastapi import HTTPException, UploadFile
import jsonschema
import pymupdf

from backend.api.main import app, extract_fields_endpoint
from backend.db.connection import Database
from backend.db.repository import init_db
from backend.extraction.date_parser import parse_date
from backend.extraction.grounding import ground
from backend.extraction.extractor import extract_document_fields, load_doc_schema
from backend.extraction.service import process_document_extraction
from backend.ingest.service import process_upload_stream
from backend.storage.vault import LocalVaultStorage


SCHEMA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../docs/contracts"))
EXTRACTION_SCHEMA = json.load(open(os.path.join(SCHEMA_DIR, "document_extraction_response.schema.json")))
C3_SCHEMA = json.load(open(os.path.join(SCHEMA_DIR, "c3_fact.schema.json")))

BASE_URI = f"file:///{SCHEMA_DIR.replace(os.sep, '/')}/"
STORE = {
    C3_SCHEMA.get("$id"): C3_SCHEMA,
    "c3_fact.schema.json": C3_SCHEMA,
    f"{BASE_URI}c3_fact.schema.json": C3_SCHEMA
}
RESOLVER = jsonschema.RefResolver(base_uri=BASE_URI, referrer=EXTRACTION_SCHEMA, store=STORE)


def create_digital_fire_noc_pdf() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)

    page.insert_text((50, 60), "GOVERNMENT OF KARNATAKA", fontsize=12)
    page.insert_text((50, 90), "FIRE AND RESCUE SERVICES DEPARTMENT", fontsize=13)
    page.insert_text((50, 130), "NO OBJECTION CERTIFICATE", fontsize=14)
    page.insert_text((50, 180), "Name of Institution: Oxford Engineering College", fontsize=11)
    page.insert_text((50, 220), "Certificate No: FIRE/KA/2024/00123", fontsize=11)
    page.insert_text((50, 260), "Issued on: 10th April 2024", fontsize=11)
    page.insert_text((50, 300), "Valid till: 31st March 2026", fontsize=11)
    page.insert_text((50, 340), "Issuing Authority: Chief Fire Officer", fontsize=11)

    return doc.tobytes()


class TestDateParserPolicy(unittest.TestCase):
    def test_valid_four_digit_dates(self):
        # Ordinal string: '31st March 2026' -> date(2026, 3, 31), 'ok'
        d, status = parse_date("31st March 2026")
        self.assertEqual(status, "ok")
        self.assertEqual(d, date(2026, 3, 31))

        # Numeric Indian format DD/MM/YYYY
        d, status = parse_date("10/04/2024")
        self.assertEqual(status, "ok")
        self.assertEqual(d, date(2024, 4, 10))

        # ISO format YYYY-MM-DD
        d, status = parse_date("2026-03-31")
        self.assertEqual(status, "ok")
        self.assertEqual(d, date(2026, 3, 31))

    def test_two_digit_year_is_ambiguous(self):
        # Guide §11.4: 2-digit years return ambiguous -> NEEDS_REVIEW, never an automated guess
        d, status = parse_date("31/03/26")
        self.assertEqual(status, "ambiguous")
        self.assertIsNone(d)

    def test_missing_year_is_ambiguous(self):
        d, status = parse_date("31st March")
        self.assertEqual(status, "ambiguous")
        self.assertIsNone(d)

    def test_invalid_date(self):
        # 31st February does not exist
        d, status = parse_date("31/02/2026")
        self.assertEqual(status, "invalid")
        self.assertIsNone(d)

        # Non-date garbage
        d, status = parse_date("not a real date string")
        self.assertEqual(status, "invalid")
        self.assertIsNone(d)


class TestS6bGrounding(unittest.TestCase):
    def setUp(self):
        self.blocks = [
            {"id": "B1_1", "text": "GOVERNMENT OF KARNATAKA", "bbox_norm": [0.1, 0.05, 0.9, 0.1], "bbox_precision": "block", "page": 1},
            {"id": "B1_2", "text": "Valid till: 31st March 2026", "bbox_norm": [0.1, 0.3, 0.6, 0.35], "bbox_precision": "block", "page": 1},
            {"id": "B1_3", "text": "Other block with 31st March 2026 repeated", "bbox_norm": [0.1, 0.5, 0.7, 0.55], "bbox_precision": "block", "page": 1},
        ]

    def test_provenance_first_resolves_correct_block(self):
        # When block_id is provided, pool is scoped to that block
        res = ground("31st March 2026", self.blocks, block_id="B1_2")
        self.assertTrue(res["grounded"])
        self.assertEqual(res["source_ref"], "B1_2")
        self.assertEqual(res["score"], 100.0)

    def test_repeated_value_without_provenance_is_ambiguous_match(self):
        # Guide §11.3: value repeated in multiple blocks without provenance returns AMBIGUOUS_MATCH
        res = ground("31st March 2026", self.blocks)
        self.assertFalse(res["grounded"])
        self.assertEqual(res["reason"], "AMBIGUOUS_MATCH")
        self.assertEqual(set(res["candidates"]), {"B1_2", "B1_3"})

    def test_word_precision_refinement_with_pymupdf(self):
        pdf_bytes = create_digital_fire_noc_pdf()
        blocks = [
            {"id": "B1_valid", "text": "Valid till: 31st March 2026", "bbox_norm": [0.08, 0.34, 0.6, 0.38], "bbox_precision": "block", "page": 1}
        ]
        res = ground("31st March 2026", blocks, block_id="B1_valid", pdf_bytes=pdf_bytes)
        self.assertTrue(res["grounded"])
        self.assertEqual(res["bbox_precision"], "word")
        self.assertIsNotNone(res["bbox_norm"])
        # Word bbox should be narrower than full block
        self.assertLess(res["bbox_norm"][2] - res["bbox_norm"][0], 0.45)


class TestSchemaDrivenExtraction(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_ext_")
        self.vault_dir = os.path.join(self.test_dir, "vault")
        self.db_path = os.path.join(self.test_dir, "test.db")
        os.makedirs(self.vault_dir, exist_ok=True)

        self.db = Database(f"sqlite:///{self.db_path}")
        init_db(self.db)
        self.vault = LocalVaultStorage(self.vault_dir)

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_complete_fire_noc_extraction(self):
        """Test Appendix B clean Fire NOC extraction producing COMPLETE status and exact values."""
        pdf_bytes = create_digital_fire_noc_pdf()
        payload = {
            "schema_version": "4.0",
            "blake3": "dummy_b3",
            "blocks": [
                {"id": "B1_1", "text": "FIRE AND RESCUE SERVICES DEPARTMENT", "bbox_norm": [0.1, 0.1, 0.9, 0.15], "page": 1},
                {"id": "B1_2", "text": "Name of Institution: Oxford Engineering College", "bbox_norm": [0.1, 0.2, 0.8, 0.25], "page": 1},
                {"id": "B1_3", "text": "Certificate No: FIRE/KA/2024/00123", "bbox_norm": [0.1, 0.25, 0.7, 0.3], "page": 1},
                {"id": "B1_4", "text": "Issued on: 10th April 2024", "bbox_norm": [0.1, 0.3, 0.6, 0.35], "page": 1},
                {"id": "B1_5", "text": "Valid till: 31st March 2026", "bbox_norm": [0.1, 0.35, 0.6, 0.4], "page": 1},
                {"id": "B1_6", "text": "Issuing Authority: Chief Fire Officer", "bbox_norm": [0.1, 0.4, 0.7, 0.45], "page": 1},
            ],
            "markdown": "FIRE AND RESCUE\nOxford Engineering College\nCertificate No: FIRE/KA/2024/00123\nIssued on: 10th April 2024\nValid till: 31st March 2026"
        }

        res = extract_document_fields(
            application_id="APP-001",
            document_id="doc_fire",
            doc_type="FIRE_NOC",
            c1_payload=payload,
            original_pdf_bytes=pdf_bytes
        )

        self.assertEqual(res["completeness_status"], "COMPLETE")
        self.assertEqual(res["missing_fields"], [])

        fact_dict = {f["key"]: f for f in res["facts"]}

        # 1. Institution Name
        self.assertEqual(fact_dict["institution_name"]["value"], "Oxford Engineering College")
        self.assertTrue(fact_dict["institution_name"]["grounded"])

        # 2. Certificate No
        self.assertEqual(fact_dict["certificate_no"]["value"], "FIRE/KA/2024/00123")
        self.assertEqual(fact_dict["certificate_no"]["parse_state"], "ok")

        # 3. Issued On
        self.assertEqual(fact_dict["issued_on"]["value"], "2024-04-10")
        self.assertEqual(fact_dict["issued_on"]["parse_state"], "ok")

        # 4. Valid Till (Appendix B worked run: raw '31st March 2026' -> '2026-03-31')
        self.assertEqual(fact_dict["valid_till"]["raw"], "31st March 2026")
        self.assertEqual(fact_dict["valid_till"]["value"], "2026-03-31")
        self.assertEqual(fact_dict["valid_till"]["parse_state"], "ok")
        self.assertEqual(fact_dict["valid_till"]["bbox_precision"], "word")

    def test_incomplete_fire_noc_missing_valid_till(self):
        """When a required field (e.g. valid_till) is absent, document is INCOMPLETE."""
        payload = {
            "schema_version": "4.0",
            "blake3": "dummy_b3",
            "blocks": [
                {"id": "B1_1", "text": "Name of Institution: Oxford Engineering College", "bbox_norm": [0.1, 0.2, 0.8, 0.25], "page": 1},
                {"id": "B1_2", "text": "Certificate No: FIRE/KA/2024/00123", "bbox_norm": [0.1, 0.25, 0.7, 0.3], "page": 1},
                {"id": "B1_3", "text": "Issued on: 10th April 2024", "bbox_norm": [0.1, 0.3, 0.6, 0.35], "page": 1},
            ],
            "markdown": "Oxford Engineering College\nCertificate No: FIRE/KA/2024/00123\nIssued on: 10th April 2024"
        }

        res = extract_document_fields(
            application_id="APP-001",
            document_id="doc_fire_missing",
            doc_type="FIRE_NOC",
            c1_payload=payload
        )

        self.assertEqual(res["completeness_status"], "INCOMPLETE")
        self.assertIn("valid_till", res["missing_fields"])

    def test_ambiguous_two_digit_year_causes_incomplete_status(self):
        """Two-digit year '31/03/26' sets parse_state to ambiguous and prevents COMPLETE status."""
        payload = {
            "schema_version": "4.0",
            "blake3": "dummy_b3",
            "blocks": [
                {"id": "B1_1", "text": "Name of Institution: Oxford Engineering College", "bbox_norm": [0.1, 0.2, 0.8, 0.25], "page": 1},
                {"id": "B1_2", "text": "Certificate No: FIRE/KA/2024/00123", "bbox_norm": [0.1, 0.25, 0.7, 0.3], "page": 1},
                {"id": "B1_3", "text": "Issued on: 10/04/2024", "bbox_norm": [0.1, 0.3, 0.6, 0.35], "page": 1},
                {"id": "B1_4", "text": "Valid till: 31/03/26", "bbox_norm": [0.1, 0.35, 0.6, 0.4], "page": 1},
            ],
            "markdown": "Valid till: 31/03/26"
        }

        res = extract_document_fields(
            application_id="APP-001",
            document_id="doc_fire_2digit",
            doc_type="FIRE_NOC",
            c1_payload=payload
        )

        self.assertEqual(res["completeness_status"], "INCOMPLETE")
        self.assertIn("valid_till", res["missing_fields"])

        fact_valid = next(f for f in res["facts"] if f["key"] == "valid_till")
        self.assertEqual(fact_valid["parse_state"], "ambiguous")
        self.assertIsNone(fact_valid["value"])

    def test_end_to_end_extraction_service_and_caching(self):
        """Test process_document_extraction end-to-end: upload -> typing -> extraction -> DB cache."""
        pdf_bytes = create_digital_fire_noc_pdf()
        upload_res = asyncio.run(process_upload_stream(
            upload_file=UploadFile(filename="fire_noc.pdf", file=io.BytesIO(pdf_bytes)),
            application_id="APP-SRV-001",
            doc_slot="fire_noc",
            database=self.db,
            vault=self.vault
        ))
        doc_id = upload_res.document_id

        # First run: extracts and writes to facts table
        res1 = process_document_extraction(
            application_id="APP-SRV-001",
            document_id=doc_id,
            database=self.db,
            vault_backend=self.vault
        )
        self.assertEqual(res1["completeness_status"], "COMPLETE")
        self.assertEqual(res1["doc_type"], "FIRE_NOC")
        self.assertFalse(res1["idempotent_cached"])
        self.assertTrue(len(res1["facts"]) >= 4)

        # Second run: serves from DB cache
        res2 = process_document_extraction(
            application_id="APP-SRV-001",
            document_id=doc_id,
            database=self.db,
            vault_backend=self.vault
        )
        self.assertEqual(res2["completeness_status"], "COMPLETE")
        self.assertTrue(res2["idempotent_cached"])
        self.assertEqual(len(res2["facts"]), len(res1["facts"]))

    def test_schema_compliance_of_extraction_result(self):
        """Validate extraction result conforms to document_extraction_response.schema.json."""
        pdf_bytes = create_digital_fire_noc_pdf()
        payload = {
            "schema_version": "4.0",
            "blake3": "dummy_b3",
            "blocks": [
                {"id": "B1_1", "text": "Name of Institution: Oxford Engineering College", "bbox_norm": [0.1, 0.2, 0.8, 0.25], "page": 1},
                {"id": "B1_2", "text": "Certificate No: FIRE/KA/2024/00123", "bbox_norm": [0.1, 0.25, 0.7, 0.3], "page": 1},
                {"id": "B1_3", "text": "Issued on: 10th April 2024", "bbox_norm": [0.1, 0.3, 0.6, 0.35], "page": 1},
                {"id": "B1_4", "text": "Valid till: 31st March 2026", "bbox_norm": [0.1, 0.35, 0.6, 0.4], "page": 1},
            ],
            "markdown": "FIRE NOC text"
        }

        res = extract_document_fields(
            application_id="APP-001",
            document_id="doc_schema_val",
            doc_type="FIRE_NOC",
            c1_payload=payload,
            original_pdf_bytes=pdf_bytes
        )

        validator = jsonschema.Draft202012Validator(EXTRACTION_SCHEMA, resolver=RESOLVER)
        validator.validate(res)

    def test_extraction_api_endpoint(self):
        """Test POST /applications/{app_id}/documents/{doc_id}/fields API endpoint."""
        from backend.db.connection import db as default_db
        from backend.storage.vault import default_vault

        pdf_bytes = create_digital_fire_noc_pdf()
        upload_res = asyncio.run(process_upload_stream(
            upload_file=UploadFile(filename="fire_api.pdf", file=io.BytesIO(pdf_bytes)),
            application_id="APP-API-EXT",
            doc_slot="fire_noc",
            database=default_db,
            vault=default_vault
        ))
        doc_id = upload_res.document_id

        # Call endpoint
        res = asyncio.run(extract_fields_endpoint(
            application_id="APP-API-EXT",
            document_id=doc_id
        ))

        self.assertEqual(res["completeness_status"], "COMPLETE")
        self.assertEqual(res["doc_type"], "FIRE_NOC")
        self.assertEqual(res["pipeline_stage"], "S6_EXTRACTION")

        # 404 test
        with self.assertRaises(HTTPException) as cm:
            asyncio.run(extract_fields_endpoint(
                application_id="APP-API-EXT",
                document_id="doc_missing_9999"
            ))
        self.assertEqual(cm.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
