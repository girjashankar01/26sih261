import asyncio
import io
import os
import shutil
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import patch
from urllib.parse import urlparse

import blake3
from fastapi import UploadFile

from backend.db.connection import Database
from backend.db.repository import count_uploads_for_blob, init_db
from backend.ingest.service import IngestError, process_upload_stream
from backend.storage.vault import S3VaultStorage, format_vault_key

SAMPLE_PDF = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 /Root 1 0 R >>\nstartxref\n50\n%%EOF"
SAMPLE_PDF_2 = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R /Second true >>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 /Root 1 0 R >>\nstartxref\n63\n%%EOF"


class MockS3Handler(BaseHTTPRequestHandler):
    """
    Minimal S3 wire-compatible HTTP server handling path-style S3 requests.
    Accurately supports If-None-Match: * conditional writes, GET, HEAD, PUT, DELETE.
    """

    storage: dict[str, dict[str, bytes]] = {}

    def log_message(self, format, *args):
        # Silence HTTP server logging during tests
        return

    def _parse_path(self):
        parsed = urlparse(self.path)
        parts = parsed.path.strip("/").split("/", 1)
        bucket = parts[0] if parts and parts[0] else ""
        key = parts[1] if len(parts) > 1 else ""
        return bucket, key

    def do_HEAD(self):
        bucket, key = self._parse_path()
        if not key:
            # Head bucket
            if bucket in self.storage:
                self.send_response(200)
                self.end_headers()
            else:
                self.send_response(404)
                self.end_headers()
            return

        if bucket in self.storage and key in self.storage[bucket]:
            data = self.storage[bucket][key]
            self.send_response(200)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("ETag", f'"{blake3.blake3(data).hexdigest()}"')
            self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        bucket, key = self._parse_path()
        if not key:
            self.send_response(200)
            self.send_header("Content-Type", "application/xml")
            self.end_headers()
            self.wfile.write(b"<ListBucketResult></ListBucketResult>")
            return

        if bucket in self.storage and key in self.storage[bucket]:
            data = self.storage[bucket][key]
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("ETag", f'"{blake3.blake3(data).hexdigest()}"')
            self.end_headers()
            self.wfile.write(data)
        else:
            self.send_response(404)
            self.send_header("Content-Type", "application/xml")
            self.end_headers()
            self.wfile.write(b"<Error><Code>NoSuchKey</Code></Error>")

    def do_PUT(self):
        bucket, key = self._parse_path()
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        if not key:
            # Create bucket
            self.storage.setdefault(bucket, {})
            self.send_response(200)
            self.end_headers()
            return

        self.storage.setdefault(bucket, {})

        # Check conditional write If-None-Match: * (Guide §3.3)
        if_none_match = self.headers.get("If-None-Match")
        if if_none_match == "*" and key in self.storage[bucket]:
            self.send_response(412)
            self.send_header("Content-Type", "application/xml")
            self.end_headers()
            self.wfile.write(b"<Error><Code>PreconditionFailed</Code><Message>At least one of the pre-conditions you specified did not hold</Message></Error>")
            return

        self.storage[bucket][key] = body
        self.send_response(200)
        self.send_header("ETag", f'"{blake3.blake3(body).hexdigest()}"')
        self.end_headers()

    def do_DELETE(self):
        bucket, key = self._parse_path()
        if bucket in self.storage and key in self.storage[bucket]:
            del self.storage[bucket][key]
        self.send_response(204)
        self.end_headers()


def make_upload_file(data: bytes, filename: str = "document.pdf") -> UploadFile:
    return UploadFile(filename=filename, file=io.BytesIO(data))


