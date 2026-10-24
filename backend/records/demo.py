# Synthetic fixtures only. Values do not represent a real institution.
APPLICATIONS = {
    "DEMO-CLEAN-001": {
        "id": "DEMO-CLEAN-001", "category": "EOA_RENEWAL", "submitted_on": "2026-10-12",
        "requested_intake": 480, "required_documents": ["affidavit", "fire_noc"],
        "documents": [
            {"type": "affidavit", "valid_till": None},
            {"type": "fire_noc", "valid_till": "2027-03-31"},
        ],
        "record": {"approved_intake": 480, "source": "synthetic_authorized_record", "simulated": True},
    },
    "DEMO-ISSUES-001": {
        "id": "DEMO-ISSUES-001", "category": "EOA_RENEWAL", "submitted_on": "2026-10-12",
        "requested_intake": 540, "required_documents": ["affidavit", "fire_noc"],
        "documents": [{"type": "fire_noc", "valid_till": "2026-03-31"}],
        "record": {"approved_intake": 480, "source": "synthetic_authorized_record", "simulated": True},
    },
}
