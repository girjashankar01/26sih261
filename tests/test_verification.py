import asyncio
from datetime import date
import io
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest

from fastapi import HTTPException
from jsonschema import Draft202012Validator, RefResolver

from backend.api.main import verify_document_endpoint
from backend.db.connection import Database
from backend.db.repository import (
    get_verifications_by_doc,
    init_db,
    insert_blob,
    insert_facts_batch,
    insert_upload,
)
from backend.facts.service import build_c3_fact
from backend.storage.vault import VaultStorage
from backend.verification.adapters.portal import MockPortalAdapter
from backend.verification.adapters.qr import QRAdapter
from backend.verification.decide import decide
from backend.verification.gateway import VerificationGateway


class TestVerificationGateway(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_verif_")
        self.db_path = os.path.join(self.test_dir, "test.db")
        self.vault_dir = os.path.join(self.test_dir, "vault")
        os.makedirs(self.vault_dir, exist_ok=True)

        self.test_db = Database(f"sqlite:///{self.db_path}")
        init_db(self.test_db)
        self.vault = VaultStorage(root_dir=self.vault_dir)

        self.contracts_dir = Path(__file__).resolve().parents[1] / "docs" / "contracts"
        self.schema_store = {}
        for p in self.contracts_dir.glob("*.schema.json"):
            with open(p, "r", encoding="utf-8") as f:
                s = json.load(f)
                self.schema_store[s.get("$id", p.name)] = s
                self.schema_store[p.name] = s

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_decide_precedence_order(self):
        # 1. Reference not found -> MANUAL_REVIEW_REQUIRED
        st1, r1 = decide(None, {"certificate_no": "FIRE/KA/2024/00123"})
        self.assertEqual(st1, "MANUAL_REVIEW_REQUIRED")
        self.assertEqual(r1.get("reason"), "REFERENCE_NOT_FOUND")

        # 2. Incomplete response -> MANUAL_REVIEW_REQUIRED
        ret_incomplete = {"certificate_no": "FIRE/KA/2024/00123", "institution_name": ""}
        st2, r2 = decide(ret_incomplete, {"certificate_no": "FIRE/KA/2024/00123", "institution_name": "Apex Inst"})
        self.assertEqual(st2, "MANUAL_REVIEW_REQUIRED")
        self.assertEqual(r2.get("reason"), "PARTIAL_RESPONSE")

        # 3. Field mismatch -> MISMATCH_DETECTED
        ret_mismatch = {"certificate_no": "FIRE/KA/2024/00123", "institution_name": "Other College"}
        st3, r3 = decide(ret_mismatch, {"certificate_no": "FIRE/KA/2024/00123", "institution_name": "Apex Institute"})
        self.assertEqual(st3, "MISMATCH_DETECTED")
        self.assertFalse(r3["institution_name"]["match"])

        # 4. Validity ended -> EXPIRED
        ret_expired = {
            "certificate_no": "FIRE/KA/2024/00123",
            "institution_name": "Apex Institute",
            "validity_ended": True,
            "valid_till": "2026-03-31",
        }
        st4, r4 = decide(ret_expired, {"certificate_no": "FIRE/KA/2024/00123", "institution_name": "Apex Institute"}, today=date(2026, 10, 12))
        self.assertEqual(st4, "EXPIRED")

        # 5. Full match -> VERIFIED
        ret_valid = {
            "certificate_no": "FIRE/KA/2024/00123",
            "institution_name": "Apex Institute",
            "validity_ended": False,
            "valid_till": "2027-03-31",
        }
        st5, r5 = decide(ret_valid, {"certificate_no": "FIRE/KA/2024/00123", "institution_name": "Apex Institute"}, today=date(2026, 10, 12))
        self.assertEqual(st5, "VERIFIED")

    def test_qr_adapter_simulated_fire_noc(self):
        ad = QRAdapter()

        # Seeded test 1: FIRE/KA/2024/00123 -> EXPIRED
        res1 = ad.verify(
            doc_type="FIRE_NOC",
            ident="FIRE/KA/2024/00123",
            submitted={"certificate_no": "FIRE/KA/2024/00123", "institution_name": "Apex Institute of Technology Private Limited"},
        )
        self.assertEqual(res1["status"], "EXPIRED")
        self.assertTrue(res1["simulated"])

        # Seeded test 2: FIRE/KA/2024/00999 -> VERIFIED
        res2 = ad.verify(
            doc_type="FIRE_NOC",
            ident="FIRE/KA/2024/00999",
            submitted={"certificate_no": "FIRE/KA/2024/00999", "institution_name": "Apex Institute of Technology Private Limited"},
        )
        self.assertEqual(res2["status"], "VERIFIED")

        # Seeded test 3: FIRE/KA/2024/00456 -> MISMATCH_DETECTED
        res3 = ad.verify(
            doc_type="FIRE_NOC",
            ident="FIRE/KA/2024/00456",
            submitted={"certificate_no": "FIRE/KA/2024/00456", "institution_name": "Apex Institute of Technology Private Limited"},
        )
        self.assertEqual(res3["status"], "MISMATCH_DETECTED")

        # Seeded test 4: Unknown reference -> MANUAL_REVIEW_REQUIRED
        res4 = ad.verify(
            doc_type="FIRE_NOC",
            ident="FIRE/UNKNOWN/999",
            submitted={"certificate_no": "FIRE/UNKNOWN/999"},
        )
        self.assertEqual(res4["status"], "MANUAL_REVIEW_REQUIRED")

    def test_mock_portal_adapter_fallback_states(self):
        gw = VerificationGateway(max_tries=2)

        # 1. 503 Service Unavailable -> retries exhausted -> SOURCE_UNAVAILABLE
        ad_503 = MockPortalAdapter(mode="503")
        res1 = gw.verify(
            application_id="APP-001",
            document_id="doc-portal-01",
            doc_type="AFFIDAVIT",
            ident="AFF-2026-001",
            submitted={},
            adapter_override=ad_503,
            database=self.test_db,
        )
        self.assertEqual(res1["status"], "SOURCE_UNAVAILABLE")

        # 2. Pending response -> VERIFICATION_PENDING
        ad_pending = MockPortalAdapter(mode="pending")
        res2 = gw.verify(
            application_id="APP-001",
            document_id="doc-portal-02",
            doc_type="AFFIDAVIT",
            ident="AFF-2026-002",
            submitted={},
            adapter_override=ad_pending,
            database=self.test_db,
        )
        self.assertEqual(res2["status"], "VERIFICATION_PENDING")

        # 3. Permanent error -> MANUAL_REVIEW_REQUIRED
        ad_perm = MockPortalAdapter(mode="permanent_err")
        res3 = gw.verify(
            application_id="APP-001",
            document_id="doc-portal-03",
            doc_type="AFFIDAVIT",
            ident="AFF-2026-003",
            submitted={},
            adapter_override=ad_perm,
            database=self.test_db,
        )
        self.assertEqual(res3["status"], "MANUAL_REVIEW_REQUIRED")

    def test_gateway_persistence_and_caching(self):
        gw = VerificationGateway()
        ad = QRAdapter()

        res1 = gw.verify(
            application_id="APP-GATEWAY-001",
            document_id="doc-gw-01",
            doc_type="FIRE_NOC",
            ident="FIRE/KA/2024/00999",
            submitted={"certificate_no": "FIRE/KA/2024/00999", "institution_name": "Apex Institute of Technology Private Limited"},
            adapter_override=ad,
            database=self.test_db,
        )
        self.assertEqual(res1["status"], "VERIFIED")

        # Second call returns cache hit
        res2 = gw.verify(
            application_id="APP-GATEWAY-001",
            document_id="doc-gw-01",
            doc_type="FIRE_NOC",
            ident="FIRE/KA/2024/00999",
            submitted={"certificate_no": "FIRE/KA/2024/00999", "institution_name": "Apex Institute of Technology Private Limited"},
            adapter_override=ad,
            database=self.test_db,
        )
        self.assertEqual(res2["status"], "VERIFIED")
        self.assertTrue(res2.get("idempotent_cached"))

        # Verify DB records
        with self.test_db.connection() as conn:
            db_verifs = get_verifications_by_doc(conn, "APP-GATEWAY-001", "doc-gw-01", self.test_db)
        self.assertEqual(len(db_verifs), 1)

        # Validate against c6_verification_result.schema.json
        c6_schema = self.schema_store["c6_verification_result.schema.json"]
        resolver = RefResolver.from_schema(c6_schema, store=self.schema_store)
        validator = Draft202012Validator(c6_schema, resolver=resolver)
        validator.validate(res1)

    def test_api_verify_document_endpoint(self):
        # 400 on empty application or document ID
        with self.assertRaises(HTTPException) as cm1:
            asyncio.run(verify_document_endpoint(application_id="   ", document_id="doc-1"))
        self.assertEqual(cm1.exception.status_code, 400)

        with self.assertRaises(HTTPException) as cm2:
            asyncio.run(verify_document_endpoint(application_id="APP-001", document_id="   "))
        self.assertEqual(cm2.exception.status_code, 400)

        # 404 on non-existent document
        with self.assertRaises(HTTPException) as cm3:
            asyncio.run(verify_document_endpoint(application_id="APP-001", document_id="doc-missing-999"))
        self.assertEqual(cm3.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
