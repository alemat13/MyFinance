import re
from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Alias used where a model field is itself named `date`: pydantic v2 resolves
# annotations using the class's own namespace, and a field named the same as
# its type (with a default) gets shadowed by that default there, so the bare
# `date` name can't be used as the annotation in that case.
_DateType = date


class UserOut(BaseModel):
    id: int
    name: str
    email: str | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class UserCreate(BaseModel):
    name: str
    email: str | None = None


class UserUpdate(BaseModel):
    name: str | None = None
    email: str | None = None


class AccountUserOut(BaseModel):
    user_id: int
    user_name: str
    ownership_percentage: float
    model_config = ConfigDict(from_attributes=True)


class AccountUserCreate(BaseModel):
    user_id: int
    ownership_percentage: float


def _validate_currency_code(value: str) -> str:
    value = value.strip().upper()
    if len(value) != 3 or not value.isalpha():
        raise ValueError(f"Currency must be a 3-letter code, got '{value}'")
    return value


class AccountSplitWeightOut(BaseModel):
    user_id: int
    user_name: str
    weight: int
    model_config = ConfigDict(from_attributes=True)


class AccountSplitWeightUpdateItem(BaseModel):
    user_id: int
    weight: int


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str
    balance: float
    currency: str
    created_at: datetime
    archived: bool = False
    users: list[AccountUserOut] = []
    split_weights: list[AccountSplitWeightOut] = []
    # Only filled by GET /api/dashboard; None elsewhere, or when the account
    # has no transactions.
    last_transaction_date: date | None = None


class AccountCreate(BaseModel):
    name: str
    type: str
    balance: float = 0.0
    currency: str = "EUR"
    users: list[AccountUserCreate] = []

    @field_validator("currency")
    @classmethod
    def _validate_currency(cls, value: str) -> str:
        return _validate_currency_code(value)


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    balance: Optional[float] = None
    currency: Optional[str] = None
    archived: Optional[bool] = None
    users: list[AccountUserCreate] | None = None

    @field_validator("currency")
    @classmethod
    def _validate_currency(cls, value: str | None) -> str | None:
        return _validate_currency_code(value) if value is not None else None


class CategorySplitOut(BaseModel):
    user_id: int
    user_name: str
    weight: int
    model_config = ConfigDict(from_attributes=True)


class CategorySplitCreate(BaseModel):
    user_id: int
    weight: int


_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

# Keep in sync with CATEGORY_ICON_NAMES in frontend/src/utils/categoryIcons.ts.
_VALID_CATEGORY_ICONS = {
    "ShoppingCart", "Home", "Utensils", "Car", "Plane", "Wifi", "Tv", "Music", "Heart", "PiggyBank",
    "Landmark", "Briefcase", "GraduationCap", "Gift", "Gamepad2", "Dumbbell", "Stethoscope",
    "Fuel", "CreditCard", "Wallet", "Coffee", "ShoppingBag", "Dog", "Smartphone", "ArrowLeftRight",
    "Shield", "Zap", "TrainFront", "Bus", "Mail", "Receipt", "TrendingUp", "Baby", "Sofa", "Shirt",
    "Scissors", "Banknote", "Ticket", "Sparkles", "Laptop", "BookOpen", "Film", "Palette", "Trophy",
    "Hammer", "Flower2", "HeartHandshake", "ParkingCircle", "Ship", "Sandwich", "Umbrella",
    "Building2", "School", "Bike", "PartyPopper",
}


def _validate_category_color(value: str | None) -> str | None:
    if value is None:
        return None
    if not _COLOR_RE.match(value):
        raise ValueError(f"color must be a '#RRGGBB' hex string, got '{value}'")
    return value


def _validate_category_icon(value: str | None) -> str | None:
    if value is None:
        return None
    if value not in _VALID_CATEGORY_ICONS:
        raise ValueError(f"Unknown category icon '{value}'")
    return value


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str
    color: str | None = None
    icon: str | None = None
    parent_id: int | None = None
    parent_name: str | None = None
    splits: list[CategorySplitOut] = []


# The only category types accepted. Charts count Income and Expense; anything
# filed under "Transfer, other" stays out of every income/expense figure.
# Alembic 0020 moved every older free-text value onto this list.
CATEGORY_TYPES = ("Income", "Expense", "Transfer, other")
CategoryType = Literal["Income", "Expense", "Transfer, other"]


def normalize_category_type(value):
    """Maps a type outside CATEGORY_TYPES onto the last one, as Alembic 0020 did."""
    return value if value in CATEGORY_TYPES else CATEGORY_TYPES[-1]


