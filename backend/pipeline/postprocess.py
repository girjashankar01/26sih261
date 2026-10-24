"""
Branch B Post-processing Module (Guide §9).

Implements:
- Indian financial symbol normalisation (backtick, Rs, Rs., INR -> ₹)
- Indic numeral transliteration and Indian number scaling (lakh, crore)
- Cell-level repair rules with raw text preservation
- Deterministic table arithmetic verification (§9.3)
"""

from decimal import Decimal
import re
from typing import Any

# Indic script digit bases: Devanagari to Malayalam
BASES = (0x0966, 0x09E6, 0x0A66, 0x0AE6, 0x0B66, 0x0BE6, 0x0C66, 0x0CE6, 0x0D66)
DIGITS = str.maketrans({chr(b + i): str(i) for b in BASES for i in range(10)})

UNITS = {
    "lakh": Decimal("1e5"),
    "lakhs": Decimal("1e5"),
    "lac": Decimal("1e5"),
    "lacs": Decimal("1e5"),
    "crore": Decimal("1e7"),
    "crores": Decimal("1e7"),
    "cr": Decimal("1e7"),
    "cr.": Decimal("1e7"),
}

CUR_PREFIX = re.compile(r"^\s*(?:`|rs\.?|inr|₹|\?|[TtZzE](?=\d))\s*", re.IGNORECASE)
MONEY_HEADER = re.compile(r"(?:fee|amount|rs|inr|₹|cost|total|lakh|crore|stipend|salary)", re.IGNORECASE)
TOTAL_ROW = re.compile(r"^\s*(?:grand\s+)?total\b", re.IGNORECASE)
NUMERIC_COL = re.compile(r"(?:intake|area|fee|amount|capacity|enrolment|count|seats|total)", re.IGNORECASE)
DIGIT_CONFUSIONS = str.maketrans({"O": "0", "o": "0", "l": "1", "I": "1", "|": "1"})


def normalise_currency_symbols(text: str) -> str:
    """Normalise older Indian backtick rupee glyph or Rs/INR variants to ₹."""
    if not text:
        return ""
    # Replace backtick when used before a digit (with or without spaces)
    t = re.sub(r"`\s*(?=\d)", "₹ ", text)
    # Replace Rs/Rs./INR with ₹
    t = re.sub(r"\b(?:Rs\.?|INR)\s*(?=\d)", "₹ ", t, flags=re.IGNORECASE)
    return t


def parse_indian_number(s: str) -> Decimal | None:
    """
    Parse an Indian formatted number string into Decimal (Guide §9.2).
    Examples:
      '1,45,000.50' -> 145000.50
      '2.5 Cr'      -> 25000000
      'Rs. 12 Lakhs'-> 1200000
    """
    if not s or not s.strip():
        return None
    
    # Strip currency prefix and transliterate any Indic script digits
    t = CUR_PREFIX.sub("", s.translate(DIGITS).strip()).replace(",", "")
    
    m = re.fullmatch(r"(-?\d+(?:\.\d+)?)\s*([A-Za-z.]+)?", t)
    if not m:
        return None
    
    try:
        val = Decimal(m.group(1))
    except Exception:
        return None
        
    unit = (m.group(2) or "").lower()
    if unit:
        if unit not in UNITS:
            return None
        return val * UNITS[unit]
    
    return val


