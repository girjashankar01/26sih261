"""
Typed Facts and Entity Resolution Aggregation Service (S7, Guide §11.4).

Aggregates facts from three distinct sources into C3 Typed Fact envelopes:
1. Extracted document facts (S6/S6b from database facts table)
2. Form-supplied application data (application form)
3. Record-supplied data from authorised synthetic records (RecordsAdapter)

Resolves canonical institution identity and evaluates cross-source document name
aliases using Guide §11.4 core/legal-form comparison rules.
"""

from datetime import datetime, timezone
import json
from typing import Any

from backend.db.connection import Database, db as default_db
from backend.db.repository import get_facts_by_application
from backend.extraction.names import name_compare, split_name, norm_id
from backend.records.adapter import RecordsAdapter, default_records_adapter
from backend.records.demo import APPLICATIONS


def build_c3_fact(
    application_id: str,
    source: str,
    entity: str,
    key: str,
    value: Any,
    value_type: str,
    parse_state: str = "ok",
    raw: str | None = None,
    document_id: str | None = None,
    conf: float | None = 1.0,
    conf_kind: str = "human",
    grounded: bool = False,
    source_ref: str | None = None,
    page: int | None = None,
    bbox_norm: list[float] | None = None,
    bbox_precision: str | None = None,
    extractor: str = "facts_aggregator",
    extractor_version: str = "1.0.0",
    needs_confirmation: bool = False,
    simulated: bool = True,
) -> dict[str, Any]:
    """Helper to construct a dictionary conforming strictly to c3_fact.schema.json."""
    fact_id = f"fact-{application_id}-{entity}-{key}"
    if document_id:
        fact_id = f"fact-{application_id}-{document_id[:8]}-{entity}-{key}"

    return {
        "id": fact_id,
        "application_id": application_id,
        "document_id": document_id,
        "source": source,
        "entity": entity,
        "key": key,
        "raw": raw if raw is not None else (str(value) if value is not None else None),
        "value_type": value_type,
        "value": value if parse_state == "ok" else None,
        "parse_state": parse_state,
        "conf": conf,
        "conf_kind": conf_kind,
        "grounded": grounded,
        "source_ref": source_ref,
        "page": page,
        "bbox_norm": bbox_norm,
        "bbox_precision": bbox_precision,
        "extractor": extractor,
        "extractor_version": extractor_version,
        "needs_confirmation": needs_confirmation,
        "simulated": simulated,
    }