class CategoryCreate(BaseModel):
    name: str
    type: CategoryType
    color: str | None = None
    icon: str | None = None
    parent_id: int | None = None
    splits: list[CategorySplitCreate] = []

    @field_validator("color")
    @classmethod
    def _validate_color(cls, value: str | None) -> str | None:
        return _validate_category_color(value)

    @field_validator("icon")
    @classmethod
    def _validate_icon(cls, value: str | None) -> str | None:
        return _validate_category_icon(value)


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[CategoryType] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    parent_id: int | None = None
    splits: list[CategorySplitCreate] | None = None

    @field_validator("color")
    @classmethod
    def _validate_color(cls, value: str | None) -> str | None:
        return _validate_category_color(value)

    @field_validator("icon")
    @classmethod
    def _validate_icon(cls, value: str | None) -> str | None:
        return _validate_category_icon(value)


class GlobalSplitWeightOut(BaseModel):
    user_id: int
    user_name: str
    weight: int
    model_config = ConfigDict(from_attributes=True)


class GlobalSplitWeightUpdateItem(BaseModel):
    user_id: int
    weight: int


class SplitWeightCreate(BaseModel):
    user_id: int
    weight: int


class TransactionSplitOut(BaseModel):
    user_id: int
    user_name: str
    weight: int
    share_amount: float
    source: str
    model_config = ConfigDict(from_attributes=True)


class UserBalanceOut(BaseModel):
    user_id: int
    user_name: str
    currency: str
    net_position: float


