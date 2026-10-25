"""
Records Adapter (Authorised AICTE Data; Simulated) - Guide §11.5.

All returned records are wrapped in a Record envelope:
{
    "data": { ... },
    "source_version": "2026.1",
    "fetched_at": "...",
    "simulated": True
}
Returning None indicates 'no record returned' which downstream rules treat as
NOT_CHECKED, never as 'does not exist'.
"""

from datetime import datetime, timezone
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class RecordsAdapter(Protocol):
    simulated: bool = True

    def institute(self, aicte_id: str) -> dict[str, Any] | None: ...
    def approved_programmes(self, aicte_id: str, year: int | None = None) -> dict[str, Any] | None: ...
    def previous_eoa(self, aicte_id: str) -> dict[str, Any] | None: ...
    def deficiencies(self, aicte_id: str, year: int | None = None) -> dict[str, Any] | None: ...
    def ter_payment(self, aicte_id: str, year: int | None = None) -> dict[str, Any] | None: ...
    def faculty(self, aicte_id: str) -> dict[str, Any] | None: ...
    def faculty_listed_elsewhere(self, id_hmac: str) -> dict[str, Any] | None: ...
    def application_history(self, aicte_id: str) -> dict[str, Any] | None: ...


def _envelope(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "data": data,
        "source_version": "2026.1",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "simulated": True,
    }


class MockRecordsAdapter:
    """
    In-memory mock adapter serving synthetic authorized records for testing and demo.
    Always flags simulated=True. Returns None for unknown IDs.
    """

    def __init__(self):
        self.simulated: bool = True

        self._institutes = {
            "1-10998877": {
                "aicte_id": "1-10998877",
                "name": "Apex Institute of Technology Private Limited",
                "address": "Plot 42, Knowledge Park III, Greater Noida",
                "state": "Uttar Pradesh",
                "district": "Gautam Buddha Nagar",
                "institution_type": "Private-Self Financing",
                "established_year": 2008,
            },
            "1-10998878": {
                "aicte_id": "1-10998878",
                "name": "Beacon College of Engineering",
                "address": "Sector 62, Institutional Area, Noida",
                "state": "Uttar Pradesh",
                "district": "Gautam Buddha Nagar",
                "institution_type": "Private-Self Financing",
                "established_year": 2012,
            },
        }

        self._approved_programmes = {
            "1-10998877": {
                "approved_intake": 480,
                "academic_year": "2025-2026",
                "programmes": [
                    {"name": "Computer Science & Engineering", "level": "UG", "intake": 180},
                    {"name": "Electronics & Communication Engineering", "level": "UG", "intake": 120},
                    {"name": "Mechanical Engineering", "level": "UG", "intake": 180},
                ],
            },
            "1-10998878": {
                "approved_intake": 480,
                "academic_year": "2025-2026",
                "programmes": [
                    {"name": "Computer Science & Engineering", "level": "UG", "intake": 240},
                    {"name": "Information Technology", "level": "UG", "intake": 240},
                ],
            },
        }

        self._previous_eoa = {
            "1-10998877": {
                "academic_year": "2025-2026",
                "status": "APPROVED",
                "eoa_number": "AICTE/NORTH/1-10998877/2025/EOA",
                "issued_date": "2025-05-15",
            },
            "1-10998878": {
                "academic_year": "2025-2026",
                "status": "APPROVED",
                "eoa_number": "AICTE/NORTH/1-10998878/2025/EOA",
                "issued_date": "2025-05-20",
            },
        }

        self._deficiencies = {
            "1-10998877": {
                "count": 0,
                "has_deficiency": False,
                "items": [],
            },
            "1-10998878": {
                "count": 1,
                "has_deficiency": True,
                "items": ["Faculty Cadre Ratio Deficiency: Professor cadre shortfall"],
            },
        }

        self._ter_payments = {
            "1-10998877": {
                "status": "PAID",
                "amount_due": 100000.0,
                "amount_paid": 100000.0,
                "currency": "INR",
                "paid_on": "2026-09-15",
                "receipt_no": "TER/2026/88921",
                "payment_mode": "ONLINE_PORTAL",
            },
            "1-10998878": {
                "status": "PENDING",
                "amount_due": 100000.0,
                "amount_paid": 0.0,
                "currency": "INR",
                "paid_on": None,
                "receipt_no": None,
                "payment_mode": None,
            },
        }

        self._faculty = {
            "1-10998877": {
                "total_faculty": 64,
                "cadre_ratio_adequate": True,
                "professors": 8,
                "associate_professors": 16,
                "assistant_professors": 40,
            },
            "1-10998878": {
                "total_faculty": 38,
                "cadre_ratio_adequate": False,
                "professors": 2,
                "associate_professors": 6,
                "assistant_professors": 30,
            },
        }

        self._application_history = {
            "1-10998877": [
                {"year": "2025-2026", "category": "EOA_RENEWAL", "status": "APPROVED"},
                {"year": "2024-2025", "category": "EOA_RENEWAL", "status": "APPROVED"},
            ],
            "1-10998878": [
                {"year": "2025-2026", "category": "EOA_RENEWAL", "status": "APPROVED"},
            ],
        }

    def institute(self, aicte_id: str) -> dict[str, Any] | None:
        if not aicte_id or aicte_id not in self._institutes:
            return None
        return _envelope(self._institutes[aicte_id])

    def approved_programmes(self, aicte_id: str, year: int | None = None) -> dict[str, Any] | None:
        if not aicte_id or aicte_id not in self._approved_programmes:
            return None
        return _envelope(self._approved_programmes[aicte_id])

    def previous_eoa(self, aicte_id: str) -> dict[str, Any] | None:
        if not aicte_id or aicte_id not in self._previous_eoa:
            return None
        return _envelope(self._previous_eoa[aicte_id])

    def deficiencies(self, aicte_id: str, year: int | None = None) -> dict[str, Any] | None:
        if not aicte_id or aicte_id not in self._deficiencies:
            return None
        return _envelope(self._deficiencies[aicte_id])

    def ter_payment(self, aicte_id: str, year: int | None = None) -> dict[str, Any] | None:
        if not aicte_id or aicte_id not in self._ter_payments:
            return None
        return _envelope(self._ter_payments[aicte_id])

    def faculty(self, aicte_id: str) -> dict[str, Any] | None:
        if not aicte_id or aicte_id not in self._faculty:
            return None
        return _envelope(self._faculty[aicte_id])

    def faculty_listed_elsewhere(self, id_hmac: str) -> dict[str, Any] | None:
        # Phase C capability placeholder
        return None

    def application_history(self, aicte_id: str) -> dict[str, Any] | None:
        if not aicte_id or aicte_id not in self._application_history:
            return None
        return _envelope({"history": self._application_history[aicte_id]})


default_records_adapter = MockRecordsAdapter()
