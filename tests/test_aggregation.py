import asyncio
import json
import os
import shutil
import tempfile
import unittest
from datetime import date
from jsonschema import validate

from backend.api.main import get_application_aggregation_endpoint
from backend.api.schemas import AggregationResponseModel
from backend.aggregation.service import (
    derive_workflow_status,
    derive_review_lane,
    calculate_priority_score,
    generate_application_alerts,
    aggregate_application,
)
from backend.db.connection import Database
from backend.db.repository import (
    init_db,
    insert_blob,
    insert_upload,
    insert_verification,
    insert_infra_evidence,
    get_alerts_by_app,
)


class TestAggregationModule(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_agg_")
        self.db_path = os.path.join(self.test_dir, "test.db")
        self.test_db = Database(f"sqlite:///{self.db_path}")
        init_db(self.test_db)

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_workflow_status_rectification(self):
        """Open rectifiable findings must yield NEEDS_RECTIFICATION."""
        findings = [
            {
                "rule_id": "R-EXP-001",
                "category": "EXPIRED_CERTIFICATE",
                "status": "FAILED_CHECK",
                "lifecycle": "open",
                "severity": "high",
            }
        ]
        checks = [{"rule_id": "R-EXP-001", "status": "FAILED_CHECK"}]
        verifications = [{"document_id": "d1", "status": "VERIFIED"}]
        status = derive_workflow_status(findings, checks, verifications)
        self.assertEqual(status, "NEEDS_RECTIFICATION")

    def test_workflow_status_manual_review_mandatory_blocker(self):
        """Mandatory NOT_CHECKED / NEEDS_REVIEW must yield NEEDS_MANUAL_REVIEW."""
        findings = []
        checks = [{"rule_id": "R-DOC-001", "status": "NOT_CHECKED"}]
        verifications = [{"document_id": "d1", "status": "VERIFIED"}]
        status = derive_workflow_status(findings, checks, verifications)
        self.assertEqual(status, "NEEDS_MANUAL_REVIEW")

    def test_workflow_status_manual_review_verification_status(self):
        """MANUAL_REVIEW_REQUIRED verification outcome yields NEEDS_MANUAL_REVIEW."""
        findings = []
        checks = [{"rule_id": "R-DOC-001", "status": "PASS"}]
        verifications = [{"document_id": "d1", "status": "MANUAL_REVIEW_REQUIRED"}]
        status = derive_workflow_status(findings, checks, verifications)
        self.assertEqual(status, "NEEDS_MANUAL_REVIEW")

    def test_workflow_status_manual_review_high_tier(self):
        """Document tier HIGH yields NEEDS_MANUAL_REVIEW."""
        findings = []
        checks = [{"rule_id": "R-DOC-001", "status": "PASS"}]
        verifications = [{"document_id": "d1", "status": "VERIFIED"}]
        status = derive_workflow_status(findings, checks, verifications, doc_tiers=["HIGH"])
        self.assertEqual(status, "NEEDS_MANUAL_REVIEW")

    def test_workflow_status_validated_no_issues(self):
        """Clean pass on all mandatory checks and verifications yields VALIDATED_NO_ISSUES."""
        findings = []
        checks = [{"rule_id": "R-DOC-001", "status": "PASS"}]
        verifications = [{"document_id": "d1", "status": "VERIFIED"}]
        status = derive_workflow_status(findings, checks, verifications, doc_tiers=["LOW"])
        self.assertEqual(status, "VALIDATED_NO_ISSUES")

    def test_review_lane_scrutiny(self):
        """HIGH tier or high-severity finding routes to NEEDS_SCRUTINY."""
        lane = derive_review_lane(
            workflow_status="NEEDS_RECTIFICATION",
            doc_tiers=["HIGH"],
            findings=[],
        )
        self.assertEqual(lane, "NEEDS_SCRUTINY")

    def test_review_lane_verification(self):
        """Pending or manual verification routes to NEEDS_VERIFICATION."""
        lane = derive_review_lane(
            workflow_status="NEEDS_MANUAL_REVIEW",
            doc_tiers=["LOW"],
            findings=[],
            verifications=[{"document_id": "d1", "status": "VERIFICATION_PENDING"}],
        )
        self.assertEqual(lane, "NEEDS_VERIFICATION")

    def test_review_lane_evidence(self):
        """Missing or expired finding routes to NEEDS_EVIDENCE."""
        lane = derive_review_lane(
            workflow_status="NEEDS_RECTIFICATION",
            doc_tiers=["LOW"],
            findings=[{"category": "MISSING_DOCUMENT", "lifecycle": "open"}],
            verifications=[{"document_id": "d1", "status": "VERIFIED"}],
        )
        self.assertEqual(lane, "NEEDS_EVIDENCE")

    def test_review_lane_fast_review(self):
        """VALIDATED_NO_ISSUES routes to FAST_REVIEW."""
        lane = derive_review_lane(
            workflow_status="VALIDATED_NO_ISSUES",
            doc_tiers=["LOW"],
            findings=[],
            verifications=[{"document_id": "d1", "status": "VERIFIED"}],
        )
        self.assertEqual(lane, "FAST_REVIEW")

    def test_priority_score_formula(self):
        """Priority score = 100·high + 30·medium + 5·low + age_days + deadline_pressure."""
        findings = [
            {"severity": "high"},
            {"severity": "high"},
            {"severity": "medium"},
            {"severity": "low"},
        ]
        # Current date: 2026-10-24, Submitted: 2026-10-14 -> 10 days age
        # Deadline: 2026-10-30 -> 6 days away (<= 7 days) -> +50 deadline pressure
        res = calculate_priority_score(
            findings=findings,
            submitted_on="2026-10-14",
            deadline_date="2026-10-30",
            current_date=date(2026, 10, 24),
        )
        # Expected: 2*100 + 1*30 + 1*5 + 10 + 50 = 200 + 30 + 5 + 10 + 50 = 295
        self.assertEqual(res["score"], 295)
        self.assertEqual(res["breakdown"]["high"], 2)
        self.assertEqual(res["breakdown"]["medium"], 1)
        self.assertEqual(res["breakdown"]["low"], 1)
        self.assertEqual(res["breakdown"]["age_days"], 10)
        self.assertEqual(res["breakdown"]["deadline_pressure"], 50)
        self.assertIn("100·high", res["formula"])

    def test_generate_alerts(self):
        """Alerts generated for expired document, high tier, and verification required."""
        findings = [
            {
                "rule_id": "R-EXP-001",
                "category": "EXPIRED_CERTIFICATE",
                "severity": "high",
                "lifecycle": "open",
                "reason": "Fire NOC certificate expired",
            }
        ]
        verifications = [
            {
                "document_id": "doc_fire_01",
                "status": "MANUAL_REVIEW_REQUIRED",
                "reason": "Issuer seal unclear",
            }
        ]
        alerts = generate_application_alerts(
            application_id="APP-TEST-001",
            findings=findings,
            verifications=verifications,
            doc_tiers=["HIGH"],
        )
        categories = {a["category"] for a in alerts}
        self.assertIn("HIGH_TIER_DOCUMENT", categories)
        self.assertIn("DOCUMENT_EXPIRED", categories)
        self.assertIn("VERIFICATION_ATTENTION_REQUIRED", categories)

    def test_aggregate_application_e2e(self):
        """Test full aggregate_application with database persistence and alert recording."""
        app_id = "APP-AGG-001"
        b3 = "b3_agg_test_01"
        sha = "sha_agg_test_01"

        with self.test_db.transaction() as conn:
            insert_blob(conn, b3, sha, 1024, "application/pdf", "key_agg_01", database=self.test_db)
            insert_upload(conn, "doc_agg_01", app_id, b3, "B02", database=self.test_db)
            insert_verification(
                conn,
                {
                    "id": f"verif-{app_id}-01",
                    "application_id": app_id,
                    "document_id": "doc_agg_01",
                    "adapter": "qr_state_fire_service",
                    "source": "state_fire_portal",
                    "status": "EXPIRED",
                    "request_digest": "req_dig_01",
                    "response_digest": "resp_dig_01",
                    "simulated": True,
                    "checked_at": "2026-10-24T10:00:00Z",
                    "reason": "Simulated fire certificate expired",
                },
                database=self.test_db,
            )

        agg = aggregate_application(
            application_id=app_id,
            database=self.test_db,
        )

        self.assertEqual(agg["application_id"], app_id)
        self.assertEqual(agg["pipeline_stage"], "S11_AGGREGATION")
        self.assertIn("workflow_status", agg)
        self.assertIn("review_lane", agg)
        self.assertIn("priority", agg)
        self.assertIn("summary", agg)
        self.assertTrue(agg["simulated"])
        self.assertTrue(agg["decision_support_only"])

        # Check that alerts were persisted into DB
        with self.test_db.connection() as conn:
            persisted_alerts = get_alerts_by_app(conn, app_id, database=self.test_db)
        self.assertGreaterEqual(len(persisted_alerts), 1)

    def test_api_endpoint_and_schema_contract(self):
        """Test GET /applications/{id}/aggregate against Pydantic schema and JSON schema contract."""
        data = asyncio.run(get_application_aggregation_endpoint(application_id="APP-TEST-API-001"))

        # Validate with Pydantic model
        validated_model = AggregationResponseModel.model_validate(data)
        self.assertEqual(validated_model.application_id, "APP-TEST-API-001")
        self.assertEqual(validated_model.pipeline_stage, "S11_AGGREGATION")

        # Convert to JSON dict for schema validation (handling Enums)
        json_data = json.loads(validated_model.model_dump_json())

        # Validate with frozen JSON Schema contract
        with open("docs/contracts/aggregation_response.schema.json", "r", encoding="utf-8") as f:
            contract_schema = json.load(f)
        validate(instance=json_data, schema=contract_schema)


if __name__ == "__main__":
    unittest.main()