class TagRef(BaseModel):
    """A tag as a transaction carries it."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    color: Optional[str] = None


class TagOut(TagRef):
    """A tag as the tag list shows it, with how many transactions carry it."""
    transaction_count: int = 0


class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    color: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("A tag needs a name.")
        if any(c in value for c in ",;|"):
            # They separate several tags in one cell of an exported/imported CSV.
            raise ValueError("A tag name cannot contain , ; or |")
        return value

    @field_validator("color")
    @classmethod
    def _check_color(cls, value):
        if value is not None and not _COLOR_RE.match(value):
            raise ValueError("color must be a #RRGGBB hex value")
        return value


class TagUpdate(TagCreate):
    """Rename or recolour; omitted fields stay (exclude_unset)."""
    name: Optional[str] = Field(None, min_length=1, max_length=50)


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: _DateType
    payee: str
    memo: Optional[str] = None
    amount: float
    account_id: int
    account_name: str
    currency: str
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    category_icon: Optional[str] = None
    accounting_month_offset: int
    accounting_month: str
    reconciled: bool
    divide_group_id: Optional[int] = None
    # Read-only throughout: present here and absent from TransactionCreate /
    # TransactionUpdate, so the API can show what the source said without
    # ever letting a client rewrite it. See models.Transaction.
    raw_source: Optional[str] = None
    raw_label: Optional[str] = None
    raw_counterparty: Optional[str] = None
    raw_transaction_code: Optional[str] = None
    raw_merchant_category_code: Optional[str] = None
    raw_merchant_location: Optional[str] = None
    raw_initiated_date: Optional[date] = None
    raw_booking_date: Optional[date] = None
    splits: list[TransactionSplitOut] = []
    tags: list[TagRef] = []


class PayeeSuggestionOut(BaseModel):
    """One autocompletion entry for the Payee field: a payee as last used, the
    category it was filed under then, and that most recent transaction's date
    and amount so two similar entries can be told apart."""
    payee: str
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    date: _DateType
    amount: float
    currency: str


class TransactionCreate(BaseModel):
    date: _DateType
    payee: str
    memo: Optional[str] = None
    amount: float
    account_id: int
    category_id: Optional[int] = None
    accounting_month_offset: int = Field(0, ge=-3, le=3)
    split_weights: list[SplitWeightCreate] | None = None
    split_source: Literal["global", "account", "category", "custom"] | None = None
    # The transaction's tags, by id; omitted or empty means none.
    tag_ids: list[int] | None = None


class TransactionUpdate(BaseModel):
    date: Optional[_DateType] = None
    payee: Optional[str] = None
    memo: Optional[str] = None
    amount: Optional[float] = None
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    accounting_month_offset: Optional[int] = Field(None, ge=-3, le=3)
    reconciled: Optional[bool] = None
    split_weights: list[SplitWeightCreate] | None = None
    split_source: Literal["global", "account", "category", "custom"] | None = None
    # Replaces the whole set of tags; omitted leaves them, [] removes them all.
    tag_ids: list[int] | None = None


class TransactionRawFieldsUpdate(BaseModel):
    """Admin-mode edit of a transaction's raw, as-reported fields (the
    "As reported by the bank" section). Same exclude_unset contract as
    TransactionUpdate: an omitted key is left untouched, an explicit null (or
    a blank string) clears it. Lengths mirror the columns, so Postgres never
    sees a value it would truncate or refuse."""
    raw_source: Optional[Literal["enable_banking", "csv_import", "linxo_export"]] = None
    raw_label: Optional[str] = None
    raw_counterparty: Optional[str] = Field(None, max_length=200)
    raw_transaction_code: Optional[str] = Field(None, max_length=60)
    raw_merchant_category_code: Optional[str] = Field(None, max_length=10)
    raw_merchant_location: Optional[str] = Field(None, max_length=120)
    raw_initiated_date: Optional[_DateType] = None
    raw_booking_date: Optional[_DateType] = None

    @field_validator(
        "raw_label", "raw_counterparty", "raw_transaction_code",
        "raw_merchant_category_code", "raw_merchant_location", mode="before",
    )
    @classmethod
    def _blank_is_null(cls, value):
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value


class BulkTransactionUpdate(BaseModel):
    """Same "field omitted vs explicitly null" contract as TransactionUpdate,
    via exclude_unset: only include a key here when its section is meant to be
    applied to every selected transaction. An omitted key leaves that field
    untouched on all of them; category_id explicitly set to null clears it.
    reconciled has no null-clearing semantics (it's a plain bool, not nullable
    on the model) — omit it to leave reconciled status untouched. payee
    renames every selected transaction to the same text (stripped; blank or
    null is refused, a payee can't be cleared); the memo is never touched.
    payee_mode says what to do with that text: "replace" (the default) sets
    it as the payee, "prepend"/"append" add it before/after each row's own
    payee, taken as typed (unstripped) so a separating space can be part of it.
    "regex" (admin mode on screen) takes payee as a regular expression and
    replaces every match in each row's payee with payee_replacement, where
    $1, $2... name capture groups and $& the whole match, as in JavaScript;
    the result is stripped, and a row the pattern doesn't match is left alone."""
    category_id: Optional[int] = None
    payee: Optional[str] = None
    payee_mode: Literal["replace", "prepend", "append", "regex"] = "replace"
    payee_replacement: str = ""
    payee_ignore_case: bool = False
    # Admin mode only on screen: moves every selected transaction to this
    # account, keeping each one's own split as it is.
    account_id: Optional[int] = None
    accounting_month_offset: Optional[int] = Field(None, ge=-3, le=3)
    reconciled: Optional[bool] = None
    split_weights: list[SplitWeightCreate] | None = None
    split_source: Literal["global", "account", "category", "custom"] | None = None
    # Tags added to / removed from every selected transaction, each row
    # keeping its other tags. A tag in both lists is refused.
    add_tag_ids: list[int] | None = None
    remove_tag_ids: list[int] | None = None


class BulkUpdateTransactionsRequest(BaseModel):
    """Exactly one of transaction_ids (the rows ticked on screen) or filter
    (every transaction the Transactions screen's current filter matches, across
    all pages; its pagination and sorting fields are ignored). expected_count,
    sent with a filter, is how many rows the user was shown: if the filter now
    matches a different number (a bank sync landed in between), the request is
    refused with 409 rather than editing rows nobody saw counted."""
    transaction_ids: list[int] = []
    filter: Optional["TransactionSearchRequest"] = None
    expected_count: Optional[int] = None
    update: BulkTransactionUpdate


class BulkUpdateTransactionsResponse(BaseModel):
    updated_count: int
    transaction_ids: list[int]


class BulkDeleteTransactionsRequest(BaseModel):
    """Same selection contract as BulkUpdateTransactionsRequest: exactly one of
    transaction_ids or filter (+ expected_count, 409 if the match moved)."""
    transaction_ids: list[int] = []
    filter: Optional["TransactionSearchRequest"] = None
    expected_count: Optional[int] = None


class BulkDeleteTransactionsResponse(BaseModel):
    deleted_count: int
    transaction_ids: list[int]


class TransactionDividePart(BaseModel):
    """One resulting part of a "divide" operation (splitting a transaction's
    amount into several new transactions by category/date — unrelated to
    TransactionSplit/split_weights, which divides a transaction's amount
    among users). No account_id: every part stays on the original
    transaction's account."""
    date: _DateType
    payee: str
    memo: Optional[str] = None
    amount: float
    category_id: Optional[int] = None
    accounting_month_offset: int = Field(0, ge=-3, le=3)
    split_weights: list[SplitWeightCreate] | None = None
    split_source: Literal["global", "account", "category", "custom"] | None = None


class TransactionDivideRequest(BaseModel):
    parts: list[TransactionDividePart]


class TransactionDivideResponse(BaseModel):
    transactions: list[TransactionOut]


TEXT_OPERATORS = {"contains", "equals", "not_equals", "starts_with", "ends_with"}
NUMERIC_OPERATORS = {"eq", "ne", "gt", "gte", "lt", "lte", "between"}
DATE_OPERATORS = {"on", "before", "after", "between"}
TEXT_FIELDS = {
    "payee", "memo", "raw_label",
    "raw_counterparty", "raw_transaction_code", "raw_merchant_category_code", "raw_merchant_location",
}
# created_at is when the row reached MyFinance ("Added on"), compared by day.
DATE_FIELDS = {"date", "raw_initiated_date", "raw_booking_date", "created_at"}
NUMERIC_FIELDS = {"amount", "account_id", "category_id", "accounting_month_offset"}
# "Reconciled is Yes / No"; the value is a boolean (or "true"/"false").
BOOL_FIELDS = {"reconciled"}
BOOL_OPERATORS = {"eq"}
# "Has tag" / "does not have tag"; with no tag named, "has no tag at all" /
# "has at least one tag" (is / is not), like the uncategorized category_id.
TAG_FIELDS = {"tag_id"}
TAG_OPERATORS = {"eq", "ne"}
# Per-user figures of a transaction, each condition naming the user it reads:
# their split weight, their share, and their balance (share minus the part of
# the amount their ownership of the account pays). Searched only: a rule has
# no use for them, since the import preview runs rules on rows with no split.
USER_FIELDS = {"split_weight", "split_share", "split_balance"}

OPERATORS_BY_FIELD = {
    **{f: TEXT_OPERATORS for f in TEXT_FIELDS},
    **{f: DATE_OPERATORS for f in DATE_FIELDS},
    **{f: NUMERIC_OPERATORS for f in NUMERIC_FIELDS},
    **{f: NUMERIC_OPERATORS for f in USER_FIELDS},
    **{f: TAG_OPERATORS for f in TAG_FIELDS},
    **{f: BOOL_OPERATORS for f in BOOL_FIELDS},
}


class FilterCondition(BaseModel):
    field: Literal[
        "payee", "memo", "raw_label", "amount", "date", "account_id", "category_id",
        "split_weight", "split_share", "split_balance", "tag_id",
        "reconciled", "accounting_month_offset", "created_at",
        "raw_counterparty", "raw_transaction_code", "raw_merchant_category_code", "raw_merchant_location",
        "raw_initiated_date", "raw_booking_date",
    ]
    operator: str
    value: bool | str | float | int | None = None
    value2: str | float | int | None = None
    # The user a per-user field (USER_FIELDS) reads; unused by the others.
    user_id: int | None = None

    @model_validator(mode="after")
    def _validate_operator(self):
        allowed = OPERATORS_BY_FIELD[self.field]
        if self.operator not in allowed:
            raise ValueError(f'operator "{self.operator}" not valid for field "{self.field}" (allowed: {sorted(allowed)})')
        if self.field in USER_FIELDS and self.user_id is None:
            raise ValueError(f'field "{self.field}" needs a user_id')
        return self


class TransactionSearchRequest(BaseModel):
    user_id: int | None = None

    # simple mode
    search: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    account_id: int | None = None
    category_id: int | None = None
    # Only the transactions with no category (category_id is then ignored by
    # the screen, which never sends both).
    uncategorized: bool = False
    # Only the transactions carrying this tag, or (untagged) carrying none.
    tag_id: int | None = None
    untagged: bool = False
    amount_min: float | None = None
    amount_max: float | None = None
    reconciled: bool | None = None

    # advanced mode
    conditions: list[FilterCondition] = []
    match_mode: Literal["all", "any"] = "all"

    # pagination
    page: int = 1
    page_size: int = 50
    unpaginated: bool = False

    # sorting
    sort_by: Literal["date", "amount", "payee", "created_at"] = "date"
    sort_dir: Literal["asc", "desc"] = "desc"


BulkUpdateTransactionsRequest.model_rebuild()
BulkDeleteTransactionsRequest.model_rebuild()


class TransactionSearchResponse(BaseModel):
    items: list[TransactionOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class DashboardResponse(BaseModel):
    accounts: List[AccountOut]
    recent_transactions: List[TransactionOut]
    balances: List[UserBalanceOut] = []


class CategoryChartItem(BaseModel):
    category_id: int | None
    category_name: str
    category_type: Literal["Income", "Expense", "Uncategorized"]
    color: str | None = None
    amount: float
    currency: str


class MonthChartItem(BaseModel):
    month: str
    income: float
    expense: float
    uncategorized: float
    currency: str


class NetMonthChartItem(BaseModel):
    month: str
    net: float
    currency: str


class MonthCategoryChartItem(BaseModel):
    month: str
    category_id: int | None
    amount: float
    currency: str


class ChartCategoryOut(BaseModel):
    category_id: int | None
    name: str
    color: str | None = None
    icon: str | None = None


class ParentCategoryOut(BaseModel):
    id: int
    name: str


class ChartsResponse(BaseModel):
    currencies: List[str]
    by_category: List[CategoryChartItem]
    by_month: List[MonthChartItem]
    net_by_month: List[NetMonthChartItem]
    by_month_category: List[MonthCategoryChartItem] = []
    chart_categories: List[ChartCategoryOut] = []
    parent_category: ParentCategoryOut | None = None


class TransactionHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    transaction_id: int
    action: str
    source: Optional[str] = None
    changed_at: datetime
    changed_by_user_id: Optional[int] = None
    changed_by_user_name: Optional[str] = None
    date: Optional[_DateType] = None
    payee: Optional[str] = None
    memo: Optional[str] = None
    amount: Optional[float] = None
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    accounting_month_offset: Optional[int] = None
    changes: Optional[dict] = None


class ImportDetectResponse(BaseModel):
    headers: list[str]
    encoding: str
    delimiter: str
    date_format: str | None = None  # Python strptime format; None if not confidently detected
    decimal_separator: str  # ',' or '.'
    column_mapping: dict[str, str | None]  # canonical field -> detected raw header (or None)
    sample_rows: list[dict[str, str]]
    file_format: str = "csv"  # 'csv' or 'qif' (a QIF file is read as fixed Date/Payee/Amount/Memo/Category columns)


class ImportPreviewRequest(BaseModel):
    account_id: int  # default/fallback account, used when account_col is absent or a row's value doesn't match
    encoding: str
    delimiter: str
    date_format: str  # Python strptime format, confirmed by the user
    decimal_separator: str  # ',' or '.'
    date_col: str
    payee_col: str
    amount_col: str
    memo_col: str | None = None
    category_col: str | None = None
    account_col: str | None = None


class ImportPreviewSplitShare(BaseModel):
    user_id: int
    weight: int
    share_amount: float
    source: str


class ImportPreviewRow(BaseModel):
    row_number: int
    transaction_date: date | None = None
    payee: str | None = None
    memo: str | None = None
    amount: float | None = None
    account_id: int
    account_name: str | None = None  # raw value from the CSV's account column, if any
    account_matched: bool = True  # False when account_id fell back to the request's default account
    category_id: int | None = None
    category_name: str | None = None
    status: str  # 'ok' | 'needs_category' | 'possible_duplicate' | 'error'
    error_message: str | None = None
    preview_split: list[ImportPreviewSplitShare] = []
    # What the active categorisation model would file this row under, or all
    # three None when no model is active. Advisory: the screen offers it next
    # to the file's own category and commits whichever the user kept.
    suggested_category_id: int | None = None
    suggested_category_name: str | None = None
    suggested_confidence: float | None = None
    # What the enabled automatic rules would do to this row (see
    # transaction_rules.py), or None when no rule matches. The screen applies
    # it by default and can switch it off, so the file's own values stay here.
    rules: "RuleOutcomeOut | None" = None


class ImportCommitRow(TransactionCreate):
    """A row as the import commits it. `raw_label` is the file's own payee,
    sent back separately because an automatic rule may have renamed `payee`
    in the preview; absent, the payee is taken as the file's label.
    `reconciled` is there because a rule may mark a row reconciled."""
    raw_label: str | None = None
    reconciled: bool = False


class ImportCommitRequest(BaseModel):
    rows: list[ImportCommitRow]


class ImportCommitResponse(BaseModel):
    created_count: int
    transaction_ids: list[int]


# ── Automatic categorisation (see categorizer.py) ────────────────

class CategorizerTrainRequest(BaseModel):
    """Which transactions to learn from, and which to be scored on.

    Both selections are ordinary Transactions-screen filters, so a training
    set can be "everything except the accounts nobody keeps up to date"
    rather than just a date range. `page`/`page_size` on either are ignored:
    training always reads the whole selection.

    The two must not overlap. A model scored on rows it was fitted on reports
    a precision it does not have, and since the point of the test selection
    is to decide whether to activate the model, that number has to mean
    something.
    """
    train: TransactionSearchRequest
    test: TransactionSearchRequest
    note: str | None = Field(None, max_length=200)


class CategorizerModelOut(BaseModel):
    id: int
    created_at: datetime
    status: str
    is_active: bool
    trained_rows: int
    tested_rows: int
    note: str | None = None
    params: dict | None = None
    metrics: dict | None = None
    error: str | None = None

    model_config = {"from_attributes": True}


class CategorizerSuggestRequest(BaseModel):
    """Either an explicit list of transactions (the bulk action on a
    selection) or a filter (everything matching, e.g. the uncategorised)."""
    transaction_ids: list[int] | None = None
    selection: TransactionSearchRequest | None = None
    limit: int = Field(500, ge=1, le=2000)


class CategorizerSuggestion(BaseModel):
    transaction_id: int
    date: _DateType
    payee: str
    raw_label: str | None = None
    amount: float
    current_category_id: int | None = None
    current_category_name: str | None = None
    suggested_category_id: int | None = None
    suggested_category_name: str | None = None
    confidence: float | None = None
    high_confidence: bool = False
    category_changed: bool = False


class CategorizerSuggestResponse(BaseModel):
    model_id: int
    threshold: float
    items: list[CategorizerSuggestion]
    category_changes: int
    high_confidence_changes: int


class CategorizerApplyItem(BaseModel):
    transaction_id: int
    category_id: int


class CategorizerApplyRequest(BaseModel):
    """Applies one value per transaction, which is why this is not
    bulk-update: that endpoint sets the same category on every row it
    touches."""
    items: list[CategorizerApplyItem]
    # Off by default: a category somebody set by hand outranks a suggestion.
    overwrite_category: bool = False


class CategorizerApplyResponse(BaseModel):
    updated_count: int
    transaction_ids: list[int]
    # Rows left alone because they already carried a category and
    # overwrite_category was false.
    skipped_transaction_ids: list[int] = []


# ── Automatic rules (see transaction_rules.py) ───────────────────

class RuleActions(BaseModel):
    """What a rule does to a matching transaction: a bulk edit's fields, plus
    renaming the payee. Moving to another account and deleting are left out
    on purpose — too much to happen unseen. An omitted (or None) key leaves
    that field alone; a rule cannot clear a category."""
    payee: str | None = Field(None, min_length=1, max_length=200)
    category_id: int | None = None
    accounting_month_offset: int | None = Field(None, ge=-3, le=3)
    reconciled: bool | None = None
    split_weights: list[SplitWeightCreate] | None = None
    split_source: Literal["global", "account", "category", "custom"] | None = None
    # A weight tier read when the rule runs, instead of weights copied into
    # the rule: changing the global split then changes what the rule applies.
    # "default" is the usual account > category > global cascade. Exclusive
    # with split_weights.
    split_tier: Literal["global", "account", "category", "default"] | None = None
    # Tags added to a matching transaction, which keeps the ones it has.
    add_tag_ids: list[int] | None = None

    @model_validator(mode="after")
    def _one_kind_of_split(self):
        if self.split_tier is not None and self.split_weights is not None:
            raise ValueError("Set either split_weights or split_tier, not both.")
        return self

    def is_empty(self) -> bool:
        return all(getattr(self, f) is None for f in
                   ("payee", "category_id", "accounting_month_offset", "reconciled", "split_weights", "split_tier")) \
            and not self.add_tag_ids


class RuleBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    enabled: bool = True
    match_mode: Literal["all", "any"] = "all"
    conditions: list[FilterCondition]
    actions: RuleActions


class RuleCreate(RuleBase):
    pass


class RuleUpdate(RuleBase):
    pass


class RuleOut(RuleBase):
    id: int
    position: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RuleOrderRequest(BaseModel):
    """Every rule's id, in the order they should run."""
    rule_ids: list[int]


# ── Saved filters (Transactions screen) ───────────────────────────

class SavedFilterBase(BaseModel):
    """`filters` is the screen's own filter state, stored and returned as is
    (see models.SavedFilter)."""
    name: str = Field(..., min_length=1, max_length=100)
    mode: Literal["simple", "advanced"]
    filters: dict


class SavedFilterCreate(SavedFilterBase):
    pass


class SavedFilterUpdate(BaseModel):
    """Rename, or replace what the filter holds; omitted fields stay."""
    name: str | None = Field(None, min_length=1, max_length=100)
    mode: Literal["simple", "advanced"] | None = None
    filters: dict | None = None


class SavedFilterOut(SavedFilterBase):
    id: int
    position: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SavedFilterOrderRequest(BaseModel):
    """Every saved filter's id, in the order the buttons should show."""
    filter_ids: list[int]


class RuleOutcomeOut(BaseModel):
    """What the rules change on one transaction. Only the fields a rule
    actually changes are set; `split_weights` set means a rule set the split."""
    rule_ids: list[int]
    rule_names: list[str]
    payee: str | None = None
    category_id: int | None = None
    category_name: str | None = None
    accounting_month_offset: int | None = None
    reconciled: bool | None = None
    split_weights: list[SplitWeightCreate] | None = None
    split_source: str | None = None
    # Tags the rules add that the row does not carry yet.
    add_tag_ids: list[int] | None = None
    add_tag_names: list[str] | None = None


ImportPreviewRow.model_rebuild()


class RulePreviewRequest(BaseModel):
    """The ticked transactions, and which rules to run on them (by id, in
    their saved order). `rule_ids` omitted means every enabled rule."""
    transaction_ids: list[int]
    rule_ids: list[int] | None = None


class RulePreviewItem(BaseModel):
    transaction_id: int
    date: _DateType
    payee: str
    amount: float
    current_category_id: int | None = None
    current_category_name: str | None = None
    current_accounting_month_offset: int = 0
    current_reconciled: bool = False
    outcome: RuleOutcomeOut | None = None


class RulePreviewResponse(BaseModel):
    items: list[RulePreviewItem]
    changed_count: int


class RuleApplyRequest(RulePreviewRequest):
    pass


class RuleApplyResponse(BaseModel):
    updated_count: int
    transaction_ids: list[int]


# ── Full database backup (export/import) ─────────────────────────
# Raw-column schemas: unlike the *Out schemas above, these mirror each
# model's own columns exactly (ids and FK ids included, no joins), so a
# round-trip preserves the database precisely.

class UserExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str | None = None
    created_at: datetime


class AccountExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str
    balance: float
    currency: str
    created_at: datetime
    archived: bool = False


class CategoryExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str
    color: str | None = None
    icon: str | None = None
    parent_id: int | None = None

    @field_validator("type")
    @classmethod
    def _normalize_type(cls, value: str) -> str:
        # An archive written before Alembic 0020 can carry a free-text type.
        return normalize_category_type(value)


class AccountUserExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_id: int
    user_id: int
    ownership_percentage: float


class CategorySplitExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    category_id: int
    user_id: int
    weight: int


class GlobalSplitWeightExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    weight: int


class AccountSplitWeightExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_id: int
    user_id: int
    weight: int


class TransactionExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: _DateType
    payee: str
    memo: str | None = None
    amount: float
    account_id: int
    category_id: int | None
    accounting_month_offset: int = 0
    reconciled: bool = False
    divide_group_id: int | None = None
    # Carried through so a restore doesn't strip the bank identifiers that
    # keep a later sync from re-importing the same transactions. Defaulted,
    # so archives written before bank sync existed still validate.
    external_id: str | None = None
    # Same reasoning as external_id: a restore that dropped these would
    # silently undo a backfill nothing else can redo (the Linxo export is a
    # one-off file, not a feed). Defaulted, so older archives still validate.
    raw_source: str | None = None
    raw_label: str | None = None
    raw_counterparty: str | None = None
    raw_transaction_code: str | None = None
    raw_merchant_category_code: str | None = None
    raw_merchant_location: str | None = None
    raw_initiated_date: _DateType | None = None
    raw_booking_date: _DateType | None = None
    created_at: datetime


class TransactionSplitExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    transaction_id: int
    user_id: int
    weight: int
    share_amount: float
    source: str


class TransactionHistoryExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    transaction_id: int
    action: str
    source: str | None = None
    changed_at: datetime
    changed_by_user_id: int | None = None
    date: _DateType | None = None
    payee: str | None = None
    memo: str | None = None
    amount: float | None = None
    account_id: int | None = None
    category_id: int | None = None
    accounting_month_offset: int | None = None
    changes: dict | None = None


class BankConnectionExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    aspsp_name: str
    aspsp_country: str = "FR"
    state: str
    authorization_id: str | None = None
    session_id: str | None = None
    status: str = "pending"
    access_valid_until: datetime | None = None
    created_at: datetime | None = None
    last_error: str | None = None


class BankAccountLinkExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    connection_id: int
    remote_account_uid: str
    iban: str | None = None
    remote_name: str | None = None
    currency: str | None = None
    account_id: int | None = None
    sync_enabled: bool = True
    sync_from_date: _DateType | None = None
    last_synced_at: datetime | None = None
    last_sync_status: str | None = None
    last_sync_error: str | None = None
    last_imported_count: int = 0


class TransactionRuleExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    position: int = 0
    enabled: bool = True
    match_mode: str = "all"
    conditions: list[dict]
    actions: dict
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TagExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    color: str | None = None
    created_at: datetime | None = None


class TransactionTagExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    transaction_id: int
    tag_id: int


class SavedFilterExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    position: int = 0
    mode: str
    filters: dict
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DatabaseExport(BaseModel):
    schema_version: int
    exported_at: datetime
    users: list[UserExport] = []
    accounts: list[AccountExport] = []
    categories: list[CategoryExport] = []
    account_users: list[AccountUserExport] = []
    category_splits: list[CategorySplitExport] = []
    global_split_weights: list[GlobalSplitWeightExport] = []
    account_split_weights: list[AccountSplitWeightExport] = []
    transactions: list[TransactionExport] = []
    transaction_splits: list[TransactionSplitExport] = []
    transaction_history: list[TransactionHistoryExport] = []
    # Bank sync (Enable Banking): the consent granted at each bank and the
    # mapping of each remote account onto a MyFinance account. `None` (an
    # archive written before these were exported) is not the same as `[]`:
    # see backup.import_database. The OneDrive connection is deliberately
    # never exported — it holds the refresh token of the very drive these
    # archives get uploaded to.
    bank_connections: list[BankConnectionExport] | None = None
    bank_account_links: list[BankAccountLinkExport] | None = None
    # Automatic rules (transaction_rules.py), restored in overwrite mode only:
    # their conditions and actions name account and category ids, which a
    # partial restore renumbers. `None` is an archive from before rules.
    transaction_rules: list[TransactionRuleExport] | None = None
    # Saved filters of the Transactions screen, same overwrite-only contract
    # as the rules (they name account and category ids). `None` is an archive
    # from before saved filters.
    saved_filters: list[SavedFilterExport] | None = None
    # Each user's email alert settings, same overwrite-only contract (a
    # partial restore doesn't recreate users). `None` is an archive from
    # before email alerts.
    email_alerts: list["EmailAlertExport"] | None = None
    # Tags and which transactions carry them. Restored by both modes (a
    # partial restore reuses a tag of the same name). `None` is an archive
    # from before tags.
    tags: list[TagExport] | None = None
    transaction_tags: list[TransactionTagExport] | None = None


# ── OneDrive automatic backup connection ──────────────────────────
# A single global connection (see models.OneDriveBackupSettings); token
# columns are never exposed here.

class OneDriveSettingsOut(BaseModel):
    connected: bool
    account_email: str | None = None
    folder_path: str | None = None
    keep_daily: int
    keep_weekly: int
    keep_monthly: int
    keep_yearly: int
    last_backup_at: datetime | None = None
    last_backup_status: Literal["success", "failed"] | None = None
    last_backup_error: str | None = None
    model_config = ConfigDict(from_attributes=True)


class OneDriveSettingsUpdate(BaseModel):
    folder_path: str
    keep_daily: int
    keep_weekly: int
    keep_monthly: int
    keep_yearly: int


class OneDriveBackupRunResult(BaseModel):
    ran: bool
    status: Literal["success", "failed"] | None = None
    error: str | None = None


# ── Email alerts on new transactions ──────────────────────────────
# One row per user (see models.EmailAlert / email_alerts.py).

class EmailAlertOut(BaseModel):
    user_id: int
    email: str | None = None
    daily: bool
    weekly: bool
    monthly: bool
    last_daily_sent_at: datetime | None = None
    last_weekly_sent_at: datetime | None = None
    last_monthly_sent_at: datetime | None = None
    last_status: Literal["success", "failed"] | None = None
    last_error: str | None = None
    # Whether the server can send at all (SMTP_HOST set), so the screen can
    # say so instead of letting an alert be saved that never goes out.
    sending_configured: bool = False
    from_address: str = ""
    model_config = ConfigDict(from_attributes=True)


class EmailAlertUpdate(BaseModel):
    email: str | None = None
    daily: bool = False
    weekly: bool = False
    monthly: bool = False


class EmailAlertTestResult(BaseModel):
    sent_to: str
    transaction_count: int


class EmailAlertExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    email: str | None = None
    daily: bool = False
    weekly: bool = False
    monthly: bool = False
    last_daily_sent_at: datetime | None = None
    last_weekly_sent_at: datetime | None = None
    last_monthly_sent_at: datetime | None = None


class ImportSummary(BaseModel):
    mode: Literal["overwrite", "partial"]
    users: int
    accounts: int
    categories: int
    account_users: int
    category_splits: int
    global_split_weights: int
    account_split_weights: int
    transactions: int
    transaction_splits: int
    transaction_history: int
    bank_connections: int = 0
    bank_account_links: int = 0
    transaction_rules: int = 0
    saved_filters: int = 0
    email_alerts: int = 0
    tags: int = 0
    transaction_tags: int = 0


# ── Bank sync (Enable Banking) ────────────────────────────────────────
# See enable_banking.py. Nothing here exposes a session id or any part of
# the signing key — the frontend only ever needs the consent URL.

class BankInstitutionOut(BaseModel):
    name: str
    country: str
    logo: str | None = None


class BankConnectionCreate(BaseModel):
    aspsp_name: str
    aspsp_country: str = "FR"
    language: str = "fr"


class BankConnectionCreated(BaseModel):
    connection_id: int
    authorization_url: str


class BankAccountLinkOut(BaseModel):
    id: int
    connection_id: int
    iban: str | None = None
    remote_name: str | None = None
    currency: str | None = None
    account_id: int | None = None
    account_name: str | None = None
    sync_enabled: bool
    sync_from_date: _DateType | None = None
    last_synced_at: datetime | None = None
    last_sync_status: Literal["success", "failed"] | None = None
    last_sync_error: str | None = None
    last_imported_count: int


class BankConnectionOut(BaseModel):
    id: int
    aspsp_name: str
    aspsp_country: str
    status: Literal["pending", "linked", "expired", "error"]
    access_valid_until: datetime | None = None
    created_at: datetime | None = None
    last_error: str | None = None
    accounts: List[BankAccountLinkOut] = []


class BankAccountLinkUpdate(BaseModel):
    account_id: int | None = None
    sync_enabled: bool = True
    sync_from_date: _DateType | None = None


class BankResyncRequest(BaseModel):
    date_from: _DateType
    date_to: _DateType


class BankSyncRunResult(BaseModel):
    ran: bool
    synced_links: int = 0
    created_count: int = 0
    status: Literal["success", "failed"] | None = None
    error: str | None = None


DatabaseExport.model_rebuild()
