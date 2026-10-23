# AICTE Application Validation — SIH 2026 PS 26261

Synthetic decision-support prototype. The current vertical slice demonstrates three deterministic checks on two synthetic EoA renewal cases. It is not integrated with AICTE or issuing authorities and makes no regulatory decision.

## Start

Requirements: Docker Desktop/Engine with Compose, or CPython 3.12.14 plus uv 0.13.5 for local development.

```sh
docker compose -f docker/compose.yml up --build
```

Open `http://localhost:8000`. For local development:

```sh
uv python install 3.12.14
uv sync --locked
uv run uvicorn backend.api.main:app --reload
```

## Source material and agent instructions

- The supplied SIH problem statement and `sih26261-prototype-guide-v4.2.md` are stored unchanged in `docs/reference/`.
- Read root `AGENTS.md` for Antigravity and shared agent constraints. `CLAUDE.md` points Claude Code to the same constraints.
- `docs/spec/phase-a.md` is the short implementation brief for this starter. Keep large reference documents out of always-loaded rule files.
- `docs/decisions.md` records actual decisions, versions, verified setup, and open questions.

## Current slice and boundaries

- FastAPI endpoints: `/health`, `/api/demo/applications`, `/api/demo/applications/{id}/validate`, and `/api/docs`.
- UI: simple application selector, findings, compared evidence, and visible simulated-data label.
- Rules: required document, expiry date, requested intake versus synthetic record.
- All application/record data is synthetic. `simulated: true` is returned for demo results.
- No upload/OCR, rule activation, real verification, database persistence, login/RBAC, audit log, or infrastructure analysis is implemented yet.

The dependency declarations are in `pyproject.toml`, exact resolved versions and hashes in `uv.lock`, and an exported pinned `requirements.txt` for tools that need that format. Make dependency changes with `uv add`/`uv remove`, then commit the updated lock and export.
