# Phase A implementation spec

## Phase A milestone goal (Guide §20.1)

Demonstrate one end-to-end reliable validation flow for a single application
category (Extension of Approval / EoA renewal) over synthetic data. The guide's exit gate requires:
- A synthetic generator for one institute and one application.
- Ingest (S1), forensics (S2), routing (S3), Branch B OCR path (S4),
  typing (S5), extraction and grounding (S6/S6b), typed facts (S7),
  declarative deterministic rules (S8), simulated verification gateway (S9),
  infrastructure evidence inventory & geotags (S10), unified aggregation & lanes (S11),
  evidence viewer with grounded bounding boxes, officer actions & draft notice/brief exports (S12),
  and tamper-evident cryptographic audit hash chain with Ed25519 checkpoints (S13).
- All §20.6 items marked "A" passing.

Phase A is the guide's "one reliable case" milestone. It is not a subset of
pipeline stages: it spans **S1 through S13** for the single-category path.

---

## Pipeline Stage Implementation Status (Guide §2.2)

All 13 pipeline stages are **implemented and verified end-to-end** for the single-category EoA Renewal flow:

| Stage | Guide section | Status | Implementation Details |
|---|---|:---:|---|
| **S1 Ingest** | §4 | **Implemented** | Streaming multipart upload, BLAKE3 and SHA-256 dual digest computed in a single pass, magic-byte sniffing (PDF, PNG, JPEG), 50 MB size limit, encrypted PDF rejection, content-addressed vault storage (`b3/<aa>/<bb>/<digest>`), DB blob/upload deduplication, and idempotent replay via `Idempotency-Key`. |
| **S2 Forensics** | §5 | **Implemented** | Raw-byte metadata inspection (PyMuPDF), incremental update parsing, X.509 digital signature validation (pyHanko), image EXIF and GPS coordinate extraction (Pillow), software editor token detection, QR code locator (OpenCV/RapidOCR). Deferred/unsupported checks recorded as `NOT_CHECKED`. |
| **S3 Route** | §6 | **Implemented** | Per-page heuristic classification based on extractable text density, raster image area ratio, and vector path drawing count. Routes document to `BRANCH_A_DIGITAL`, `BRANCH_B_SCANNED`, or `BRANCH_MIXED`. |
| **S4 Branch B** | §7–§9 | **Implemented** | Raster preprocessing (L0/L1), single 3×3 matrix inverse coordinate transform, offline engine ladder (RapidOCR ONNX, Docling layout/table parser, digital PDF fallback), table cell normalization, Indic numeral transliteration, arithmetic row/column sum verification, unified C1 payload generation, and derived vault caching. |
| **S5 Typing** | §11.1 | **Implemented** | Page 1 rule-based pattern scoring, bounded slot prior, evidence grounding to text blocks and bounding boxes, slot mismatch detection (`DOC_TYPE_SLOT_MISMATCH`), and database caching. |
| **S6/S6b Extraction & Grounding** | §11.2–§11.3 | **Implemented** | Schema-driven field extraction per document type (YAML schemas), 4-digit date policy, provenance-first grounding, word-precision search, completeness enforcement (`COMPLETE` vs `INCOMPLETE`), and persistent C3 typed facts. |
| **S7 Typed Facts & Resolution** | §11.4 | **Implemented** | Separate core and legal-form name comparison, `token_sort_ratio` fuzzy matching, abbreviation expansion, Indic digit and registration ID normalization, synthetic record envelopes via `RecordsAdapter`, and cross-source fact aggregator. |
| **S8 Rules Engine** | §12 | **Implemented** | Declarative versioned YAML rule sets (`EOA_RENEWAL.yaml`), Three-Valued Gate (`PASS`, `FAILED_CHECK`, `NOT_CHECKED`, `NEEDS_REVIEW`, `WARNING`), 7 deterministic evaluators (`required_doc`, `not_expired`, `name_match`, `intake_check`, `field_present`, `date_order`, `count_check`), fail-visible error handling, activation validator, C4 check results, and C5 actionable findings. |
| **S9 Verification Gateway** | §13 | **Implemented** | Independent verification adapters: QR code decoder registry lookup, Ed25519/X.509 digital signature adapter, mock portal adapter. Error normalization (`SOURCE_UNAVAILABLE`, `MANUAL_REVIEW_REQUIRED`), circuit breaker, and strict `simulated: true` labels. |
| **S10 Infrastructure Evidence** | §14 | **Implemented** | Facility evidence inventory count vs minimum required files, EXIF GPS coordinates vs registered campus coordinates via Haversine distance, capture timestamp checks vs submission window, 64-bit DCT perceptual hash (pHash) Hamming distance deduplication across institutions, and claim vs minimum area norms. |
| **S11 Aggregation & Status** | §11.7 | **Implemented** | Combines S1–S10 outputs into an integrated decision-support payload: derives workflow status (`VALIDATED_NO_ISSUES`, `NEEDS_RECTIFICATION`, `NEEDS_MANUAL_REVIEW`), assigns review lanes (`FAST_REVIEW`, `NEEDS_SCRUTINY`, `NEEDS_VERIFICATION`, `NEEDS_EVIDENCE`), computes priority score (formula: `100·high + 30·medium + 5·low + age_days + deadline_pressure`), and emits structured officer alerts. |
| **S12 Review Console & Exports** | §17, §11.8 | **Implemented** | Human officer finding action lifecycle (`open` → `acknowledged` → `rectification_requested` → `dismissed` → `escalated` → `resolved`) with mandatory reasons, overrides stored beside original findings, immutable audit event creation, draft statutory Deficiency Notice generation (omitting internal anomaly tags per §17.4), Ground Inspection Brief compilation, and comprehensive Application Evaluation Report. |
| **S13 Audit Trail** | §15 | **Implemented** | Strict chronological append-only event log linked via SHA-256 hash chaining (Genesis to Head), fail-visible tamper tripwire, external signed checkpoints via asymmetric Ed25519 digital signatures, and signature verification against trusted public keys. |

