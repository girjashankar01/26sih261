# Team workstreams

Use separate branches or small commits. Agree on contract changes with the
API/domain owner before parallel implementation.

| Workstream | First useful task | Main files/interfaces | Current boundary |
|---|---|---|---|
| API/domain | Implement S2 Forensics detectors | `backend/pipeline/forensics/`, `docs/contracts/` | Next stage per guide §5; no new stage work without reading that section first |
| UI | Improve the case queue/report and evidence readability | `ui/` | Coordinate any response-shape changes first |
| Synthetic evaluation | Add a small labelled corpus, expected outputs, and known-miss report | `scripts/`, `docs/` | Synthetic only; do not claim real-world accuracy |
| Platform/security | Review SeaweedFS S3 storage deviation vs LocalStore default | `docker/`, config | See Storage-Deviation note in `docs/decisions.md` |

## Current pipeline-stage status (guide §2.2)

| Stage | Guide | Status | Evidence |
|---|---|---|---|
| S1 Ingest | §4 | **Implemented** | `backend/ingest/`, `tests/test_ingest.py`, `tests/test_storage.py`, `tests/test_persistence.py` |
| S2 Forensics | §5 | **Not started** — next task | No code; detectors listed in §5 are unimplemented |
| S3 Route | §6 | **Implemented** | `backend/pipeline/router.py`, `tests/test_router.py` (42 tests pass) |
| S4 Branch B | §7–§9 | Not started | — |
| S5 Typing | §11.1 | Not started | — |
| S6 Extraction | §11.2 | Not started | — |
| S6b Grounding | §11.3 | Not started | — |
| S7 Facts | §11.4 | Not started | — |
| S8 Rules | §12 | Partial (demo only) | 3 hardcoded checks in starter demo; no rule engine against extracted facts |
| S9 Verify | §13 | Not started | — |
| S10 Infra | §14 | Not started | — |
| S11 Aggregate | §11.7 | Not started | — |
| S12 Review | — | Not started | — |
| S13 Audit | §15 | Not started | — |

> [!IMPORTANT]
> The next implementation task is **S2 Forensics** (guide §5).
> Do not begin S4 Branch B, OCR, or extraction before S2 is in place;
> the guide's flow diagram runs S2 in parallel with S3 from the same fork.

## Storage deviation

Guide §3.3 defines `LocalStore` as the Phase A default with S3 deferred to
Phase C. The current Docker Compose stack runs SeaweedFS S3 (`VAULT_BACKEND=s3`).
The code supports `LocalVaultStorage` by default when `VAULT_BACKEND` is unset;
the Compose override is the deviation. See `docs/decisions.md` for the
deviation record and migration path.

## Integration routine

1. Read `AGENTS.md` and `docs/spec/phase-a.md` at the start.
2. Read the relevant guide section (§5 for S2 Forensics) before coding.
3. Record shared data/API changes in `docs/decisions.md` before parallel
   implementation.
4. Integrate small changes, run `uv run python -m unittest discover tests`,
   and record exact results.
5. Keep untouched guide modules out of scope until the current stage is stable.