class TestS3VaultStorageAdapter(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        MockS3Handler.storage = {}
        cls.server = HTTPServer(("127.0.0.1", 0), MockS3Handler)
        cls.port = cls.server.server_port
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        MockS3Handler.storage = {"aicte-vault": {}}
        self.endpoint_url = f"http://127.0.0.1:{self.port}"
        self.vault = S3VaultStorage(
            endpoint_url=self.endpoint_url,
            bucket_name="aicte-vault",
            access_key="test_key",
            secret_key="test_secret",
        )
        self.test_dir = tempfile.mkdtemp(prefix="test_s3_")
        self.scratch_dir = os.path.join(self.test_dir, "scratch")
        os.makedirs(self.scratch_dir, exist_ok=True)
        self.db_path = os.path.join(self.test_dir, "test.db")
        self.db = Database(f"sqlite:///{self.db_path}")
        init_db(self.db)

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_s3_put_get_exists_delete(self):
        key = "b3/ab/cd/test_blob.bin"
        payload = b"Immutable S3 Blob Payload 123"

        # 1. Initially does not exist
        self.assertFalse(self.vault.exists(key))

        # 2. Put bytes with if_absent=True -> returns True
        created = self.vault.put_bytes(key, payload, if_absent=True)
        self.assertTrue(created)
        self.assertTrue(self.vault.exists(key))

        # 3. Put same key with if_absent=True -> returns False (conditional write If-None-Match: *)
        second_put = self.vault.put_bytes(key, b"different bytes", if_absent=True)
        self.assertFalse(second_put)

        # 4. Get bytes matches original payload bit-for-bit
        retrieved = self.vault.get_bytes(key)
        self.assertEqual(retrieved, payload)

        # 5. Open stream reads payload
        stream = self.vault.open_stream(key)
        stream_bytes = stream.read()
        self.assertEqual(stream_bytes, payload)

        # 6. Verify integrity matches BLAKE3
        expected_hex = blake3.blake3(payload).hexdigest()
        self.assertTrue(self.vault.verify_integrity(key, expected_hex))
        self.assertFalse(self.vault.verify_integrity(key, "0000" * 16))

        # 7. Delete removes object
        deleted = self.vault.delete(key)
        self.assertTrue(deleted)
        self.assertFalse(self.vault.exists(key))

    def test_upload_persists_to_s3_vault(self):
        f = make_upload_file(SAMPLE_PDF, "fire_noc.pdf")
        res = asyncio.run(
            process_upload_stream(
                f,
                application_id="APP-S3-001",
                doc_slot="fire_noc",
                scratch_dir=self.scratch_dir,
                vault=self.vault,
                database=self.db,
            )
        )
        self.assertEqual(res.processing_state, "PERSISTED")
        self.assertEqual(res.persistence_status, "VAULT_OBJECT_STORE")
        self.assertTrue(res.is_new_blob)
        self.assertFalse(res.idempotent_replay)
        self.assertTrue(self.vault.exists(res.storage_key))

        # Verify object bytes in S3 match submitted PDF
        s3_bytes = self.vault.get_bytes(res.storage_key)
        self.assertEqual(s3_bytes, SAMPLE_PDF)

    def test_s3_deduplication_across_uploads(self):
        # First upload writes blob to S3
        f1 = make_upload_file(SAMPLE_PDF, "doc1.pdf")
        res1 = asyncio.run(
            process_upload_stream(
                f1,
                application_id="APP-S3-A",
                doc_slot="doc1",
                scratch_dir=self.scratch_dir,
                vault=self.vault,
                database=self.db,
            )
        )
        self.assertTrue(res1.is_new_blob)

        # Second upload with identical bytes to another application
        f2 = make_upload_file(SAMPLE_PDF, "doc2.pdf")
        res2 = asyncio.run(
            process_upload_stream(
                f2,
                application_id="APP-S3-B",
                doc_slot="doc2",
                scratch_dir=self.scratch_dir,
                vault=self.vault,
                database=self.db,
            )
        )
        self.assertFalse(res2.is_new_blob)
        self.assertEqual(res1.storage_key, res2.storage_key)
        self.assertNotEqual(res1.document_id, res2.document_id)

    def test_s3_integrity_mismatch_detected(self):
        f1 = make_upload_file(SAMPLE_PDF, "valid.pdf")
        res = asyncio.run(
            process_upload_stream(
                f1,
                application_id="APP-S3-INT",
                scratch_dir=self.scratch_dir,
                vault=self.vault,
                database=self.db,
            )
        )

        # Corrupt the object in S3
        MockS3Handler.storage["aicte-vault"][res.storage_key] = b"CORRUPTED S3 BYTES"

        # Second upload of same content must catch the integrity mismatch
        f2 = make_upload_file(SAMPLE_PDF, "valid_dup.pdf")
        with self.assertRaises(IngestError) as ctx:
            asyncio.run(
                process_upload_stream(
                    f2,
                    application_id="APP-S3-INT2",
                    scratch_dir=self.scratch_dir,
                    vault=self.vault,
                    database=self.db,
                )
            )
        self.assertEqual(ctx.exception.status_code, 500)
        self.assertEqual(ctx.exception.detail["error_code"], "STORAGE_INTEGRITY_MISMATCH")

    def test_s3_idempotent_replay_and_conflict(self):
        key = "idemp-s3-test-key"
        f1 = make_upload_file(SAMPLE_PDF, "idemp1.pdf")
        res1 = asyncio.run(
            process_upload_stream(
                f1,
                application_id="APP-S3-IDEMP",
                idempotency_key=key,
                scratch_dir=self.scratch_dir,
                vault=self.vault,
                database=self.db,
            )
        )
        self.assertFalse(res1.idempotent_replay)
        self.assertEqual(res1.persistence_status, "VAULT_OBJECT_STORE")

        # Replay same key + same content -> idempotent replay
        f2 = make_upload_file(SAMPLE_PDF, "idemp2.pdf")
        res2 = asyncio.run(
            process_upload_stream(
                f2,
                application_id="APP-S3-IDEMP",
                idempotency_key=key,
                scratch_dir=self.scratch_dir,
                vault=self.vault,
                database=self.db,
            )
        )
        self.assertTrue(res2.idempotent_replay)
        self.assertEqual(res2.document_id, res1.document_id)

        # Replay same key + DIFFERENT content -> HTTP 409 conflict
        f3 = make_upload_file(SAMPLE_PDF_2, "different.pdf")
        with self.assertRaises(IngestError) as ctx:
            asyncio.run(
                process_upload_stream(
                    f3,
                    application_id="APP-S3-IDEMP",
                    idempotency_key=key,
                    scratch_dir=self.scratch_dir,
                    vault=self.vault,
                    database=self.db,
                )
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["error_code"], "IDEMPOTENCY_CONFLICT")

    def test_s3_reverse_failure_cleanup(self):
        # When new blob S3 put succeeds but DB transaction fails:
        b3_hex = blake3.blake3(SAMPLE_PDF).hexdigest()
        storage_key = format_vault_key(b3_hex)

        f = make_upload_file(SAMPLE_PDF, "fail.pdf")
        with patch("backend.ingest.service.insert_upload", side_effect=RuntimeError("Simulated DB Disk Crash")):
            with self.assertRaises(IngestError) as ctx:
                asyncio.run(
                    process_upload_stream(
                        f,
                        application_id="APP-FAIL-S3",
                        scratch_dir=self.scratch_dir,
                        vault=self.vault,
                        database=self.db,
                    )
                )
            self.assertEqual(ctx.exception.status_code, 500)

        # Verify unreferenced S3 object was cleaned up
        self.assertFalse(self.vault.exists(storage_key))


if __name__ == "__main__":
    unittest.main()
