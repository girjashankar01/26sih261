"""
Rules Engine v4 (S8, Guide §12).

Module Contract:
- Input: typed facts (C3) for one application, record envelopes, active rule set.
- Output: check results (C4) per rule, actionable findings (C5) for non-pass outcomes,
  and validation report (validation_response).
- Deterministic: Same facts + same rule set version => identical results.
- Fail-visible: Rule error => NOT_CHECKED with error class. Stack trace goes to logs, not UI.
- Activation validator (validate_rule_set): Fails closed on missing approver or unknown rule types.
"""

from datetime import datetime, timezone
import hashlib
from pathlib import Path
from typing import Any
import yaml

from backend.rules.evaluators import EVALUATORS
from backend.rules.gate import (
    FAILED_CHECK,
    NEEDS_REVIEW,
    NOT_CHECKED,
    PASS,
    WARNING,
)

RULE_SETS_DIR = Path(__file__).resolve().parents[2] / "rules" / "rule_sets"


def load_rule_set(rule_set_name: str = "EOA_RENEWAL") -> dict[str, Any]:
    """Load rule set YAML definition from disk."""
    path = RULE_SETS_DIR / f"{rule_set_name}.yaml"
    if not path.exists():
        raise FileNotFoundError(f"Rule set file not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data


def validate_rule_set(rs: dict[str, Any], evaluators: dict[str, Any] | None = None) -> list[str]:
    """
    Activation validator per Guide §12.4. Fails closed.
    Returns list of error messages. If non-empty, rule set cannot be activated.
    """
    ev = evaluators or EVALUATORS
    errs: list[str] = []

    if not rs.get("approved_by"):
        errs.append("No named approver specified in rule set")

    if not rs.get("rules"):
        errs.append("Rule set has no rules defined")

    for r in rs.get("rules", []):
        r_id = r.get("id", "UNKNOWN")
        st = r.get("status", "enabled")

        if st == "planned":
            continue

        if r.get("type") not in ev:
            errs.append(f"{r_id}: unknown rule type '{r.get('type')}'")

        if st == "enabled":
            ref_clause = (r.get("ref") or {}).get("clause", "")
            if not ref_clause or "<" in ref_clause:
                errs.append(f"{r_id}: enabled rule has a placeholder clause reference")

        if st == "synthetic_demo" and not rs.get("demo"):
            errs.append(f"{r_id}: synthetic_demo rule in a non-demo rule set")

        if not r.get("tests"):
            errs.append(f"{r_id}: no verification tests defined")

    return errs


def run_rule_set(
    rs: dict[str, Any],
    facts: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
    application_id: str = "APP-001",
    category: str = "EOA_RENEWAL",
) -> dict[str, Any]:
    """
    Execute active rules against typed facts.
    Returns complete validation response matching validation_response.schema.json.
    """
    ctx = context or {}
    checks: list[dict[str, Any]] = []
    findings: list[dict[str, Any]] = []
    checks_not_evaluated: list[str] = []

    # Sort facts to guarantee deterministic snapshot ID
    fact_ids = sorted(f.get("id", "") for f in facts)
    data_snapshot_id = hashlib.sha256(":".join(fact_ids).encode("utf-8")).hexdigest()

    for rule in rs.get("rules", []):
        rule_id = rule.get("id")
        rule_status = rule.get("status", "enabled")
        rule_type = rule.get("type")

        if rule_status == "planned":
            checks_not_evaluated.append(f"{rule_id} ({rule_type}) - status: planned")
            continue

        evaluator = EVALUATORS.get(rule_type)
        if not evaluator:
            check_res = {
                "rule_id": rule_id,
                "rule_version": str(rule.get("version", "1.0.0")),
                "status": NOT_CHECKED,
                "category": "INCONSISTENT",
                "severity": rule.get("severity", "medium"),
                "observed": None,
                "expected": "Implemented rule evaluator",
                "advisory": True,
                "simulated": True,
                "reason": f"Evaluator for rule type '{rule_type}' not available.",
                "evidence": {"rule_id": rule_id, "type": rule_type},
            }
        else:
            try:
                check_res = evaluator(rule, facts, ctx)
            except Exception as e:
                # Fail-visible: rule error -> NOT_CHECKED with error class
                check_res = {
                    "rule_id": rule_id,
                    "rule_version": str(rule.get("version", "1.0.0")),
                    "status": NOT_CHECKED,
                    "category": "INCONSISTENT",
                    "severity": rule.get("severity", "medium"),
                    "observed": None,
                    "expected": "Clean rule execution",
                    "advisory": True,
                    "simulated": True,
                    "reason": f"Rule evaluation error: {type(e).__name__}",
                    "evidence": {"error_type": type(e).__name__},
                }

        checks.append(check_res)

        # Non-pass results create or refresh actionable findings (C5)
        if check_res["status"] in (FAILED_CHECK, WARNING, NEEDS_REVIEW):
            finding_id = f"finding-{rule_id.lower()}-{check_res.get('category', '').lower()}"
            findings.append({
                "id": finding_id,
                "rule_id": rule_id,
                "rule_version": str(rule.get("version", "1.0.0")),
                "status": check_res["status"],
                "category": check_res["category"],
                "severity": check_res.get("severity", rule.get("severity", "medium")),
                "lifecycle": "open",
                "advisory": True,
                "reason": check_res["reason"],
                "evidence": check_res["evidence"],
            })

    # Determine workflow status based on findings
    has_failed = any(f["status"] == FAILED_CHECK for f in findings)
    has_review = any(f["status"] == NEEDS_REVIEW for f in findings)

    if has_failed:
        workflow = "NEEDS_RECTIFICATION"
    elif has_review:
        workflow = "NEEDS_MANUAL_REVIEW"
    else:
        workflow = "NO_FINDINGS_IN_ENABLED_DEMO_CHECKS"

    # Add general unevaluated pipeline checks
    checks_not_evaluated.extend([
        "Live AICTE Web Portal Auth Adapter (simulated demo)",
        "Direct Municipal Fire Dept QR Verification API",
        "Faculty Duplicate Registry Cross-Institute Check",
    ])

    return {
        "application_id": application_id,
        "category": category,
        "workflow": workflow,
        "decision_support_only": True,
        "simulated": True,
        "rule_set": rs.get("rule_set", "EOA_RENEWAL"),
        "rule_set_version": str(rs.get("version", "4")),
        "data_snapshot_id": data_snapshot_id,
        "coverage": {
            "mode": "demo_partial_checks",
            "summary": f"{len(checks)} rules evaluated deterministically across facts and synthetic records",
            "rules_evaluated": len(checks),
            "checks_not_evaluated": checks_not_evaluated,
        },
        "checks": checks,
        "findings": findings,
    }
