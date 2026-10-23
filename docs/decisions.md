# Decisions and handoff log

## Baseline — 2026-10-23
- Python is pinned to CPython 3.12.14; Python does not use a formal LTS designation. 3.12 is the conservative baseline for document/OCR libraries planned in the guide.
- uv is pinned to 0.13.5. Direct dependencies live in `pyproject.toml`; exact transitive resolution belongs in `uv.lock`; `requirements.txt` is exported.
- Demo scope: synthetic EoA renewal, required-document/expiry/intake rules only. All rules are illustrative, not confirmed AICTE requirements.
- No live integrations, uploads, OCR, persistence, authentication, or audit storage.
- The guide's suggested full module tree is a roadmap, not a requirement to create empty packages. The starter follows the boundaries with real code (`api`, `records`, `rules`, `ui`) and documents the deferred modules in `backend/README.md`.

## Update format
Date · decision · reason · owner · interfaces/files affected · unresolved follow-up. Record failures and unverified assumptions as well as successful runs.

## Starter verification — 2026-10-23
- `uv lock` and requirements export completed with uv 0.12.17 while resolving the locked CPython 3.12.14 project; project tooling is pinned to uv 0.13.5 for the team baseline.
- `uv sync --locked --no-dev` completed; the API started with the locked environment; `/health` returned 200 and the seeded issue case returned missing, expired, and inconsistent findings with both intake values.
- Docker is not installed in the authoring environment, so Compose parsing/image build remain to be checked by the team on a machine with Docker Desktop/Engine.

## Phase 0 Environment and Handoff Readiness Verification — 2026-10-23
- Prerequisites verified on macOS:
  - `git --version`: 2.54.0
  - `uv --version`: 0.13.5 (matches project pin)
  - `docker version`: Client 29.9.2, Server Docker Desktop 4.96.3 / Engine 29.9.2 (aarch64)
  - `docker compose version`: v5.6.1
  - `docker info`: Server healthy; Docker Desktop launched on Mac
- Local environment sync:
  - `uv python install 3.12.14`: CPython 3.12.14 installed successfully
  - `uv sync --locked`: 22 locked dependencies synced into `.venv`
- Defect identified and resolved:
  - File: `docker/compose.yml`
  - Issue: `networks: [internal]` with `internal: true` was configured on the standalone `app` service without an edge proxy. As anticipated in guide §18.3, Docker drops external host port forwarding on `internal: true` networks, making `8000:8000` unreachable from the Mac host (`curl: (7) Failed to connect to localhost port 8000`), despite the uvicorn process running successfully inside the container.
  - Fix: Removed `networks: [internal]` / `internal: true` from `docker/compose.yml` for this standalone starter slice so port 8000 is accessible from localhost. (When the offline multi-service topology is introduced, an Nginx gateway on both `edge` and `internal` networks will be added per guide §18.3).
- Verification runs:
  - `docker compose -f docker/compose.yml config`: parsed and validated
  - `docker compose -f docker/compose.yml up --build -d`: image built and container started
  - `GET http://localhost:8000/health`: returned HTTP 200 `{"status":"ok","mode":"demo","simulated":true}`
  - `GET http://localhost:8000/`: UI loaded, prominently showing the synthetic disclaimer notice and SIMULATED badge
  - `GET http://localhost:8000/api/demo/applications`: returned clean and issue demo applications with `simulated: true`
  - `GET http://localhost:8000/api/demo/applications/DEMO-CLEAN-001/validate`: returned `VALIDATED_NO_ISSUES`, 4 passed checks, 0 findings, `decision_support_only: true`, `simulated: true`
  - `GET http://localhost:8000/api/demo/applications/DEMO-ISSUES-001/validate`: returned `NEEDS_RECTIFICATION`, reporting all 3 seeded issues with full evidence:
    - `DEMO-DOC-001` (MISSING): missing 'affidavit'
    - `DEMO-DATE-001` (EXPIRED): 'fire_noc' validity date (2026-03-31) precedes submission date (2026-10-12)
    - `DEMO-INTAKE-001` (INCONSISTENT): requested intake (540) exceeds record (480)
  - `docker compose -f docker/compose.yml down`: container stopped and network removed cleanly
  - Verified that neither API nor UI claims live AICTE/issuer integration or legal authority.

