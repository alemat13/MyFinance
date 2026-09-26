"""QIF (Quicken Interchange Format) support for the import screen.

A QIF file is turned into the same CSV text the CSV import already reads, with
fixed Date/Payee/Amount/Memo/Category headers, so detection, preview, duplicate
checks and commit all stay the CSV pipeline's. Only the cash-like account
types (Bank, CCard, Cash, Oth A, Oth L) carry importable transactions; every
other section (investments, category and class lists, account lists) is skipped.
"""
import csv
import io
import re

from rules import RuleViolation

QIF_HEADERS = ["Date", "Payee", "Amount", "Memo", "Category"]
# Anything written out by this module goes through csv.writer with this delimiter.
QIF_DELIMITER = ","

_TRANSACTION_TYPES = {"bank", "ccard", "cash", "oth a", "oth l"}
# d/m/y or m/d/y with '/', '-', '.' or Quicken's "'" before the year, and
# Quicken's space padding ("1/ 5'98").
_DMY_DATE = re.compile(r"^(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*['/.\-]\s*(\d{2}|\d{4})$")
_YMD_DATE = re.compile(r"^(\d{4})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{1,2})$")


def is_qif(text: str) -> bool:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped.startswith("!")
    return False


def normalize_qif_date(raw: str) -> str:
    """Pad and expand a QIF date without deciding day-first vs month-first.

    The result ("05/01/1998" or "1998-01-05") is left for the regular date-format
    detection, which the user can still override on the confirm step.
    """
    value = raw.strip()
    match = _YMD_DATE.match(value)
    if match:
        year, month, day = match.groups()
        return f"{year}-{int(month):02d}-{int(day):02d}"
    match = _DMY_DATE.match(value)
    if not match:
        return value
    first, second, year = match.groups()
    if len(year) == 2:
        # Exporters disagree on what "'" means for the century, so the usual pivot decides.
        year = f"20{year}" if int(year) < 70 else f"19{year}"
    return f"{int(first):02d}/{int(second):02d}/{year}"


def _category(raw: str) -> str:
    value = raw.strip()
    # [Account name] marks a transfer, not a category.
    if value.startswith("[") and value.endswith("]"):
        return ""
    # "Category/Class": the class isn't something MyFinance has.
    return value.split("/", 1)[0].strip()


def parse_qif(text: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    in_transactions = False
    current: dict[str, str] = {}
    for line in text.splitlines():
        line = line.rstrip("\r\n")
        if not line.strip():
            continue
        if line.startswith("!"):
            header = line[1:].strip().lower()
            if header.startswith("type:"):
                in_transactions = header[5:].strip() in _TRANSACTION_TYPES
            elif header.startswith("option:") or header.startswith("clear:"):
                continue
            else:
                in_transactions = False
            current = {}
            continue
        if not in_transactions:
            continue
        code, value = line[0], line[1:]
        if code == "^":
            if current:
                rows.append(current)
            current = {}
        elif code == "D":
            current["Date"] = normalize_qif_date(value)
        elif code in ("T", "U") and "Amount" not in current:
            current["Amount"] = value.strip()
        elif code == "P":
            current["Payee"] = value.strip()
        elif code == "M":
            current["Memo"] = value.strip()
        elif code == "L":
            current["Category"] = _category(value)
        # Split lines (S/E/$), check numbers (N), cleared status (C) and
        # addresses (A) have no MyFinance counterpart: the total (T) is imported.
    if current:
        rows.append(current)

    if not rows:
        raise RuleViolation(
            "This QIF file has no bank or credit card transactions to import "
            "(only !Type:Bank, CCard, Cash, Oth A and Oth L sections are read)."
        )
    for row in rows:
        # No payee is common in QIF; the memo is the next best label.
        if not row.get("Payee"):
            row["Payee"] = row.get("Memo", "")
    return rows


def qif_to_csv_text(text: str) -> str:
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=QIF_HEADERS, delimiter=QIF_DELIMITER, extrasaction="ignore")
    writer.writeheader()
    for row in parse_qif(text):
        writer.writerow({h: row.get(h, "") for h in QIF_HEADERS})
    return out.getvalue()
