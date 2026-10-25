"""
Comprehensive Unit Tests for S5 Document Typing and Checklist Selection (Guide §11.1).

Tests:
- Deterministic rule classification for FIRE_NOC, ACCREDITATION, EOA_LETTER, AFFIDAVIT
- Calibrated confidence matching Appendix B targets (~0.93, ~0.88, ~0.95)
- Bounded slot prior: slot bonus alone cannot classify unrelated text
- Slot mismatch flag: DOC_TYPE_SLOT_MISMATCH when declared slot differs from detected type
- Unclassified fallback: unknown/ambiguous text returns UNCLASSIFIED
- Evidence grounding: phrases mapped to block IDs and bounding boxes
- Database persistence and idempotent caching
- FastAPI endpoints (POST and GET)
- Schema contract validation against document_type_response.schema.json
"""

import asyncio
import io
import json
import os
import shutil
import tempfile
import unittest

import jsonschema
from fastapi import HTTPException, UploadFile
import pymupdf

from backend.api.main import app, type_document_endpoint
from backend.db.connection import Database
from backend.db.repository import init_db
from backend.ingest.service import process_upload_stream
from backend.storage.vault import LocalVaultStorage
from backend.typing.classifier import (
    classify_document,
    DocumentTypeResult,
    TAU_MIN,
    DELTA,
    SLOT_BONUS,
)
from backend.typing.service import process_document_typing


SCHEMA_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../docs/contracts/document_type_response.schema.json")
)
with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
    TYPE_SCHEMA = json.load(f)


def create_sample_pdf(text_lines: list[str]) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    y = 72
    for line in text_lines:
        page.insert_text((50, y), line, fontsize=11)
        y += 24
    return doc.tobytes()