## Phase 0 Contract & Status Closeout — 2026-10-24
- Frozen API & Data Contracts:
  - Defined 6 versioned JSON Schemas under `docs/contracts/` per Prototype Guide §3.4:
    - `c1_unified_payload.schema.json` (lossless extraction representation)
    - `c2_flag.schema.json` (forensics/tamper detector signal, advisory only)
    - `c3_fact.schema.json` (typed, grounded fact extractions with parse_state and gate calibration rules)
    - `c4_check_result.schema.json` (rule evaluation results with 5 states)
    - `c5_finding.schema.json` (actionable non-pass findings with both-sides comparison evidence and lifecycle)
    - `c6_verification_result.schema.json` (independent document verification statuses and registry comparison)
    - `validation_response.schema.json` (top-level validation report for API endpoint)
  - Created representative examples for all 6 contracts plus clean and defect validation responses under `docs/contracts/examples/`.
  - Implemented typed Pydantic models in `backend/api/schemas.py` bound to endpoints in `backend/api/main.py`.
  - Exported complete OpenAPI 3.1.0 specification to `docs/contracts/openapi.json`.
- Separation of 4 State Dimensions (Guide §1.3):
  - Check result status: `PASS`, `WARNING`, `FAILED_CHECK`, `NOT_CHECKED`, `NEEDS_REVIEW`.
  - Verification status: `VERIFIED`, `MISMATCH_DETECTED`, `EXPIRED`, `VERIFICATION_PENDING`, `SOURCE_UNAVAILABLE`, `MANUAL_REVIEW_REQUIRED`, `NOT_SUPPORTED`, `NOT_CHECKED`.
  - Finding lifecycle: `open`, `acknowledged`, `rectification_requested`, `dismissed`, `escalated`, `resolved`.
  - Application workflow: `DRAFT`, `SUBMITTED`, `VALIDATING`, `NO_FINDINGS_IN_ENABLED_DEMO_CHECKS`, `NEEDS_RECTIFICATION`, `NEEDS_MANUAL_REVIEW`, `VALIDATED_NO_ISSUES`, `UNDER_OFFICER_REVIEW`, `OFFICER_DECISION_RECORDED`.
- Workflow-Status Correction:
  - Clean case no longer emits `VALIDATED_NO_ISSUES` because the prototype only evaluated 3 partial demo rules without OCR, forensics, or live issuer verifications.
  - Now emits `NO_FINDINGS_IN_ENABLED_DEMO_CHECKS` with structured `coverage` metadata detailing 3 evaluated demo checks and listing unevaluated pipeline stages.
  - Seeded-defect case retains `NEEDS_RECTIFICATION` reporting missing, expired, and inconsistent findings.
  - Updated UI in `ui/index.html` to clearly render `NO FINDINGS IN ENABLED DEMO CHECKS` and display coverage details, ensuring passing demo checks cannot be mistaken for approval or regulatory decisions.
- Docker Networking & Security Note:
  - Updated `docker/compose.yml` to bind port strictly to localhost (`127.0.0.1:8000:8000`) on the default bridge network.
  - Documented that the default bridge network allows outbound container traffic. There are no external provider calls in this demo, so outbound isolation is not claimed.
  - True air-gapped/offline isolation requires the edge-gateway/reverse-proxy topology (guide §18.3) with an edge network and an `internal: true` network; this is tracked as a later platform/security task.
