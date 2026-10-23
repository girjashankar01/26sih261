from datetime import date


def validate_application(case: dict) -> dict:
    submitted = date.fromisoformat(case["submitted_on"])
    documents = {document["type"]: document for document in case["documents"]}
    findings, checks = [], []

    for document_type in case["required_documents"]:
        if document_type not in documents:
            findings.append({
                "rule_id": "DEMO-DOC-001", "status": "FAILED_CHECK", "category": "MISSING",
                "severity": "high", "reason": f"Required document '{document_type}' was not submitted.",
                "evidence": {"expected_document": document_type, "submitted_document": None},
            })
        else:
            checks.append({"rule_id": "DEMO-DOC-001", "status": "PASS", "reason": f"'{document_type}' is present."})

    for document in case["documents"]:
        if document.get("valid_till"):
            expiry = date.fromisoformat(document["valid_till"])
            if expiry < submitted:
                findings.append({
                    "rule_id": "DEMO-DATE-001", "status": "FAILED_CHECK", "category": "EXPIRED",
                    "severity": "high", "reason": f"'{document['type']}' validity date precedes submission.",
                    "evidence": {"document_type": document["type"], "valid_till": document["valid_till"], "submitted_on": case["submitted_on"]},
                })
            else:
                checks.append({"rule_id": "DEMO-DATE-001", "status": "PASS", "reason": f"'{document['type']}' is within its stated validity date."})

    requested = case["requested_intake"]
    approved = case["record"]["approved_intake"]
    if requested > approved:
        findings.append({
            "rule_id": "DEMO-INTAKE-001", "status": "FAILED_CHECK", "category": "INCONSISTENT",
            "severity": "medium", "reason": "Requested intake is above the synthetic record value; officer review is required.",
            "evidence": {
                "submitted": {"value": requested, "source": "application form"},
                "compared_with": {"value": approved, "source": case["record"]["source"], "simulated": True},
            },
        })
    else:
        checks.append({
            "rule_id": "DEMO-INTAKE-001", "status": "PASS", "reason": "Requested intake does not exceed the synthetic record value.",
            "evidence": {"submitted": requested, "record": approved, "simulated": True},
        })

    return {
        "application_id": case["id"], "category": case["category"],
        "workflow": "NEEDS_RECTIFICATION" if findings else "VALIDATED_NO_ISSUES",
        "decision_support_only": True, "simulated": True,
        "rule_set": "EOA_RENEWAL-demo-v1", "checks": checks, "findings": findings,
    }
