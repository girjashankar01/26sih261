# Backend module map

The starter currently has only the modules with working Phase A behavior:

- `api/`: FastAPI routes and HTTP error handling.
- `records/`: synthetic record/application fixtures (no real source adapter).
- `rules/`: deterministic demo rules (currently executable logic; YAML is illustrative and not dynamically loaded).

Add `ingest/`, `forensics/`, `pipeline/`, `extract/`, `facts/`, `verify/`, `infra/`, `audit/`, and `jobs/` when implementing those guide phases. Keep each new package tied to an agreed contract and working feature rather than adding empty directories now.