- Verification Runs Executed:
  - Python model validation test verified both demo fixtures match `ValidationResponseModel`.
  - JSON Schema syntax check validated all 7 schemas and 8 examples.
  - `docker compose -f docker/compose.yml config` validated cleanly with `host_ip: 127.0.0.1`.
  - `docker compose -f docker/compose.yml up --build -d` built and launched container `docker-app-1`.
  - `GET http://127.0.0.1:8000/health` returned HTTP 200 `{"status":"ok","mode":"demo","simulated":true}`.
  - `GET http://127.0.0.1:8000/api/demo/applications/DEMO-CLEAN-001/validate` returned `NO_FINDINGS_IN_ENABLED_DEMO_CHECKS` with 4 passed checks, 0 findings, and coverage block.
  - `GET http://127.0.0.1:8000/api/demo/applications/DEMO-ISSUES-001/validate` returned `NEEDS_RECTIFICATION` with 3 findings (missing, expired, inconsistent) and complete evidence.
  - `docker compose -f docker/compose.yml down` stopped container and removed network cleanly.

## Phase A Step 1 — Document Ingestion Gateway (S1) — 2026-10-24
- Endpoint Implemented:
  - Added `POST /applications/{application_id}/documents` for multipart document upload.
  - Dependencies: Added `blake3==1.0.11` and `python-multipart==0.0.32` via `pyproject.toml`, resolved in `uv.lock`, and exported to `requirements.txt`.
- Architecture & Processing Behavior:
  - Streaming: Upload is streamed in 64 KB chunks directly to a temporary scratch file on disk; full file is never held in memory.
  - Cryptographic Digests: Computes BLAKE3 and SHA-256 in a single pass over the stream.
  - Size Limit: Enforces configurable `max_size` (default 10 MB) during streaming; immediately terminates stream with HTTP 413 `FILE_TOO_LARGE` if threshold is exceeded.
  - Format Sniffing: Strictly sniffs magic bytes (`%PDF-`, `\x89PNG\r\n\x1a\n`, `\xff\xd8\xff`); ignores submitted filename and Content-Type header. Rejects unsupported formats with HTTP 415 `UNSUPPORTED_MEDIA_TYPE`.
  - PDF Security: Inspects PDF xref/trailer structures for `/Encrypt`; rejects encrypted or password-protected PDFs with HTTP 422 `ENCRYPTED_PDF_REJECTED`.
  - Zero-Data-Leakage Logging: Error messages and logs contain only status codes, identifiers, and format errors; uploaded payload data is never leaked.
  - Scratch File Lifecycle: Scratch files are guaranteed unlinked on both success and error paths in `finally:`.
  - Honest Pipeline States: Returns `processing_state: "INGESTED_STREAM_VERIFIED"`, `pipeline_stage: "S1_INGESTION_GATEWAY"`, `ocr_status: "NOT_RUN"`, and `persistence_status: "EPHEMERAL_SCRATCH_VERIFIED"`. No OCR, database persistence, or downstream extraction is claimed until implemented.
- Contract & OpenAPI Updates:
  - Created `docs/contracts/document_ingest_response.schema.json` and `docs/contracts/examples/document_ingest_response_example.json`.
  - Registered `DocumentIngestResponseModel` in `backend/api/schemas.py`.
  - Exported updated OpenAPI 3.1.0 specification to `docs/contracts/openapi.json`.
- Verification Runs Executed:
  - Unit tests (`tests/test_ingest.py`): 8 test cases executed via `uv run python -m unittest discover tests` (testing PDF, PNG, JPEG, spoofed bytes, empty file, size limit streaming abort, encrypted PDF, and scratch file cleanup). All 8 passed (0.056s).
  - `docker compose -f docker/compose.yml config`: validated with `host_ip: 127.0.0.1`.
  - `docker compose -f docker/compose.yml up --build -d`: container built and started.
  - Live container multipart POST tests executed against `http://127.0.0.1:8000/applications/DEMO-CLEAN-001/documents`:
    - Valid PDF: returned 201 Created with detected_kind `pdf` and matching BLAKE3/SHA-256.
    - Valid PNG: returned 201 Created with detected_kind `png`.
    - Spoofed text file: returned 415 with `UNSUPPORTED_MEDIA_TYPE`.
    - Encrypted PDF: returned 422 with `ENCRYPTED_PDF_REJECTED`.
  - `docker compose -f docker/compose.yml down`: container stopped and network removed cleanly.