---

## Complete API Route Reference (S1 through S13)

### Core & Legacy Demo Endpoints
- `GET  /` — Web application SPA shell (`ui/index.html`)
- `GET  /health` — Health and sovereign mode verification (`{"status": "ok", "mode": "demo", "simulated": true}`)
- `GET  /api/demo/applications` — List pre-loaded synthetic demo applications
- `GET  /api/demo/applications/{application_id}/validate` — Starter demo validation against hardcoded records

### S1: Document Ingest & Storage
- `POST /applications/{application_id}/documents` — Upload and persist document (multipart, dual-hash, vault storage)
- `GET  /applications/{application_id}/documents` — List uploaded document metadata for application
- `GET  /applications/{application_id}/documents/{document_id}/page/{page_num}` — Rendered page raster streaming (PDF page or raw image)

### S2: Raw-Byte Forensics
- `POST /applications/{application_id}/documents/{document_id}/forensics` — Execute forensics analysis pipeline
- `GET  /applications/{application_id}/documents/{document_id}/forensics` — Retrieve cached forensic findings

### S3: Content Routing
- `POST /applications/{application_id}/documents/{document_id}/route` — Classify and route document (Branch A vs B)
- `GET  /applications/{application_id}/documents/{document_id}/route` — Retrieve cached routing outcome

### S4: Branch B Extraction & Normalization
- `POST /applications/{application_id}/documents/{document_id}/extract` — Execute Branch B OCR ladder and produce C1 payload
- `GET  /applications/{application_id}/documents/{document_id}/extract` — Retrieve C1 unified document payload

### S5: Document Typing
- `POST /applications/{application_id}/documents/{document_id}/type` — Classify document category and checklist slot
- `GET  /applications/{application_id}/documents/{document_id}/type` — Retrieve document classification and slot mismatch status

### S6: Schema-Driven Field Extraction
- `POST /applications/{application_id}/documents/{document_id}/fields` — Extract schema-driven fields and ground bounding boxes
- `GET  /applications/{application_id}/documents/{document_id}/fields` — Retrieve extracted fields and completeness status

### S7: Typed Facts & Entity Resolution
- `GET  /applications/{application_id}/facts` — Aggregated C3 typed facts and canonical entity comparisons

