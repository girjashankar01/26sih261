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

## Open questions
- Which exact Handbook edition/category is the target, and who can review rule sources/effective dates?
- Which next contracts should be frozen for the team's next vertical slice?
- Does the team need Postgres persistence in its first judgeable demo, or is synthetic in-memory data sufficient?
