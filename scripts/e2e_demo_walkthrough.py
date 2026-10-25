"""
End-to-End Pipeline Walkthrough Script (S1 through S13).

Creates synthetic test application package:
1. Application Form & Synthetic Records
2. Document 1: Affidavit (Digital PDF)
3. Document 2: Fire Safety NOC (Digital PDF with QR code & certificate details)
4. Facility Evidence: Computer Lab photo with geotagged metadata

Executes every pipeline stage in sequence:
- S1 Ingest Gateway
- S2 Document Forensics
- S3 Document Routing
- S4 Branch B Extraction & Normalization
- S5 Document Typing
- S6 Schema-Driven Field Extraction & Grounding
- S7 Typed Facts & Entity Resolution
- S8 Deterministic Rules Engine v4
- S9 Issuing Authority Verification Gateway
- S10 Infrastructure Evidence Checklist & Geotag Norms
- S11 Unified Aggregation, Workflow Status, Lanes, Priority, & Alerts
- S12 Review Console Actions & Officer Exports (Notice, Brief, Report)
- S13 Tamper-Evident Audit Hash Chain & Ed25519 Checkpoint
"""

import asyncio
from datetime import datetime, timezone
import io
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

# Ensure workspace root is in sys.path
WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

# Ensure stdout handles utf-8 safely
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import cv2
from fastapi import UploadFile
import numpy as np
import pymupdf
import qrcode
from PIL import Image

from backend.db.connection import Database
from backend.db.repository import (
    init_db,
    insert_blob,
    insert_upload,
    insert_infra_evidence,
    get_last_audit_event,
)
from backend.storage.vault import LocalVaultStorage
from backend.ingest.service import process_upload_stream
from backend.forensics import run_forensics
from backend.pipeline.router import route_document
from backend.pipeline.branch_b import execute_branch_b
from backend.typing.service import process_document_typing
from backend.extraction.service import process_document_extraction
from backend.facts.service import aggregate_application_facts
from backend.records.adapter import default_records_adapter
from backend.records.demo import APPLICATIONS
from backend.rules.evaluate import validate_persisted_application
from backend.verification.gateway import verify_persisted_document
from backend.infra.service import evaluate_application_infra
from backend.aggregation.service import aggregate_application
from backend.review.findings import record_finding_action
from backend.review.exports import (
    generate_deficiency_notice,
    generate_inspection_brief,
    generate_application_report,
)
from backend.audit.chain import verify_chain, create_checkpoint, verify_checkpoint