## Phase A Step 2 — Vault Storage & Transactional Database Persistence — 2026-10-24
- Content-Addressed Vault Storage (`backend/storage/vault.py`):
  - Key scheme: Formatted as `b3/<aa>/<bb>/<blake3>` based on BLAKE3 digest (Guide §3.1).
  - Atomic writes: Conditional placement (`if_absent=True`) writes to a sibling temporary file (`.tmp-...`) in the target directory and executes an atomic replace, preventing partial reads.
  - Path traversal defense: Key resolution verifies that keys are relative POSIX paths without `..` traversal and that the resolved path is strictly relative to the vault root directory.
  - Collision & integrity check: Deduplication detects existing blobs; on collision, verifies BLAKE3 hash integrity (`verify_integrity`). If existing data is corrupt, raises HTTP 500 `STORAGE_INTEGRITY_MISMATCH`.
- Database Layer & Portability (`backend/db/connection.py`, `backend/db/repository.py`):
  - Portable database abstraction supporting SQLite (default local zero-dependency storage at `data/prototype.db` or `:memory:`) and PostgreSQL (`psycopg 3.3.6`) via SQL parameter translation (`?` vs `%s`).
  - Schema:
    - `blobs`: `blake3` (PK), `sha256`, `byte_size`, `media_type`, `storage_key`, `created_at`.
    - `uploads`: `id` (PK `doc_...`), `application_id`, `blake3` (FK to blobs), `doc_slot`, `idempotency_key` (UNIQUE), `created_at`.
  - Transaction management: All database inserts execute inside a transactional context (`Database.transaction()`) with automatic commit on success and rollback on exceptions.
- Idempotency & Failure Handling:
  - Supports `Idempotency-Key` via request header or multipart form parameter.
  - Checked after stream hashing:
    - Same key + same BLAKE3 hash + same application ID: Returns original upload record with `idempotent_replay: true` and `processing_state: "PERSISTED"`.
    - Same key + different content or application ID: Returns structured HTTP 409 `IDEMPOTENCY_CONFLICT`.
  - Failure atomicity & reverse-failure cleanup:
    - If vault write fails, DB transaction is not started.
    - If vault write succeeds for a new blob (`is_new_blob=True`) but DB transaction fails, the service checks whether any other upload references that blob (`count_uploads_for_blob`). If unreferenced (`refs == 0`), the orphaned storage file is safely unlinked; if existing uploads reference it (`refs > 0`), the vault file is preserved.
- Pipeline Status & Disclaimers:
  - Upgraded status from ephemeral to `processing_state: "PERSISTED"` and `persistence_status: "VAULT_LOCAL"`.
  - Retains `ocr_status: "NOT_RUN"`, `pipeline_stage: "S1_INGESTION_GATEWAY"`, `simulated: true`, and `advisory: true`. No OCR, extraction, or verification is claimed.
- Docker Persistence:
  - Updated `docker/compose.yml` with named volume `prototype_data:/app/data` so persisted database and vault files survive container restarts while keeping `read_only: true` on the container root filesystem.
- Contract Updates:
  - Updated `docs/contracts/document_ingest_response.schema.json` and `docs/contracts/examples/document_ingest_response_example.json` with storage key, persistence status, and idempotency fields.
  - Re-exported OpenAPI specification in `docs/contracts/openapi.json`.
