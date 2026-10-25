import asyncio
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest

from fastapi import HTTPException
from jsonschema import Draft202012Validator, RefResolver

from backend.api.main import get_application_facts_endpoint
from backend.db.connection import Database
from backend.db.repository import init_db, insert_facts_batch
from backend.extraction.names import name_compare, norm_id, split_name
from backend.facts.service import aggregate_application_facts, build_c3_fact
from backend.records.adapter import MockRecordsAdapter


class TestTypedFactsAndEntityResolution(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_facts_")
        self.db_path = os.path.join(self.test_dir, "test.db")
        self.test_db = Database(f"sqlite:///{self.db_path}")
        init_db(self.test_db)
        self.records_adapter = MockRecordsAdapter()

        # Load local schema store for contract validation
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


    def test_split_name_abbreviations_and_legal_forms(self):
        core, legal = split_name("Apex Inst. of Engg. & Tech. Pvt. Ltd.")
        self.assertEqual(core, "apex institute engineering technology")
        self.assertEqual(legal, frozenset({"private", "limited"}))

        core2, legal2 = split_name("The St. Xavier Coll. Mgmt. Trust")
        self.assertEqual(core2, "st xavier college management")
        self.assertEqual(legal2, frozenset({"trust"}))

    def test_name_compare_match_control_d04c(self):
        # Pvt. Ltd. vs Private Limited is MATCH
        res = name_compare(
            "Apex Inst of Tech Pvt. Ltd.",
            "Apex Institute of Technology Private Limited"
        )
        self.assertEqual(res, "MATCH")

    def test_name_compare_legal_form_differs(self):
        # Trust vs Society is LEGAL_FORM_DIFFERS
        res = name_compare(
            "Apex Engineering College Trust",
            "Apex Engineering College Society"
        )
        self.assertEqual(res, "LEGAL_FORM_DIFFERS")

    def test_name_compare_partial_subsets(self):
        # Strict subset is PARTIAL
        res = name_compare(
            "Apex Institute",
            "Apex Institute of Technology"
        )
        self.assertEqual(res, "PARTIAL")

    def test_name_compare_different_and_hard_negatives(self):
        # Completely different
        self.assertEqual(
            name_compare("Delhi Engineering College", "Mumbai Institute of Technology"),
            "DIFFERENT"
        )

        # Hard negative: two institutions sharing a common founder name
        self.assertEqual(
            name_compare(
                "Dr. B. R. Ambedkar College of Engineering",
                "Dr. B. R. Ambedkar Institute of Technology"
            ),
            "DIFFERENT"
        )

    def test_norm_id(self):
        # Strips spaces, hyphens, slashes and translates Indic digits
        self.assertEqual(norm_id("FIRE/KA/2024/00123"), "FIREKA202400123")
        self.assertEqual(norm_id(" 1 - 10998877 / 2026 "), "1109988772026")
        # Devanagari numerals: १-१०९९८८७७
        self.assertEqual(norm_id("१-१०९९८८७७"), "110998877")

    def test_records_adapter_mock_envelopes(self):
        adapter = MockRecordsAdapter()
        rec = adapter.institute("1-10998877")
        self.assertIsNotNone(rec)
        self.assertTrue(rec["simulated"])
        self.assertEqual(rec["data"]["name"], "Apex Institute of Technology Private Limited")

        # Missing ID returns None (downstream NOT_CHECKED, never 'does not exist')
        self.assertIsNone(adapter.institute("UNKNOWN-999"))
        self.assertIsNone(adapter.approved_programmes("UNKNOWN-999"))

    def test_aggregate_application_facts_end_to_end(self):
        # Seed a persisted document fact into test_db
        doc_fact = build_c3_fact(
            application_id="TEST-APP-001",
            document_id="doc-fire-123",
            source="doc",
            entity="FIRE_NOC",
            key="institution_name",
            value="Apex Inst of Tech Pvt. Ltd.",
            value_type="string",
            parse_state="ok",
            raw="Apex Inst of Tech Pvt. Ltd.",
            grounded=True,
            source_ref="B04",
            page=1,
            bbox_norm=[0.1, 0.2, 0.8, 0.3],
            bbox_precision="word",
            extractor="regex_extractor",
        )
        doc_fact["created_at"] = "2026-10-24T12:00:00Z"
        doc_fact["bbox_norm_json"] = json.dumps(doc_fact["bbox_norm"])

        with self.test_db.transaction() as conn:
            insert_facts_batch(conn, [doc_fact], self.test_db)


        # Form data
        form_data = {
            "application_id": "TEST-APP-001",
            "aicte_id": "1-10998877",
            "category": "EOA_RENEWAL",
            "submitted_on": "2026-10-12",
            "requested_intake": 480,
            "institution_name": "Apex Institute of Technology Private Limited",
        }

        result = aggregate_application_facts(
            application_id="TEST-APP-001",
            form_data=form_data,
            database=self.test_db,
            records_adapter=self.records_adapter,
        )

        self.assertEqual(result["application_id"], "TEST-APP-001")
        self.assertEqual(result["pipeline_stage"], "S7_TYPED_FACTS")
        self.assertTrue(result["simulated"])
        self.assertIsNotNone(result["canonical_institute"])
        self.assertEqual(result["canonical_institute"]["aicte_id"], "1-10998877")

        # Verify alias resolution
        self.assertEqual(len(result["aliases"]), 1)
        alias = result["aliases"][0]
        self.assertEqual(alias["doc_type"], "FIRE_NOC")
        self.assertEqual(alias["match_status"], "MATCH")

        # Verify cross-source match fact was emitted
        cross_source_facts = [f for f in result["facts"] if f["entity"] == "CROSS_SOURCE"]
        self.assertEqual(len(cross_source_facts), 1)
        self.assertEqual(cross_source_facts[0]["value"], "MATCH")
        self.assertTrue(cross_source_facts[0]["grounded"])

        # Validate schema contract
        facts_schema = self.schema_store["application_facts_response.schema.json"]
        resolver = RefResolver.from_schema(facts_schema, store=self.schema_store)
        validator = Draft202012Validator(facts_schema, resolver=resolver)
        validator.validate(result)

    def test_api_endpoint_get_application_facts(self):
        data = asyncio.run(get_application_facts_endpoint(
            application_id="DEMO-CLEAN-001"
        ))

        self.assertEqual(data["application_id"], "DEMO-CLEAN-001")
        self.assertEqual(data["pipeline_stage"], "S7_TYPED_FACTS")
        self.assertTrue(data["simulated"])
        self.assertTrue(data["decision_support_only"])
        self.assertIsNotNone(data["canonical_institute"])
        self.assertEqual(data["canonical_institute"]["aicte_id"], "1-10998877")
        self.assertGreater(data["facts_count"], 0)

        # Validate schema contract for API output
        facts_schema = self.schema_store["application_facts_response.schema.json"]
        resolver = RefResolver.from_schema(facts_schema, store=self.schema_store)
        validator = Draft202012Validator(facts_schema, resolver=resolver)
        validator.validate(data)

        # Test 400 on empty application ID
        with self.assertRaises(HTTPException) as cm:
            asyncio.run(get_application_facts_endpoint(application_id="   "))
        self.assertEqual(cm.exception.status_code, 400)



if __name__ == "__main__":
    unittest.main()