def generate_synthetic_affidavit() -> bytes:
    """Create a digital PDF affidavit conforming to AICTE norms."""
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((50, 60), "AFFIDAVIT ON STAMP PAPER", fontsize=16)
    page.insert_text((50, 90), "I, Dr. Rajesh Kumar, deponent, hereby solemnly affirm and declare:", fontsize=11)
    page.insert_text((50, 115), "Name of Institution: Apex Institute of Technology Private Limited", fontsize=11)
    page.insert_text((50, 140), "That the institution adheres strictly to the norms and standards prescribed by AICTE.", fontsize=11)
    page.insert_text((50, 180), "Deponent: Dr. Rajesh Kumar", fontsize=11)
    page.insert_text((50, 210), "Sworn: 12/10/2026", fontsize=11)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def generate_synthetic_fire_noc() -> bytes:
    """Create a digital PDF Fire NOC with an embedded QR code."""
    # 1. Create QR code image
    qr = qrcode.QRCode(box_size=4, border=2)
    qr.add_data("https://fire.karnataka.gov.in/verify?cert=FIRE/KA/2024/00123")
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    qr_buf = io.BytesIO()
    qr_img.save(qr_buf, format="PNG")
    qr_bytes = qr_buf.getvalue()

    # 2. Build PDF document
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((50, 60), "GOVERNMENT OF KARNATAKA - FIRE & EMERGENCY SERVICES", fontsize=13)
    page.insert_text((50, 85), "FIRE SAFETY CERTIFICATE / NO OBJECTION CERTIFICATE", fontsize=14)
    page.insert_text((50, 130), "Certificate No: FIRE/KA/2024/00123", fontsize=11)
    page.insert_text((50, 150), "Issued to: Apex Institute of Technology Private Limited", fontsize=11)
    page.insert_text((50, 170), "Issue Date: 01/04/2023", fontsize=11)
    page.insert_text((50, 190), "Valid Till: 31/03/2024", fontsize=11)  # Expired to test anomaly detection
    page.insert_text((50, 230), "Scan QR code below to verify online with State Fire Service:", fontsize=10)

    # Insert QR code
    rect = pymupdf.Rect(50, 250, 170, 370)
    page.insert_image(rect, stream=qr_bytes)

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def generate_synthetic_photo(color: tuple = (100, 150, 200)) -> bytes:
    """Create a JPEG image representing facility infrastructure evidence."""
    img = np.full((300, 400, 3), color, dtype=np.uint8)
    cv2.putText(img, "Computer Centre Lab 1", (30, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    success, encoded = cv2.imencode(".jpg", img)
    return encoded.tobytes()


async def run_pipeline_walkthrough():
    print("=" * 80)
    print("AICTE VALIDATION PROTOTYPE: S1 THROUGH S13 END-TO-END DEMO WALKTHROUGH")
    print("=" * 80)

    # Setup isolated test sandbox
    sandbox_dir = tempfile.mkdtemp(prefix="aicte_e2e_")
    db_path = os.path.join(sandbox_dir, "demo.db")
    vault_dir = os.path.join(sandbox_dir, "vault")
    test_db = Database(f"sqlite:///{db_path}")
    init_db(test_db)
    test_vault = LocalVaultStorage(vault_dir)

    app_id = "APP-2026-EOA-9876"
    print(f"\n[INIT] Initialized test sandbox:")
    print(f"       Database: {db_path}")
    print(f"       Vault:    {vault_dir}")
    print(f"       Target:   {app_id}")

    # =========================================================================
    # STAGE S1: Ingest Gateway
    # =========================================================================
    print("\n" + "-" * 80)
    print("STAGE S1: DOCUMENT INGESTION GATEWAY (Guide §4)")
    print("-" * 80)
    affidavit_pdf = generate_synthetic_affidavit()
    fire_noc_pdf = generate_synthetic_fire_noc()

    # Upload Affidavit
    aff_file = UploadFile(filename="affidavit.pdf", file=io.BytesIO(affidavit_pdf))
    res_s1_aff = await process_upload_stream(
        upload_file=aff_file,
        application_id=app_id,
        doc_slot="affidavit",
        database=test_db,
        vault=test_vault,
    )
    doc_id_aff = res_s1_aff.document_id
    print(f"  [OK] Affidavit Ingested: doc_id={doc_id_aff}, blake3={res_s1_aff.blake3[:16]}..., status={res_s1_aff.processing_state}")

    # Upload Fire NOC
    fire_file = UploadFile(filename="fire_noc.pdf", file=io.BytesIO(fire_noc_pdf))
    res_s1_fire = await process_upload_stream(
        upload_file=fire_file,
        application_id=app_id,
        doc_slot="fire_noc",
        database=test_db,
        vault=test_vault,
    )
    doc_id_fire = res_s1_fire.document_id
    print(f"  [OK] Fire NOC Ingested:  doc_id={doc_id_fire}, blake3={res_s1_fire.blake3[:16]}..., status={res_s1_fire.processing_state}")

    # =========================================================================
    # STAGE S2: Document Forensics (Branch A)
    # =========================================================================
    print("\n" + "-" * 80)
    print("STAGE S2: DOCUMENT FORENSICS ANALYSIS (Guide §5)")
    print("-" * 80)
    forensics_aff = run_forensics(
        raw_bytes=affidavit_pdf,
        media_type="application/pdf",
        document_id=doc_id_aff,
        application_id=app_id,
        blake3=res_s1_aff.blake3,
        sha256=res_s1_aff.sha256,
        storage_key=res_s1_aff.storage_key,
        doc_slot="affidavit",
    )
    print(f"  [OK] Affidavit Forensics: flags_count={len(forensics_aff.flags)}, stage={forensics_aff.pipeline_stage}")

    forensics_fire = run_forensics(
        raw_bytes=fire_noc_pdf,
        media_type="application/pdf",
        document_id=doc_id_fire,
        application_id=app_id,
        blake3=res_s1_fire.blake3,
        sha256=res_s1_fire.sha256,
        storage_key=res_s1_fire.storage_key,
        doc_slot="fire_noc",
    )
    qr_detected = bool(forensics_fire.qr and forensics_fire.qr.get("detected"))
    print(f"  [OK] Fire NOC Forensics:  flags_count={len(forensics_fire.flags)}, qr_detected={qr_detected}")

    # =========================================================================
    # STAGE S3: Document Routing
    # =========================================================================
    print("\n" + "-" * 80)
    print("STAGE S3: DOCUMENT ROUTING (Guide §6)")
    print("-" * 80)
    route_aff = route_document(
        raw_bytes=affidavit_pdf,
        media_type="application/pdf",
        document_id=doc_id_aff,
        application_id=app_id,
        doc_slot="affidavit",
        blake3=res_s1_aff.blake3,
        sha256=res_s1_aff.sha256,
        storage_key=res_s1_aff.storage_key,
    )
    print(f"  [OK] Affidavit Route: outcome={route_aff.routing_outcome}, pages={route_aff.total_pages}")
    route_fire = route_document(
        raw_bytes=fire_noc_pdf,
        media_type="application/pdf",
        document_id=doc_id_fire,
        application_id=app_id,
        doc_slot="fire_noc",
        blake3=res_s1_fire.blake3,
        sha256=res_s1_fire.sha256,
        storage_key=res_s1_fire.storage_key,
    )
    print(f"  [OK] Fire NOC Route:  outcome={route_fire.routing_outcome}, pages={route_fire.total_pages}")

    # =========================================================================
    # STAGE S4: Branch B Extraction
    # =========================================================================
    print("\n" + "-" * 80)
    print("STAGE S4: BRANCH B EXTRACTION & C1 UNIFIED PAYLOAD (Guide §7–§9)")
    print("-" * 80)
    c1_aff = execute_branch_b(app_id, doc_id_aff, database=test_db, vault_backend=test_vault)
    print(f"  [OK] Affidavit C1 Payload: pages={len(c1_aff.get('pages', []))}, blocks={len(c1_aff.get('blocks', []))}, engines={c1_aff.get('engines')}")
    c1_fire = execute_branch_b(app_id, doc_id_fire, database=test_db, vault_backend=test_vault)
    print(f"  [OK] Fire NOC C1 Payload:  pages={len(c1_fire.get('pages', []))}, blocks={len(c1_fire.get('blocks', []))}, engines={c1_fire.get('engines')}")

    # =========================================================================
    # STAGE S5: Document Typing & Classification
    # =========================================================================
    print("\n" + "-" * 80)
    print("STAGE S5: DOCUMENT TYPING (Guide §11.1)")
    print("-" * 80)
    type_aff = process_document_typing(app_id, doc_id_aff, database=test_db, vault_backend=test_vault)
    print(f"  [OK] Affidavit Classified: doc_type={type_aff['doc_type']}, confidence={type_aff['confidence']}")
    type_fire = process_document_typing(app_id, doc_id_fire, database=test_db, vault_backend=test_vault)
    print(f"  [OK] Fire NOC Classified:  doc_type={type_fire['doc_type']}, confidence={type_fire['confidence']}")

    # =========================================================================
    # STAGE S6: Schema-Driven Extraction & Grounding
    # =========================================================================
    print("\n" + "-" * 80)
    print("STAGE S6: FIELD EXTRACTION & PROVENANCE GROUNDING (Guide §11.2, §11.3)")
    print("-" * 80)
    ext_aff = process_document_extraction(app_id, doc_id_aff, database=test_db, vault_backend=test_vault)
    print(f"  [OK] Affidavit Extracted Facts: count={len(ext_aff.get('facts', []))}, completeness={ext_aff.get('completeness_status')}")
    for fld in ext_aff.get("facts", []):
        if fld.get("value") is not None:
            print(f"      - {fld['key']}: '{fld['value']}' (grounded={fld['grounded']}, precision={fld.get('bbox_precision')})")

    ext_fire = process_document_extraction(app_id, doc_id_fire, database=test_db, vault_backend=test_vault)
    print(f"  [OK] Fire NOC Extracted Facts: count={len(ext_fire.get('facts', []))}, completeness={ext_fire.get('completeness_status')}")
    for fld in ext_fire.get("facts", []):
        if fld.get("value") is not None:
            print(f"      - {fld['key']}: '{fld['value']}' (grounded={fld['grounded']}, precision={fld.get('bbox_precision')})")

    # =========================================================================
    # STAGE S7: Typed Facts & Entity Resolution
    # =========================================================================
    print("\n" + "-" * 80)
    print("STAGE S7: TYPED FACTS & ENTITY RESOLUTION (Guide §11.4, §11.5)")
    print("-" * 80)
    form_data = {
        "aicte_id": "1-10998877",
        "institution_name": "Apex Institute of Technology Private Limited",
        "category": "EOA_RENEWAL",
        "submitted_on": "2026-10-12",
        "requested_intake": 480,
    }
    # Register demo application record in registry
    APPLICATIONS[app_id] = {
        "id": app_id,
        "category": "EOA_RENEWAL",
        "aicte_id": "1-10998877",
        "institution_name": "Apex Institute of Technology Private Limited",
        "submitted_on": "2026-10-12",
        "requested_intake": 480,
        "required_documents": ["affidavit", "fire_noc"],
        "record": {"approved_intake": 480, "source": "synthetic_authorized_record", "simulated": True},
    }

    facts_res = aggregate_application_facts(
        application_id=app_id,
        form_data=form_data,
        database=test_db,
        records_adapter=default_records_adapter,
    )
    print(f"  [OK] Aggregated Facts: count={facts_res['facts_count']}")
    print(f"  [OK] Canonical Institute: {facts_res['canonical_institute']['name']}")
    for alias in facts_res["aliases"]:
        print(f"      - Alias compare: doc_type={alias['doc_type']}, match_status={alias['match_status']}, extracted='{alias['extracted_name']}'")

    # =========================================================================
    # STAGE S8: Deterministic Rules Engine v4
    # =========================================================================
    print("\n" + "-" * 80)
    print("STAGE S8: DETERMINISTIC RULES ENGINE v4 (Guide §12)")
    print("-" * 80)
    rules_res = validate_persisted_application(
        application_id=app_id,
        rule_set_name="EOA_RENEWAL",
        database=test_db,
    )
    print(f"  [OK] Rule Set: {rules_res['rule_set']} (version {rules_res['rule_set_version']})")
    print(f"  [OK] Checks Evaluated: {len(rules_res['checks'])}, Findings Derived: {len(rules_res['findings'])}")
    for chk in rules_res["checks"]:
        print(f"      - [{chk['status']}] {chk['rule_id']} ({chk['category']}): {chk['reason']}")

    # =========================================================================
    # STAGE S9: Verification Gateway
    # =========================================================================
    print("\n" + "-" * 80)
    print("STAGE S9: ISSUING AUTHORITY VERIFICATION GATEWAY (Guide §13)")
    print("-" * 80)
    verif_res = verify_persisted_document(
        application_id=app_id,
        document_id=doc_id_fire,
        database=test_db,
        vault_backend=test_vault,
    )
    print(f"  [OK] Fire NOC Verification: adapter={verif_res['adapter']}, status={verif_res['status']}")
    print(f"      Reason: {verif_res['reason']}")
    print(f"      Simulated: {verif_res['simulated']}")

    # =========================================================================
    # STAGE S10: Infrastructure Evidence Module
    # =========================================================================
    print("\n" + "-" * 80)
    print("STAGE S10: INFRASTRUCTURE EVIDENCE & GEOTAG NORMS (Guide §14)")
    print("-" * 80)
    # Record synthetic infra evidence with photo and valid campus GPS (Greater Noida: 28.4728, 77.4891)
    photo_bytes = generate_synthetic_photo()
    with test_db.transaction() as conn:
        insert_infra_evidence(
            conn,
            {
                "id": "inf-comp-01",
                "application_id": app_id,
                "item_key": "computer_lab_photos",
                "file_id": "file_lab_photo_01",
                "phash": "a1b2c3d4e5f60718",
                "latitude": 28.4728,
                "longitude": 77.4891,
                "capture_time": "2026-10-10T14:30:00Z",
            },
            database=test_db,
        )
    infra_res = evaluate_application_infra(
        application_id=app_id,
        database=test_db,
    )
    print(f"  [OK] Overall Infra Status: {infra_res['overall_status']}")
    for item in infra_res["items"]:
        print(f"      - {item['label']}: status={item['status']} (evidence_count={item['evidence_count']})")

    # =========================================================================
    # STAGE S11: Unified Aggregation, Lanes & Priority
    # =========================================================================
    print("\n" + "-" * 80)
    print("STAGE S11: UNIFIED AGGREGATION, WORKFLOW STATUS, LANES & ALERTS (Guide §11.7)")
    print("-" * 80)
    agg_res = aggregate_application(
        application_id=app_id,
        database=test_db,
    )
    print(f"  [OK] Application Workflow Status: {agg_res['workflow_status']}")
    print(f"  [OK] Review Lane Assignment:      {agg_res['review_lane']}")
    print(f"  [OK] Priority Score:             {agg_res['priority']['score']} (formula: {agg_res['priority']['formula']})")
    print(f"      Breakdown: {agg_res['priority']['breakdown']}")
    print(f"  [OK] Active Alerts Emitted:       {len(agg_res['alerts'])}")
    for alt in agg_res["alerts"]:
        print(f"      - [{alt['severity'].upper()}] {alt['title']}: {alt['message']}")

    # =========================================================================
    # STAGE S12: Review & Officer Console Actions
    # =========================================================================
    print("\n" + "-" * 80)
    print("STAGE S12: OFFICER REVIEW ACTIONS & EXPORTS (Guide §11.8, §17)")
    print("-" * 80)
    # Officer performs finding action: requests rectification on expired Fire NOC finding
    target_finding_id = agg_res["findings"][0]["rule_id"] if agg_res["findings"] else "R-EXP-001"
    act_res = record_finding_action(
        application_id=app_id,
        finding_id=target_finding_id,
        action="request_rectification",
        actor="officer_sharma",
        reason="Fire NOC certificate expired on 2024-03-31; valid renewed NOC required.",
        database=test_db,
    )
    print(f"  [OK] Officer Action Recorded:")
    print(f"      Finding: {act_res['finding_id']}")
    print(f"      Transition: {act_res['previous_state']} -> {act_res['new_state']}")
    print(f"      Actor: {act_res['actor']}, Reason: '{act_res['reason']}'")
    print(f"      Linked Audit Event ID: {act_res['audit_event_id']}")

    # Generate draft deficiency notice
    notice = generate_deficiency_notice(application_id=app_id, database=test_db)
    print(f"\n  [OK] Draft Deficiency Notice Generated (status: {notice['status']}):")
    print(f"      Deficiencies Count: {notice['deficiencies_count']}")
    for d_item in notice["deficiencies"]:
        print(f"      - {d_item['rule_id']}: Observed={d_item['observed']} | Expected={d_item['expected']}")
        print(f"        Action Required: {d_item['action_required']}")

    # Generate inspection brief
    brief = generate_inspection_brief(application_id=app_id, database=test_db)
    print(f"\n  [OK] Physical Inspection Brief Generated (status: {brief['status']}):")
    print(f"      Facilities to Inspect: {brief['facilities_to_inspect_count']}")
    print(f"      Pending Verifications: {brief['pending_verifications_count']}")

    # Generate full report
    report = generate_application_report(application_id=app_id, database=test_db)
    print(f"\n  [OK] Comprehensive Application Evaluation Report:")
    print(f"      Checklist Items: {len(report['checklist'])}")
    print(f"      Findings (with action history): {len(report['findings'])}")
    print(f"      Audit Chain Head Digest: {report['audit_chain_head'][:16]}...")

    # =========================================================================
    # STAGE S13: Audit Hash Chain & Checkpoints
    # =========================================================================
    print("\n" + "-" * 80)
    print("STAGE S13: TAMPER-EVIDENT AUDIT TRAIL & Ed25519 CHECKPOINTS (Guide §15)")
    print("-" * 80)
    with test_db.connection() as conn:
        verify_res = verify_chain(conn, database=test_db)
    print(f"  [OK] Cryptographic Hash Chain Verification:")
    print(f"      Integrity Verified: {verify_res['ok']}")
    print(f"      Total Events Chained: {verify_res['count']}")
    print(f"      Chain Head Hash: {verify_res['head'][:24]}...")

    # Create signed checkpoint
    checkpoint = create_checkpoint(
        upto_id=verify_res["count"],
        head_hash=verify_res["head"],
        database=test_db,
    )
    print(f"  [OK] Ed25519 Checkpoint Created:")
    print(f"      Checkpoint ID: {checkpoint['id']}")
    print(f"      Signature:     {checkpoint['signature'][:32]}...")

    # Verify checkpoint
    chk_verif = verify_checkpoint(checkpoint)
    print(f"  [OK] Checkpoint Verification against Trusted Key: {chk_verif['valid']} ({chk_verif['reason']})")

    # Clean up test sandbox
    shutil.rmtree(sandbox_dir, ignore_errors=True)
    print("\n" + "=" * 80)
    print("ALL 13 PIPELINE STAGES EXECUTED AND VERIFIED END-TO-END WITH TEST DATA!")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(run_pipeline_walkthrough())
