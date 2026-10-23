import hashlib
import os
import shutil
import tempfile
import unittest
import blake3

from backend.storage.vault import VaultStorage, format_vault_key


class TestVaultStorage(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_vault_")
        self.vault = VaultStorage(root_dir=self.test_dir)

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)

    def test_vault_format_key(self):
        h = "9f2c91a0ef3e2189281a719c8f8b1b229910d3e2118320491823901a8f9b2c11"
        expected = "b3/9f/2c/9f2c91a0ef3e2189281a719c8f8b1b229910d3e2118320491823901a8f9b2c11"
        self.assertEqual(format_vault_key(h), expected)

    def test_vault_storage_write_and_read_bytes(self):
        data = b"Hello Vault Storage"
        b3_hex = blake3.blake3(data).hexdigest()
        key = format_vault_key(b3_hex)

        # First put returns True (newly written)
        is_new = self.vault.put_bytes(key, data, if_absent=True)
        self.assertTrue(is_new)
        self.assertTrue(self.vault.exists(key))
        self.assertEqual(self.vault.get_bytes(key), data)

        # Second put with if_absent returns False (deduplicated)
        is_new_again = self.vault.put_bytes(key, data, if_absent=True)
        self.assertFalse(is_new_again)

    def test_vault_storage_put_file(self):
        src_tmp = os.path.join(self.test_dir, "sample.bin")
        data = b"Sample File Content for Vault"
        with open(src_tmp, "wb") as f:
            f.write(data)

        b3_hex = blake3.blake3(data).hexdigest()
        key = format_vault_key(b3_hex)

        is_new = self.vault.put_file(key, src_tmp, if_absent=True)
        self.assertTrue(is_new)
        self.assertTrue(self.vault.exists(key))

        with self.vault.open_stream(key) as stream:
            self.assertEqual(stream.read(), data)

    def test_vault_integrity_verification(self):
        data = b"Integrity Protected Document"
        b3_hex = blake3.blake3(data).hexdigest()
        key = format_vault_key(b3_hex)
        self.vault.put_bytes(key, data)

        # Integrity check passes with correct hash
        self.assertTrue(self.vault.verify_integrity(key, b3_hex))
        # Integrity check fails with wrong hash
        wrong_hex = blake3.blake3(b"Different").hexdigest()
        self.assertFalse(self.vault.verify_integrity(key, wrong_hex))

    def test_vault_path_traversal_rejection(self):
        with self.assertRaises(ValueError):
            self.vault._resolve_path("../../etc/passwd")

        with self.assertRaises(ValueError):
            self.vault._resolve_path("/absolute/path/file")

    def test_vault_delete(self):
        data = b"To be deleted"
        key = format_vault_key(blake3.blake3(data).hexdigest())
        self.vault.put_bytes(key, data)
        self.assertTrue(self.vault.exists(key))

        deleted = self.vault.delete(key)
        self.assertTrue(deleted)
        self.assertFalse(self.vault.exists(key))


if __name__ == "__main__":
    unittest.main()