class TestDocumentTyping(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_typing_")
        self.vault_dir = os.path.join(self.test_dir, "vault")
        self.db_path = os.path.join(self.test_dir, "test.db")
        os.makedirs(self.vault_dir, exist_ok=True)

        self.db = Database(f"sqlite:///{self.db_path}")
        init_db(self.db)
        self.vault = LocalVaultStorage(self.vault_dir)

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_classify_fire_noc(self):
        """Test Fire Safety Certificate classification and confidence matching Appendix B."""
        text = (
            "GOVERNMENT OF KARNATAKA\n"
            "FIRE AND RESCUE SERVICES DEPARTMENT\n"
            "NO OBJECTION CERTIFICATE\n"
            "Certificate No: FIRE/KA/2024/00123\n"
            "This is to certify that the institution premises has complied with all fire safety norms."
        )
        blocks = [
            {"id": "B1_1", "text": "FIRE AND RESCUE SERVICES DEPARTMENT", "bbox_norm": [0.1, 0.1, 0.9, 0.15], "page": 1},
            {"id": "B1_2", "text": "NO OBJECTION CERTIFICATE", "bbox_norm": [0.2, 0.2, 0.8, 0.25], "page": 1},
            {"id": "B1_3", "text": "Certificate No: FIRE/KA/2024/00123", "bbox_norm": [0.1, 0.3, 0.5, 0.35], "page": 1},
        ]
        res = classify_document(
            application_id="APP-001",
            document_id="doc_fire",
            page_1_text=text,
            page_1_blocks=blocks,
            doc_slot="fire_noc"
        )
        self.assertEqual(res.doc_type, "FIRE_NOC")
        self.assertTrue(res.is_classified)
        self.assertGreaterEqual(res.confidence, 0.90)
        self.assertEqual(len(res.flags), 0)
        self.assertTrue(len(res.evidence) > 0)
        
        # Verify evidence grounding to block
        ev_noc = next((e for e in res.evidence if "no objection" in e.phrase.lower()), None)
        self.assertIsNotNone(ev_noc)
        self.assertEqual(ev_noc.block_id, "B1_2")
        self.assertEqual(ev_noc.bbox_norm, [0.2, 0.2, 0.8, 0.25])

    def test_classify_accreditation(self):
        """Test NBA Accreditation letter classification matching Appendix B (~0.88)."""
        text = (
            "NATIONAL BOARD OF ACCREDITATION\n"
            "Accreditation status of the programmes offered by the institution.\n"
            "File No: NBA/2024/TIER-I/54\n"
            "The Tier-I accredited programmes are valid up to 30-06-2027."
        )
        blocks = [
            {"id": "B1_1", "text": "NATIONAL BOARD OF ACCREDITATION", "bbox_norm": [0.1, 0.1, 0.9, 0.15], "page": 1},
            {"id": "B1_2", "text": "Tier-I accredited programmes valid up to 30-06-2027", "bbox_norm": [0.1, 0.2, 0.8, 0.25], "page": 1},
        ]
        res = classify_document(
            application_id="APP-001",
            document_id="doc_nba",
            page_1_text=text,
            page_1_blocks=blocks,
            doc_slot="accreditation"
        )
        self.assertEqual(res.doc_type, "ACCREDITATION")
        self.assertTrue(res.is_classified)
        self.assertGreaterEqual(res.confidence, 0.85)

    def test_classify_eoa_letter(self):
        """Test AICTE EoA Letter classification matching Appendix B (~0.95)."""
        text = (
            "ALL INDIA COUNCIL FOR TECHNICAL EDUCATION\n"
            "Sub: Extension of Approval for Academic Year 2026-27\n"
            "F. No. AICTE/EOA/2026/1-456789\n"
            "Approved Intake for Computer Science and Engineering: 180"
        )
        blocks = [
            {"id": "B1_1", "text": "ALL INDIA COUNCIL FOR TECHNICAL EDUCATION", "bbox_norm": [0.1, 0.1, 0.9, 0.15], "page": 1},
            {"id": "B1_2", "text": "Sub: Extension of Approval for Academic Year 2026-27", "bbox_norm": [0.1, 0.2, 0.8, 0.25], "page": 1},
            {"id": "B1_3", "text": "Approved Intake for Computer Science", "bbox_norm": [0.1, 0.3, 0.6, 0.35], "page": 1},
        ]
        res = classify_document(
            application_id="APP-001",
            document_id="doc_eoa",
            page_1_text=text,
            page_1_blocks=blocks,
            doc_slot="eoa_letter"
        )
        self.assertEqual(res.doc_type, "EOA_LETTER")
        self.assertTrue(res.is_classified)
        self.assertGreaterEqual(res.confidence, 0.90)

    def test_classify_affidavit(self):
        """Test AICTE prescribed format affidavit classification."""
        text = (
            "NON-JUDICIAL STAMP PAPER\n"
            "AFFIDAVIT\n"
            "I, Dr. Rajesh Kumar, solemnly affirm and declare that the institution\n"
            "deponent verified at Bengaluru before me Notary Public."
        )
        res = classify_document(
            application_id="APP-001",
            document_id="doc_aff",
            page_1_text=text,
            doc_slot="affidavit"
        )
        self.assertEqual(res.doc_type, "AFFIDAVIT")
        self.assertTrue(res.is_classified)

    def test_slot_prior_alone_cannot_classify_garbage(self):
        """Slot bonus alone (+0.20) cannot reach tau_min (0.50), returning UNCLASSIFIED (Guide §11.1 #2)."""
        text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Random generic text."
        res = classify_document(
            application_id="APP-001",
            document_id="doc_garbage",
            page_1_text=text,
            doc_slot="fire_noc"
        )
        self.assertEqual(res.doc_type, "UNCLASSIFIED")
        self.assertFalse(res.is_classified)
        self.assertLess(res.confidence, TAU_MIN)
        self.assertIn("manual typing task required", res.decision_reason)

    def test_slot_mismatch_emits_advisory_flag(self):
        """When detected document differs from declared slot, emit DOC_TYPE_SLOT_MISMATCH (Guide §11.1 #5)."""
        text = (
            "NON-JUDICIAL STAMP PAPER\n"
            "AFFIDAVIT\n"
            "I, Dr. Rajesh Kumar, solemnly affirm and declare that all details are true.\n"
            "Deponent verified before Oath Commissioner."
        )
        # Uploaded an Affidavit in the fire_noc slot
        res = classify_document(
            application_id="APP-001",
            document_id="doc_mismatch",
            page_1_text=text,
            doc_slot="fire_noc"
        )
        self.assertEqual(res.doc_type, "AFFIDAVIT")
        self.assertTrue(res.is_classified)
        self.assertEqual(len(res.flags), 1)
        flag = res.flags[0]
        self.assertEqual(flag["code"], "DOC_TYPE_SLOT_MISMATCH")
        self.assertEqual(flag["severity"], "medium")
        self.assertTrue(flag["advisory"])
        self.assertTrue(flag["requires_human_review"])
        self.assertEqual(flag["evidence"]["detected_type"], "AFFIDAVIT")
        self.assertEqual(flag["evidence"]["declared_slot"], "fire_noc")

    def test_schema_compliance_of_result(self):
        """Verify typing result conforms strictly to document_type_response.schema.json."""
        text = (
            "GOVERNMENT OF KARNATAKA\n"
            "FIRE AND RESCUE SERVICES DEPARTMENT\n"
            "NO OBJECTION CERTIFICATE\n"
            "Certificate No: FIRE/KA/2024/00123"
        )
        res = classify_document(
            application_id="APP-001",
            document_id="doc_schema_check",
            page_1_text=text,
            doc_slot="fire_noc"
        )
        res_dict = res.to_dict()
        jsonschema.validate(instance=res_dict, schema=TYPE_SCHEMA)

    def test_end_to_end_typing_service_and_caching(self):
        """Test process_document_typing end-to-end with S4 extraction, DB persistence, and cache hit."""
        pdf_bytes = create_sample_pdf([
            "ALL INDIA COUNCIL FOR TECHNICAL EDUCATION",
            "Extension of Approval (EoA) Academic Year 2026-27",
            "F. No. AICTE/EOA/2026/01234",
            "Approved Intake for Engineering and Technology"
        ])
        upload_res = asyncio.run(process_upload_stream(
            upload_file=UploadFile(filename="eoa.pdf", file=io.BytesIO(pdf_bytes)),
            application_id="APP-E2E-001",
            doc_slot="eoa_letter",
            database=self.db,
            vault=self.vault
        ))
        doc_id = upload_res.document_id

        # First run: computes and persists
        res1 = process_document_typing(
            application_id="APP-E2E-001",
            document_id=doc_id,
            database=self.db,
            vault_backend=self.vault
        )
        self.assertEqual(res1["doc_type"], "EOA_LETTER")
        self.assertTrue(res1["is_classified"])
        self.assertFalse(res1["idempotent_cached"])

        # Second run: serves from cache
        res2 = process_document_typing(
            application_id="APP-E2E-001",
            document_id=doc_id,
            database=self.db,
            vault_backend=self.vault
        )
        self.assertEqual(res2["doc_type"], "EOA_LETTER")
        self.assertTrue(res2["idempotent_cached"])
        self.assertEqual(res2["confidence"], res1["confidence"])

    def test_typing_api_endpoint(self):
        """Test POST /applications/{app_id}/documents/{doc_id}/type endpoint."""
        from backend.db.connection import db as default_db
        from backend.storage.vault import default_vault

        pdf_bytes = create_sample_pdf([
            "GOVERNMENT OF TAMIL NADU",
            "FIRE AND RESCUE SERVICES DEPARTMENT",
            "NO OBJECTION CERTIFICATE",
            "Certificate No: NOC/FIRE/TN/9876",
            "Fire safety measures verified."
        ])
        upload_res = asyncio.run(process_upload_stream(
            upload_file=UploadFile(filename="fire.pdf", file=io.BytesIO(pdf_bytes)),
            application_id="APP-API-TYPING",
            doc_slot="fire_noc",
            database=default_db,
            vault=default_vault
        ))
        doc_id = upload_res.document_id

        # Call endpoint
        res = asyncio.run(type_document_endpoint(
            application_id="APP-API-TYPING",
            document_id=doc_id
        ))
        self.assertEqual(res["doc_type"], "FIRE_NOC")
        self.assertTrue(res["is_classified"])
        self.assertEqual(res["pipeline_stage"], "S5_TYPING")

        # 404 test
        with self.assertRaises(HTTPException) as cm:
            asyncio.run(type_document_endpoint(
                application_id="APP-API-TYPING",
                document_id="doc_missing_9999"
            ))
        self.assertEqual(cm.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
