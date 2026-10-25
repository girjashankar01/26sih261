"""
Entity Resolution and Name Comparison Logic (Guide §11.4).

Policy:
- Core names and legal forms are compared separately (P1-2).
- Abbreviations are expanded (e.g. inst -> institute, engg -> engineering).
- Legal form tokens are classified into canonical forms (pvt/private, ltd/limited, trust, society, etc.).
- Subsets return 'PARTIAL' (token_set_ratio is avoided because it gives 100 on subsets).
- Fuzzy token_sort_ratio is evaluated on the core names (threshold: 90).
- Comparison produces: MATCH | LEGAL_FORM_DIFFERS | PARTIAL | DIFFERENT.
- ID normalization strips spaces, dashes, slashes, and translates Indic numerals.
"""

from typing import FrozenSet, Tuple
import re
from rapidfuzz import fuzz

LEGAL = {
    "pvt": "private",
    "private": "private",
    "ltd": "limited",
    "limited": "limited",
    "trust": "trust",
    "society": "society",
    "llp": "llp",
    "foundation": "foundation",
}

ABBR = {
    "inst": "institute",
    "engg": "engineering",
    "tech": "technology",
    "univ": "university",
    "coll": "college",
    "mgmt": "management",
}

STOP_WORDS = {"the", "of", "and", "&"}

BASES = (0x0966, 0x09E6, 0x0A66, 0x0AE6, 0x0B66, 0x0BE6, 0x0C66, 0x0CE6, 0x0D66)
DIGITS = str.maketrans({chr(b + i): str(i) for b in BASES for i in range(10)})


def split_name(s: str) -> Tuple[str, FrozenSet[str]]:
    """
    Split a name into (core_name, frozenset(legal_forms)).
    Normalizes abbreviations, removes punctuation and stop words.
    """
    if not s or not s.strip():
        return "", frozenset()

    toks = [ABBR.get(w, w) for w in re.sub(r"[^\w\s]", " ", s.lower()).split()]
    core = " ".join(w for w in toks if w not in LEGAL and w not in STOP_WORDS)
    legal_forms = frozenset(LEGAL[w] for w in toks if w in LEGAL)
    return core, legal_forms


def name_compare(a: str, b: str, thr: int = 90) -> str:
    """
    Compare two institution or trust names according to Guide §11.4:
    Returns:
    - MATCH: Core names match and legal forms match.
    - LEGAL_FORM_DIFFERS: Core names match but legal forms differ (e.g. Trust vs Society).
    - PARTIAL: One core name's tokens are a strict subset of the other's.
    - DIFFERENT: Core names fail the similarity threshold.
    """
    if not a or not b:
        return "DIFFERENT"

    (ca, la), (cb, lb) = split_name(a), split_name(b)
    if not ca and not cb:
        return "MATCH" if la == lb else "LEGAL_FORM_DIFFERS"
    if not ca or not cb:
        return "DIFFERENT"

    sa, sb = set(ca.split()), set(cb.split())
    if sa < sb or sb < sa:
        return "PARTIAL"

    if fuzz.token_sort_ratio(ca, cb) < thr:
        return "DIFFERENT"

    return "MATCH" if la == lb else "LEGAL_FORM_DIFFERS"


def norm_id(s: str) -> str:
    """
    Normalize registration / certificate / AICTE identifier:
    - Translates Indic digits to ASCII.
    - Strips whitespace, hyphens, and slashes.
    - Uppercases alphanumeric characters.
    """
    if not s:
        return ""
    return re.sub(r"[\s\-/]", "", s.upper().translate(DIGITS))
