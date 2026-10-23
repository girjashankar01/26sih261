# Claude Code instructions

Follow [`AGENTS.md`](AGENTS.md) for shared project constraints. Before changing a module, read [`docs/spec/phase-a.md`](docs/spec/phase-a.md), the relevant contract/API, and only the applicable section of the full reference guide.

Preserve synthetic-only data, explicit simulated labels, evidence-linked preliminary findings, and human review. Keep dependencies managed by uv and update `docs/decisions.md` when assumptions or interfaces change.

## Local commands
- Start the demo: `uv run uvicorn backend.api.main:app --reload`
- Sync pinned dependencies: `uv sync --locked`
- Start the container: `docker compose -f docker/compose.yml up --build`

## Done means
- The intended behavior is visible in the synthetic demo or an explicitly documented interface.
- Relevant tests are added/updated and run when the team has established the test target.
- Simulation labels and evidence are preserved; unavailable/ambiguous paths are not presented as passing.
- The readme and `docs/decisions.md` match what was actually implemented and verified.
