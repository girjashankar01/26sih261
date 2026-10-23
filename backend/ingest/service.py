import hashlib
import os
import re
import tempfile
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import blake3
from fastapi import HTTPException

from backend.db.connection import Database, db as default_db
from backend.db.repository import (
    count_uploads_for_blob,
    get_upload_by_idempotency_key,
    init_db,
    insert_blob,
    insert_upload,
)
from backend.storage.vault import (
    VaultStorage,
    format_vault_key,
    get_default_vault,
)

# Supported magic bytes signatures
MAGIC_SIGNATURES = {
    "pdf": b"%PDF-",
    "png": b"\x89PNG\r\n\x1a\n",
    "jpeg": b"\xff\xd8\xff",
}

MEDIA_TYPES = {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpeg": "image/jpeg",
}

DEFAULT_MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB default
CHUNK_SIZE = 64 * 1024  # 64 KB streaming chunks

# Default storage vault instance
default_vault = get_default_vault()


class IngestError(HTTPException):
    def __init__(self, status_code: int, error_code: str, message: str, **kwargs):
        detail = {
            "error_code": error_code,
            "message": message,
            **kwargs,
        }
        super().__init__(status_code=status_code, detail=detail)


@dataclass
class IngestResult:
    application_id: str
    document_id: str
    doc_slot: str | None
    detected_kind: str
    detected_media_type: str
    byte_size: int
    blake3: str
    sha256: str
    storage_key: str
    processing_state: str
    pipeline_stage: str
    ocr_status: str
    persistence_status: str
    is_new_blob: bool
    idempotent_replay: bool
    simulated: bool
    advisory: bool
    created_at: str
    message: str


def sniff_format(header: bytes) -> str | None:
    """Sniff document format strictly using magic bytes. Do not trust filename or MIME header."""
    if header.startswith(MAGIC_SIGNATURES["pdf"]):
        return "pdf"
    if header.startswith(MAGIC_SIGNATURES["png"]):
        return "png"
    if header.startswith(MAGIC_SIGNATURES["jpeg"]):
        return "jpeg"
    return None


def check_pdf_encryption(file_path: str) -> bool:
    """
    Scans PDF cross-reference/trailer dictionaries for the /Encrypt key per ISO 32000-1 §7.5.5.
    Returns True if the PDF is encrypted or password-protected.
    """
    with open(file_path, "rb") as f:
        content = f.read()
        return bool(re.search(rb"/Encrypt\s*(\d+\s+\d+\s+R|<<)", content))


