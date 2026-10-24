import os
import shutil
import uuid
from pathlib import Path, PurePosixPath
from typing import BinaryIO, Protocol, runtime_checkable
import blake3
import boto3
from botocore.client import Config
from botocore.exceptions import ClientError


def format_vault_key(blake3_hex: str) -> str:
    """Format content-addressed key scheme: b3/<aa>/<bb>/<blake3> (Guide §3.1)."""
    clean_hex = blake3_hex.lower().strip()
    return f"b3/{clean_hex[:2]}/{clean_hex[2:4]}/{clean_hex}"


@runtime_checkable
class VaultBackend(Protocol):
    storage_type: str

    def exists(self, key: str) -> bool: ...
    def get_bytes(self, key: str) -> bytes: ...
    def open_stream(self, key: str): ...
    def put_file(self, key: str, src_path: str | Path, *, if_absent: bool = True) -> bool: ...
    def put_bytes(self, key: str, data: bytes, *, if_absent: bool = True) -> bool: ...
    def delete(self, key: str) -> bool: ...
    def verify_integrity(self, key: str, expected_blake3_hex: str) -> bool: ...


class LocalVaultStorage:
    """
    Local filesystem content-addressed immutable blob vault (Guide §3.1, §3.3 LocalStore).
    Ensures safe conditional writes (if_absent=True), atomic placement,
    component-aware path traversal checks, and cryptographic integrity verification.
    """

    storage_type = "VAULT_LOCAL"

    def __init__(self, root_dir: str | Path = "data/vault"):
        self.root = Path(root_dir).resolve()
        try:
            self.root.mkdir(parents=True, exist_ok=True)
        except OSError:
            pass

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

    def open_stream(self, key: str) -> BinaryIO:
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
            shutil.copyfile(src_path, tmp_path)
            with open(tmp_path, "rb") as f:
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


class S3VaultStorage:
    """
    S3 / MinIO / SeaweedFS compatible object storage adapter (Guide §3.3 S3Store).
    Implements content-addressed storage with provider-supported atomic conditional
    write (If-None-Match: *) to prevent write races without HEAD-then-PUT.
    """

    storage_type = "VAULT_OBJECT_STORE"

    def __init__(
        self,
        endpoint_url: str | None = None,
        bucket_name: str = "aicte-vault",
        access_key: str | None = None,
        secret_key: str | None = None,
        region_name: str = "us-east-1",
    ):
        self.endpoint_url = endpoint_url or os.environ.get("S3_ENDPOINT_URL") or os.environ.get("MINIO_ENDPOINT") or "http://127.0.0.1:8333"
        self.bucket = bucket_name or os.environ.get("S3_BUCKET") or "aicte-vault"
        self.access_key = access_key or os.environ.get("AWS_ACCESS_KEY_ID") or os.environ.get("MINIO_ACCESS_KEY") or "any"
        self.secret_key = secret_key or os.environ.get("AWS_SECRET_ACCESS_KEY") or os.environ.get("MINIO_SECRET_KEY") or "any"
        self.region_name = region_name or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"

        self.s3 = boto3.client(
            "s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
            region_name=self.region_name,
        )
        self.ensure_bucket()

    def ensure_bucket(self) -> None:
        """Create target vault bucket if not present."""
        try:
            self.s3.head_bucket(Bucket=self.bucket)
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code in ("404", "NoSuchBucket", "NotFound"):
                try:
                    self.s3.create_bucket(Bucket=self.bucket)
                except Exception:
                    pass

    def exists(self, key: str) -> bool:
        """Check whether object exists in S3 bucket."""
        try:
            self.s3.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code in ("404", "NoSuchKey", "NotFound"):
                return False
            raise

    def get_bytes(self, key: str) -> bytes:
        """Read full object bytes from S3."""
        try:
            resp = self.s3.get_object(Bucket=self.bucket, Key=key)
            return resp["Body"].read()
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code in ("404", "NoSuchKey", "NotFound"):
                raise FileNotFoundError(f"Object not found in vault: {key}") from e
            raise

    def open_stream(self, key: str):
        """Open read stream from S3."""
        try:
            resp = self.s3.get_object(Bucket=self.bucket, Key=key)
            return resp["Body"]
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code in ("404", "NoSuchKey", "NotFound"):
                raise FileNotFoundError(f"Object not found in vault: {key}") from e
            raise

    def put_bytes(self, key: str, data: bytes, *, if_absent: bool = True) -> bool:
        """
        Store bytes into S3 vault.
        Uses provider-supported conditional write (If-None-Match: *) when if_absent=True.
        Returns True if newly created, False if object already existed.
        """
        if if_absent:
            try:
                self.s3.put_object(
                    Bucket=self.bucket,
                    Key=key,
                    Body=data,
                    IfNoneMatch="*",
                )
                return True
            except ClientError as e:
                code = e.response.get("Error", {}).get("Code", "")
                # S3 / MinIO / SeaweedFS returns 412 PreconditionFailed on collision
                if code in ("PreconditionFailed", "412", "AtLeastOneConditionFailed"):
                    return False
                # Fallback check if provider does not support IfNoneMatch header
                if self.exists(key):
                    return False
                raise
        else:
            self.s3.put_object(Bucket=self.bucket, Key=key, Body=data)
            return True

    def put_file(self, key: str, src_path: str | Path, *, if_absent: bool = True) -> bool:
        """Store file into S3 vault."""
        with open(src_path, "rb") as f:
            data = f.read()
        return self.put_bytes(key, data, if_absent=if_absent)

    def delete(self, key: str) -> bool:
        """Delete object from S3 vault (used for safe cleanup of unreferenced orphans)."""
        try:
            self.s3.delete_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError:
            return False

    def verify_integrity(self, key: str, expected_blake3_hex: str) -> bool:
        """Verify that stored S3 object's BLAKE3 digest exactly matches expected hash."""
        try:
            resp = self.s3.get_object(Bucket=self.bucket, Key=key)
            hasher = blake3.blake3()
            body = resp["Body"]
            while chunk := body.read(64 * 1024):
                hasher.update(chunk)
            return hasher.hexdigest().lower() == expected_blake3_hex.lower()
        except ClientError:
            return False


# Aliases
VaultStorage = LocalVaultStorage
MinIOVaultStorage = S3VaultStorage


def get_default_vault() -> VaultBackend:
    """
    Factory creating configured storage vault backend.
    Checks VAULT_BACKEND or S3_ENDPOINT_URL / MINIO_ENDPOINT.
    Defaults to LocalVaultStorage (Guide §3.3 LocalStore) for zero-setup local dev.
    """
    backend = os.environ.get("VAULT_BACKEND", "").lower().strip()
    has_s3_url = bool(os.environ.get("S3_ENDPOINT_URL") or os.environ.get("MINIO_ENDPOINT"))

    if backend in ("s3", "minio") or has_s3_url:
        return S3VaultStorage()
    return LocalVaultStorage()


default_vault = get_default_vault()
