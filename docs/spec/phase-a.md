# Phase A starter slice

## Goal
Demonstrate one explainable EoA renewal validation flow over synthetic data.

## Implemented behavior
- Two fixed cases: a clean case and a seeded-defect case.
- Three demo checks: required document present, document validity date compared with submission date, requested intake compared with synthetic record.
- Findings show rule ID, outcome, reason, and evidence values; compare both sides when applicable.
- API and dashboard label all data/results as synthetic/simulated.

## Routes
- `GET /health`
- `GET /api/demo/applications`
- `GET /api/demo/applications/{id}/validate`

Implementation follows the guide's useful boundaries: HTTP routes in `backend/api/`, synthetic records in `backend/records/`, deterministic checks in `backend/rules/`, and browser assets in `ui/`.

## States and limits
Current endpoints return `PASS` or `FAILED_CHECK` only for checks with concrete values. If a future check cannot run or has ambiguous evidence, use `NOT_CHECKED` or `NEEDS_REVIEW`. This starter does not implement real regulatory rules, source adapters, persistence, OCR, file upload, authentication, or officer actions.

## Next contract step
Before parallel feature work, freeze API schemas/examples under `docs/contracts/`. The long guide proposes six contracts; adopt only the contracts needed for the agreed next vertical slice and record additions in `docs/decisions.md`.