async def process_upload_stream(
    upload_file,
    application_id: str,
    doc_slot: str | None = None,
    idempotency_key: str | None = None,
    max_size: int = DEFAULT_MAX_UPLOAD_SIZE,
    scratch_dir: str | None = None,
    vault: VaultStorage | None = None,
    database: Database | None = None,
) -> IngestResult:
    """
    Stream upload to temporary scratch file, computing BLAKE3 + SHA-256 in one pass,
    enforcing max size during streaming, sniffing magic bytes, checking PDF encryption,
    storing to content-addressed vault with deduplication, persisting to database within
    a transaction, handling reverse-failure cleanup, and unlinking scratch files in all paths.
    """
    target_vault = vault or default_vault
    target_db = database or default_db

    # Ensure schema initialized
    init_db(target_db)

    tmp_path = None
    is_new_blob = False
    storage_key = None
    b3_hex = None

    try:
        fd, tmp_path = tempfile.mkstemp(prefix="ingest_", suffix=".tmp", dir=scratch_dir)
        os.close(fd)

        hasher_b3 = blake3.blake3()
        hasher_sha = hashlib.sha256()
        total_bytes = 0
        header_bytes = b""

        with open(tmp_path, "wb") as dst:
            while True:
                chunk = await upload_file.read(CHUNK_SIZE)
                if not chunk:
                    break

                total_bytes += len(chunk)
                if total_bytes > max_size:
                    raise IngestError(
                        status_code=413,
                        error_code="FILE_TOO_LARGE",
                        message=f"File exceeds maximum allowed upload size of {max_size} bytes.",
                        max_size_bytes=max_size,
                    )

                if len(header_bytes) < 16:
                    header_bytes += chunk[: 16 - len(header_bytes)]

                hasher_b3.update(chunk)
                hasher_sha.update(chunk)
                dst.write(chunk)

        if total_bytes == 0:
            raise IngestError(
                status_code=400,
                error_code="EMPTY_FILE",
                message="Uploaded file is empty (0 bytes).",
            )

        detected_kind = sniff_format(header_bytes)
        if not detected_kind:
            raise IngestError(
                status_code=415,
                error_code="UNSUPPORTED_MEDIA_TYPE",
                message="File magic bytes do not match supported formats (PDF, PNG, JPEG). Submitted filename and content-type are not trusted.",
                supported_types=["pdf", "png", "jpeg"],
            )

        if detected_kind == "pdf":
            if check_pdf_encryption(tmp_path):
                raise IngestError(
                    status_code=422,
                    error_code="ENCRYPTED_PDF_REJECTED",
                    message="Encrypted or password-protected PDF files cannot be processed. Please upload an unencrypted document.",
                    document_kind="pdf",
                )

        b3_hex = hasher_b3.hexdigest()
        sha_hex = hasher_sha.hexdigest()
        storage_key = format_vault_key(b3_hex)

        # Handle Idempotency Key
        if idempotency_key:
            with target_db.connection() as check_conn:
                existing = get_upload_by_idempotency_key(check_conn, idempotency_key, target_db)
                if existing:
                    if existing["blake3"] == b3_hex and existing["application_id"] == application_id:
                        # Idempotent replay: same key, same content, same application
                        return IngestResult(
                            application_id=existing["application_id"],
                            document_id=existing["id"],
                            doc_slot=existing["doc_slot"],
                            detected_kind=detected_kind,
                            detected_media_type=existing["media_type"],
                            byte_size=existing["byte_size"],
                            blake3=existing["blake3"],
                            sha256=existing["sha256"],
                            storage_key=existing["storage_key"],
                            processing_state="PERSISTED",
                            pipeline_stage="S1_INGESTION_GATEWAY",
                            ocr_status="NOT_RUN",
                            persistence_status=getattr(target_vault, "storage_type", "VAULT_LOCAL"),
                            is_new_blob=False,
                            idempotent_replay=True,
                            simulated=True,
                            advisory=True,
                            created_at=existing["created_at"],
                            message="Document previously ingested and verified with same idempotency key.",
                        )
                    else:
                        raise IngestError(
                            status_code=409,
                            error_code="IDEMPOTENCY_CONFLICT",
                            message="Idempotency key was previously used with different content or application.",
                        )

        # Store to content-addressed vault
        is_new_blob = target_vault.put_file(storage_key, tmp_path, if_absent=True)
        if not is_new_blob:
            # Existing object with same key: verify hash integrity
            if not target_vault.verify_integrity(storage_key, b3_hex):
                raise IngestError(
                    status_code=500,
                    error_code="STORAGE_INTEGRITY_MISMATCH",
                    message="Existing vault object failed cryptographic digest verification.",
                )

        # Database transaction: record blob and upload
        document_id = f"doc_{uuid.uuid4().hex[:12]}"
        created_at = datetime.now(timezone.utc).isoformat()

        try:
            with target_db.transaction() as tx_conn:
                insert_blob(
                    conn=tx_conn,
                    blake3=b3_hex,
                    sha256=sha_hex,
                    byte_size=total_bytes,
                    media_type=MEDIA_TYPES[detected_kind],
                    storage_key=storage_key,
                    created_at=created_at,
                    database=target_db,
                )
                insert_upload(
                    conn=tx_conn,
                    id=document_id,
                    application_id=application_id,
                    blake3=b3_hex,
                    doc_slot=doc_slot,
                    idempotency_key=idempotency_key,
                    created_at=created_at,
                    database=target_db,
                )
        except Exception as db_err:
            # Reverse failure case: storage succeeded, but DB failed!
            # Clean up unreferenced object safely without deleting content used by another upload
            if is_new_blob:
                try:
                    with target_db.connection() as check_conn:
                        refs = count_uploads_for_blob(check_conn, b3_hex, target_db)
                        if refs == 0:
                            target_vault.delete(storage_key)
                except Exception:
                    pass
            if isinstance(db_err, IngestError):
                raise
            raise IngestError(
                status_code=500,
                error_code="DATABASE_TRANSACTION_FAILED",
                message="Database transaction failed while recording upload metadata.",
            ) from db_err

        return IngestResult(
            application_id=application_id,
            document_id=document_id,
            doc_slot=doc_slot,
            detected_kind=detected_kind,
            detected_media_type=MEDIA_TYPES[detected_kind],
            byte_size=total_bytes,
            blake3=b3_hex,
            sha256=sha_hex,
            storage_key=storage_key,
            processing_state="PERSISTED",
            pipeline_stage="S1_INGESTION_GATEWAY",
            ocr_status="NOT_RUN",
            persistence_status=getattr(target_vault, "storage_type", "VAULT_LOCAL"),
            is_new_blob=is_new_blob,
            idempotent_replay=False,
            simulated=True,
            advisory=True,
            created_at=created_at,
            message="Document successfully streamed, hashed, persisted to vault, and recorded in database.",
        )
    finally:
        # Guarantee cleanup of temporary scratch file on both success and failure paths
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
