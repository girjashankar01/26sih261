import os
import shutil
import uuid
from pathlib import Path, PurePosixPath
import blake3


def format_vault_key(blake3_hex: str) -> str:
    """Format content-addressed key scheme: b3/<aa>/<bb>/<blake3> (Guide §3.1)."""
    clean_hex = blake3_hex.lower().strip()
    return f"b3/{clean_hex[:2]}/{clean_hex[2:4]}/{clean_hex}"


class VaultStorage:
    """
    Content-addressed immutable blob vault (Guide §3.1, §3.3).
    Ensures safe conditional writes (if_absent=True), atomic placement,
    component-aware path traversal checks, and cryptographic integrity verification.
    """

    def __init__(self, root_dir: str | Path = "data/vault"):
        self.root = Path(root_dir).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _resolve_path(self, key: str) -> Path:
        """Resolve key safely within vault root. Rejects path traversal and absolute paths."""
        kp = PurePosixPath(key)
        if kp.is_absolute() or ".." in kp.parts:
            raise ValueError(f"Invalid storage key: {key}")
        p = (self.root / kp).resolve()
        if not p.is_relative_to(self.root):
            raise ValueError(f"Path traversal detected for key: {key}")
        return p

    def exists(self, key: str) -> bool:
        """Check whether object exists in vault."""
        return self._resolve_path(key).is_file()

    def get_bytes(self, key: str) -> bytes:
        """Read full object bytes from vault."""
        p = self._resolve_path(key)
        if not p.is_file():
            raise FileNotFoundError(f"Object not found in vault: {key}")
        return p.read_bytes()

    def open_stream(self, key: str):
        """Open read stream for vault object."""
        p = self._resolve_path(key)
        if not p.is_file():
            raise FileNotFoundError(f"Object not found in vault: {key}")
        return open(p, "rb")

    def put_file(self, key: str, src_path: str | Path, *, if_absent: bool = True) -> bool:
        """
        Store file into vault atomically using a temporary sibling file.
        Returns True if newly created, False if object already existed.
        """
        final_path = self._resolve_path(key)
        if if_absent and final_path.is_file():
            return False

        final_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = final_path.with_name(f".tmp-{uuid.uuid4().hex}")

        try:
            # Copy source file to temporary sibling
            shutil.copyfile(src_path, tmp_path)
            # Sync file to disk
            with open(tmp_path, "rb") as f:
                os.fsync(f.fileno())

            if if_absent:
                try:
                    # Atomic link fails if destination exists (POSIX semantics)
                    os.link(tmp_path, final_path)
                    return True
                except (FileExistsError, OSError):
                    # Fallback for systems/filesystems without hard-link support
                    if final_path.is_file():
                        return False
                    os.replace(tmp_path, final_path)
                    return True
            else:
                os.replace(tmp_path, final_path)
                return True
        finally:
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except OSError:
                    pass

    def put_bytes(self, key: str, data: bytes, *, if_absent: bool = True) -> bool:
        """Store bytes into vault atomically."""
        final_path = self._resolve_path(key)
        if if_absent and final_path.is_file():
            return False

        final_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = final_path.with_name(f".tmp-{uuid.uuid4().hex}")

        try:
            with open(tmp_path, "xb") as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())

            if if_absent:
                try:
                    os.link(tmp_path, final_path)
                    return True
                except (FileExistsError, OSError):
                    if final_path.is_file():
                        return False
                    os.replace(tmp_path, final_path)
                    return True
            else:
                os.replace(tmp_path, final_path)
                return True
        finally:
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except OSError:
                    pass

    def delete(self, key: str) -> bool:
        """
        Delete object from vault (used for safe cleanup of unreferenced orphans).
        Returns True if deleted, False if did not exist.
        """
        final_path = self._resolve_path(key)
        if final_path.is_file():
            try:
                final_path.unlink()
                return True
            except OSError:
                return False
        return False

    def verify_integrity(self, key: str, expected_blake3_hex: str) -> bool:
        """Verify that stored object's BLAKE3 digest exactly matches expected hash."""
        p = self._resolve_path(key)
        if not p.is_file():
            return False
        hasher = blake3.blake3()
        with open(p, "rb") as f:
            while chunk := f.read(64 * 1024):
                hasher.update(chunk)
        return hasher.hexdigest().lower() == expected_blake3_hex.lower()
