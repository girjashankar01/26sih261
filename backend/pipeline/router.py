import re
from dataclasses import asdict, dataclass
from typing import Any
import pymupdf

# Thresholds from Prototype Guide §6.1
MIN_VISIBLE = 80          # Minimum visible character count for real text layer
COVER_SCAN = 0.60         # Image coverage ratio indicating full-page scan
COVER_HYBRID = 0.25       # Image coverage ratio indicating text plus embedded photo/stamp
DRAWING_MIN = 40          # Threshold for drawing/vector presence
DRAWING_DENSE = 400       # Dense vector paths indicating architectural / CAD plan
DRAWING_TEXT_RATIO = 0.25 # Ratio of visible text to vector paths for CAD labels
GARBAGE = re.compile(r"\ufffd|\(cid:\d+\)|[\ue000-\uf8ff]")


def text_sanity(text: str) -> float:
    """
    Compute text sanity score in 0.0..1.0 (Guide §6.1).
    Catches (cid:..), U+FFFD, private-use glyphs, and vowel-less Latin gibberish.
    """
    if not text:
        return 0.0
    bad = len(GARBAGE.findall(text))
    latin = [w for w in re.findall(r"[^\W\d_]{3,}", text) if w.isascii()]
    gib = sum(1 for w in latin if not re.search(r"[aeiouAEIOU]", w)) / len(latin) if latin else 0.0
    return max(0.0, 1.0 - 4.0 * bad / len(text) - 0.8 * gib)


@dataclass
class PageVerdict:
    page_index: int       # 1-indexed page number
    label: str            # digital, hybrid, scanned, vector_drawing, blank
    reason: str           # Deterministic decision rationale
    metrics: dict[str, Any]


@dataclass
class DocumentRouteResult:
    document_id: str
    application_id: str
    doc_slot: str | None
    detected_kind: str
    detected_media_type: str
    byte_size: int
    blake3: str
    sha256: str
    storage_key: str
    routing_outcome: str  # BRANCH_A_DIGITAL, BRANCH_B_SCANNED, MIXED, VECTOR_DRAWING, BLANK_DOCUMENT, CORRUPT_DOCUMENT, ENCRYPTED_PDF, EMPTY_DOCUMENT, UNSUPPORTED_FORMAT
    reason: str
    total_pages: int
    page_counts: dict[str, int]
    page_verdicts: list[dict[str, Any]]
    processing_state: str = "ROUTED"
    pipeline_stage: str = "S3_ROUTER"
    ocr_status: str = "NOT_RUN"
    classification_status: str = "NOT_RUN"
    simulated: bool = True
    advisory: bool = True


def classify_page(page: pymupdf.Page) -> PageVerdict:
    """
    Classify a single PDF page into digital, hybrid, scanned, vector_drawing, or blank
    strictly according to the deterministic decision tree in Guide §6.1.
    """
    page_num = page.number + 1

    # 1. Text extraction and character traces
    raw_text = page.get_text() or ""
    try:
        tt = page.get_texttrace() or []
        visible = sum(len(span.get("chars", [])) for span in tt if span.get("type") != 3)
        invisible = sum(len(span.get("chars", [])) for span in tt if span.get("type") == 3)
    except Exception:
        # Fallback if get_texttrace is unavailable on particular page type
        visible = len(raw_text.strip())
        invisible = 0

    sanity = round(text_sanity(raw_text), 3)

    # 2. Image coverage calculation
    page_area = max(1.0, float(page.rect.width * page.rect.height))
    cover_max = 0.0
    cover_sum = 0.0

    try:
        images = page.get_image_info() or []
        for img in images:
            bbox = img.get("bbox", (0, 0, 0, 0))
            w = max(0.0, min(bbox[2], page.rect.width) - max(0.0, bbox[0]))
            h = max(0.0, min(bbox[3], page.rect.height) - max(0.0, bbox[1]))
            ratio = min(1.0, (w * h) / page_area)
            cover_max = max(cover_max, ratio)
            cover_sum += ratio
    except Exception:
        pass

    cover_max = round(min(1.0, cover_max), 3)
    cover_sum = round(min(1.0, cover_sum), 3)

    # 3. Vector paths count
    try:
        paths = len(page.get_drawings() or [])
    except Exception:
        paths = 0

    metrics = {
        "visible": visible,
        "invisible": invisible,
        "sanity": sanity,
        "cover_max": cover_max,
        "cover_sum": cover_sum,
        "paths": paths,
    }

    # 4. Deterministic decision order from Guide §6.1
    real = visible >= MIN_VISIBLE

    if not real and invisible == 0 and cover_sum < 0.05 and paths < DRAWING_MIN:
        label = "blank"
        reason = "no text, images or vector content"
    elif cover_max >= COVER_SCAN and (invisible > 0 or not real):
        label = "scanned"
        reason = "full-page image; any text is a hidden OCR layer"
    elif real and sanity < 0.6:
        label = "scanned"
        reason = "text layer unreliable (garbled / cid / legacy font)"
    elif paths >= DRAWING_DENSE and (visible / max(1, paths)) < DRAWING_TEXT_RATIO:
        label = "vector_drawing"
        reason = "dense vector paths, sparse labels (CAD plan)"
    elif real and cover_sum >= COVER_HYBRID:
        label = "hybrid"
        reason = "real text plus large embedded image"
    elif real:
        label = "digital"
        reason = "visible, sane text layer"
    elif paths >= DRAWING_MIN and cover_sum < COVER_HYBRID:
        label = "vector_drawing"
        reason = "vector paths dominate"
    else:
        label = "scanned"
        reason = "ambiguous low-text page; OCR is the safe default"

    return PageVerdict(
        page_index=page_num,
        label=label,
        reason=reason,
        metrics=metrics,
    )


