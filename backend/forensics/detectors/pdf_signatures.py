"""
PDF Digital Signature Detector (Guide §5.2).
Performs cryptographic validation on raw bytes using pyHanko.
Strictly disables network fetching (allow_fetching=False).
Outputs three separate fields: integrity, trust, source_verification.
An unsigned PDF is NOT a flag.
"""
import asyncio
import concurrent.futures
import io
import logging
from typing import Any

from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature, ValidationContext
from pyhanko.sign.validation.status import PdfSignatureStatus

from backend.forensics.models import ForensicFlag, SignatureInfo
from backend.forensics.trust_roots import (
    get_demo_validation_context,
    get_untrusted_validation_context,
    DEMO_ASN1_CERT,
)

logger = logging.getLogger("aicte.forensics.signatures")

DETECTOR_NAME = "pdf_signature"
DETECTOR_VERSION = "2.0.0"


def _safe_validate_sig(sig: Any, vc: ValidationContext) -> PdfSignatureStatus:
    """Run pyHanko signature validation safely whether in an event loop or worker thread."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop is not None and loop.is_running():
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(validate_pdf_signature, sig, vc).result()
    return validate_pdf_signature(sig, vc)


def _determine_integrity(status: PdfSignatureStatus, is_entire_file: bool) -> str:
    """Determine cryptographic integrity status from pyHanko status object."""
    cov = getattr(status.coverage, "name", str(status.coverage))

    if not (status.intact and status.valid):
        return "BROKEN"
    if cov != "ENTIRE_FILE" or not is_entire_file:
        return "MODIFIED_AFTER_SIGNING"
    return "INTACT_FULL_COVERAGE"


def _signature_flag(status: PdfSignatureStatus, is_entire_file: bool) -> tuple[str, str, str]:
    """
    Map pyHanko status to advisory flag per Guide §5.2.
    Returns (code, severity, reason).
    """
    cov = getattr(status.coverage, "name", str(status.coverage))
    mod = getattr(status.modification_level, "name", str(status.modification_level))

    if not (status.intact and status.valid):
        return (
            "SIG_BROKEN",
            "high",
            "Cryptographic signature verification failed: signature digest or cryptographic envelope is invalid or broken.",
        )
    if cov != "ENTIRE_FILE" or not is_entire_file:
        if mod in ("FORM_FILLING", "ANNOTATIONS"):
            return (
                "SIG_LATER_REVISIONS_BENIGN",
                "low",
                "Document has benign post-signing revisions (form filling or annotations).",
            )
        return (
            "SIG_MODIFIED_AFTER_SIGNING",
            "high",
            "Document was modified after signing with unauthorized revisions or trailing bytes beyond signature coverage.",
        )
    if not status.trusted:
        return (
            "SIG_UNTRUSTED_ROOT",
            "medium",
            "Signature is cryptographically intact, but certificate chain does not anchor to a configured trust root.",
        )
    return (
        "SIG_INTACT",
        "info",
        "Cryptographically intact digital signature verified against demo stand-in root (not live issuer verification).",
    )


def detect_pdf_signatures(
    raw_bytes: bytes,
    document_id: str,
    validation_context: ValidationContext | None = None,
) -> tuple[list[SignatureInfo], list[ForensicFlag]]:
    """
    Cryptographically validate digital signatures in raw PDF bytes using pyHanko.
    Returns (signatures, flags).
    Guide §5.2: An unsigned PDF is not a flag.
    """
    signatures: list[SignatureInfo] = []
    flags: list[ForensicFlag] = []

    try:
        reader = PdfFileReader(io.BytesIO(raw_bytes))
        embedded_sigs = reader.embedded_signatures
    except Exception as err:
        # Corrupt PDF or reader failure
        logger.warning(f"Failed to read PDF structure for doc {document_id}: {err}")
        return signatures, flags

    if not embedded_sigs:
        # Guide §5.2: "An unsigned PDF is not a flag."
        return signatures, flags

    vc = validation_context or get_demo_validation_context()

    for idx, sig in enumerate(embedded_sigs):
        field_name = sig.field_name or f"Signature{idx + 1}"
        try:
            status = _safe_validate_sig(sig, vc)
            total_covered = sig.byte_range[2] + sig.byte_range[3] if sig.byte_range and len(sig.byte_range) >= 4 else len(raw_bytes)
            is_entire_file = (total_covered == len(raw_bytes)) and (getattr(status.coverage, "name", str(status.coverage)) == "ENTIRE_FILE")

            integrity = _determine_integrity(status, is_entire_file)

            # Determine trust class: production, demo, or untrusted
            if status.trusted and integrity == "INTACT_FULL_COVERAGE":
                trust = "demo"  # In Phase A demo environment, trusted roots are demo roots
            else:
                trust = "untrusted"

            source_verification = "UNVERIFIED"

            signatures.append(
                SignatureInfo(
                    integrity=integrity,
                    trust=trust,
                    source_verification=source_verification,
                    name=field_name,
                    signing_time=str(sig.self_reported_timestamp) if getattr(sig, "self_reported_timestamp", None) else None,
                )
            )

            code, severity, reason = _signature_flag(status, is_entire_file)
            flags.append(
                ForensicFlag(
                    code=code,
                    severity=severity,
                    reason=reason,
                    evidence={
                        "artifact_uri": f"forensics://documents/{document_id}/signatures/{idx}",
                        "value": f"field='{field_name}', integrity={integrity}, trust={trust}",
                    },
                    advisory=True,
                    requires_human_review=True,
                    detector={"name": DETECTOR_NAME, "version": DETECTOR_VERSION},
                )
            )

        except Exception as sig_err:
            logger.warning(f"Cryptographic signature validation failed on {field_name} in doc {document_id}: {sig_err}")
            # If pyHanko fails cryptographically on a malformed signature
            signatures.append(
                SignatureInfo(
                    integrity="BROKEN",
                    trust="untrusted",
                    source_verification="UNVERIFIED",
                    name=field_name,
                )
            )
            flags.append(
                ForensicFlag(
                    code="SIG_BROKEN",
                    severity="high",
                    reason=f"Signature '{field_name}' failed cryptographic decoding: {type(sig_err).__name__}",
                    evidence={
                        "artifact_uri": f"forensics://documents/{document_id}/signatures/{idx}",
                        "value": str(sig_err),
                    },
                    advisory=True,
                    requires_human_review=True,
                    detector={"name": DETECTOR_NAME, "version": DETECTOR_VERSION},
                )
            )

    return signatures, flags
