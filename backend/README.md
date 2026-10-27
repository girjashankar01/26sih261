# Backend Module Map & Architecture Reference

> **AICTE Application Validation Prototype — SIH 2026 PS 26261**  
> *Sovereign Decision-Support Engine for Technical Education Regulatory Scrutiny*

---

## 1. Architectural Principles

1. **AI Proposes, Rules Decide, Officers Approve:** The engine generates preliminary discrepancy indicators; it never automates approval or rejection.
2. **Four Orthogonal State Dimensions:** Check results (`PASS`/`FAILED_CHECK`/`NOT_CHECKED`/`NEEDS_REVIEW`/`WARNING`), verification statuses (`VERIFIED`/`EXPIRED`/`MISMATCH_DETECTED`/`SOURCE_UNAVAILABLE`/etc.), finding lifecycles (`open`/`acknowledged`/`rectification_requested`/`dismissed`/`escalated`/`resolved`), and workflow statuses (`VALIDATED_NO_ISSUES`/`NEEDS_RECTIFICATION`/`NEEDS_MANUAL_REVIEW`).
3. **Fail-Visible Honesty:** Unavailable or un-evaluated checks are strictly recorded as `NOT_CHECKED` or `NEEDS_REVIEW`, never `PASS`.
4. **Both Compared Values:** Non-pass findings contain both observed document values and expected normative/record values.
5. **Air-Gapped Sovereign Compliance:** Zero document or telemetry data is transmitted to external endpoints. All issuer simulations carry explicit `simulated: true` labels.

---

## 2. Directory & Module Structure

```
backend/
├── aggregation/           # S11 Unified aggregation, status derivation, review lanes, priority formula, alerts
│   ├── __init__.py
│   └── service.py
├── api/                   # FastAPI route definitions, OpenAPI schema models, CORS, static mounts
│   ├── __init__.py
│   ├── main.py            # Main application router and 43 REST endpoint handlers
│   └── schemas.py         # Pydantic v2 validation and response models
├── audit/                 # S13 Tamper-evident cryptographic hash chain, Ed25519 signing, RBAC definitions
│   ├── __init__.py
│   ├── chain.py           # Sequential SHA-256 hash chain & Ed25519 checkpoint creator/verifier
│   └── rbac.py            # Role scopes & permission definitions
├── db/                    # Persistence layer with dual SQLite/PostgreSQL support
│   ├── __init__.py
│   ├── connection.py      # Dual-engine connection & transaction manager (SQLite / psycopg PostgreSQL)
│   └── repository.py      # DDL schema definitions and 30+ atomic repository query functions
├── extraction/            # S6/S6b Schema-driven field extraction, date normalization, bounding box grounding
│   ├── __init__.py
│   ├── date_parser.py     # 4-digit year enforcement & Indian format date parser
│   ├── extractor.py       # Pattern and layout matching against document schemas
│   ├── grounding.py       # Word-precision and block-precision coordinate locator
│   ├── names.py           # Core vs legal-form name comparison, token sort ratio, abbreviation expansion
│   └── service.py         # S6 execution orchestrator & C3 fact persistence
├── facts/                 # S7 Cross-source fact aggregation & entity resolution
│   ├── __init__.py
│   └── service.py         # Aggregates C3 facts from forms, uploads, extractions, and authorized records
├── forensics/             # S2 Raw-byte document forensics & advisory preliminary indicators
│   ├── __init__.py
│   ├── detectors/
│   │   ├── image_exif.py      # EXIF metadata, GPS geotag, image editor software token detector
│   │   ├── pdf_meta.py        # PyMuPDF metadata & PDF editor software token detector
│   │   ├── pdf_signatures.py  # pyHanko digital signature & revision parser
│   │   └── qr_locator.py      # OpenCV / RapidOCR QR code detector and bounding box locator
│   ├── models.py          # Forensic metadata and C2 flag data models
│   ├── runner.py          # Sequential forensics detector execution runner
│   └── trust_roots.py     # Sovereign trust roots and demonstration X.509 fixtures
├── infra/                 # S10 Physical infrastructure evidence & geotag norm verification
│   ├── __init__.py
│   └── service.py         # DCT 64-bit pHash deduplication, Haversine GPS radius check, area norm checks
├── ingest/                # S1 Document ingestion gateway & vault storage
│   ├── __init__.py
│   └── service.py         # Streaming multipart upload, BLAKE3+SHA-256 dual hashing, idempotency replay
├── pipeline/              # S3 Router & S4 Branch B OCR extraction ladder
│   ├── __init__.py
│   ├── branch_b.py        # Branch B extraction coordinator, cache manager, C1 payload generator
│   ├── engines/
│   │   ├── digital_pdf.py     # PyMuPDF text and block extraction engine
│   │   ├── docling_engine.py  # Structured layout and table parsing engine
│   │   ├── ocr_ladder.py      # RapidOCR ONNX fallback ladder
│   │   └── tabular.py         # Table grid, bounding box, and cell extraction
│   ├── postprocess.py     # Indic numeral transliteration, currency symbol normalization, arithmetic sum checks
│   ├── preprocess.py      # L0/L1 raster preparation, deskewing, dewarping, and 3x3 inverse matrix
│   └── router.py          # S3 heuristic classifier (extractable text vs image area vs vector paths)
├── records/               # Synthetic institutional records & application fixtures
│   ├── __init__.py
│   ├── adapter.py         # RecordsAdapter interface & MockRecordsAdapter implementation
│   └── demo.py            # Immutable synthetic institutional application envelopes
├── review/                # S12 Human review console, finding actions & draft notice generators
│   ├── __init__.py
│   ├── exports.py         # Statutory Deficiency Notice, Inspection Brief, Evaluation Report compilers
│   └── findings.py        # Officer finding action recorder with mandatory rationale enforcement
├── rules/                 # S8 Versioned deterministic regulatory rules engine v4
│   ├── __init__.py
│   ├── engine.py          # Rule set YAML loader and activation validator
│   ├── evaluate.py        # Application validation orchestrator producing C4 checks & C5 findings
│   ├── evaluators.py      # 7 deterministic evaluators (required_doc, not_expired, name_match, intake, etc.)
│   └── gate.py            # Three-Valued Gate (Precheck, Primary, Hardening)
├── storage/               # Immutable content-addressed blob vault
│   ├── __init__.py
│   └── vault.py           # LocalVaultStorage (`b3/<aa>/<bb>/<digest>`) and S3VaultBackend
├── typing/                # S5 Document classification & checklist selection
│   ├── __init__.py
│   ├── classifier.py      # Page 1 pattern-scoring classifier with slot priors
│   └── service.py         # S5 execution coordinator & slot mismatch detector
└── verification/          # S9 Issuing authority verification gateway
    ├── __init__.py
    ├── adapters/
    │   ├── base.py        # VerificationAdapter base class & exception types
    │   ├── portal.py      # MockPortalAdapter for institutional accreditation registries
    │   ├── qr.py          # QRAdapter for state fire service certificates
    │   └── signature.py   # SignatureAdapter for X.509 cryptographically signed documents
    ├── decide.py          # Field comparison, normalizers, and verification decision engine
    └── gateway.py         # VerificationGateway orchestrator with retry and circuit breaker
```

