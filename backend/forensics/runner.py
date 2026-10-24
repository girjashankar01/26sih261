"""
Forensics Runner (Guide §5).
Executes raw-byte forensic detectors on immutable stored objects.
Isolates exceptions per detector and records failed detectors as NOT_CHECKED.
"""
from typing import Any
import logging

from backend.forensics.models import (
    DocumentForensicsResult,
    ForensicFlag,
    ForensicsMeta,
    GeoMeta,
    QRResult,
    DetectorStatus,
)
from backend.forensics.detectors.pdf_meta import detect_pdf_metadata
from backend.forensics.detectors.pdf_signatures import detect_pdf_signatures
from backend.forensics.detectors.image_exif import detect_image_exif
from backend.forensics.detectors.qr_locator import detect_qr_code

logger = logging.getLogger("aicte.forensics")

# Deferred advanced detectors per Guide §5 / §20.1:
DEFERRED_DETECTORS = [
    ("font_inconsistency", "1.0.0", "Deferred to Phase B per Guide §5.4 / §20.1"),
    ("ela_jpeg", "1.0.0", "Deferred to Phase B per Guide §5.5 / §20.1"),
    ("mark_reuse", "1.0.0", "Deferred to Phase B per Guide §5.6b / §20.1"),
    ("text_layer_ocr_mismatch", "1.0.0", "Requires Branch B (S4) OCR outputs per Guide §5.8"),
    ("ooxml_structure", "1.0.0", "Deferred to Phase B per Guide §5.9 / §20.1"),
    ("c2pa_provenance", "1.0.0", "Deferred to Phase C per Guide §5.3 / §20.1"),
]


def run_forensics(
    raw_bytes: bytes,
    media_type: str,
    document_id: str,
    application_id: str,
    blake3: str,
    sha256: str,
    storage_key: str,
    doc_slot: str | None = None,
    issuer_profile: dict[str, Any] | None = None,
) -> DocumentForensicsResult:
    """
    Run raw-byte forensic analysis on a document.
    Executes detectors with exception isolation; records any failure as NOT_CHECKED.
    Returns complete DocumentForensicsResult.
    """
    flags: list[ForensicFlag] = []
    detector_statuses: list[DetectorStatus] = []

    meta = ForensicsMeta()
    geo = GeoMeta()
    qr: QRResult | None = None

    is_pdf = media_type == "application/pdf" or raw_bytes.startswith(b"%PDF")
    is_image = media_type in ("image/png", "image/jpeg")

    # 1. Detector: pdf_metadata
    if is_pdf:
        try:
            pdf_meta, meta_flags = detect_pdf_metadata(raw_bytes, document_id)
            meta.producer = pdf_meta.producer
            meta.creator = pdf_meta.creator
            meta.title = pdf_meta.title
            meta.author = pdf_meta.author
            meta.subject = pdf_meta.subject
            meta.creation_date = pdf_meta.creation_date
            meta.mod_date = pdf_meta.mod_date
            meta.incremental_updates_count = pdf_meta.incremental_updates_count
            flags.extend(meta_flags)
            detector_statuses.append(
                DetectorStatus(name="pdf_metadata", version="1.0.0", status="COMPLETED")
            )
        except Exception as err:
            logger.warning(f"Forensic detector pdf_metadata failed for doc {document_id}: {err}")
            detector_statuses.append(
                DetectorStatus(
                    name="pdf_metadata",
                    version="1.0.0",
                    status="NOT_CHECKED",
                    reason=f"Detector error: {type(err).__name__}",
                )
            )
    else:
        detector_statuses.append(
            DetectorStatus(
                name="pdf_metadata",
                version="1.0.0",
                status="NOT_CHECKED",
                reason="Not applicable to non-PDF media",
            )
        )

    # 2. Detector: pdf_signature
    if is_pdf:
        try:
            signatures, sig_flags = detect_pdf_signatures(raw_bytes, document_id)
            meta.signatures = [s.to_dict() for s in signatures]
            flags.extend(sig_flags)
            detector_statuses.append(
                DetectorStatus(name="pdf_signature", version="2.0.0", status="COMPLETED")
            )
        except Exception as err:
            logger.warning(f"Forensic detector pdf_signature failed for doc {document_id}: {err}")
            detector_statuses.append(
                DetectorStatus(
                    name="pdf_signature",
                    version="2.0.0",
                    status="NOT_CHECKED",
                    reason=f"Detector error: {type(err).__name__} - {err}",
                )
            )
    else:
        detector_statuses.append(
            DetectorStatus(
                name="pdf_signature",
                version="2.0.0",
                status="NOT_CHECKED",
                reason="Not applicable to non-PDF media",
            )
        )

    # 3. Detector: image_metadata_exif
    if is_image:
        try:
            exif_geo, exif_flags = detect_image_exif(raw_bytes, document_id)
            geo = exif_geo
            flags.extend(exif_flags)
            detector_statuses.append(
                DetectorStatus(name="image_metadata_exif", version="2.0.0", status="COMPLETED")
            )
        except Exception as err:
            logger.warning(f"Forensic detector image_metadata_exif failed for doc {document_id}: {err}")
            detector_statuses.append(
                DetectorStatus(
                    name="image_metadata_exif",
                    version="2.0.0",
                    status="NOT_CHECKED",
                    reason=f"{type(err).__name__}: {err}",
                )
            )
    else:
        detector_statuses.append(
            DetectorStatus(
                name="image_metadata_exif",
                version="2.0.0",
                status="NOT_CHECKED",
                reason="EXIF analysis deferred to embedded raster extraction in Phase B",
            )
        )

    # 4. Detector: qr_decode
    try:
        qr_res, qr_flags = detect_qr_code(raw_bytes, media_type, document_id)
        qr = qr_res
        flags.extend(qr_flags)
        detector_statuses.append(
            DetectorStatus(name="qr_decode", version="1.0.0", status="COMPLETED")
        )
    except Exception as err:
        logger.warning(f"Forensic detector qr_decode failed for doc {document_id}: {err}")
        detector_statuses.append(
            DetectorStatus(
                name="qr_decode",
                version="1.0.0",
                status="NOT_CHECKED",
                reason=f"Detector error: {type(err).__name__}",
            )
        )

    # 5. Append deferred detectors explicitly as NOT_CHECKED per Guide §2.2 / §5
    for name, version, reason in DEFERRED_DETECTORS:
        detector_statuses.append(
            DetectorStatus(name=name, version=version, status="NOT_CHECKED", reason=reason)
        )

    return DocumentForensicsResult(
        application_id=application_id,
        document_id=document_id,
        doc_slot=doc_slot,
        detected_media_type=media_type,
        byte_size=len(raw_bytes),
        blake3=blake3,
        sha256=sha256,
        storage_key=storage_key,
        pipeline_stage="S2_FORENSICS",
        flags=[f.to_dict() for f in flags],
        meta=meta.to_dict(),
        geo=geo.to_dict(),
        qr=qr.to_dict() if qr else None,
        detectors=[d.to_dict() for d in detector_statuses],
        simulated=True,
        advisory=True,
    )
