"""
Explicit Indian Date Parsing Policy (Guide §11.4).

Policy:
- Day-first for Indian dates (DD/MM/YYYY or DD-MM-YYYY).
- Four-digit years only; a two-digit year (e.g. 31/03/26) or a textual date without
  a year returns 'ambiguous' (-> NEEDS_REVIEW), never an automated guess.
- Translates Indic numerals and handles ordinal suffixes (31st -> 31).
- Returns (datetime.date | None, "ok" | "ambiguous" | "invalid").
"""

from datetime import date
import re
from dateutil import parser as dparser

ORD = re.compile(r"(\d+)(?:st|nd|rd|th)\b", re.IGNORECASE)
BASES = (0x0966, 0x09E6, 0x0A66, 0x0AE6, 0x0B66, 0x0BE6, 0x0C66, 0x0CE6, 0x0D66)
DIGITS = str.maketrans({chr(b + i): str(i) for b in BASES for i in range(10)})
MONTH_OR_DIGIT = re.compile(
    r"(?i)\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\d"
)


def parse_date(s: str) -> tuple[date | None, str]:
    """
    Parse date according to Guide §11.4 explicit policy.
    Returns: (parsed_date, status) where status in ('ok', 'ambiguous', 'invalid').
    """
    if not s or not s.strip():
        return None, "invalid"

    # Translate regional digits and strip ordinals (e.g. 31st -> 31)
    t = ORD.sub(r"\1", s.translate(DIGITS)).strip()

    # If string contains no date-like elements (no month names, no digits), it's invalid
    if not MONTH_OR_DIGIT.search(t):
        return None, "invalid"

    # Rule: two-digit year or no 4-digit year is AMBIGUOUS
    if re.fullmatch(r"\d{1,2}[./-]\d{1,2}[./-]\d{2}", t) or not re.search(r"\b\d{4}\b", t):
        return None, "ambiguous"

    # Standard numeric pattern: DD/MM/YYYY or DD-MM-YYYY
    m = re.fullmatch(r"(\d{1,2})[./-](\d{1,2})[./-](\d{4})", t)
    if m:
        d, mo, y = map(int, m.groups())
        try:
            return date(y, mo, d), "ok"
        except ValueError:
            return None, "invalid"

    # Textual / verbose parsing: dayfirst=True for India
    try:
        dt = dparser.parse(t, dayfirst=True, fuzzy=False)
        return dt.date(), "ok"
    except (ValueError, OverflowError):
        # Retry with fuzzy=True only if 4-digit year is preserved
        try:
            dt = dparser.parse(t, dayfirst=True, fuzzy=True)
            return dt.date(), "ok"
        except Exception:
            return None, "invalid"
