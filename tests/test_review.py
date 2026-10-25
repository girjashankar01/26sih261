import asyncio
import json
import os
import shutil
import tempfile
import unittest
from jsonschema import validate
from fastapi import HTTPException

from backend.review.findings import record_finding_action
from backend.review.exports import (
    generate_deficiency_notice,
    generate_inspection_brief,
    generate_application_report,
)
from backend.api.main import (
    act_on_finding_endpoint,
    get_finding_actions_endpoint,
    get_deficiency_notice_endpoint,
    get_inspection_brief_endpoint,
    get_application_report_endpoint,
)
from backend.api.schemas import (
    FindingActionRequestModel,
    DeficiencyNoticeResponseModel,
    InspectionBriefResponseModel,
    ApplicationReportResponseModel,
)
from backend.db.connection import Database
from backend.db.repository import (
    init_db,
    insert_blob,
    insert_upload,
    insert_facts_batch,
    insert_verification,
    insert_infra_evidence,
)
from backend.facts.service import build_c3_fact


class TestReviewModule(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_review_")
        self.db_path = os.path.join(self.test_dir, "test.db")
        self.test_db = Database(f"sqlite:///{self.db_path}")
        init_db(self.test_db)

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_record_finding_action_acknowledge(self):
        """Test acknowledging a finding transitions state and registers audit event."""
        res = record_finding_action(
            application_id="APP-REV-001",
            finding_id="find-doc-01",
            action="acknowledge",
            actor="officer_patel",
            database=self.test_db,
        )
        self.assertEqual(res["action"], "acknowledge")
        self.assertEqual(res["new_state"], "acknowledged")
        self.assertEqual(res["previous_state"], "open")
        self.assertIsNotNone(res.get("audit_event_id"))
        self.assertIsNotNone(res.get("audit_entry_hash"))

    def test_mandatory_reason_enforcement(self):
        """Dismiss, request_rectification, and escalate require non-empty officer reason."""
        with self.assertRaises(HTTPException) as ctx:
            record_finding_action(
                application_id="APP-REV-001",
                finding_id="find-doc-01",
                action="dismiss",
                actor="officer_patel",
                reason="",  # empty reason
                database=self.test_db,
            )
        self.assertEqual(ctx.exception.status_code, 422)

    def test_escalation_and_senior_officer_resolution(self):
        """Only senior_officer role can resolve an escalated finding (Guide §15.2)."""
        # Escalate finding with reason
        record_finding_action(
            application_id="APP-REV-001",
            finding_id="find-doc-02",
            action="escalate",
            actor="officer_patel",
            reason="Uncertainty regarding local municipality NOC authority",
            database=self.test_db,
        )

        # Normal officer attempting to resolve fails with 403
        with self.assertRaises(HTTPException) as ctx:
            record_finding_action(
                application_id="APP-REV-001",
                finding_id="find-doc-02",
                action="resolve",
                actor="officer_patel",
                reason="Overriding escalation",
                user_role="officer",
                database=self.test_db,
            )
        self.assertEqual(ctx.exception.status_code, 403)

        # Senior officer can resolve
        resolved = record_finding_action(
            application_id="APP-REV-001",
            finding_id="find-doc-02",
            action="resolve",
            actor="senior_officer_deshmukh",
            reason="Confirmed authenticity through state commissioner contact",
            user_role="senior_officer",
            database=self.test_db,
        )
        self.assertEqual(resolved["new_state"], "resolved")
        self.assertEqual(resolved["previous_state"], "escalated")

    def test_deficiency_notice_draft_generation(self):
        """Test draft deficiency notice compiles open rectifiable findings with two-sided evidence."""
        app_id = "APP-DEF-001"
        b3 = "b3_def_test_01"
        sha = "sha_def_test_01"

        with self.test_db.transaction() as conn:
            insert_blob(conn, b3, sha, 1024, "application/pdf", "key_def_01", database=self.test_db)
            insert_upload(conn, "doc_fire_01", app_id, b3, "B02", database=self.test_db)
            facts = [
                build_c3_fact(app_id, "application_form", "APPLICATION", "category", "EOA_RENEWAL", "string"),
                build_c3_fact(app_id, "application_form", "APPLICATION", "submitted_on", "2026-10-12", "date"),
                build_c3_fact(app_id, "doc", "FIRE_NOC", "certificate_no", "FIRE/KA/2024/00123", "string", grounded=True),
                build_c3_fact(app_id, "doc", "FIRE_NOC", "valid_till", "2024-03-31", "date", grounded=True),  # expired
            ]
            insert_facts_batch(conn, facts, database=self.test_db)

        notice = generate_deficiency_notice(
            application_id=app_id,
            actor="officer_singh",
            database=self.test_db,
        )

        self.assertEqual(notice["application_id"], app_id)
        self.assertEqual(notice["status"], "DRAFT")
        self.assertEqual(notice["document_type"], "DEFICIENCY_NOTICE_DRAFT")
        self.assertGreaterEqual(notice["deficiencies_count"], 1)

        # Verify two-sided evidence fields
        first_def = notice["deficiencies"][0]
        self.assertIn("observed", first_def)
        self.assertIn("expected", first_def)
        self.assertIn("action_required", first_def)
        self.assertIn("handbook_reference", first_def)

        # Dismiss all findings and assert deficiency notice count reaches 0
        for d_item in notice["deficiencies"]:
            record_finding_action(
                application_id=app_id,
                finding_id=d_item["finding_id"],
                action="dismiss",
                actor="officer_singh",
                reason="Overridden by officer review with supporting documentation",
                database=self.test_db,
            )

        updated_notice = generate_deficiency_notice(
            application_id=app_id,
            actor="officer_singh",
            database=self.test_db,
        )
        self.assertEqual(updated_notice["deficiencies_count"], 0)

    def test_inspection_brief_generation(self):
        """Test physical ground inspection brief generation."""
        app_id = "APP-INSP-001"
        with self.test_db.transaction() as conn:
            insert_infra_evidence(
                conn,
                {
                    "id": "inf-insp-01",
                    "application_id": app_id,
                    "item_key": "computer_center",
                    "file_id": "file_lab_01",
                    "phash": "ffff0000ffff0000",
                    "latitude": 13.5000,  # Far from campus
                    "longitude": 78.0000,
                    "capture_time": "2026-10-10T10:00:00Z",
                },
                database=self.test_db,
            )
            insert_verification(
                conn,
                {
                    "id": f"verif-{app_id}-01",
                    "application_id": app_id,
                    "document_id": "doc_fire_01",
                    "adapter": "qr_state_fire_service",
                    "source": "state_fire_service",
                    "status": "MANUAL_REVIEW_REQUIRED",
                    "request_digest": "req_1",
                    "response_digest": "resp_1",
                    "simulated": True,
                    "checked_at": "2026-10-24T12:00:00Z",
                    "reason": "Fire station verification pending ground check",
                },
                database=self.test_db,
            )

        brief = generate_inspection_brief(
            application_id=app_id,
            actor="officer_verma",
            database=self.test_db,
        )

        self.assertEqual(brief["application_id"], app_id)
        self.assertEqual(brief["document_type"], "PHYSICAL_INSPECTION_BRIEF")
        self.assertGreaterEqual(brief["facilities_to_inspect_count"], 1)
        self.assertGreaterEqual(brief["pending_verifications_count"], 1)
        self.assertIn("inspection_focus", brief["facilities_to_inspect"][0])

    def test_application_report_generation(self):
        """Test comprehensive application report with checklist transparency and audit head."""
        app_id = "APP-REP-001"
        report = generate_application_report(
            application_id=app_id,
            database=self.test_db,
        )

        self.assertEqual(report["application_id"], app_id)
        self.assertEqual(report["pipeline_stage"], "S12_REPORT_VIEW")
        self.assertIn("audit_chain_head", report)
        self.assertIn("checklist", report)
        self.assertIn("findings", report)
        self.assertIn("verifications", report)
        self.assertIn("infra_checklist", report)

    def test_api_endpoints_and_contracts(self):
        """Test API endpoints and schema contract validation."""
        app_id = "DEMO-ISSUES-001"

        # 1. Deficiency notice endpoint & schema
        notice_data = asyncio.run(get_deficiency_notice_endpoint(application_id=app_id))
        DeficiencyNoticeResponseModel.model_validate(notice_data)
        with open("docs/contracts/deficiency_notice_response.schema.json", "r", encoding="utf-8") as f:
            schema = json.load(f)
        validate(instance=notice_data, schema=schema)

        # 2. Inspection brief endpoint & schema
        brief_data = asyncio.run(get_inspection_brief_endpoint(application_id=app_id))
        InspectionBriefResponseModel.model_validate(brief_data)
        with open("docs/contracts/inspection_brief_response.schema.json", "r", encoding="utf-8") as f:
            schema = json.load(f)
        validate(instance=brief_data, schema=schema)

        # 3. Application report endpoint & schema
        report_data = asyncio.run(get_application_report_endpoint(application_id=app_id))
        ApplicationReportResponseModel.model_validate(report_data)
        with open("docs/contracts/application_report_response.schema.json", "r", encoding="utf-8") as f:
            schema = json.load(f)
        validate(instance=report_data, schema=schema)

        # 4. Finding action endpoint
        req = FindingActionRequestModel(
            action="request_rectification",
            actor="officer_sharma",
            reason="Please provide valid renewed document",
        )
        act_res = asyncio.run(act_on_finding_endpoint(
            application_id=app_id,
            finding_id="R-EXP-001",
            body=req,
        ))
        self.assertEqual(act_res["action"], "request_rectification")
        self.assertEqual(act_res["new_state"], "rectification_requested")

        # 5. Finding actions history endpoint
        hist = asyncio.run(get_finding_actions_endpoint(application_id=app_id))
        self.assertGreaterEqual(hist["total_actions"], 1)


if __name__ == "__main__":
    unittest.main()
