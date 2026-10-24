"""
PDF Metadata & Structure Detector (Guide §5.1).
Inspects Producer, Creator, Title, Author, creation/modification dates,
and counts incremental update (%%EOF) markers on raw bytes.
"""
from typing import Any
import pymupdf

from backend.forensics.models import ForensicFlag, ForensicsMeta

DETECTOR_NAME = "pdf_metadata"
DETECTOR_VERSION = "1.0.0"

# Known editing tools from Guide §5.1:
# "photoshop, gimp, canva, ilovepdf, sejda, smallpdf, pixlr, corel, foxit phantom, nitro, pdfescape, pdf-xchange editor, acrobat pro"
EDITOR_TOKENS = [
    "photoshop",
    "gimp",
    "canva",
    "ilovepdf",
    "sejda",
    "smallpdf",
    "pixlr",
    "corel",
    "foxit phantom",
    "nitro",
    "pdfescape",
    "pdf-xchange editor",
    "acrobat pro",
]


def detect_pdf_metadata(
    raw_bytes: bytes,
    document_id: str,
) -> tuple[ForensicsMeta, list[ForensicFlag]]:
    """
    Extract PDF metadata and inspect for editing tool signatures or incremental updates.
    Returns (meta, flags).
    """
    flags: list[ForensicFlag] = []

    # 1. Inspect raw bytes for incremental updates (%%EOF count)
    eof_count = raw_bytes.count(b"%%EOF")
    if eof_count == 0:
        eof_count = 1  # Fallback minimal count for well-formed single revision

    if eof_count > 1:
        flags.append(
            ForensicFlag(
                code="INCREMENTAL_UPDATE_PRESENT",
                severity="low",
                reason=(
                    f"Document contains {eof_count} incremental updates (%%EOF markers). "
                    "Normal for signing/annotation workflows, but requires human verification."
                ),
                evidence={
                    "artifact_uri": f"forensics://documents/{document_id}/eof",
                    "value": eof_count,
                },
                advisory=True,
                requires_human_review=True,
                detector={"name": DETECTOR_NAME, "version": DETECTOR_VERSION},
            )
        )

    # 2. Extract metadata dictionary via PyMuPDF
    meta = ForensicsMeta(incremental_updates_count=eof_count)

    try:
        doc = pymupdf.open(stream=raw_bytes, filetype="pdf")
        pdf_meta = doc.metadata or {}
        doc.close()
    except Exception:
        # If PyMuPDF fails to parse trailer, return meta with raw eof_count
        return meta, flags

    meta.producer = pdf_meta.get("producer") or None
    meta.creator = pdf_meta.get("creator") or None
    meta.title = pdf_meta.get("title") or None
    meta.author = pdf_meta.get("author") or None
    meta.subject = pdf_meta.get("subject") or None
    meta.creation_date = pdf_meta.get("creationDate") or None
    meta.mod_date = pdf_meta.get("modDate") or None

    # 3. Check Producer & Creator for editing software tokens (Guide §5.1)
    combined_producer_creator = f"{meta.producer or ''} {meta.creator or ''}".lower()
    matched_editor = None
    for token in EDITOR_TOKENS:
        if token in combined_producer_creator:
            matched_editor = token
            break

    if matched_editor:
        flags.append(
            ForensicFlag(
                code="EDITING_TOOL_IN_METADATA",
                severity="medium",
                reason=(
                    f"Document Producer/Creator metadata contains '{matched_editor}'. "
                    "Legitimate certificates are routinely scanned, cropped, and re-exported, "
                    "so this is an advisory lead for officer review, not proof of tampering."
                ),
                evidence={
                    "artifact_uri": f"forensics://documents/{document_id}/metadata",
                    "value": f"producer='{meta.producer}', creator='{meta.creator}'",
                },
                advisory=True,
                requires_human_review=True,
                detector={"name": DETECTOR_NAME, "version": DETECTOR_VERSION},
            )
        )

    return meta, flags
