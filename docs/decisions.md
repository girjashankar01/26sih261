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

## Open questions
- Which exact Handbook edition/category is the target, and who can review rule sources/effective dates?
- Which next contracts should be frozen for the team's next vertical slice?
- Does the team need Postgres persistence in its first judgeable demo, or is synthetic in-memory data sufficient?
- In future offline isolation testing (guide §18.3), should we implement the Nginx gateway or retain direct port publishing for developer convenience?