def aggregate_application_facts(
    application_id: str,
    form_data: dict[str, Any] | None = None,
    database: Database | None = None,
    records_adapter: RecordsAdapter | None = None,
) -> dict[str, Any]:
    """
    Aggregate all typed facts (C3) for an application across:
    - Form submission
    - Authorised records adapter
    - Persisted document extractions
    Performs entity resolution against canonical institute name.
    """
    d = database or default_db
    adapter = records_adapter or default_records_adapter

    # 1. Resolve application form fields
    form = form_data or APPLICATIONS.get(application_id, {})
    aicte_id = form.get("aicte_id")
    category = form.get("category", "EOA_RENEWAL")
    submitted_on = form.get("submitted_on")
    requested_intake = form.get("requested_intake")
    form_institute_name = form.get("institution_name")

    all_facts: list[dict[str, Any]] = []

    # Emit form facts
    if aicte_id:
        all_facts.append(
            build_c3_fact(
                application_id=application_id,
                source="application_form",
                entity="APPLICATION",
                key="aicte_id",
                value=aicte_id,
                value_type="string",
                raw=aicte_id,
                conf=1.0,
                conf_kind="human",
                extractor="form_submission",
            )
        )
    if category:
        all_facts.append(
            build_c3_fact(
                application_id=application_id,
                source="application_form",
                entity="APPLICATION",
                key="category",
                value=category,
                value_type="string",
                raw=category,
                conf=1.0,
                conf_kind="human",
                extractor="form_submission",
            )
        )
    if submitted_on:
        all_facts.append(
            build_c3_fact(
                application_id=application_id,
                source="application_form",
                entity="APPLICATION",
                key="submitted_on",
                value=submitted_on,
                value_type="date",
                raw=submitted_on,
                conf=1.0,
                conf_kind="human",
                extractor="form_submission",
            )
        )
    if requested_intake is not None:
        all_facts.append(
            build_c3_fact(
                application_id=application_id,
                source="application_form",
                entity="APPLICATION",
                key="requested_intake",
                value=int(requested_intake),
                value_type="number",
                raw=str(requested_intake),
                conf=1.0,
                conf_kind="human",
                extractor="form_submission",
            )
        )
    if form_institute_name:
        all_facts.append(
            build_c3_fact(
                application_id=application_id,
                source="application_form",
                entity="APPLICATION",
                key="institution_name",
                value=form_institute_name,
                value_type="string",
                raw=form_institute_name,
                conf=1.0,
                conf_kind="human",
                extractor="form_submission",
            )
        )

    # 2. Query Authorised Records Adapter
    canonical_institute = None
    canonical_name = form_institute_name

    if aicte_id:
        inst_envelope = adapter.institute(aicte_id)
        if inst_envelope and "data" in inst_envelope:
            inst_data = inst_envelope["data"]
            canonical_name = inst_data.get("name", canonical_name)
            canonical_institute = {
                "aicte_id": aicte_id,
                "name": canonical_name,
                "source": "synthetic_record",
                "address": inst_data.get("address"),
                "state": inst_data.get("state"),
                "simulated": True,
            }
            all_facts.append(
                build_c3_fact(
                    application_id=application_id,
                    source="synthetic_record",
                    entity="INSTITUTION",
                    key="canonical_name",
                    value=canonical_name,
                    value_type="string",
                    raw=canonical_name,
                    conf=1.0,
                    conf_kind="regex_exact",
                    extractor="records_adapter",
                )
            )

        prog_envelope = adapter.approved_programmes(aicte_id)
        if prog_envelope and "data" in prog_envelope:
            prog_data = prog_envelope["data"]
            appr_intake = prog_data.get("approved_intake")
            if appr_intake is not None:
                all_facts.append(
                    build_c3_fact(
                        application_id=application_id,
                        source="synthetic_record",
                        entity="APPROVED_PROGRAMMES",
                        key="approved_intake",
                        value=int(appr_intake),
                        value_type="number",
                        raw=str(appr_intake),
                        conf=1.0,
                        conf_kind="regex_exact",
                        extractor="records_adapter",
                    )
                )

        ter_envelope = adapter.ter_payment(aicte_id)
        if ter_envelope and "data" in ter_envelope:
            ter_data = ter_envelope["data"]
            all_facts.append(
                build_c3_fact(
                    application_id=application_id,
                    source="synthetic_record",
                    entity="TER_PAYMENT",
                    key="status",
                    value=ter_data.get("status"),
                    value_type="string",
                    raw=ter_data.get("status"),
                    conf=1.0,
                    conf_kind="regex_exact",
                    extractor="records_adapter",
                )
            )

        eoa_envelope = adapter.previous_eoa(aicte_id)
        if eoa_envelope and "data" in eoa_envelope:
            eoa_data = eoa_envelope["data"]
            all_facts.append(
                build_c3_fact(
                    application_id=application_id,
                    source="synthetic_record",
                    entity="PREVIOUS_EOA",
                    key="status",
                    value=eoa_data.get("status"),
                    value_type="string",
                    raw=eoa_data.get("status"),
                    conf=1.0,
                    conf_kind="regex_exact",
                    extractor="records_adapter",
                )
            )

        def_envelope = adapter.deficiencies(aicte_id)
        if def_envelope and "data" in def_envelope:
            def_data = def_envelope["data"]
            all_facts.append(
                build_c3_fact(
                    application_id=application_id,
                    source="synthetic_record",
                    entity="DEFICIENCIES",
                    key="has_deficiency",
                    value=bool(def_data.get("has_deficiency")),
                    value_type="boolean",
                    raw=str(def_data.get("has_deficiency")),
                    conf=1.0,
                    conf_kind="regex_exact",
                    extractor="records_adapter",
                )
            )

        fac_envelope = adapter.faculty(aicte_id)
        if fac_envelope and "data" in fac_envelope:
            fac_data = fac_envelope["data"]
            all_facts.append(
                build_c3_fact(
                    application_id=application_id,
                    source="synthetic_record",
                    entity="FACULTY",
                    key="cadre_ratio_adequate",
                    value=bool(fac_data.get("cadre_ratio_adequate")),
                    value_type="boolean",
                    raw=str(fac_data.get("cadre_ratio_adequate")),
                    conf=1.0,
                    conf_kind="regex_exact",
                    extractor="records_adapter",
                )
            )

    # 3. Query Persisted Document Facts from Database
    doc_facts: list[dict[str, Any]] = []
    with d.connection() as conn:
        db_rows = get_facts_by_application(conn, application_id, d)

    aliases: list[dict[str, Any]] = []

    for row in db_rows:
        bbox_norm = None
        if row.get("bbox_norm_json"):
            try:
                bbox_norm = json.loads(row["bbox_norm_json"])
            except Exception:
                bbox_norm = None

        val = row.get("value")
        vtype = row.get("value_type", "string")
        if row.get("parse_state") == "ok" and val is not None:
            if vtype == "number":
                try:
                    val = int(val) if str(val).isdigit() else float(val)
                except ValueError:
                    pass
            elif vtype == "boolean":
                val = str(val).lower() in ("true", "1")

        fact_dict = {
            "id": row["id"],
            "application_id": row["application_id"],
            "document_id": row["document_id"],
            "source": row["source"],
            "entity": row["entity"],
            "key": row["key"],
            "raw": row["raw"],
            "value_type": vtype,
            "value": val if row.get("parse_state") == "ok" else None,
            "parse_state": row["parse_state"],
            "conf": row["conf"],
            "conf_kind": row["conf_kind"],
            "grounded": bool(row["grounded"]),
            "source_ref": row["source_ref"],
            "page": row["page"],
            "bbox_norm": bbox_norm,
            "bbox_precision": row["bbox_precision"],
            "extractor": row["extractor"],
            "extractor_version": row["extractor_version"],
            "needs_confirmation": bool(row.get("needs_confirmation", False)),
            "simulated": bool(row.get("simulated", True)),
        }
        all_facts.append(fact_dict)

        # Check for institution_name to perform entity resolution & alias registration
        if row["key"] == "institution_name" and canonical_name and row.get("parse_state") == "ok":
            extracted_name = str(row["value"])
            match_status = name_compare(extracted_name, canonical_name)
            core_ext, legal_ext = split_name(extracted_name)
            core_can, legal_can = split_name(canonical_name)

            alias_entry = {
                "document_id": row.get("document_id"),
                "doc_type": row["entity"],
                "extracted_name": extracted_name,
                "canonical_name": canonical_name,
                "match_status": match_status,
                "core_extracted": core_ext,
                "core_canonical": core_can,
                "legal_forms_extracted": sorted(list(legal_ext)),
                "legal_forms_canonical": sorted(list(legal_can)),
            }
            aliases.append(alias_entry)

            # Emit cross-source comparison fact
            all_facts.append(
                build_c3_fact(
                    application_id=application_id,
                    document_id=row.get("document_id"),
                    source="doc",
                    entity="CROSS_SOURCE",
                    key=f"{row['entity'].lower()}_name_match",
                    value=match_status,
                    value_type="string",
                    raw=f"Extracted: '{extracted_name}' vs Canonical: '{canonical_name}'",
                    parse_state="ok",
                    conf=1.0,
                    conf_kind="regex_exact",
                    grounded=bool(row["grounded"]),
                    source_ref=row.get("source_ref"),
                    page=row.get("page"),
                    bbox_norm=bbox_norm,
                    bbox_precision=row.get("bbox_precision"),
                    extractor="name_comparator",
                    extractor_version="1.0.0",
                )
            )

    return {
        "application_id": application_id,
        "pipeline_stage": "S7_TYPED_FACTS",
        "simulated": True,
        "decision_support_only": True,
        "canonical_institute": canonical_institute,
        "aliases": aliases,
        "facts": all_facts,
        "facts_count": len(all_facts),
    }
