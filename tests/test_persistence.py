import asyncio
import io
import os
import shutil
import tempfile
import unittest
from unittest.mock import patch

import blake3
from fastapi import UploadFile

from backend.db.connection import Database
from backend.db.repository import (
    count_uploads_for_blob,
    get_upload_by_idempotency_key,
    init_db,
)
from backend.ingest.service import IngestError, process_upload_stream
from backend.storage.vault import VaultStorage, format_vault_key

SAMPLE_PDF = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 /Root 1 0 R >>\nstartxref\n50\n%%EOF"
SAMPLE_PDF_2 = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R /Different true >>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 /Root 1 0 R >>\nstartxref\n65\n%%EOF"


def make_upload_file(data: bytes, filename: str = "document.pdf") -> UploadFile:
    return UploadFile(filename=filename, file=io.BytesIO(data))


class TestPersistenceAndVault(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_persist_")
        self.scratch_dir = os.path.join(self.test_dir, "scratch")
        self.vault_dir = os.path.join(self.test_dir, "vault")
        self.db_path = os.path.join(self.test_dir, "test.db")
        os.makedirs(self.scratch_dir, exist_ok=True)
        os.makedirs(self.vault_dir, exist_ok=True)

        self.vault = VaultStorage(root_dir=self.vault_dir)
        self.db = Database(f"sqlite:///{self.db_path}")
        init_db(self.db)

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_upload_persists_to_vault_and_database(self):
        f = make_upload_file(SAMPLE_PDF, "land_deed.pdf")
        res = asyncio.run(
            process_upload_stream(
                f,
                application_id="DEMO-CLEAN-001",
                doc_slot="land_deed",
                scratch_dir=self.scratch_dir,
                vault=self.vault,
                database=self.db,
            )
        )
        self.assertEqual(res.processing_state, "PERSISTED")
        self.assertEqual(res.persistence_status, "VAULT_LOCAL")
        self.assertTrue(res.is_new_blob)
        self.assertFalse(res.idempotent_replay)

        # Verify vault contains exact bytes
        vault_bytes = self.vault.get_bytes(res.storage_key)
        self.assertEqual(vault_bytes, SAMPLE_PDF)

        # Verify DB records
        with self.db.connection() as conn:
            cur = conn.execute("SELECT blake3, sha256, byte_size, storage_key FROM blobs WHERE blake3 = ?", (res.blake3,))
            blob_row = cur.fetchone()
            self.assertIsNotNone(blob_row)
            self.assertEqual(blob_row["blake3"], res.blake3)
            self.assertEqual(blob_row["byte_size"], len(SAMPLE_PDF))
            self.assertEqual(blob_row["storage_key"], res.storage_key)

            cur2 = conn.execute("SELECT id, application_id, doc_slot FROM uploads WHERE id = ?", (res.document_id,))
            upload_row = cur2.fetchone()
            self.assertIsNotNone(upload_row)
            self.assertEqual(upload_row["application_id"], "DEMO-CLEAN-001")
            self.assertEqual(upload_row["doc_slot"], "land_deed")

    def test_deduplication_of_identical_content(self):
        # First upload
        f1 = make_upload_file(SAMPLE_PDF, "fire_noc_copy1.pdf")
        res1 = asyncio.run(
            process_upload_stream(
                f1,
                application_id="APP-001",
                doc_slot="fire_noc",
                scratch_dir=self.scratch_dir,
                vault=self.vault,
                database=self.db,
            )
        )
        self.assertTrue(res1.is_new_blob)

        # Second upload with identical bytes but different application and slot
        f2 = make_upload_file(SAMPLE_PDF, "fire_noc_copy2.pdf")
        res2 = asyncio.run(
            process_upload_stream(
                f2,
                application_id="APP-002",
                doc_slot="affidavit",
                scratch_dir=self.scratch_dir,
                vault=self.vault,
                database=self.db,
            )
        )
        self.assertFalse(res2.is_new_blob)
        self.assertNotEqual(res1.document_id, res2.document_id)
        self.assertEqual(res1.storage_key, res2.storage_key)
        self.assertEqual(res1.blake3, res2.blake3)

        # Confirm single blob in DB, but two uploads
        with self.db.connection() as conn:
            cur = conn.execute("SELECT COUNT(*) as c FROM blobs")
            self.assertEqual(cur.fetchone()["c"], 1)
            cur2 = conn.execute("SELECT COUNT(*) as c FROM uploads")
            self.assertEqual(cur2.fetchone()["c"], 2)

    def test_storage_integrity_mismatch_detected(self):
        # 1. Put initial file
        f1 = make_upload_file(SAMPLE_PDF, "valid.pdf")
        res = asyncio.run(
            process_upload_stream(
                f1,
                application_id="APP-INT-001",
                scratch_dir=self.scratch_dir,
                vault=self.vault,
                database=self.db,
            )
        )
        storage_path = self.vault._resolve_path(res.storage_key)

        # Corrupt the vault file on disk
        with open(storage_path, "wb") as fh:
            fh.write(b"CORRUPTED CONTENT NOT MATCHING BLAKE3")

        # 2. Upload same content again: deduplication integrity check should catch the mismatch
        f2 = make_upload_file(SAMPLE_PDF, "valid_dup.pdf")
        with self.assertRaises(IngestError) as ctx:
            asyncio.run(
                process_upload_stream(
                    f2,
                    application_id="APP-INT-002",
                    scratch_dir=self.scratch_dir,
                    vault=self.vault,
                    database=self.db,
                )
            )
        self.assertEqual(ctx.exception.status_code, 500)
        self.assertEqual(ctx.exception.detail["error_code"], "STORAGE_INTEGRITY_MISMATCH")

    def test_idempotent_replay_same_key_same_content(self):
        key = "idemp-test-12345"
        f1 = make_upload_file(SAMPLE_PDF, "first.pdf")
        res1 = asyncio.run(
            process_upload_stream(
                f1,
                application_id="APP-IDEMP-01",
                doc_slot="fire_noc",
                idempotency_key=key,
                scratch_dir=self.scratch_dir,
                vault=self.vault,
                database=self.db,
            )
        )
        self.assertFalse(res1.idempotent_replay)

        # Second request with identical key and identical content
        f2 = make_upload_file(SAMPLE_PDF, "second.pdf")
        res2 = asyncio.run(
            process_upload_stream(
                f2,
                application_id="APP-IDEMP-01",
                doc_slot="fire_noc",
                idempotency_key=key,
                scratch_dir=self.scratch_dir,
                vault=self.vault,
                database=self.db,
            )
        )
        self.assertTrue(res2.idempotent_replay)
        self.assertEqual(res2.document_id, res1.document_id)
        self.assertEqual(res2.storage_key, res1.storage_key)
        self.assertEqual(res2.created_at, res1.created_at)

    def test_idempotency_conflict_different_content(self):
        key = "idemp-conflict-key"
        f1 = make_upload_file(SAMPLE_PDF, "first.pdf")
        asyncio.run(
            process_upload_stream(
                f1,
                application_id="APP-IDEMP-02",
                idempotency_key=key,
                scratch_dir=self.scratch_dir,
                vault=self.vault,
                database=self.db,
            )
        )

        # Reusing same key with different PDF content
        f2 = make_upload_file(SAMPLE_PDF_2, "different.pdf")
        with self.assertRaises(IngestError) as ctx:
            asyncio.run(
                process_upload_stream(
                    f2,
                    application_id="APP-IDEMP-02",
                    idempotency_key=key,
                    scratch_dir=self.scratch_dir,
                    vault=self.vault,
                    database=self.db,
                )
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["error_code"], "IDEMPOTENCY_CONFLICT")

    def test_idempotency_conflict_different_application(self):
        key = "idemp-diff-app-key"
        f1 = make_upload_file(SAMPLE_PDF, "first.pdf")
        asyncio.run(
            process_upload_stream(
                f1,
                application_id="APP-A",
                idempotency_key=key,
                scratch_dir=self.scratch_dir,
                vault=self.vault,
                database=self.db,
            )
        )

        # Reusing same key with same content but different application ID
        f2 = make_upload_file(SAMPLE_PDF, "second.pdf")
        with self.assertRaises(IngestError) as ctx:
            asyncio.run(
                process_upload_stream(
                    f2,
                    application_id="APP-B",
                    idempotency_key=key,
                    scratch_dir=self.scratch_dir,
                    vault=self.vault,
                    database=self.db,
                )
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["error_code"], "IDEMPOTENCY_CONFLICT")

    def test_reverse_failure_orphan_cleanup_when_no_prior_refs(self):
        # Simulate failure in DB insert when writing a brand new blob
        b3_hex = blake3.blake3(SAMPLE_PDF).hexdigest()
        storage_key = format_vault_key(b3_hex)

        f = make_upload_file(SAMPLE_PDF, "failing_tx.pdf")

        with patch("backend.ingest.service.insert_upload", side_effect=RuntimeError("Simulated DB Disk Crash")):
            with self.assertRaises(IngestError) as ctx:
                asyncio.run(
                    process_upload_stream(
                        f,
                        application_id="APP-FAIL-01",
                        scratch_dir=self.scratch_dir,
                        vault=self.vault,
                        database=self.db,
                    )
                )
            self.assertEqual(ctx.exception.status_code, 500)
            self.assertEqual(ctx.exception.detail["error_code"], "DATABASE_TRANSACTION_FAILED")

        # Verify vault object was cleaned up because it was a new blob and no other uploads reference it
        self.assertFalse(self.vault.exists(storage_key))
        with self.db.connection() as conn:
            cur = conn.execute("SELECT COUNT(*) as c FROM uploads")
            self.assertEqual(cur.fetchone()["c"], 0)
            cur2 = conn.execute("SELECT COUNT(*) as c FROM blobs")
            self.assertEqual(cur2.fetchone()["c"], 0)

    def test_reverse_failure_preserves_content_if_referenced_by_other_upload(self):
        # 1. Successful first upload establishes blob and 1 reference
        f1 = make_upload_file(SAMPLE_PDF, "existing.pdf")
        res1 = asyncio.run(
            process_upload_stream(
                f1,
                application_id="APP-ORIGINAL",
                scratch_dir=self.scratch_dir,
                vault=self.vault,
                database=self.db,
            )
        )
        self.assertTrue(self.vault.exists(res1.storage_key))

        # 2. Second upload of same content fails during DB transaction
        f2 = make_upload_file(SAMPLE_PDF, "second_failing.pdf")
        with patch("backend.ingest.service.insert_upload", side_effect=RuntimeError("DB constraint error")):
            with self.assertRaises(IngestError) as ctx:
                asyncio.run(
                    process_upload_stream(
                        f2,
                        application_id="APP-FAIL-02",
                        scratch_dir=self.scratch_dir,
                        vault=self.vault,
                        database=self.db,
                    )
                )
            self.assertEqual(ctx.exception.status_code, 500)

        # 3. Storage object MUST NOT be deleted because APP-ORIGINAL still references it!
        self.assertTrue(self.vault.exists(res1.storage_key))
        with self.db.connection() as conn:
            refs = count_uploads_for_blob(conn, res1.blake3, self.db)
            self.assertEqual(refs, 1)


if __name__ == "__main__":
    unittest.main()