- Verification Runs Executed:
  - Unit tests (`tests/test_ingest.py`, `tests/test_storage.py`, `tests/test_persistence.py`): 22 test cases executed via `uv run python -m unittest discover tests`. All 22 passed (0.096s).
    - Verified vault key formatting, atomic writes, reads, streaming, deduplication, path traversal rejection, and deletion.
    - Verified database transaction commits, rollback on DB error, reverse-failure orphan cleanup, idempotency replay, and 409 conflict detection.
  - `docker compose -f docker/compose.yml config`: validated with volume mount `prototype_data:/app/data`.
  - Container build & startup: `docker compose -f docker/compose.yml up --build -d` built and started `docker-app-1`.
  - Live container upload: Uploaded synthetic PDF with `Idempotency-Key: test-docker-persist-key-001`. Returned HTTP 201 with `processing_state: "PERSISTED"`, `storage_key: "b3/af/2f/af2fa2158778f711fbb8baff1e22f3275fdf3c87c9d142243efc21b0281515db"`, and `document_id: "doc_e8cce9bddf01"`.
  - Live container restart verification: Restarted container via `docker compose -f docker/compose.yml restart app`.
  - Re-sent upload with same idempotency key post-restart: Returned HTTP 200 with `idempotent_replay: true` and the original `doc_e8cce9bddf01`, confirming persistence of DB and vault data across container restarts.
  - Tested idempotency conflict: Sent same idempotency key with different PDF content; returned HTTP 409 Conflict with `{"detail": {"error_code": "IDEMPOTENCY_CONFLICT", ...}}`.
  - Container teardown: `docker compose -f docker/compose.yml down -v` cleanly removed container, network, and test volume.

## Phase A Step 2 — Storage & Database Gap Closeout (S3/MinIO & PostgreSQL) — 2026-10-24
- Analysis of Guide Storage & Database Specifications:
  - Guide §3.3 Storage Decision: The guide explicitly investigates MinIO and documents that MinIO CE entered maintenance mode / source-only distribution (citation [S6]). The guide explicitly warns: "MinIO CE is in maintenance mode and ships source-only, so do not choose it for new builds [S6]; for an S3 story use SeaweedFS or Garage and do not assume Object Lock. Default backend LocalStore (zero extra containers)."
  - Verified Docker distribution status: Public Docker Hub and Quay repositories for `minio/minio` confirm this finding (Docker Hub returns access denied/repository removed; Quay returns 401 unauthorized).
  - Guide §3.2 & §18.1 Database Decision: The guide strictly specifies PostgreSQL (`postgres:16`, database `aicte`) across all architecture sections. SQLite is not present anywhere in the guide; it was only introduced as a lightweight local development convenience.
- Implemented S3 / MinIO-Compatible Adapter (`backend/storage/vault.py`):
  - Added `S3VaultStorage` (and `MinIOVaultStorage` alias) implementing the unified `VaultBackend` protocol alongside `LocalVaultStorage`.
  - Implemented provider-supported conditional write (`If-None-Match: *`) per Guide §3.3 to eliminate race conditions between HEAD and PUT during concurrent deduplicated uploads.
  - Added automatic bucket provisioning (`ensure_bucket`), stream retrieval, dual-hash integrity verification (`verify_integrity`), and safe deletion of unreferenced orphan blobs.
  - Added dependency `boto3>=1.35.0` via `pyproject.toml`, resolved in `uv.lock`, and exported to `requirements.txt`.
- Docker Compose Production Stack (`docker/compose.yml`):
  - `postgres`: PostgreSQL 16 Alpine container with healthcheck and persistent volume `pg_data:/var/lib/postgresql/data`.
  - `storage`: SeaweedFS S3-compatible service (`chrislusf/seaweedfs:latest server -s3 -filer`) with persistent volume `storage_data:/data` exposing native S3 API on port 8333.
  - `app`: Configured with `DATABASE_URL=postgresql://aicte_owner:aicte_dev_secret@postgres:5432/aicte` and `S3_ENDPOINT_URL=http://storage:8333`, running with `read_only: true` and `tmpfs: /tmp`.
  - Zero-setup local development preserved: Defaults to `LocalVaultStorage` and local SQLite if S3 and PostgreSQL environment variables are omitted.
