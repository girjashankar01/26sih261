# Team Workstreams & Handoff Guide

## Project Status Overview

The **Phase A milestone** (single-category EoA renewal end-to-end flow) is **fully implemented across all 13 pipeline stages (S1 through S13)** in accordance with `sih26261-prototype-guide-v4.2.md`.

All 151 Python backend tests and all 48 frontend integration tests are passing (100% green). The complete end-to-end demo walkthrough script (`scripts/e2e_demo_walkthrough.py`) executes cleanly from raw upload to Ed25519-signed checkpoint verification.

---

## Active Workstreams & Implementation Status

| Workstream | Status | Completed Scope | Immediate Next Tasks |
|---|:---:|---|---|
| **Pipeline & Core Engines** | **Complete (Phase A)** | S1 Ingest, S2 Forensics, S3 Router, S4 Branch B OCR Ladder, S5 Typing, S6 Extraction & Grounding, S7 Facts & Resolution. | Phase B: Multi-page tabular models for faculty lists (cadre ratio, qualification checks), land area conversion schemas. |
| **Rules & Regulatory Engine** | **Complete (Phase A)** | S8 Rules Engine v4 with Three-Valued Gate, 7 deterministic evaluators, `EOA_RENEWAL.yaml` active rule set, and rule version diff engine (`GET /rules/compare`). | Add rule sets for New Institute, Intake Expansion, and Course Addition categories. |
| **Verification & External Gateways** | **Complete (Phase A)** | S9 Gateway with simulated QR, X.509 signature, and mock portal adapters; circuit breaker and error normalization; S10 Infrastructure evidence checklist with pHash deduplication and GPS haversine. | Phase C: Allowlisted live issuer adapters (DigiLocker, state fire portals) behind confidentiality gates. |
| **Officer Review & Exports** | **Complete (Phase A)** | S11 Aggregator (4 review lanes, priority formula, alerts); S12 Finding lifecycle management with mandatory rationale; statutory draft Deficiency Notice, Inspection Brief, and Application Report. | Expose batch notice export and formal PDF rendering. |
| **Audit & Integrity** | **Complete (Phase A)** | S13 SHA-256 sequential hash chain, fail-visible tamper tripwire simulation, external Ed25519 checkpoint generation and signature verification. | Periodic automated cron checkpoint anchoring. |
| **Frontend UI/UX** | **Complete (Phase A)** | 10 modular panels in zero-dependency vanilla JS SPA: Queue Triage, Workspace, Checklist Table, Document Vault, Evidence Viewer (bounding box canvas), Verification Gateway, Infra Panel, Exports Hub, Audit Console, Rules Explorer, Realness Matrix, Keyboard shortcuts (`J`/`K`/`A`/`D`/`R`/`E`/`V`/`?`). | Wire role switcher to auth token; add drag-and-drop facility photo uploader directly in `infra_panel.js`; remove legacy inline demo script in `index.html`. |
| **Platform & Deployment** | **In Progress** | Dockerfile, docker-compose.yml (FastAPI + PostgreSQL 16), dual DB support (SQLite dev / PostgreSQL prod), LocalVault storage. | Fix Dockerfile CMD entrypoint (`backend.api.main:app`), add `COPY rules ./rules`, configure persistent vault named volume mounts in `docker-compose.yml`. |
| **Security & Authorization** | **Specification Ready** | RBAC roles and scopes defined in `backend/audit/rbac.py` (`institution`, `officer`, `senior_officer`, `rules_admin`, `auditor`). | Wire FastAPI security dependencies to enforce token/role scopes on mutating endpoints. |

---

## Complete Pipeline Stage Status (Guide §2.2)

