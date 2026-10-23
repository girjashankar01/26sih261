# Team workstreams

Use separate branches or small commits. Agree on contract changes with the API/domain owner before parallel implementation.

| Workstream | First useful task | Main files/interfaces | Current boundary |
|---|---|---|---|
| API/domain | Save representative validation response examples and freeze only the contracts needed next | `backend/api/`, `docs/contracts/` | No live source adapters or new rules without reviewer references |
| UI | Improve the case queue/report and evidence readability using the existing response | `ui/` | Coordinate any response-shape changes first |
| Synthetic evaluation | Add a small labelled corpus, expected outputs, and known-miss report | `scripts/`, `docs/` | Synthetic only; do not claim real-world accuracy |
| Platform/security | Decide next persistence step; document local secrets/network assumptions and implement only needed baseline | `docker/`, config, later `backend/jobs/` or audit | No production security claims or placeholder integrations |

## Integration routine

1. Read `AGENTS.md` and `docs/spec/phase-a.md` at the start.
2. Record shared data/API changes in `docs/decisions.md` before coding them in parallel.
3. Integrate small changes, run the agreed startup walkthrough, and record exact results.
4. Keep untouched guide modules out of scope until the current vertical slice is stable.
