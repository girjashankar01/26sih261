"""
Verification Status Decision Logic (Guide §13.1).

Precedence order:
1. Partial response or reference not found -> MANUAL_REVIEW_REQUIRED
2. One or more fields differ -> MISMATCH_DETECTED
3. Validity ended / valid_till < today -> EXPIRED
4. All whitelisted fields match -> VERIFIED
"""

from datetime import date
from typing import Any, Callable


def default_normaliser(val: Any) -> str:
    """Normalize string for robust equivalence comparison."""
    if val is None:
        return ""
    import re
    return re.sub(r"[\s\-_/.,]", "", str(val).lower())


def decide(
    returned: dict[str, Any] | None,
    submitted: dict[str, Any],
    fields: dict[str, Callable[[Any], str]] | None = None,
    today: date | None = None,
) -> tuple[str, dict[str, Any]]:
    """
    Decide verification status and construct field-by-field comparison dictionary.
    Returns: (status, compared_dict_or_reason)
    """
    as_of = today or date.today()
    if fields is None:
        fields = {k: default_normaliser for k in submitted.keys()}

    # 1. Source answered but has no such reference
    if returned is None:
        return "MANUAL_REVIEW_REQUIRED", {"reason": "REFERENCE_NOT_FOUND"}

    cmp: dict[str, Any] = {}
    for f, norm in fields.items():
        ret_val = returned.get(f)
        sub_val = submitted.get(f)

        # 2. Source gave incomplete response
        if ret_val in (None, ""):
            return "MANUAL_REVIEW_REQUIRED", {"reason": "PARTIAL_RESPONSE", "missing_field": f}

        match = norm(sub_val) == norm(ret_val)
        cmp[f] = {
            "submitted": sub_val,
            "returned": ret_val,
            "match": match,
        }

    # 3. Whitelisted fields mismatch
    if not all(c["match"] for c in cmp.values()):
        return "MISMATCH_DETECTED", cmp

    # 4. Validity ended / expired
    if returned.get("validity_ended"):
        return "EXPIRED", cmp

    valid_till_val = returned.get("valid_till")
    if valid_till_val:
        if isinstance(valid_till_val, str):
            try:
                vt = date.fromisoformat(valid_till_val)
                if vt < as_of:
                    return "EXPIRED", cmp
            except ValueError:
                pass
        elif isinstance(valid_till_val, date) and valid_till_val < as_of:
            return "EXPIRED", cmp

    # 5. Full match
    return "VERIFIED", cmp