def normalise_table_cells(
    cells: list[dict[str, Any]],
    n_rows: int,
    n_cols: int
) -> list[dict[str, Any]]:
    """
    Normalise table cells in-place following the precedence rules in Guide §9.2.
    Preserves raw cell text unconditionally in cell['raw'].
    """
    # Detect header strings per column from row 0
    col_headers = {}
    for cell in cells:
        if cell.get("r") == 0:
            c = cell.get("c", 0)
            col_headers[c] = cell.get("raw", "")

    for cell in cells:
        raw = cell.get("raw", "").strip()
        cell["raw"] = raw
        cell["repaired"] = False
        cell["kind"] = "text"
        cell["value"] = None
        
        c = cell.get("c", 0)
        header = col_headers.get(c, "")
        is_money_col = bool(MONEY_HEADER.search(header))
        is_numeric_col = is_money_col or bool(NUMERIC_COL.search(header))

        # Step 1: Currency repair on OCR symbol confusion (?5000, T5000 -> ₹5000)
        if is_money_col and re.match(r"^[?TtZzE]\s*\d", raw):
            repaired_text = "₹ " + re.sub(r"^[?TtZzE]\s*", "", raw)
            cell["repaired"] = True
            cell["currency"] = "INR"
            parsed = parse_indian_number(repaired_text)
            if parsed is not None:
                cell["value"] = str(parsed)
                cell["kind"] = "money"
            continue

        # Step 2: Letter-to-digit confusions (e.g. 1O,OOO -> 10,000) in numeric column
        if is_numeric_col and re.search(r"\d", raw) and re.search(r"[OolI|]", raw):
            candidate = raw.translate(DIGIT_CONFUSIONS)
            parsed = parse_indian_number(candidate)
            if parsed is not None:
                cell["repaired"] = True
                cell["value"] = str(parsed)
                cell["kind"] = "money" if is_money_col else "number"
                if is_money_col:
                    cell["currency"] = "INR"
                continue

        # Step 3: Standard numeric parsing
        parsed = parse_indian_number(raw)
        if parsed is not None:
            cell["value"] = str(parsed)
            if is_money_col or "₹" in raw or "rs" in raw.lower() or "inr" in raw.lower():
                cell["kind"] = "money"
                cell["currency"] = "INR"
            else:
                cell["kind"] = "number"
        else:
            cell["kind"] = "text"
            cell["value"] = None

    return cells


def check_table_arithmetic(
    table: dict[str, Any]
) -> list[dict[str, Any]]:
    r"""
    Execute deterministic table sum checks (Guide §9.3).
    Find the first row whose first cell matches ^\s*(grand\s+)?total\b at index >= 2.
    For each column where total cell and >= 2 body cells are numeric:
      compare sum(body) to total with Decimal.
    Returns list of C2 tamper/anomaly flags.
    """
    flags = []
    cells = table.get("cells", [])
    n_rows = table.get("n_rows", 0)
    n_cols = table.get("n_cols", 0)
    table_id = table.get("table_id", "T1")
    page = table.get("page", 1)

    # Index cells by (r, c)
    grid: dict[tuple[int, int], dict[str, Any]] = {}
    for cell in cells:
        grid[(cell["r"], cell["c"])] = cell

    # Find total row at index >= 2
    total_r = -1
    for r in range(2, n_rows):
        first_cell = grid.get((r, 0))
        if first_cell and TOTAL_ROW.search(first_cell.get("raw", "")):
            total_r = r
            break

    if total_r == -1:
        return flags

    for c in range(n_cols):
        total_cell = grid.get((total_r, c))
        if not total_cell or total_cell.get("value") is None:
            continue

        try:
            expected_total = Decimal(str(total_cell["value"]))
        except Exception:
            continue

        body_values = []
        body_cells = []
        has_repaired = total_cell.get("repaired", False)

        for r in range(1, total_r):
            body_cell = grid.get((r, c))
            if body_cell and body_cell.get("value") is not None:
                try:
                    val = Decimal(str(body_cell["value"]))
                    body_values.append(val)
                    body_cells.append(body_cell)
                    if body_cell.get("repaired"):
                        has_repaired = True
                except Exception:
                    pass

        if len(body_values) >= 2:
            computed_sum = sum(body_values)
            # Compare with tolerance for paise (0.50), exact for integer counts
            tolerance = Decimal("0.50") if "." in str(total_cell["value"]) else Decimal("0.0")
            diff = abs(computed_sum - expected_total)

            if diff > tolerance:
                flags.append({
                    "code": "TABLE_SUM_MISMATCH",
                    "severity": "medium",
                    "advisory": True,
                    "table_id": table_id,
                    "page": page,
                    "col": c,
                    "computed_sum": str(computed_sum),
                    "reported_total": str(expected_total),
                    "evidence": {
                        "total_raw": total_cell.get("raw"),
                        "total_value": total_cell.get("value"),
                        "summand_count": len(body_values),
                        "summands": [str(v) for v in body_values]
                    },
                    "reason": (
                        f"Computed column sum ({computed_sum}) differs from reported total ({expected_total}) "
                        f"in table {table_id} on page {page}"
                    )
                })
                if has_repaired:
                    flags.append({
                        "code": "OCR_REPAIRED_VALUES_IN_SUM",
                        "severity": "info",
                        "advisory": True,
                        "table_id": table_id,
                        "page": page,
                        "reason": f"Table arithmetic mismatch involves OCR-repaired values in table {table_id}"
                    })

    return flags