### S8: Deterministic Rules Engine
- `POST /applications/{application_id}/validate` — Execute rule set evaluation against typed facts
- `GET  /applications/{application_id}/validate` — Retrieve validation report (C4 checks, C5 findings)
- `GET  /rules` — List active and candidate regulatory rule sets
- `GET  /rules/{rule_set_name}` — Get versioned rule definitions, parameters, and evaluators
- `GET  /rules/compare` — Side-by-side diff between two rule set versions

### S9: Issuing Authority Verification Gateway
- `POST /applications/{application_id}/documents/{document_id}/verify` — Query simulated verification adapter (QR, signature, portal)
- `GET  /applications/{application_id}/documents/{document_id}/verify` — Retrieve C6 verification result

### S10: Physical Infrastructure Evidence
- `GET  /applications/{application_id}/infra` — Evaluate facility photo inventory, GPS coordinates, pHash deduplication, and area norms

### S11: Unified Aggregation & Triage
- `GET  /applications/{application_id}/aggregate` — Consolidated workflow status, review lane assignment, priority score, and alerts

### S12: Officer Review Console & Notice Exports
- `POST /applications/{application_id}/findings/{finding_id}/act` — Record human officer action on finding (with mandatory rationale)
- `GET  /applications/{application_id}/findings/actions` — Retrieve chronological finding action history
- `GET  /applications/{application_id}/exports/deficiency-notice` — Generate formal draft Deficiency Notice for institution
- `GET  /applications/{application_id}/exports/inspection-brief` — Generate Physical Ground Inspection Brief
- `GET  /applications/{application_id}/report` — Generate comprehensive Application Evaluation Report

### S13: Tamper-Evident Cryptographic Audit Trail
- `GET  /audit/events` — Retrieve chronological audit log entries
- `GET  /audit/verify` — Verify SHA-256 hash chain integrity from Genesis to Head (with optional sandbox tamper simulation)
- `POST /audit/checkpoint` — Create signed Ed25519 external checkpoint
- `GET  /audit/checkpoints` — List signed external checkpoints
- `GET  /audit/checkpoints/{checkpoint_id}/verify` — Verify Ed25519 signature against trusted public key

### System Transparency
- `GET  /about/realness` — System Realness & Transparency Matrix (Guide §1.4)

---

## State Model Governance

The prototype strictly enforces four independent state dimensions without conflation:
1. **Check Result (C4):** `PASS` · `WARNING` · `FAILED_CHECK` · `NOT_CHECKED` · `NEEDS_REVIEW`
2. **Verification Status (C6):** `VERIFIED` · `MISMATCH_DETECTED` · `EXPIRED` · `VERIFICATION_PENDING` · `SOURCE_UNAVAILABLE` · `MANUAL_REVIEW_REQUIRED` · `NOT_SUPPORTED` · `NOT_CHECKED`
3. **Finding Lifecycle:** `open` → `acknowledged` → `rectification_requested` → `dismissed` → `escalated` → `resolved`
4. **Application Workflow Status:** `DRAFT` → `SUBMITTED` → `VALIDATING` → (`VALIDATED_NO_ISSUES` | `NEEDS_RECTIFICATION` | `NEEDS_MANUAL_REVIEW`) → `UNDER_OFFICER_REVIEW` → `OFFICER_DECISION_RECORDED`

Unavailable or ambiguous checks are strictly recorded as `NOT_CHECKED` or `NEEDS_REVIEW`, never defaulted to `PASS`.

---

## Boundary to Next Phases

### Phase B Scope (Multi-Category Expansion)
- Extend document schemas and rule sets to additional application categories (New Institute Setup, Intake Increase, Additional Courses, Closure).
- Expand tabular extraction models for faculty lists (Cadre ratio, AICTE qualification norms).
- Land norms and building plan verification (Title deed, conversion certificate, FSI/FAR limits).

### Phase C Scope (Live External Authority Integrations)
- Production PKI trust anchors (CCA India certificate authority integration and live OCSP queries).
- Live issuer adapters (DigiLocker API, state fire registry webhooks, university affiliation portals) under strict confidentiality gates.
- Production OAuth 2.0 / OpenID Connect authorization with endpoint-level RBAC middleware enforcement.
- S3-compatible cloud object storage integration (SeaweedFS / AWS S3) for multi-region scale.
