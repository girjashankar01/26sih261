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
| S1 Ingest | §4 | **Implemented** — streaming, dual hash, magic-byte sniff, size limit, vault storage, DB persistence, idempotency |
| S2 Forensics | §5 | **Implemented** — raw-byte metadata, incremental updates, signatures, EXIF/geo, QR locator; deferred detectors recorded as `NOT_CHECKED` |
| S3 Route | §6 | **Implemented** — per-page classifier, document-level routing outcome |
| S4 Branch B | §7–§9 | **Implemented** — raster prep (L0/L1), single 3x3 matrix inverse coordinate map, offline tabular/digital/OCR engines, cell/number normalization, arithmetic sum checks, C1 unified payload, derived vault caching |
| S5 Typing | §11.1 | **Implemented** — page 1 rule scoring, bounded slot prior, evidence grounding, slot mismatch detection, database caching |
| S6/S6b Extraction & Grounding | §11.2–§11.3 | **Implemented** — schema-driven fields, 4-digit date policy, provenance-first grounding, word-precision search, completeness enforcement, C3 fact persistence |
| S7 Typed Facts & Resolution | §11.4 | **Implemented** — separate core & legal-form name comparison, token_sort_ratio, abbreviation expansion, ID normalization with Indic digits, RecordsAdapter mock envelopes, cross-source fact aggregator |
| S8 Rules Engine | §12 | **Implemented** — declarative YAML rule sets, Three-Valued Gate (Pre/precheck/harden), 7 deterministic evaluators, fail-visible exception handling, activation validator, C4 check results, and C5 actionable findings |
| S9–S11 | §13–§14 | Not started |
| S12 Review | §17 | Not started |
| S13 Audit | §15 | Not started |

## Starter demo (committed at Phase 0)

Two fixed synthetic EoA renewal cases with three deterministic checks are
served from the original demo endpoints:

- `GET /health`
- `GET /api/demo/applications`
- `GET /api/demo/applications/{id}/validate`

These implement `S8 Rules` in a very limited form (three checks against
hardcoded synthetic records) without S1–S7 or S9–S13.

## Routes added for S1 through S8

- `POST /applications/{application_id}/documents` — S1 Ingest
- `POST /applications/{application_id}/documents/{document_id}/forensics` — S2 Forensics
- `GET  /applications/{application_id}/documents/{document_id}/forensics` — S2 Forensics result
- `POST /applications/{application_id}/documents/{document_id}/route` — S3 Route
- `GET  /applications/{application_id}/documents/{document_id}/route` — S3 Route result
- `POST /applications/{application_id}/documents/{document_id}/extract` — S4 Branch B Extraction
- `GET  /applications/{application_id}/documents/{document_id}/extract` — S4 Branch B Extraction result
- `POST /applications/{application_id}/documents/{document_id}/type` — S5 Document Typing
- `GET  /applications/{application_id}/documents/{document_id}/type` — S5 Document Typing result
- `POST /applications/{application_id}/documents/{document_id}/fields` — S6 Schema-Driven Extraction
- `GET  /applications/{application_id}/documents/{document_id}/fields` — S6 Schema-Driven Extraction result
- `GET  /applications/{application_id}/facts` — S7 Aggregated Typed Facts & Entity Resolution
- `POST /applications/{application_id}/validate` — S8 Rules Engine Application Validation
- `GET  /applications/{application_id}/validate` — S8 Rules Engine Validation result
- `POST /applications/{application_id}/documents/{document_id}/route` — S3 Route
- `GET  /applications/{application_id}/documents/{document_id}/route` — S3 Route result

## States and limits

Current endpoints return `PASS` or `FAILED_CHECK` only for checks with
concrete values. Unavailable or ambiguous checks use `NOT_CHECKED` or
`NEEDS_REVIEW`. This spec does not cover live regulatory rules, source
adapters, authentication, or officer actions.

## API contracts

Frozen JSON Schemas and examples are in `docs/contracts/`. Add schemas only
for contracts needed by the agreed next stage. Record additions in
`docs/decisions.md` before parallel implementation.