- Verification Runs Executed:
  - Unit tests (`tests/test_s3_storage.py`): 6 dedicated tests against an isolated S3 wire-compatible server testing bucket creation, conditional writes, deduplication, hash integrity mismatch detection, idempotent replay, 409 conflict, and reverse-failure orphan cleanup.
  - Full test suite: 28 tests passing (`uv run python -m unittest discover tests`, 10.0s).
  - `docker compose -f docker/compose.yml config`: validated with PostgreSQL and SeaweedFS S3 services.
  - Live Docker Compose Stack Execution:
    - Stack started: `docker compose -f docker/compose.yml up --build -d`.
    - Uploaded synthetic PDF: returned HTTP 201 with `processing_state: "PERSISTED"`, `persistence_status: "VAULT_OBJECT_STORE"`, `storage_key: "b3/af/2f/af2fa2158778f711fbb8baff1e22f3275fdf3c87c9d142243efc21b0281515db"`, and `document_id: "doc_bf38cd3b2707"`.
    - Idempotent replay: re-sent same key and content; returned `idempotent_replay: true` with `doc_bf38cd3b2707`.
    - Container restart: restarted `app` container (`docker compose restart app`).
    - Verified post-restart persistence: re-sent request with same idempotency key; returned HTTP 200 with `idempotent_replay: true` matching the original PostgreSQL and S3 records.
    - Idempotency conflict: sent same key with different content; returned HTTP 409 Conflict with `{"detail": {"error_code": "IDEMPOTENCY_CONFLICT", ...}}`.
    - Teardown: `docker compose -f docker/compose.yml down -v` cleanly removed containers, network, and volumes.

## Phase A Step 3 — Document Routing & Classification (S2) — 2026-10-24
- Docker Compose Image Pinning:
  - Inspected `docker/compose.yml` for mutable `latest` tags.
  - Replaced mutable `chrislusf/seaweedfs:latest` with pinned version `chrislusf/seaweedfs:4.48` (image digest `sha256:4e61d15fd35994cb1e43e1e553dff106794841fd9a99ade2fc8c8bfce4d7872d`).
  - Confirmed `postgres:16-alpine` and `ghcr.io/astral-sh/uv:0.13.5` are version-pinned.
  - Verified syntax and structure via `docker compose -f docker/compose.yml config`.
- Storage-Backed Document Reading:
  - Document router reads strictly via `VaultBackend.open_stream(blob.storage_key)` through the existing content-addressed vault abstraction; it does not rely on local filesystem container paths.
  - Document records are retrieved from the database via `UploadRepository.get_upload(document_id, application_id)`.
- Per-Page Classification Engine (`backend/pipeline/router.py`):
  - Dependencies: Added `pymupdf>=1.24.0` via `pyproject.toml`, resolved in `uv.lock`, and exported to `requirements.txt`.
  - Deterministic thresholds per Guide §4 S2 and §6.1:
    - `MIN_VISIBLE = 80`: Minimum visible text characters for a page to qualify as text-bearing.
    - `COVER_SCAN = 0.60`: If raster images cover ≥ 60% of page area with < 80 visible characters, page is classified as `scanned`.
    - `COVER_HYBRID = 0.25`: If raster images cover ≥ 25% of page area with ≥ 80 visible characters, page is classified as `hybrid`.
    - `DRAWING_MIN = 40`, `DRAWING_DENSE = 400`, `DRAWING_TEXT_RATIO = 0.25`: Pages with extensive vector paths and sparse text are classified as `vector_drawing`.
    - Blank detection: 0 visible text characters, 0 image coverage, and < 5 vector drawing paths classifies the page as `blank`.
  - Text Sanity & Font Encoding:
    - `text_sanity()` evaluates alphanumeric ratio, printable ASCII ratio, and Private Use Area / CID unmapped replacement characters (`\ufffd`).
    - Pages with garbled/corrupted embedded font encodings (sanity score < 0.60) are demoted to `scanned` to ensure they undergo the OCR ladder rather than producing garbage downstream extraction.
  - Searchable OCR Layer Detection:
    - Inspects PyMuPDF text trace (`page.get_texttrace()`) to distinguish visible font spans (`type == 0`) from invisible text spans (`type == 3`). Invisible OCR text is recorded in page metadata and not conflated with original born-digital vector text.