| Stage | Guide Section | Status | Implemented Modules & Verification |
|---|---|:---:|---|
| **S1 Ingest** | §4 | **Implemented** | `backend/ingest/service.py`, `tests/test_ingest.py`, `tests/test_storage.py` |
| **S2 Forensics** | §5 | **Implemented** | `backend/forensics/`, `tests/test_forensics.py` (PDF metadata, signatures, EXIF/GPS, QR locator) |
| **S3 Route** | §6 | **Implemented** | `backend/pipeline/router.py`, `tests/test_router.py` |
| **S4 Branch B** | §7–§9 | **Implemented** | `backend/pipeline/branch_b.py`, `backend/pipeline/engines/`, `tests/test_branch_b.py` |
| **S5 Typing** | §11.1 | **Implemented** | `backend/typing/`, `tests/test_typing.py` |
| **S6 Extraction & Grounding** | §11.2–§11.3 | **Implemented** | `backend/extraction/`, `tests/test_extraction.py` |
| **S7 Typed Facts & Resolution** | §11.4 | **Implemented** | `backend/facts/`, `backend/records/adapter.py`, `tests/test_facts.py` |
| **S8 Rules Engine** | §12 | **Implemented** | `backend/rules/`, `tests/test_rules.py`, `rules/rule_sets/EOA_RENEWAL.yaml` |
| **S9 Verification Gateway** | §13 | **Implemented** | `backend/verification/`, `tests/test_verification.py` |
| **S10 Infrastructure Evidence** | §14 | **Implemented** | `backend/infra/`, `tests/test_infra.py` |
| **S11 Aggregation & Status** | §11.7 | **Implemented** | `backend/aggregation/`, `tests/test_aggregation.py` |
| **S12 Review & Exports** | §17, §11.8 | **Implemented** | `backend/review/`, `tests/test_review.py` |
| **S13 Cryptographic Audit** | §15 | **Implemented** | `backend/audit/chain.py`, `tests/test_audit.py` |

---

## What's Completed vs What's Left

### What Is Completed
1. **Full 13-stage verification pipeline** operational end-to-end with synthetic data fixtures.
2. **43 REST endpoints** covering ingestion, raw byte forensics, OCR ladder, rules evaluation, simulated authority queries, triage aggregation, finding overrides, draft notices, and audit chains.
3. **10 Frontend panels** in `ui/` matching the Master Roadmap (Queue, Workspace, Checklist, Evidence Viewer, Verifications, Infrastructure, Exports, Audit Console, Rules Explorer, Realness Matrix).
4. **Dual-backend persistence:** Seamless SQLite (local zero-config) and PostgreSQL (production).
5. **Content-addressed vault:** BLAKE3-indexed immutable storage with path-traversal guards.
6. **Zero external leakage:** Verified sovereign air-gapped compliance; all mock registries labeled `simulated: true`.
7. **Comprehensive automated tests:** 151 Python unit tests + 48 JS integration tests passing.

### What's Left for Future Slices
1. **Container & Deployment Hardening:**
   - Correct Dockerfile entrypoint from `backend.app.main:app` to `backend.api.main:app`.
   - Add `COPY rules ./rules` to Dockerfile.
   - Configure persistent named volumes in `docker-compose.yml` for vault data (`data/vault`).
   - Add Nginx reverse proxy configuration per Guide §18.3.
2. **API & Endpoints Enhancements:**
   - Add explicit `POST /applications` to register institutional application headers.
   - Add `POST /applications/{id}/infra/evidence` to allow uploading physical facility photographs directly.
   - Wire RBAC dependencies (`backend/audit/rbac.py`) into FastAPI routes to enforce role authorization.
3. **Phase B (Multi-Category Expansion):**
   - Faculty list cadre ratio and qualification verification models.
   - Land norms and architectural blueprint polygon/area calculation.
4. **Phase C (Live Authority Integration):**
   - Live PKI trust anchors (CCA India CRL/OCSP).
   - Live DigiLocker and municipal registry connectors with confidentiality gates.

---

## Storage Architecture (Guide §3.3)

- **Default / Phase A:** `LocalVaultStorage` storing content-addressed blobs locally under `data/vault/b3/<aa>/<bb>/<blake3>`. Fast, immutable, path-traversal protected, zero extra containers.
- **Phase C Stretch:** S3-compatible storage backend via boto3 client (`S3VaultBackend`) available in `backend/storage/vault.py` for cloud / SeaweedFS integration.

---

## Verification Commands

```bash
# 1. Run complete Python test suite (151 tests)
uv run python -m unittest discover tests

# 2. Run all 48 frontend integration tests
node -e "const fs = require('fs'); const { execSync } = require('child_process'); fs.readdirSync('./tests').filter(f => f.startsWith('test_step') && f.endsWith('.js')).sort((a,b) => parseInt(a.replace(/\D/g,'')) - parseInt(b.replace(/\D/g,''))).forEach(f => { execSync('node tests/' + f); console.log('PASSED:', f); });"

# 3. Execute End-to-End Pipeline Walkthrough Script
uv run python scripts/e2e_demo_walkthrough.py
```
