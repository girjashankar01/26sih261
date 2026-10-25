import asyncio
from datetime import date
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest

from fastapi import HTTPException
from jsonschema import Draft202012Validator, RefResolver

from backend.api.main import validate_application_endpoint
from backend.db.connection import Database
from backend.db.repository import init_db
from backend.facts.service import build_c3_fact
from backend.records.adapter import MockRecordsAdapter
from backend.rules import (
    FAILED_CHECK,
    NEEDS_REVIEW,
    NOT_CHECKED,
    PASS,
    WARNING,
    Pre,
    harden,
    load_rule_set,
    precheck,
    run_rule_set,
    validate_application,
    validate_rule_set,
)


class TestRulesEngineV4(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_rules_")
        self.db_path = os.path.join(self.test_dir, "test.db")
        self.test_db = Database(f"sqlite:///{self.db_path}")
        init_db(self.test_db)
        self.records_adapter = MockRecordsAdapter()

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

    def test_gate_precheck_and_harden(self):
        # 1. Missing fact -> NOT_CHECKED
        p1 = precheck(None)
        self.assertEqual(p1.block, (NOT_CHECKED, "value unavailable"))
        self.assertFalse(p1.hard_ok)

        # 2. Ambiguous parse state -> NEEDS_REVIEW
        f_ambig = {"value": "2026-03-31", "parse_state": "ambiguous", "grounded": True, "conf": 0.9}
        p2 = precheck(f_ambig)
        self.assertEqual(p2.block, (NEEDS_REVIEW, "value ambiguous"))

        # 3. Ungrounded fact when need_grounded=True -> NEEDS_REVIEW
        f_ungrounded = {"value": "2026-03-31", "parse_state": "ok", "grounded": False, "conf": 0.9}
        p3 = precheck(f_ungrounded, need_grounded=True)
        self.assertEqual(p3.block, (NEEDS_REVIEW, "value not grounded on the page"))

        # 4. Low confidence -> NEEDS_REVIEW
        f_low_conf = {"value": "2026-03-31", "parse_state": "ok", "grounded": True, "conf": 0.4}
        p4 = precheck(f_low_conf, min_conf=0.6)
        self.assertEqual(p4.block, (NEEDS_REVIEW, "low confidence"))

        # 5. Uncalibrated confidence kind cannot support FAILED_CHECK under the gate
        f_uncalibrated = {
            "value": "2026-03-31",
            "parse_state": "ok",
            "grounded": True,
            "conf": 0.8,
            "conf_kind": "heuristics",
        }
        p5 = precheck(f_uncalibrated)
        self.assertIsNone(p5.block)
        self.assertFalse(p5.hard_ok)
        self.assertEqual(harden(FAILED_CHECK, [p5]), NEEDS_REVIEW)

        # 6. Calibrated regex_exact allows FAILED_CHECK
        f_calibrated = {
            "value": "2026-03-31",
            "parse_state": "ok",
            "grounded": True,
            "conf": 1.0,
            "conf_kind": "regex_exact",
        }
        p6 = precheck(f_calibrated)
        self.assertIsNone(p6.block)
        self.assertTrue(p6.hard_ok)
        self.assertEqual(harden(FAILED_CHECK, [p6]), FAILED_CHECK)

    def test_validate_rule_set_activation(self):
        rs = load_rule_set("EOA_RENEWAL")
        errs = validate_rule_set(rs)
        self.assertEqual(errs, [], f"Active rule set failed activation checks: {errs}")

        # Missing approver fails closed
        invalid_rs = dict(rs)
        invalid_rs["approved_by"] = None
        errs_invalid = validate_rule_set(invalid_rs)
        self.assertTrue(any("approver" in e.lower() for e in errs_invalid))

    def test_determinism_contract(self):
        rs = load_rule_set("EOA_RENEWAL")
        facts = [
            build_c3_fact("DET-001", "application_form", "APPLICATION", "requested_intake", 480, "number"),
            build_c3_fact("DET-001", "synthetic_record", "APPROVED_PROGRAMMES", "approved_intake", 480, "number"),
            build_c3_fact("DET-001", "doc", "AFFIDAVIT", "is_present", True, "boolean", grounded=True),
        ]
        context = {"submitted_documents": ["AFFIDAVIT"], "has_unclassified": False}

        run1 = run_rule_set(rs, facts, context, "DET-001")
        run2 = run_rule_set(rs, facts, context, "DET-001")

        self.assertEqual(run1["data_snapshot_id"], run2["data_snapshot_id"])
        self.assertEqual(run1["workflow"], run2["workflow"])
        self.assertEqual(len(run1["checks"]), len(run2["checks"]))
        for c1, c2 in zip(run1["checks"], run2["checks"]):
            self.assertEqual(c1["rule_id"], c2["rule_id"])
            self.assertEqual(c1["status"], c2["status"])

    def test_rule_r_doc_001_required_doc(self):
        rs = load_rule_set("EOA_RENEWAL")
        doc_rule = next(r for r in rs["rules"] if r["id"] == "R-DOC-001")
        from backend.rules.evaluators import eval_required_doc

        # 1. Present -> PASS
        res_pass = eval_required_doc(doc_rule, [], {"submitted_documents": ["AFFIDAVIT", "FIRE_NOC"]})
        self.assertEqual(res_pass["status"], PASS)

        # 2. Absent and UNCLASSIFIED exists -> NEEDS_REVIEW (never FAILED_CHECK while unclassified exists)
        res_review = eval_required_doc(doc_rule, [], {"submitted_documents": ["FIRE_NOC", "UNCLASSIFIED"], "has_unclassified": True})
        self.assertEqual(res_review["status"], NEEDS_REVIEW)

        # 3. Absent with no unclassified -> FAILED_CHECK
        res_fail = eval_required_doc(doc_rule, [], {"submitted_documents": ["FIRE_NOC"], "has_unclassified": False})
        self.assertEqual(res_fail["status"], FAILED_CHECK)

    def test_rule_r_exp_001_not_expired(self):
        rs = load_rule_set("EOA_RENEWAL")
        exp_rule = next(r for r in rs["rules"] if r["id"] == "R-EXP-001")
        from backend.rules.evaluators import eval_not_expired

        sub_date = "2026-10-12"

        # 1. Expired (valid_till < submitted_on) -> FAILED_CHECK
        f_expired = [
            build_c3_fact("EXP-01", "doc", "FIRE_NOC", "valid_till", "2026-03-31", "date", grounded=True, conf_kind="regex_exact")
        ]
        res1 = eval_not_expired(exp_rule, f_expired, {"submission_date": sub_date})
        self.assertEqual(res1["status"], FAILED_CHECK)

        # 2. Boundary: expires on submission date -> WARNING
        f_boundary = [
            build_c3_fact("EXP-02", "doc", "FIRE_NOC", "valid_till", "2026-10-12", "date", grounded=True)
        ]
        res2 = eval_not_expired(exp_rule, f_boundary, {"submission_date": sub_date})
        self.assertEqual(res2["status"], WARNING)

        # 3. Expiring soon within 30 days -> WARNING
        f_soon = [
            build_c3_fact("EXP-03", "doc", "FIRE_NOC", "valid_till", "2026-10-30", "date", grounded=True)
        ]
        res3 = eval_not_expired(exp_rule, f_soon, {"submission_date": sub_date})
        self.assertEqual(res3["status"], WARNING)

        # 4. Valid far in future -> PASS
        f_ok = [
            build_c3_fact("EXP-04", "doc", "FIRE_NOC", "valid_till", "2027-06-01", "date", grounded=True)
        ]
        res4 = eval_not_expired(exp_rule, f_ok, {"submission_date": sub_date})
        self.assertEqual(res4["status"], PASS)

        # 5. Missing value -> NOT_CHECKED
        res5 = eval_not_expired(exp_rule, [], {"submission_date": sub_date})
        self.assertEqual(res5["status"], NOT_CHECKED)

        # 6. Ambiguous 2-digit year -> NEEDS_REVIEW
        f_ambig = [
            build_c3_fact("EXP-06", "doc", "FIRE_NOC", "valid_till", None, "date", parse_state="ambiguous", raw="31/03/26")
        ]
        res6 = eval_not_expired(exp_rule, f_ambig, {"submission_date": sub_date})
        self.assertEqual(res6["status"], NEEDS_REVIEW)

    def test_rule_r_cross_001_fuzzy_match(self):
        rs = load_rule_set("EOA_RENEWAL")
        cross_rule = next(r for r in rs["rules"] if r["id"] == "R-CROSS-001")
        from backend.rules.evaluators import eval_fuzzy_match

        rec_fact = build_c3_fact("CROSS-01", "synthetic_record", "INSTITUTION", "canonical_name", "Apex Institute of Technology Private Limited", "string")

        # 1. Pvt. Ltd. vs Private Limited -> PASS (control D04c)
        doc_pass = build_c3_fact("CROSS-01", "doc", "ACCREDITATION", "institution_name", "Apex Inst of Tech Pvt. Ltd.", "string", grounded=True)
        res1 = eval_fuzzy_match(cross_rule, [rec_fact, doc_pass], {})
        self.assertEqual(res1["status"], PASS)

        # 2. Trust vs Society -> NEEDS_REVIEW
        doc_legal = build_c3_fact("CROSS-02", "doc", "ACCREDITATION", "institution_name", "Apex Institute of Technology Trust", "string", grounded=True)
        res2 = eval_fuzzy_match(cross_rule, [rec_fact, doc_legal], {})
        self.assertEqual(res2["status"], NEEDS_REVIEW)

        # 3. Partial subset -> NEEDS_REVIEW
        doc_partial = build_c3_fact("CROSS-03", "doc", "ACCREDITATION", "institution_name", "Apex Institute", "string", grounded=True)
        res3 = eval_fuzzy_match(cross_rule, [rec_fact, doc_partial], {})
        self.assertEqual(res3["status"], NEEDS_REVIEW)

        # 4. Different institution -> FAILED_CHECK
        doc_diff = build_c3_fact("CROSS-04", "doc", "ACCREDITATION", "institution_name", "Delhi Engineering College", "string", grounded=True, conf_kind="regex_exact")
        res4 = eval_fuzzy_match(cross_rule, [rec_fact, doc_diff], {})
        self.assertEqual(res4["status"], FAILED_CHECK)

    def test_rule_r_num_001_field_lte_record(self):
        rs = load_rule_set("EOA_RENEWAL")
        num_rule = next(r for r in rs["rules"] if r["id"] == "R-NUM-001")
        from backend.rules.evaluators import eval_field_lte_record

        rec_fact = build_c3_fact("NUM-01", "synthetic_record", "APPROVED_PROGRAMMES", "approved_intake", 480, "number")

        # Intake <= approved -> PASS
        f_pass = build_c3_fact("NUM-01", "application_form", "APPLICATION", "requested_intake", 480, "number")
        res1 = eval_field_lte_record(num_rule, [f_pass, rec_fact], {})
        self.assertEqual(res1["status"], PASS)

        # Intake > approved -> FAILED_CHECK
        f_fail = build_c3_fact("NUM-02", "application_form", "APPLICATION", "requested_intake", 540, "number", conf_kind="regex_exact")
        res2 = eval_field_lte_record(num_rule, [f_fail, rec_fact], {})
        self.assertEqual(res2["status"], FAILED_CHECK)

        # Missing record -> NOT_CHECKED
        res3 = eval_field_lte_record(num_rule, [f_pass], {})
        self.assertEqual(res3["status"], NOT_CHECKED)

    def test_demo_clean_and_defect_cases(self):
        from backend.records.demo import APPLICATIONS

        clean_case = APPLICATIONS["DEMO-CLEAN-001"]
        issues_case = APPLICATIONS["DEMO-ISSUES-001"]

        # Validate clean case
        clean_rep = validate_application(clean_case)
        self.assertEqual(clean_rep["workflow"], "NO_FINDINGS_IN_ENABLED_DEMO_CHECKS")
        self.assertEqual(len(clean_rep["findings"]), 0)
        self.assertTrue(clean_rep["decision_support_only"])
        self.assertTrue(clean_rep["simulated"])

        # Validate defect case
        issues_rep = validate_application(issues_case)
        self.assertEqual(issues_rep["workflow"], "NEEDS_RECTIFICATION")
        self.assertGreater(len(issues_rep["findings"]), 0)

        # Verify exact seeded defect findings
        finding_rules = {f["rule_id"] for f in issues_rep["findings"]}
        self.assertIn("R-DOC-001", finding_rules)  # missing affidavit
        self.assertIn("R-EXP-001", finding_rules)  # expired fire NOC
        self.assertIn("R-NUM-001", finding_rules)  # requested intake > record

        # Validate both against JSON Schema contract
        val_schema = self.schema_store["validation_response.schema.json"]
        resolver = RefResolver.from_schema(val_schema, store=self.schema_store)
        validator = Draft202012Validator(val_schema, resolver=resolver)
        validator.validate(clean_rep)
        validator.validate(issues_rep)

    def test_validate_api_endpoint(self):
        # Call endpoint via asyncio
        res = asyncio.run(validate_application_endpoint(
            application_id="DEMO-CLEAN-001"
        ))

        self.assertEqual(res["application_id"], "DEMO-CLEAN-001")
        self.assertTrue(res["simulated"])
        self.assertTrue(res["decision_support_only"])
        self.assertIn("checks", res)
        self.assertIn("findings", res)

        # 400 test for invalid ID
        with self.assertRaises(HTTPException) as cm:
            asyncio.run(validate_application_endpoint(application_id="   "))
        self.assertEqual(cm.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
