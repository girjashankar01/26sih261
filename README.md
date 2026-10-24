# AICTE Application Validation — SIH 2026 PS 26261

Synthetic decision-support prototype for evaluating AICTE EoA renewal
applications. Working towards the guide's Phase A milestone: one reliable
end-to-end validation flow over synthetic data. No AICTE or issuing
authorities are connected; all results require officer review.

## Start

Requirements: Docker Desktop/Engine with Compose, or CPython 3.12.14 plus
uv 0.13.5 for local development.

```sh
docker compose -f docker/compose.yml up --build
```

Open `http://localhost:8000`. For local development without Docker:

```sh
uv python install 3.12.14
uv sync --locked
uv run uvicorn backend.api.main:app --reload
```

## Source material and agent instructions

- Problem statement and `sih26261-prototype-guide-v4.2.md` are in `docs/reference/` (read-only).
- Root `AGENTS.md` holds shared agent constraints. `CLAUDE.md` points Claude Code to the same file.
- `docs/spec/phase-a.md` is the implementation brief including the pipeline-stage status table.
- `docs/decisions.md` records actual decisions, verified runs, and open deviations.
- `docs/HANDOFF.md` holds the per-workstream task list and the S1–S13 status table.

## Implemented pipeline stages (guide §2.2)

| Stage | Guide | Status |
|---|---|---|
| S1 Ingest | §4 | **Implemented** — streaming, dual hash, magic-byte sniff, size limit, vault, DB, idempotency |
| S2 Forensics | §5 | **Implemented** — raw-byte metadata, incremental updates, signatures, EXIF/geo, QR locator |
| S3 Route | §6 | **Implemented** — per-page classifier, document-level routing |
| S4 Branch B | §7–§9 | **Not started** — next task (page rasters, deskew/dewarp, Docling/OCR ladder producing `UnifiedDoc` JSON) |
| S5–S11 | §11 | Not started |
| S12 Review | §17 | Not started |
| S13 Audit | §15 | Not started |

## Endpoints

**Starter demo (Phase 0 / Phase A demo slice):**
- `GET /health`
- `GET /api/demo/applications`
- `GET /api/demo/applications/{id}/validate`

**S1 Ingest:**
- `POST /applications/{id}/documents`

**S2 Forensics:**
- `POST /applications/{id}/documents/{doc_id}/forensics`
- `GET  /applications/{id}/documents/{doc_id}/forensics`

**S3 Route:**
- `POST /applications/{id}/documents/{doc_id}/route`
- `GET  /applications/{id}/documents/{doc_id}/route`

All application and record data is synthetic. `simulated: true` and
`advisory: true` are returned for every pipeline result. Findings are
preliminary indicators requiring officer review; the prototype does not
approve or reject applications.

## Storage configuration

Docker Compose and local development run on `LocalStore` (Guide §3.3 Phase A default),
storing content-addressed blobs locally under `b3/<aa>/<bb>/<digest>` with zero extra
storage containers.

For Phase C stretch evaluation with an S3-compatible object store (SeaweedFS):
```sh
docker compose -f docker/compose.yml -f docker/compose.s3.yml up --build
```

## Dependency management

Declarations are in `pyproject.toml`, exact resolved versions and hashes in
`uv.lock`, and an exported pinned `requirements.txt` for tools that need it.
Make dependency changes with `uv add`/`uv remove`, then commit the updated
lock and re-export.

## Tests

```sh
uv run python -m unittest discover tests
```