def route_document(
    raw_bytes: bytes,
    media_type: str,
    document_id: str,
    application_id: str,
    doc_slot: str | None,
    blake3: str,
    sha256: str,
    storage_key: str,
) -> DocumentRouteResult:
    """
    Route and classify a persisted document based on format and extractable text content.
    Reads document bytes from vault storage abstraction (no local container path dependencies).
    Implements S3 Route per Guide §2.2 and §6.
    """
    # 1. Empty document check
    if not raw_bytes or len(raw_bytes) == 0:
        return DocumentRouteResult(
            document_id=document_id,
            application_id=application_id,
            doc_slot=doc_slot,
            detected_kind="unknown",
            detected_media_type=media_type or "application/octet-stream",
            byte_size=0,
            blake3=blake3,
            sha256=sha256,
            storage_key=storage_key,
            routing_outcome="EMPTY_DOCUMENT",
            reason="Document payload is empty (0 bytes)",
            total_pages=0,
            page_counts={"digital": 0, "scanned": 0, "hybrid": 0, "vector_drawing": 0, "blank": 0},
            page_verdicts=[],
        )

    # 2. Raster image inputs (PNG, JPEG) -> direct route to Branch B (scanned)
    if media_type in ("image/png", "image/jpeg"):
        detected_kind = "png" if media_type == "image/png" else "jpeg"
        image_verdict = PageVerdict(
            page_index=1,
            label="scanned",
            reason="Raster image input routed to scanned pipeline branch",
            metrics={
                "visible": 0,
                "invisible": 0,
                "sanity": 0.0,
                "cover_max": 1.0,
                "cover_sum": 1.0,
                "paths": 0,
            },
        )
        return DocumentRouteResult(
            document_id=document_id,
            application_id=application_id,
            doc_slot=doc_slot,
            detected_kind=detected_kind,
            detected_media_type=media_type,
            byte_size=len(raw_bytes),
            blake3=blake3,
            sha256=sha256,
            storage_key=storage_key,
            routing_outcome="BRANCH_B_SCANNED",
            reason="Raster image input routed to scanned pipeline branch",
            total_pages=1,
            page_counts={"digital": 0, "scanned": 1, "hybrid": 0, "vector_drawing": 0, "blank": 0},
            page_verdicts=[asdict(image_verdict)],
        )

    # 3. Non-PDF unsupported media types
    if media_type != "application/pdf":
        return DocumentRouteResult(
            document_id=document_id,
            application_id=application_id,
            doc_slot=doc_slot,
            detected_kind="unsupported",
            detected_media_type=media_type,
            byte_size=len(raw_bytes),
            blake3=blake3,
            sha256=sha256,
            storage_key=storage_key,
            routing_outcome="UNSUPPORTED_FORMAT",
            reason=f"Media type '{media_type}' is not supported for pipeline routing",
            total_pages=0,
            page_counts={"digital": 0, "scanned": 0, "hybrid": 0, "vector_drawing": 0, "blank": 0},
            page_verdicts=[],
        )

    # 4. PDF processing
    try:
        doc = pymupdf.open(stream=raw_bytes, filetype="pdf")
    except Exception as e:
        return DocumentRouteResult(
            document_id=document_id,
            application_id=application_id,
            doc_slot=doc_slot,
            detected_kind="pdf",
            detected_media_type="application/pdf",
            byte_size=len(raw_bytes),
            blake3=blake3,
            sha256=sha256,
            storage_key=storage_key,
            routing_outcome="CORRUPT_DOCUMENT",
            reason=f"Document could not be parsed as valid PDF structure ({type(e).__name__})",
            total_pages=0,
            page_counts={"digital": 0, "scanned": 0, "hybrid": 0, "vector_drawing": 0, "blank": 0},
            page_verdicts=[],
        )

    # Encrypted PDF check
    if getattr(doc, "is_encrypted", False):
        total_p = len(doc)
        doc.close()
        return DocumentRouteResult(
            document_id=document_id,
            application_id=application_id,
            doc_slot=doc_slot,
            detected_kind="pdf",
            detected_media_type="application/pdf",
            byte_size=len(raw_bytes),
            blake3=blake3,
            sha256=sha256,
            storage_key=storage_key,
            routing_outcome="ENCRYPTED_PDF",
            reason="Encrypted or password-protected PDF cannot be inspected without credentials",
            total_pages=total_p,
            page_counts={"digital": 0, "scanned": 0, "hybrid": 0, "vector_drawing": 0, "blank": 0},
            page_verdicts=[],
        )

    total_pages = len(doc)
    if total_pages == 0:
        doc.close()
        return DocumentRouteResult(
            document_id=document_id,
            application_id=application_id,
            doc_slot=doc_slot,
            detected_kind="pdf",
            detected_media_type="application/pdf",
            byte_size=len(raw_bytes),
            blake3=blake3,
            sha256=sha256,
            storage_key=storage_key,
            routing_outcome="EMPTY_DOCUMENT",
            reason="PDF document contains 0 pages",
            total_pages=0,
            page_counts={"digital": 0, "scanned": 0, "hybrid": 0, "vector_drawing": 0, "blank": 0},
            page_verdicts=[],
        )

    page_verdicts: list[dict[str, Any]] = []
    page_counts = {"digital": 0, "scanned": 0, "hybrid": 0, "vector_drawing": 0, "blank": 0}

    for p in doc:
        verdict = classify_page(p)
        page_verdicts.append(asdict(verdict))
        page_counts[verdict.label] = page_counts.get(verdict.label, 0) + 1

    doc.close()

    # Document-level routing synthesis
    content_verdicts = [v for v in page_verdicts if v["label"] != "blank"]

    if not content_verdicts:
        routing_outcome = "BLANK_DOCUMENT"
        reason = "All pages in PDF are blank"
    elif all(v["label"] == "digital" for v in content_verdicts):
        routing_outcome = "BRANCH_A_DIGITAL"
        reason = "All pages contain visible, extractable text layer"
    elif all(v["label"] == "scanned" for v in content_verdicts):
        routing_outcome = "BRANCH_B_SCANNED"
        reason = "Document consists of scanned/raster pages requiring OCR processing"
    elif all(v["label"] == "vector_drawing" for v in content_verdicts):
        routing_outcome = "VECTOR_DRAWING"
        reason = "Document dominated by vector drawings / CAD floor plans"
    else:
        # Mixed page types
        active_counts = {k: v for k, v in page_counts.items() if v > 0}
        summary = ", ".join(f"{k}:{v}" for k, v in active_counts.items())
        routing_outcome = "MIXED"
        reason = f"Document contains mixed page types ({summary})"

    return DocumentRouteResult(
        document_id=document_id,
        application_id=application_id,
        doc_slot=doc_slot,
        detected_kind="pdf",
        detected_media_type="application/pdf",
        byte_size=len(raw_bytes),
        blake3=blake3,
        sha256=sha256,
        storage_key=storage_key,
        routing_outcome=routing_outcome,
        reason=reason,
        total_pages=total_pages,
        page_counts=page_counts,
        page_verdicts=page_verdicts,
    )
