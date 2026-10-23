# Phase A implementation spec

## Phase A milestone goal (Guide §20.1)

Demonstrate one end-to-end reliable validation flow for a single application
category (EoA renewal) over synthetic data. The guide's exit gate requires:
- A synthetic generator for one institute and one application.
- Ingest (S1), forensics (S2), routing (S3), Branch B OCR path (S4),
  typing (S5), extraction and grounding (S6/S6b), typed facts (S7),
  five to eight implemented rules (S8), one simulated verification success
  and one simulated unavailable fallback (S9), evidence viewer with
  `NOT_CHECKED` handling, officer action, and audit verify.
- `aicte eval run` reproducing Appendix B exactly on the synthetic corpus.
- All §20.6 items marked "A" passing.

Phase A is the guide's "one reliable case" milestone. It is not a subset of
pipeline stages: it spans S1 through S13 for the single-category path.
Do not describe individual stage tasks as "Phase A Step N".

## Currently implemented pipeline stages

| Stage | Guide section | Status |
|---|---|---|
| S1 Ingest | §4 | Implemented — streaming, dual hash, magic-byte sniff, size limit, vault storage, DB persistence, idempotency |
| S2 Forensics | §5 | **Not started** — next task |
| S3 Route | §6 | Implemented — per-page classifier, document-level routing outcome |
| S4 Branch B | §7–§9 | Not started |
| S5–S13 | §11–§15 | Not started |

## Starter demo (committed at Phase 0)

Two fixed synthetic EoA renewal cases with three deterministic checks are
served from the original demo endpoints:

- `GET /health`
- `GET /api/demo/applications`
- `GET /api/demo/applications/{id}/validate`

These implement `S8 Rules` in a very limited form (three checks against
hardcoded synthetic records) without S1–S7 or S9–S13.

## Routes added for S1 and S3

- `POST /applications/{application_id}/documents` — S1 Ingest
- `POST /applications/{application_id}/documents/{document_id}/route` — S3 Route
- `GET  /applications/{application_id}/documents/{document_id}/route` — S3 Route result

## States and limits

Current endpoints return `PASS` or `FAILED_CHECK` only for checks with
concrete values. Unavailable or ambiguous checks use `NOT_CHECKED` or
`NEEDS_REVIEW`. This spec does not cover live regulatory rules, source
adapters, authentication, officer actions, or S2 forensics.

## API contracts

Frozen JSON Schemas and examples are in `docs/contracts/`. Add schemas only
for contracts needed by the agreed next stage. Record additions in
`docs/decisions.md` before parallel implementation.
