"""
Application Validation Service (Guide §12, §16).

Executes the Rules Engine against aggregated typed facts (C3) across application documents,
form inputs, and authorised synthetic records. Enforces the Three-Valued Gate to prevent
unsubstantiated failure conclusions.
"""

from datetime import date
from typing import Any

from backend.db.connection import Database, db as default_db
from backend.facts.service import aggregate_application_facts, build_c3_fact
from backend.records.adapter import RecordsAdapter, default_records_adapter
from backend.rules.engine import load_rule_set, run_rule_set


def validate_persisted_application(
    application_id: str,
    rule_set_name: str = "EOA_RENEWAL",
    database: Database | None = None,
    records_adapter: RecordsAdapter | None = None,
) -> dict[str, Any]:
    """
    Validate an application using persisted extractions from S1-S6 and records from S7.
    Aggregates facts, resolves entities, and applies active rule set through the gate.
    """
    d = database or default_db
    adapter = records_adapter or default_records_adapter

    # 1. Aggregate all typed facts across form, records, and documents
    aggregated = aggregate_application_facts(
        application_id=application_id,
        form_data=None,
        database=d,
        records_adapter=adapter,
    )
    facts = aggregated.get("facts", [])

    # 2. Derive evaluation context
    submitted_docs = list({f.get("entity") for f in facts if f.get("source") == "doc"})
    has_unclassified = "UNCLASSIFIED" in submitted_docs

    context = {
        "application_id": application_id,
        "submitted_documents": submitted_docs,
        "has_unclassified": has_unclassified,
        "classification_executed": True,
        "submission_date": None,
    }

    # Find submission date in facts
    for f in facts:
        if f.get("entity") == "APPLICATION" and f.get("key") == "submitted_on":
            context["submission_date"] = f.get("value")
            break

    # 3. Load rule set and execute rules engine
    rs = load_rule_set(rule_set_name)
    report = run_rule_set(
        rs=rs,
        facts=facts,
        context=context,
        application_id=application_id,
        category=rs.get("rule_set", "EOA_RENEWAL"),
    )

    return report


def validate_application(case: dict[str, Any]) -> dict[str, Any]:
    """
    Validate application from dictionary fixture (e.g. demo cases DEMO-CLEAN-001, DEMO-ISSUES-001).
    Synthesizes typed facts and evaluates using the active v4 rules engine.
    """
    app_id = case["id"]
    category = case.get("category", "EOA_RENEWAL")
    submitted_on = case.get("submitted_on", "2026-10-12")
    requested_intake = case.get("requested_intake", 480)
    inst_name = case.get("institution_name", "Apex Institute of Technology Private Limited")
    aicte_id = case.get("aicte_id", "1-10998877")

    approved_intake = (
        case.get("record", {}).get("approved_intake")
        if isinstance(case.get("record"), dict)
        else 480
    )

    facts: list[dict[str, Any]] = [
        build_c3_fact(app_id, "application_form", "APPLICATION", "aicte_id", aicte_id, "string"),
        build_c3_fact(app_id, "application_form", "APPLICATION", "category", category, "string"),
        build_c3_fact(app_id, "application_form", "APPLICATION", "submitted_on", submitted_on, "date"),
        build_c3_fact(app_id, "application_form", "APPLICATION", "requested_intake", requested_intake, "number"),
        build_c3_fact(app_id, "application_form", "APPLICATION", "institution_name", inst_name, "string"),
        build_c3_fact(app_id, "synthetic_record", "INSTITUTION", "canonical_name", inst_name, "string"),
        build_c3_fact(app_id, "synthetic_record", "APPROVED_PROGRAMMES", "approved_intake", approved_intake, "number"),
    ]

    submitted_docs: list[str] = []
    for doc in case.get("documents", []):
        dtype = doc.get("type", "").upper()
        if dtype:
            submitted_docs.append(dtype)
        if dtype == "FIRE_NOC":
            facts.append(
                build_c3_fact(
                    app_id,
                    "doc",
                    "FIRE_NOC",
                    "certificate_no",
                    "FIRE/KA/2024/00123",
                    "string",
                    grounded=True,
                    source_ref="B02",
                    page=1,
                    bbox_norm=[0.1, 0.2, 0.5, 0.25],
                    bbox_precision="word",
                )
            )
            if doc.get("valid_till"):
                facts.append(
                    build_c3_fact(
                        app_id,
                        "doc",
                        "FIRE_NOC",
                        "valid_till",
                        doc["valid_till"],
                        "date",
                        grounded=True,
                        source_ref="B04",
                        page=1,
                        bbox_norm=[0.1, 0.35, 0.6, 0.4],
                        bbox_precision="word",
                    )
                )
        elif dtype == "ACCREDITATION":
            facts.append(
                build_c3_fact(
                    app_id,
                    "doc",
                    "ACCREDITATION",
                    "institution_name",
                    inst_name,
                    "string",
                    grounded=True,
                    source_ref="B01",
                    page=1,
                    bbox_norm=[0.1, 0.1, 0.8, 0.2],
                    bbox_precision="word",
                )
            )

    context = {
        "application_id": app_id,
        "submitted_documents": submitted_docs,
        "has_unclassified": False,
        "classification_executed": True,
        "submission_date": submitted_on,
    }

    rs = load_rule_set("EOA_RENEWAL")
    report = run_rule_set(
        rs=rs,
        facts=facts,
        context=context,
        application_id=app_id,
        category=category,
    )

    return report
