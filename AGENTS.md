# Shared project rules

## Purpose and authority
Build a decision-support prototype for SIH PS 26261. The problem statement defines the requested outcome. The prototype guide is an engineering proposal, not regulatory authority. Official AICTE Handbook/regulation clauses and effective dates require domain review before a rule is presented as regulatory.

## Non-negotiable
- Use synthetic or authorized anonymized fixtures only. Do not introduce real personal/institutional data or credentials.
- Do not claim portal integration or live issuer verification unless authorized and demonstrated against a real response. Label every simulation in API and UI.
- The product supports officers; it does not approve/reject applications or conclude misconduct. Use “preliminary indicator requiring human verification”; avoid “forged”, “fraud”, and “fake”.
- Ambiguous or unavailable checks are `NEEDS_REVIEW` or `NOT_CHECKED`, never `PASS`.
- Comparison findings include both compared values, their source, a rule ID/version, and a plain reason.
- Unreferenced illustrative rules are `synthetic_demo`; do not invent Handbook clauses or numeric norms.
- Do not send documents/data to external providers. Any future external call needs explicit authorization, an allowlisted adapter, and a confidentiality gate.
- Keep originals immutable; derived copies are separate.
- Keep shared API/contracts stable. Record proposed changes and rationale in `docs/decisions.md` before parallel implementation.

## Tooling and handoff
- Use CPython 3.12.14 and uv 0.13.5. Add/remove dependencies through `pyproject.toml`; update `uv.lock` and export `requirements.txt`. Do not install packages ad hoc with pip.
- Read `docs/spec/phase-a.md` and the relevant section of `docs/reference/sih26261-prototype-guide-v4.2.md` before implementing a module.
- Make small changes, say what was actually run, and update `docs/decisions.md`. Never claim a check passed unless it ran.
