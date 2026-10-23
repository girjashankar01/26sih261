import hashlib
import os
import re
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
import blake3
from fastapi import HTTPException

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
    processing_state: str
    pipeline_stage: str
    ocr_status: str
    persistence_status: str
    simulated: bool
    advisory: bool
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
    max_size: int = DEFAULT_MAX_UPLOAD_SIZE,
    scratch_dir: str | None = None,
) -> IngestResult:
    """
    Stream upload to temporary scratch file, computing BLAKE3 + SHA-256 in one pass,
    enforcing max size during streaming, sniffing magic bytes, checking PDF encryption,
    and unlinking temporary scratch file in all exit paths.
    """
    document_id = f"doc_{uuid.uuid4().hex[:12]}"
    tmp_path = None

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
                    header_bytes += chunk[:16 - len(header_bytes)]

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

        return IngestResult(
            application_id=application_id,
            document_id=document_id,
            doc_slot=doc_slot,
            detected_kind=detected_kind,
            detected_media_type=MEDIA_TYPES[detected_kind],
            byte_size=total_bytes,
            blake3=b3_hex,
            sha256=sha_hex,
            processing_state="INGESTED_STREAM_VERIFIED",
            pipeline_stage="S1_INGESTION_GATEWAY",
            ocr_status="NOT_RUN",
            persistence_status="EPHEMERAL_SCRATCH_VERIFIED",
            simulated=True,
            advisory=True,
            message="Document successfully streamed, hashed, and validated against format rules.",
        )
    finally:
        # Guarantee cleanup of temporary scratch file on both success and failure paths
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
