"""Users, accounts, categories, split weights and tags."""

import re
from datetime import date, datetime
from typing import Literal

from pydantic import ConfigDict, Field, field_validator

from .base import Schema


class UserOut(Schema):
    id: int
    name: str
    email: str | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class UserCreate(Schema):
    name: str
    email: str | None = None


class UserUpdate(Schema):
    name: str | None = None
    email: str | None = None


class AccountUserOut(Schema):
    user_id: int
    user_name: str
    ownership_percentage: float
    model_config = ConfigDict(from_attributes=True)


class AccountUserCreate(Schema):
    user_id: int
    ownership_percentage: float


def _validate_currency_code(value: str) -> str:
    value = value.strip().upper()
    if len(value) != 3 or not value.isalpha():
        raise ValueError(f"Currency must be a 3-letter code, got '{value}'")
    return value


class AccountSplitWeightOut(Schema):
    user_id: int
    user_name: str
    weight: int
    model_config = ConfigDict(from_attributes=True)


class AccountSplitWeightUpdateItem(Schema):
    user_id: int
    weight: int


class AccountOut(Schema):
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
    # Where the account's type group sits (models.AccountTypeOrder), None when
    # the user never placed that type: such groups come last, alphabetically.
    type_position: int | None = None


class AccountTypeOrderRequest(Schema):
    """Account types, first group to last. Matched case-insensitively and
    trimmed; types left out go back to the alphabetical tail."""

    types: list[str]


class AccountCreate(Schema):
    name: str
    type: str
    balance: float = 0.0
    currency: str = "EUR"
    users: list[AccountUserCreate] = []

    @field_validator("currency")
    @classmethod
    def _validate_currency(cls, value: str) -> str:
        return _validate_currency_code(value)


class AccountUpdate(Schema):
    name: str | None = None
    type: str | None = None
    balance: float | None = None
    currency: str | None = None
    archived: bool | None = None
    users: list[AccountUserCreate] | None = None

    @field_validator("currency")
    @classmethod
    def _validate_currency(cls, value: str | None) -> str | None:
        return _validate_currency_code(value) if value is not None else None


class CategorySplitOut(Schema):
    user_id: int
    user_name: str
    weight: int
    model_config = ConfigDict(from_attributes=True)


class CategorySplitCreate(Schema):
    user_id: int
    weight: int


_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

# Keep in sync with CATEGORY_ICON_NAMES in frontend/src/utils/categoryIcons.ts.
_VALID_CATEGORY_ICONS = {
    "ShoppingCart",
    "Home",
    "Utensils",
    "Car",
    "Plane",
    "Wifi",
    "Tv",
    "Music",
    "Heart",
    "PiggyBank",
    "Landmark",
    "Briefcase",
    "GraduationCap",
    "Gift",
    "Gamepad2",
    "Dumbbell",
    "Stethoscope",
    "Fuel",
    "CreditCard",
    "Wallet",
    "Coffee",
    "ShoppingBag",
    "Dog",
    "Smartphone",
    "ArrowLeftRight",
    "Shield",
    "Zap",
    "TrainFront",
    "Bus",
    "Mail",
    "Receipt",
    "TrendingUp",
    "Baby",
    "Sofa",
    "Shirt",
    "Scissors",
    "Banknote",
    "Ticket",
    "Sparkles",
    "Laptop",
    "BookOpen",
    "Film",
    "Palette",
    "Trophy",
    "Hammer",
    "Flower2",
    "HeartHandshake",
    "ParkingCircle",
    "Ship",
    "Sandwich",
    "Umbrella",
    "Building2",
    "School",
    "Bike",
    "PartyPopper",
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


class CategoryOut(Schema):
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


class CategoryCreate(Schema):
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


class CategoryUpdate(Schema):
    name: str | None = None
    type: CategoryType | None = None
    color: str | None = None
    icon: str | None = None
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


class GlobalSplitWeightOut(Schema):
    user_id: int
    user_name: str
    weight: int
    model_config = ConfigDict(from_attributes=True)


class GlobalSplitWeightUpdateItem(Schema):
    user_id: int
    weight: int


class SplitWeightCreate(Schema):
    user_id: int
    weight: int


class TransactionSplitOut(Schema):
    user_id: int
    user_name: str
    weight: int
    share_amount: float
    source: str
    model_config = ConfigDict(from_attributes=True)


class UserBalanceOut(Schema):
    user_id: int
    user_name: str
    currency: str
    net_position: float


class TagRef(Schema):
    """A tag as a transaction carries it."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    color: str | None = None


class TagOut(TagRef):
    """A tag as the tag list shows it, with how many transactions carry it."""

    transaction_count: int = 0


class TagCreate(Schema):
    name: str = Field(..., min_length=1, max_length=50)
    color: str | None = None

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

    name: str | None = Field(None, min_length=1, max_length=50)
