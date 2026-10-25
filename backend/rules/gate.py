"""
The Three-Valued Gate (Guide §12.2).

Prevents false accusations by enforcing evidence, calibration, and grounding gates.
Rule evaluation states:
- PASS: Requirement completely verified with grounded/calibrated evidence.
- WARNING: Approaching threshold or within warning window (e.g. valid_till expiring soon).
- FAILED_CHECK: Hard non-compliance. Can ONLY be concluded if every input is hard-capable.
- NOT_CHECKED: Input, record, or detector unavailable.
- NEEDS_REVIEW: Ambiguous, uncalibrated, ungrounded, or requiring human judgment.
"""

from dataclasses import dataclass
from typing import Any

PASS = "PASS"
WARNING = "WARNING"
FAILED_CHECK = "FAILED_CHECK"
NOT_CHECKED = "NOT_CHECKED"
NEEDS_REVIEW = "NEEDS_REVIEW"


@dataclass
class Pre:
    block: tuple[str, str] | None  # (state, reason): evaluator must return this and stop
    hard_ok: bool  # may this input support FAILED_CHECK?


def precheck(fact: Any | None, *, need_grounded: bool = True, min_conf: float = 0.6) -> Pre:
    """
    Evaluate fact readiness before computing rule condition.
    Returns Pre block condition or hard-capability indicator.
    """
    if fact is None:
        return Pre((NOT_CHECKED, "value unavailable"), False)

    parse_state = fact.get("parse_state", "ok") if isinstance(fact, dict) else getattr(fact, "parse_state", "ok")
    if parse_state != "ok":
        return Pre((NEEDS_REVIEW, f"value {parse_state}"), False)

    val = fact.get("value") if isinstance(fact, dict) else getattr(fact, "value", None)
    if val is None:
        return Pre((NOT_CHECKED, "value unavailable"), False)

    grounded = fact.get("grounded", False) if isinstance(fact, dict) else getattr(fact, "grounded", False)
    if need_grounded and not grounded:
        return Pre((NEEDS_REVIEW, "value not grounded on the page"), False)

    conf = fact.get("conf") if isinstance(fact, dict) else getattr(fact, "conf", None)
    if conf is not None and conf < min_conf:
        return Pre((NEEDS_REVIEW, "low confidence"), False)

    needs_confirmation = (
        fact.get("needs_confirmation", False)
        if isinstance(fact, dict)
        else getattr(fact, "needs_confirmation", False)
    )
    if needs_confirmation:
        return Pre(None, False)

    conf_kind = (
        fact.get("conf_kind", "heuristics")
        if isinstance(fact, dict)
        else getattr(fact, "conf_kind", "heuristics")
    )
    hard_ok = conf_kind in ("regex_exact", "human", "engine_score_calibrated")
    return Pre(None, hard_ok)


def harden(state: str, pres: list[Pre]) -> str:
    """A would-be FAILED_CHECK requires every input to be hard-capable; else returns NEEDS_REVIEW."""
    if state == FAILED_CHECK and not all(p.hard_ok for p in pres):
        return NEEDS_REVIEW
    return state