---

## 3. Data Contracts & Payload Schemas (Guide §3.4)

The backend exchanges data via versioned contract models defined under `docs/contracts/` and implemented in `backend/api/schemas.py`:

| Contract | Schema File | Description |
|---|---|---|
| **C1** | `c1_unified_payload.schema.json` | Lossless unified document extraction payload (pages, blocks, words, tables, cells, normalizations). |
| **C2** | `c2_flag.schema.json` | Raw-byte forensics preliminary indicator flag (advisory signal, never conclusive). |
| **C3** | `c3_fact.schema.json` | Grounded typed fact with value type, parse state, precision level, and normalized bounding box. |
| **C4** | `c4_check_result.schema.json` | Deterministic compliance check outcome across 5 standard states. |
| **C5** | `c5_finding.schema.json` | Actionable discrepancy finding containing observed document value, expected norm, rule ID, and lifecycle state. |
| **C6** | `c6_verification_result.schema.json` | Authority verification attempt record with adapter ID, comparison map, and explicit simulation flag. |

---

## 4. Database Schema (13 Tables)

Implemented in `backend/db/repository.py` with cross-database compatibility (SQLite in local dev, PostgreSQL in Docker/production):

1. **`blobs`**: Content-addressed binary store indexed by BLAKE3 hash with SHA-256 digest, byte size, media type, and vault storage key.
2. **`uploads`**: Uploaded document instances tied to `application_id`, slot label (`doc_slot`), and optional `idempotency_key`.
3. **`extractions`**: Cached S4 Branch B C1 payloads indexed by BLAKE3, pipeline version, and config hash.
4. **`document_types`**: S5 classification outcomes, confidence scores, evidence quotes, and candidate score breakdowns.
5. **`facts`**: Persistent C3 typed facts extracted from documents or application forms with bounding box coordinates.
6. **`verifications`**: C6 verification attempts, request/response digests, comparison results, and timestamps.
7. **`check_results`**: C4 rule check outcomes per application and rule ID.
8. **`findings`**: C5 actionable discrepancies requiring officer attention.
9. **`finding_actions`**: Chronological officer overrides (`acknowledge`, `dismiss`, `rectify`, `escalate`, `resolve`) with mandatory rationale.
10. **`infra_evidence`**: S10 facility photo records with 64-bit DCT pHash, EXIF GPS coordinates, and timestamp metadata.
11. **`alerts`**: Aggregated scrutiny alerts categorized by severity (`HIGH`, `MEDIUM`, `LOW`, `INFO`).
12. **`audit_events`**: Tamper-evident sequential SHA-256 hash chain log (Genesis to Head).
13. **`checkpoints`**: External audit checkpoints anchored with asymmetric Ed25519 digital signatures.

---

## 5. Storage Architecture (Guide §3.3)

Documents are stored immutably in a content-addressed vault:
- **Local Vault Storage (`LocalVaultStorage`):** Stores blobs under `data/vault/b3/<aa>/<bb>/<blake3_hex>`.
- **Integrity Enforcement:** Re-computes BLAKE3 digest on read to prevent bit-rot or undetected file alteration.
- **Path Traversal Protection:** Validates that resolved target paths strictly reside within the configured vault root directory.
- **S3 Backend (`S3VaultBackend`):** Implements identical `VaultBackend` protocol using `boto3` for optional cloud or SeaweedFS object stores.

---

## 6. Running the Backend

```bash
# Install / sync dependencies
uv sync --locked

# Start development server with auto-reload
uv run uvicorn backend.api.main:app --reload --host 127.0.0.1 --port 8000

# Execute backend unit test suite (151 tests)
uv run python -m unittest discover tests

# Execute end-to-end pipeline script
uv run python scripts/e2e_demo_walkthrough.py
```
