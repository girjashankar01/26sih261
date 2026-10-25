import asyncio
import os
from pathlib import Path
import shutil
import tempfile
import unittest

import cv2
from fastapi import HTTPException
import numpy as np

from backend.api.main import get_application_infra_endpoint
from backend.db.connection import Database
from backend.db.repository import init_db, insert_infra_evidence
from backend.infra import (
    compute_phash,
    evaluate_application_infra,
    evaluate_infra_item,
    hamming_distance,
    haversine_km,
)


class TestInfrastructureEvidence(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_infra_")
        self.db_path = os.path.join(self.test_dir, "test.db")
        self.test_db = Database(f"sqlite:///{self.db_path}")
        init_db(self.test_db)

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def _create_synthetic_image(self, val: int = 128) -> bytes:
        img = np.full((100, 100, 3), val, dtype=np.uint8)
        cv2.circle(img, (50, 50), 30, (255 - val, val, 100), -1)
        _, buf = cv2.imencode(".png", img)
        return buf.tobytes()

    def test_haversine_distance_computation(self):
        # Distance between Greater Noida (28.472, 77.489) and Noida Sec 62 (28.628, 77.365) ~ 21 km
        dist = haversine_km(28.472, 77.489, 28.628, 77.365)
        self.assertAlmostEqual(dist, 21.16, delta=0.5)

        # Distance to itself is 0
        self.assertEqual(haversine_km(28.472, 77.489, 28.472, 77.489), 0.0)

    def test_phash_computation_and_hamming_distance(self):
        b1 = self._create_synthetic_image(100)
        b2 = self._create_synthetic_image(100)
        b3 = self._create_synthetic_image(220)

        h1 = compute_phash(b1)
        h2 = compute_phash(b2)
        h3 = compute_phash(b3)

        self.assertTrue(len(h1) == 16)
        self.assertEqual(hamming_distance(h1, h2), 0)
        self.assertGreater(hamming_distance(h1, h3), 5)

    def test_item_evidence_inventory_insufficient(self):
        item_spec = {"key": "computer_lab_photos", "min_files": 2, "geo_required": False}
        res = evaluate_infra_item(item_spec, evidence_rows=[{"file_id": "f1"}], form_claims={})
        self.assertEqual(res["status"], "ADDITIONAL_EVIDENCE_REQUIRED")
        self.assertIn("Insufficient evidence", res["reason"])

    def test_item_missing_geotag_when_required(self):
        item_spec = {"key": "classroom_photos", "min_files": 1, "geo_required": True}
        evidence_no_geo = [{"file_id": "f1", "latitude": None, "longitude": None}]
        res = evaluate_infra_item(item_spec, evidence_no_geo, form_claims={})
        self.assertEqual(res["status"], "ADDITIONAL_EVIDENCE_REQUIRED")
        self.assertIn("Geotagged metadata required", res["reason"])

    def test_item_location_inconsistent_distance(self):
        item_spec = {"key": "classroom_photos", "min_files": 1, "geo_required": True, "radius_km": 2.0}
        # Coordinates in Noida Sec 62 (28.628, 77.365) vs campus in Greater Noida (28.472, 77.489) ~ 21 km
        evidence_far = [{"file_id": "f1", "latitude": 28.628, "longitude": 77.365}]
        campus = (28.472, 77.489)
        res = evaluate_infra_item(item_spec, evidence_far, form_claims={}, campus_coords=campus)
        self.assertEqual(res["status"], "LOCATION_METADATA_INCONSISTENT")
        self.assertIn("Photo GPS location is", res["reason"])

    def test_item_claimed_area_below_minimum_norm(self):
        item_spec = {
            "key": "computer_lab_photos",
            "min_files": 1,
            "geo_required": False,
            "min_value": 60,
            "claimed_value": {"form": "lab_area_sqm"},
        }
        evidence = [{"file_id": "f1"}]
        res = evaluate_infra_item(item_spec, evidence, form_claims={"lab_area_sqm": 45})
        self.assertEqual(res["status"], "INSPECTION_SUGGESTED")
        self.assertIn("Claimed value (45) is below configured minimum norm", res["reason"])

    def test_item_duplicate_photo_cross_institution(self):
        item_spec = {"key": "computer_lab_photos", "min_files": 1, "geo_required": False}
        phash_val = "123456789abcdef0"
        evidence_this_app = [{"file_id": "f1", "phash": phash_val}]
        evidence_other_app = [{"file_id": "f99", "phash": phash_val, "application_id": "OTHER-APP-001"}]

        res = evaluate_infra_item(
            item_spec,
            evidence_rows=evidence_this_app,
            form_claims={},
            other_institution_evidence=evidence_other_app,
        )
        self.assertEqual(res["status"], "POSSIBLE_DUPLICATE_EVIDENCE")
        self.assertIn("Perceptual image hash matches evidence file uploaded by another institution", res["reason"])

    def test_item_complete_evidence(self):
        item_spec = {"key": "central_library_photos", "min_files": 1, "geo_required": False}
        evidence = [{"file_id": "f1", "latitude": 28.472, "longitude": 77.489}]
        res = evaluate_infra_item(item_spec, evidence, form_claims={}, campus_coords=(28.472, 77.489))
        self.assertEqual(res["status"], "EVIDENCE_COMPLETE_FOR_REVIEW")
        self.assertNotEqual(res["status"], "compliant")  # Never claim compliant

    def test_evaluate_application_infra_end_to_end(self):
        # Seed 2 classroom photos and 2 lab photos in test_db
        rec1 = {
            "id": "ev-01",
            "application_id": "APP-INFRA-001",
            "item_key": "computer_lab_photos",
            "file_id": "f-lab-01",
            "phash": "aabbccddeeff0011",
            "latitude": 28.4728,
            "longitude": 77.4891,
            "capture_time": "2026-10-01T10:00:00Z",
            "created_at": "2026-10-01T10:00:00Z",
        }
        rec2 = {
            "id": "ev-02",
            "application_id": "APP-INFRA-001",
            "item_key": "computer_lab_photos",
            "file_id": "f-lab-02",
            "phash": "aabbccddeeff0022",
            "latitude": 28.4729,
            "longitude": 77.4892,
            "capture_time": "2026-10-01T10:05:00Z",
            "created_at": "2026-10-01T10:05:00Z",
        }
        with self.test_db.transaction() as conn:
            insert_infra_evidence(conn, rec1, self.test_db)
            insert_infra_evidence(conn, rec2, self.test_db)

        res = evaluate_application_infra(
            application_id="APP-INFRA-001",
            category="EOA_RENEWAL",
            form_claims={"lab_area_sqm": 75},
            database=self.test_db,
        )

        self.assertEqual(res["application_id"], "APP-INFRA-001")
        self.assertEqual(res["pipeline_stage"], "S10_INFRA_CHECKLIST")
        self.assertTrue(res["simulated"])
        self.assertTrue(res["decision_support_only"])
        self.assertGreater(res["total_items"], 0)

    def test_api_infra_endpoint(self):
        res = asyncio.run(get_application_infra_endpoint(application_id="DEMO-CLEAN-001"))
        self.assertEqual(res["application_id"], "DEMO-CLEAN-001")
        self.assertEqual(res["pipeline_stage"], "S10_INFRA_CHECKLIST")
        self.assertTrue(res["simulated"])
        self.assertIn("items", res)

        # 400 on empty ID
        with self.assertRaises(HTTPException) as cm:
            asyncio.run(get_application_infra_endpoint(application_id="   "))
        self.assertEqual(cm.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
