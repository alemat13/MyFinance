"""Automatic rules and saved filters."""
import re
from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .base import Schema, _DateType
from .entities import SplitWeightCreate
from .search import FilterCondition
from .imports import ImportPreviewRow


# ── Automatic rules (see transaction_rules.py) ───────────────────

class RuleActions(Schema):
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


class RuleBase(Schema):
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


class RuleOrderRequest(Schema):
    """Every rule's id, in the order they should run."""
    rule_ids: list[int]


# ── Saved filters (Transactions screen) ───────────────────────────

class SavedFilterBase(Schema):
    """`filters` is the screen's own filter state, stored and returned as is
    (see models.SavedFilter)."""
    name: str = Field(..., min_length=1, max_length=100)
    mode: Literal["simple", "advanced"]
    filters: dict


class SavedFilterCreate(SavedFilterBase):
    pass


class SavedFilterUpdate(Schema):
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


class SavedFilterOrderRequest(Schema):
    """Every saved filter's id, in the order the buttons should show."""
    filter_ids: list[int]


class RuleOutcomeOut(Schema):
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


class RulePreviewRequest(Schema):
    """The ticked transactions, and which rules to run on them (by id, in
    their saved order). `rule_ids` omitted means every enabled rule."""
    transaction_ids: list[int]
    rule_ids: list[int] | None = None


class RulePreviewItem(Schema):
    transaction_id: int
    date: _DateType
    payee: str
    amount: float
    current_category_id: int | None = None
    current_category_name: str | None = None
    current_accounting_month_offset: int = 0
    current_reconciled: bool = False
    outcome: RuleOutcomeOut | None = None


class RulePreviewResponse(Schema):
    items: list[RulePreviewItem]
    changed_count: int


class RuleApplyRequest(RulePreviewRequest):
    pass


class RuleApplyResponse(Schema):
    updated_count: int
    transaction_ids: list[int]
