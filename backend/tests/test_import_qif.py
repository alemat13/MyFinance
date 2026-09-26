import pytest

from import_qif import normalize_qif_date, parse_qif
from rules import RuleViolation

QIF_TEXT = """!Type:Bank
D15/01/2026
T-42,50
PCB CARREFOUR MARKET
MCourses
LTest Salary
^
D16/01/2026
T1200,00
PVIREMENT SALAIRE
LRevenus:Test Salary
^
D17/01/2026
T-10,00
MRetrait sans libelle
L[Livret A]
^
"""


def _qif_file(text: str = QIF_TEXT, encoding: str = "utf-8"):
    return {"file": ("releve.qif", text.encode(encoding), "application/qif")}


@pytest.mark.parametrize("raw,expected", [
    ("15/01/2026", "15/01/2026"),
    ("5/1/2026", "05/01/2026"),
    ("1/ 5'98", "01/05/1998"),
    ("1/5'05", "01/05/2005"),
    ("01/05/05", "01/05/2005"),
    ("01/05/98", "01/05/1998"),
    ("15.01.2026", "15/01/2026"),
    ("15-01-2026", "15/01/2026"),
    ("2026-01-15", "2026-01-15"),
    ("2026/1/5", "2026-01-05"),
])
def test_normalize_qif_date(raw, expected):
    assert normalize_qif_date(raw) == expected


def test_parse_qif_reads_bank_records_and_skips_other_sections():
    text = """!Option:AutoSwitch
!Account
NCompte courant
TBank
^
!Clear:AutoSwitch
!Type:Cat
NAlimentation
E
^
!Type:CCard
D03/02/2026
U-9.99
PNETFLIX
LLoisirs/Famille
^
!Type:Invst
D04/02/2026
NBuy
T100.00
^
"""
    rows = parse_qif(text)
    assert rows == [{"Date": "03/02/2026", "Amount": "-9.99", "Payee": "NETFLIX", "Category": "Loisirs"}]


def test_parse_qif_ignores_split_lines_and_falls_back_to_memo_for_payee():
    text = """!Type:Bank
D03/02/2026
T-30.00
MCourses et essence
SAlimentation
$-20.00
SCarburant
$-10.00
^"""
    rows = parse_qif(text)
    assert rows == [{"Date": "03/02/2026", "Amount": "-30.00", "Memo": "Courses et essence", "Payee": "Courses et essence"}]


def test_parse_qif_rejects_file_without_transactions():
    with pytest.raises(RuleViolation):
        parse_qif("!Type:Cat\nNAlimentation\n^\n")


def test_import_detect_reads_qif(client):
    response = client.post("/api/import/detect", files=_qif_file())
    assert response.status_code == 200
    body = response.json()
    assert body["file_format"] == "qif"
    assert body["delimiter"] == ","
    assert body["date_format"] == "%d/%m/%Y"
    assert body["decimal_separator"] == ","
    assert body["headers"] == ["Date", "Payee", "Amount", "Memo", "Category"]
    assert body["column_mapping"] == {
        "date": "Date", "payee": "Payee", "amount": "Amount",
        "memo": "Memo", "category": "Category", "account": None,
    }
    assert body["sample_rows"][0] == {
        "Date": "15/01/2026", "Payee": "CB CARREFOUR MARKET", "Amount": "-42,50",
        "Memo": "Courses", "Category": "Test Salary",
    }
    assert body["sample_rows"][2]["Payee"] == "Retrait sans libelle"
    assert body["sample_rows"][2]["Category"] == ""


def test_import_detect_reads_cp1252_qif(client):
    text = "!Type:Bank\nD15/01/2026\nT-12,50\nPCafé Central\n^\n"
    response = client.post("/api/import/detect", files=_qif_file(text, "cp1252"))
    assert response.status_code == 200
    body = response.json()
    assert body["encoding"] == "cp1252"
    assert body["sample_rows"][0]["Payee"] == "Café Central"


def test_import_detect_rejects_qif_without_transactions(client):
    response = client.post("/api/import/detect", files=_qif_file("!Type:Cat\nNAlimentation\n^\n"))
    assert response.status_code == 422


def test_import_preview_reads_qif(client, sample_account, sample_category):
    detected = client.post("/api/import/detect", files=_qif_file()).json()
    response = client.post("/api/import/preview", files=_qif_file(), data={
        "account_id": sample_account.id,
        "encoding": detected["encoding"],
        # Whatever delimiter comes back, a QIF file is always read as the converted CSV.
        "delimiter": ";",
        "date_format": detected["date_format"],
        "decimal_separator": detected["decimal_separator"],
        "date_col": "Date", "payee_col": "Payee", "amount_col": "Amount",
        "memo_col": "Memo", "category_col": "Category",
    })
    assert response.status_code == 200
    rows = response.json()
    assert [r["status"] for r in rows] == ["ok", "ok", "needs_category"]
    assert rows[0]["transaction_date"] == "2026-01-15"
    assert rows[0]["amount"] == -42.5
    assert rows[0]["payee"] == "CB CARREFOUR MARKET"
    assert rows[0]["memo"] == "Courses"
    # "Parent:Child" falls back to the subcategory's own name.
    assert rows[1]["category_id"] == sample_category.id
    assert rows[1]["amount"] == 1200.0
