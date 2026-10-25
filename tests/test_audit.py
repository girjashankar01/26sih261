import asyncio
import json
import os
import shutil
import tempfile
import unittest

from backend.audit.chain import (
    GENESIS,
    canon,
    sha256_hex,
    audit,
    verify_chain,
    create_checkpoint,
    verify_checkpoint,
    get_demo_signing_keys,
)
from backend.audit.rbac import ROLE_SCOPES, authorize_action
from backend.api.main import (
    get_audit_events_endpoint,
    verify_audit_chain_endpoint,
    create_audit_checkpoint_endpoint,
    get_audit_checkpoints_endpoint,
)
from backend.db.connection import Database
from backend.db.repository import init_db
from fastapi import HTTPException


class TestAuditAndRBAC(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_audit_")
        self.db_path = os.path.join(self.test_dir, "test.db")
        self.test_db = Database(f"sqlite:///{self.db_path}")
        init_db(self.test_db)

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_hash_chain_sequential_append_and_linkage(self):
        """Test sequential audit events append with cryptographic hash chaining."""
        with self.test_db.transaction() as conn:
            ev1 = audit(
                conn,
                actor="officer_1",
                action="DOCUMENT_UPLOADED",
                subject="doc:d123",
                details={"filename": "fire_noc.pdf", "blake3": "abc123hash"},
                database=self.test_db,
            )
            ev2 = audit(
                conn,
                actor="officer_2",
                action="RULE_EVALUATED",
                subject="application:APP-001",
                details={"rule_id": "R-EXP-001", "status": "FAILED_CHECK"},
                database=self.test_db,
            )

        self.assertEqual(ev1["prev_hash"], GENESIS)
        self.assertEqual(ev2["prev_hash"], ev1["entry_hash"])
        self.assertNotEqual(ev1["entry_hash"], ev2["entry_hash"])

        # Verify chain integrity
        with self.test_db.connection() as conn:
            res = verify_chain(conn, database=self.test_db)
        self.assertTrue(res["ok"])
        self.assertEqual(res["count"], 2)
        self.assertEqual(res["head"], ev2["entry_hash"])

    def test_verify_chain_detects_tampering(self):
        """Tampering with any event field or hash must cause verify_chain to fail visibly."""
        with self.test_db.transaction() as conn:
            audit(conn, "user_1", "ACTION_1", "subj:1", {"val": 10}, database=self.test_db)
            audit(conn, "user_2", "ACTION_2", "subj:2", {"val": 20}, database=self.test_db)
            audit(conn, "user_3", "ACTION_3", "subj:3", {"val": 30}, database=self.test_db)

        # Tamper row 2 details directly in DB
        with self.test_db.connection() as conn:
            conn.execute("UPDATE audit_events SET actor = 'malicious_actor' WHERE id = 2")
            conn.commit()

        with self.test_db.connection() as conn:
            res = verify_chain(conn, database=self.test_db)

        self.assertFalse(res["ok"])
        self.assertEqual(res["first_bad_id"], 2)

    def test_ed25519_checkpoint_creation_and_verification(self):
        """Test Ed25519 checkpoint creation and asymmetric signature verification."""
        with self.test_db.transaction() as conn:
            ev = audit(conn, "admin", "SYSTEM_CHECKPOINT", "system", {"info": "demo"}, database=self.test_db)

        checkpoint = create_checkpoint(
            upto_id=ev["id"],
            head_hash=ev["entry_hash"],
            database=self.test_db,
        )

        self.assertEqual(checkpoint["upto_id"], ev["id"])
        self.assertEqual(checkpoint["head_hash"], ev["entry_hash"])

        # Verify signature with trusted public key
        verif_res = verify_checkpoint(checkpoint)
        self.assertTrue(verif_res["valid"])

        # Tamper checkpoint and assert signature check fails
        tampered_checkpoint = dict(checkpoint)
        tampered_checkpoint["head_hash"] = "f" * 64
        tampered_verif = verify_checkpoint(tampered_checkpoint)
        self.assertFalse(tampered_verif["valid"])

    def test_rbac_institution_isolation(self):
        """Institution can access own resources, but 404s on other institutions."""
        # Own application access permitted
        self.assertTrue(
            authorize_action(
                user_role="institution",
                scope="app:read_own",
                user_institute_id="INST_A",
                resource_institute_id="INST_A",
            )
        )

        # Accessing other institute's resource returns 404 (hides existence per §15.2)
        with self.assertRaises(HTTPException) as ctx:
            authorize_action(
                user_role="institution",
                scope="app:read_own",
                user_institute_id="INST_A",
                resource_institute_id="INST_B",
            )
        self.assertEqual(ctx.exception.status_code, 404)

        # Institution trying to edit rules returns 403
        with self.assertRaises(HTTPException) as ctx:
            authorize_action(
                user_role="institution",
                scope="rules:write",
                user_institute_id="INST_A",
                resource_institute_id="INST_A",
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_rbac_officer_and_rules_admin_scopes(self):
        """Test officer, senior_officer, and rules_admin scope enforcement."""
        # Officer can act on findings
        self.assertTrue(authorize_action(user_role="officer", scope="finding:act"))

        # Officer cannot edit rules
        with self.assertRaises(HTTPException) as ctx:
            authorize_action(user_role="officer", scope="rules:write")
        self.assertEqual(ctx.exception.status_code, 403)

        # Rules admin can write rules
        self.assertTrue(authorize_action(user_role="rules_admin", scope="rules:write"))

        # Rules admin cannot read documents
        with self.assertRaises(HTTPException) as ctx:
            authorize_action(user_role="rules_admin", scope="doc:read")
        self.assertEqual(ctx.exception.status_code, 403)

    def test_audit_api_endpoints(self):
        """Test FastAPI audit endpoints."""
        res_events = asyncio.run(get_audit_events_endpoint(limit=50))
        self.assertIn("total_events", res_events)
        self.assertIn("events", res_events)

        res_verify = asyncio.run(verify_audit_chain_endpoint())
        self.assertTrue(res_verify["ok"])

        res_chk = asyncio.run(create_audit_checkpoint_endpoint())
        self.assertIn("signature", res_chk)

        res_chk_list = asyncio.run(get_audit_checkpoints_endpoint(limit=10))
        self.assertGreaterEqual(res_chk_list["total_checkpoints"], 1)


if __name__ == "__main__":
    unittest.main()
