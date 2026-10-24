from datetime import date


def validate_application(case: dict) -> dict:
    submitted = date.fromisoformat(case["submitted_on"])
    documents = {document["type"]: document for document in case["documents"]}
    findings, checks = [], []

    for document_type in case["required_documents"]:
        if document_type not in documents:
            findings.append({
                "id": f"finding-doc-{document_type}",
                "rule_id": "DEMO-DOC-001",
                "rule_version": "1.0.0",
                "status": "FAILED_CHECK",
                "category": "MISSING",
                "severity": "high",
                "lifecycle": "open",
                "advisory": True,
                "reason": f"Required document '{document_type}' was not submitted.",
                "evidence": {
                    "expected_document": document_type,
                    "submitted_document": None,
                    "source": "checklist_definition",
                },
            })
        else:
            checks.append({
                "rule_id": "DEMO-DOC-001",
                "rule_version": "1.0.0",
                "status": "PASS",
                "category": "REQUIRED_DOCUMENT",
                "severity": "info",
                "advisory": True,
                "reason": f"'{document_type}' is present.",
                "evidence": {
                    "document_type": document_type,
                    "source": "submitted_documents",
                },
            })

    for document in case["documents"]:
        if document.get("valid_till"):
            expiry = date.fromisoformat(document["valid_till"])
            if expiry < submitted:
                findings.append({
                    "id": f"finding-date-{document['type']}",
                    "rule_id": "DEMO-DATE-001",
                    "rule_version": "1.0.0",
                    "status": "FAILED_CHECK",
                    "category": "EXPIRED",
                    "severity": "high",
                    "lifecycle": "open",
                    "advisory": True,
                    "reason": f"'{document['type']}' validity date precedes submission.",
                    "evidence": {
                        "document_type": document["type"],
                        "submitted": {
                            "value": document["valid_till"],
                            "field": "valid_till",
                            "source": "document_validity_metadata",
                        },
                        "compared_with": {
                            "value": case["submitted_on"],
                            "field": "submitted_on",
                            "source": "application_metadata",
                        },
                        "comparison": "valid_till < submitted_on",
                    },
                })
            else:
                checks.append({
                    "rule_id": "DEMO-DATE-001",
                    "rule_version": "1.0.0",
                    "status": "PASS",
                    "category": "EXPIRED",
                    "severity": "info",
                    "advisory": True,
                    "reason": f"'{document['type']}' is within its stated validity date.",
                    "evidence": {
                        "document_type": document["type"],
                        "valid_till": document["valid_till"],
                        "submitted_on": case["submitted_on"],
                    },
                })

    requested = case["requested_intake"]
    approved = case["record"]["approved_intake"]
    if requested > approved:
        findings.append({
            "id": "finding-intake-001",
            "rule_id": "DEMO-INTAKE-001",
            "rule_version": "1.0.0",
            "status": "FAILED_CHECK",
            "category": "INCONSISTENT",
            "severity": "medium",
            "lifecycle": "open",
            "advisory": True,
            "reason": "Requested intake is above the synthetic record value; officer review is required.",
            "evidence": {
                "submitted": {
                    "value": requested,
                    "field": "requested_intake",
                    "source": "application form",
                },
                "compared_with": {
                    "value": approved,
                    "field": "approved_intake",
                    "source": case["record"]["source"],
                    "simulated": True,
                },
                "difference": requested - approved,
            },
        })
    else:
        checks.append({
            "rule_id": "DEMO-INTAKE-001",
            "rule_version": "1.0.0",
            "status": "PASS",
            "category": "INCONSISTENT",
            "severity": "info",
            "advisory": True,
            "reason": "Requested intake does not exceed the synthetic record value.",
            "evidence": {
                "submitted": requested,
                "record": approved,
                "simulated": True,
            },
        })

    # Prototype Guide §1.3: VALIDATED_NO_ISSUES is emitted ONLY when every mandatory rule in the
    # full active set is PASS, every document has VERIFIED status, no medium/high flags, and OCR quality gates pass.
    # For partial demo evaluations, we emit NO_FINDINGS_IN_ENABLED_DEMO_CHECKS with explicit coverage details.
    workflow = (
        "NEEDS_RECTIFICATION"
        if findings
        else "NO_FINDINGS_IN_ENABLED_DEMO_CHECKS"
    )

    return {
        "application_id": case["id"],
        "category": case["category"],
        "workflow": workflow,
        "decision_support_only": True,
        "simulated": True,
        "rule_set": "EOA_RENEWAL-demo-v1",
        "rule_set_version": "1.0.0",
        "coverage": {
            "mode": "demo_partial_checks",
            "summary": "3 deterministic demo checks evaluated out of full AICTE validation lifecycle",
            "rules_evaluated": len(checks) + len(findings),
            "checks_not_evaluated": [
                "ocr_and_layout_pipeline",
                "document_forensics_and_tamper_detection",
                "live_issuer_registry_verification",
                "infrastructure_norms_checklist",
                "officer_manual_review_and_decision",
            ],
        },
        "checks": checks,
        "findings": findings,
    }