- Document-Level Routing Outcomes:
  - `BRANCH_A_DIGITAL`: All pages are born-digital (or digital + blank).
  - `BRANCH_B_SCANNED`: All non-blank pages are scanned rasters.
  - Raster Images (PNG/JPEG): Directly routed to `BRANCH_B_SCANNED` without requiring PDF wrapper synthesis.
  - `MIXED`: Multi-page PDFs containing a combination of digital and scanned/hybrid pages.
  - `VECTOR_DRAWING`: Architectural/site plan drawings dominated by CAD vector paths.
  - `BLANK_DOCUMENT`: All pages in the document are blank.
  - Error/Edge Case Outcomes: Explicit outcomes for `CORRUPT_DOCUMENT`, `ENCRYPTED_PDF`, `EMPTY_DOCUMENT`, and `UNSUPPORTED_FORMAT`.
- API Endpoints & Contracts:
  - Added `POST /applications/{application_id}/documents/{document_id}/route` (executes routing analysis) and `GET /applications/{application_id}/documents/{document_id}/route` (retrieves routing result).
  - Created JSON Schema contract `docs/contracts/document_route_response.schema.json` and example `docs/contracts/examples/document_route_response_example.json`.
  - Re-exported OpenAPI specification in `docs/contracts/openapi.json`.
- Honest Pipeline State & Confidentiality:
  - Returns `processing_state: "ROUTED"`, `pipeline_stage: "S2_ROUTER"`, `ocr_status: "NOT_RUN"`, `classification_status: "NOT_RUN"`, `simulated: true`, `advisory: true`.
  - Zero-Data-Leakage: Log messages and errors contain only IDs, media types, page counts, and outcomes; document contents and extracted text strings are never logged.
- Verification Runs Executed:
  - Unit tests (`tests/test_router.py`): 14 focused tests verifying text sanity heuristics, born-digital PDF, scanned PDF, hybrid PDF, CAD vector drawing, blank PDF, mixed PDF, raster PNG/JPEG routing, corrupt documents, empty documents, storage-backed integration, and 404 handling.
  - Full test suite: 42 tests passing across all test modules (`uv run python -m unittest discover tests`, 10.2s).
  - `docker compose -f docker/compose.yml config`: validated cleanly with pinned `chrislusf/seaweedfs:4.48`.
  - Container build & startup: `docker compose -f docker/compose.yml up --build -d` built and started `postgres`, `storage`, and `app`.
  - Live container verification across container restart:
    - Uploaded synthetic PDF (`doc_139c29c75222`) and synthetic PNG (`doc_092052e71767`) to `POST /applications/DEMO-CLEAN-001/documents`.
    - Restarted `app` container via `docker compose -f docker/compose.yml restart app`.
    - Called `POST /applications/DEMO-CLEAN-001/documents/{id}/route` post-restart:
      - PDF returned `BRANCH_A_DIGITAL` with 1 digital page, `processing_state: "ROUTED"`, and `ocr_status: "NOT_RUN"`.
      - PNG returned `BRANCH_B_SCANNED` with 1 scanned page and `processing_state: "ROUTED"`.
    - Called `GET /applications/DEMO-CLEAN-001/documents/{id}/route` post-restart: returned matching `BRANCH_A_DIGITAL`.

## Open questions & Next Steps
- Implementation of the Nginx reverse-proxy gateway for true offline container isolation (Guide §18.3).
- Phase A Step 4: Branch B Preprocessing & OCR Ladder (Guide §4 S3, §7.1 - OpenCV deskew/dewarp, Tesseract OCR with confidence scoring and fallback ladder).
- Phase A Step 5: Branch A Forensics & Digital Extraction (Guide §4 S4 - PyMuPDF structured text/table extraction, metadata anomaly detection, incremental update inspection).



