from datetime import date


def compute_accounting_month(d: date, offset: int) -> str:
    """The "YYYY-MM" a transaction counts toward: d's month shifted by offset months."""
    total = d.year * 12 + (d.month - 1) + offset
    return f"{total // 12:04d}-{total % 12 + 1:02d}"
