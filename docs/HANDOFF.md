# Team workstreams

Use separate branches or small commits. Agree on contract changes with the
API/domain owner before parallel implementation.

| Workstream | First useful task | Main files/interfaces | Current boundary |
|---|---|---|---|
| API/domain | Implement S4 Branch B preprocessing & OCR ladder | `backend/pipeline/`, `docs/contracts/` | Next stage per guide §7–§9; Docling/OCR ladder producing `UnifiedDoc` JSON |
| UI | Improve the case queue/report, forensics flags, and evidence readability | `ui/` | Coordinate any response-shape changes first |
| Synthetic evaluation | Add a small labelled corpus, expected outputs, and known-miss report | `scripts/`, `docs/` | Synthetic only; do not claim real-world accuracy |
| Platform/security | Review SeaweedFS S3 storage deviation vs LocalStore default | `docker/`, config | See Storage-Deviation note in `docs/decisions.md` |

## Current pipeline-stage status (guide §2.2)

| Stage | Guide | Status | Evidence |
|---|---|---|---|
| S1 Ingest | §4 | **Implemented** | `backend/ingest/`, `tests/test_ingest.py`, `tests/test_storage.py`, `tests/test_persistence.py` |
| S2 Forensics | §5 | **Implemented** | `backend/forensics/`, `tests/test_forensics.py` (55 tests pass across suite) |
| S3 Route | §6 | **Implemented** | `backend/pipeline/router.py`, `tests/test_router.py` |
| S4 Branch B | §7–§9 | **Not started** — next task | Page rasters, deskew/dewarp, Docling/OCR ladder producing `UnifiedDoc` JSON |
| S5 Typing | §11.1 | Not started | — |
| S6 Extraction | §11.2 | Not started | — |
| S6b Grounding | §11.3 | Not started | — |
| S7 Facts | §11.4 | Not started | — |
| S8 Rules | §12 | Partial (demo only) | 3 hardcoded checks in starter demo; no rule engine against extracted facts |
| S9 Verify | §13 | Not started | — |
| S10 Infra | §14 | Not started | — |
| S11 Aggregate | §11.7 | Not started | — |
| S12 Review | §17 | Not started | Officer console and finding lifecycle review |
| S13 Audit | §15 | Not started | Append-only hash chain |

> [!IMPORTANT]
> The next implementation task is **S4 Branch B** (guide §7–§9).
> With S1 Ingest, S2 Forensics, and S3 Route in place, the pipeline fork now requires
> Branch B raster preprocessing (deskew/dewarp) and Docling/OCR engine ladder.

## Storage architecture (Guide §3.3)

- **Phase A Default:** `LocalStore` (zero extra containers, local content-addressed filesystem vault under `b3/<aa>/<bb>/<digest>`).
- **Local development & Docker Compose:** Both use `LocalVaultStorage` by default, strictly conforming to Guide §3.3.
- **Phase C Stretch:** S3-compatible storage via SeaweedFS is preserved in `docker/compose.s3.yml` as an optional override; `storage_data` volume is declared to preserve any existing data.

## Integration routine

1. Read `AGENTS.md` and `docs/spec/phase-a.md` at the start.
2. Read the relevant guide section (§7–§9 for S4 Branch B) before coding.
3. Record shared data/API changes in `docs/decisions.md` before parallel implementation.
4. Integrate small changes, run `uv run python -m unittest discover tests`, and record exact results.
5. Keep untouched guide modules out of scope until the current stage is stable.
