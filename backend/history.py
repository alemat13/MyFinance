"""The History screen's timeline: every transaction_history row, newest first,
with the rows one action wrote shown as one entry.

A bulk edit over the whole ledger writes one history row per transaction;
listed as is, a single click would bury everything else under thousands of
lines. So consecutive rows are grouped:

- rows carrying the same `batch_id` (audit.batch(), set by every action that
  writes many rows at once) form one entry per action and source, which is
  exact;
- rows written before batches existed carry none, so those are grouped by
  guesswork: same action, source, author and change (same fields set to the
  same values), written within LEGACY_GAP of each other. Two identical bulk
  edits run back to back end up as one entry, which is the price of not
  rewriting the stored history.

An entry names its rows by the id range they span plus what they share
(`group_filter()`), so its detail and the Transactions screen's "open these
transactions" read exactly the rows the entry counted, with nothing stored.
"""
import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from models import TransactionHistory

LEGACY_GAP = timedelta(seconds=60)
SCAN_CHUNK = 2000
# Fields whose new value is the row's own (a prepended payee, a reworded
# memo): only the fact that they changed is shared by a group.
_PER_ROW_FIELDS = {"payee", "memo", "date", "amount"}
_MAX_TAG_NAMES = 20

# The "Origin" filter: what the history screen calls each value of `source`.
# 'manual' also covers NULL, the hand edit made in the transaction form.
SOURCES = ("manual", "bulk", "rule", "categorizer", "csv_import", "bank_sync", "divide", "admin")


def _tags_delta(change: dict) -> tuple[list[str], list[str]]:
    before = change.get("old") or []
    after = change.get("new") or []
    return sorted(n for n in after if n not in before), sorted(n for n in before if n not in after)


def _change_signature(changes: dict | None):
    if not changes:
        return None
    parts = []
    for name, change in sorted(changes.items()):
        if name in _PER_ROW_FIELDS:
            parts.append((name,))
        elif name == "tags":
            parts.append((name, json.dumps(_tags_delta(change))))
        elif name == "splits":
            new = change.get("new") or []
            parts.append((name, json.dumps([(e["user_id"], e["weight"]) for e in new])))
        else:
            parts.append((name, json.dumps(change.get("new"))))
    return tuple(parts)


@dataclass
class Entry:
    first: TransactionHistory  # newest row
    last: TransactionHistory  # oldest row so far
    signature: tuple
    count: int = 1
    # field -> set of JSON-encoded new values seen (capped), for the summary
    values: dict = field(default_factory=dict)
    tags_added: set = field(default_factory=set)
    tags_removed: set = field(default_factory=set)

    def add_changes(self, changes: dict | None) -> None:
        for name, change in (changes or {}).items():
            if name == "tags":
                added, removed = _tags_delta(change)
                self.tags_added.update(added)
                self.tags_removed.update(removed)
                continue
            seen = self.values.setdefault(name, set())
            if len(seen) < 2:
                seen.add(json.dumps(change.get("new"), sort_keys=True))


def _signature(row: TransactionHistory) -> tuple:
    if row.batch_id:
        return ("batch", row.batch_id, row.action, row.source)
    return ("legacy", row.action, row.source, row.changed_by_user_id, _change_signature(row.changes))


def _fits(entry: Entry, row: TransactionHistory, signature: tuple) -> bool:
    if signature != entry.signature:
        return False
    if row.batch_id:
        return True
    return entry.last.changed_at - row.changed_at <= LEGACY_GAP


def _source_filter(source: str):
    if source == "manual":
        return or_(TransactionHistory.source.is_(None), TransactionHistory.source == "manual")
    return TransactionHistory.source == source


def scan(db: Session, *, before_id: int | None, limit: int,
         action: str | None = None, source: str | None = None) -> tuple[list[Entry], int | None]:
    """The next `limit` entries older than `before_id`, plus the cursor to pass
    for the page after (None once the history is exhausted). Reads rows in
    chunks until the last entry is known to be complete, so one entry can span
    any number of rows."""
    query = db.query(TransactionHistory)
    if action:
        query = query.filter(TransactionHistory.action == action)
    if source:
        query = query.filter(_source_filter(source))

    entries: list[Entry] = []
    current: Entry | None = None
    cursor = before_id
    while True:
        chunk_query = query
        if cursor is not None:
            chunk_query = chunk_query.filter(TransactionHistory.id < cursor)
        rows = chunk_query.order_by(TransactionHistory.id.desc()).limit(SCAN_CHUNK).all()
        for row in rows:
            signature = _signature(row)
            if current is not None and _fits(current, row, signature):
                current.last = row
                current.count += 1
                current.add_changes(row.changes)
                continue
            if current is not None:
                entries.append(current)
                if len(entries) == limit:
                    return entries, current.last.id
            current = Entry(first=row, last=row, signature=signature)
            current.add_changes(row.changes)
        if len(rows) < SCAN_CHUNK:
            break
        cursor = rows[-1].id
    if current is not None:
        entries.append(current)
    return entries, None


def summary(entry: Entry) -> dict | None:
    """What a group's rows have in common, keyed like a history row's own
    `changes`: {"new": value} when every row got the same value, {"new": None,
    "mixed": True} when they differ, and for tags {"added": [...], "removed":
    [...]} across the whole group."""
    out = {}
    for name, seen in entry.values.items():
        if len(seen) == 1 and name not in _PER_ROW_FIELDS:
            out[name] = {"new": json.loads(next(iter(seen)))}
        else:
            out[name] = {"new": None, "mixed": True}
    if entry.tags_added or entry.tags_removed:
        out["tags"] = {
            "added": sorted(entry.tags_added)[:_MAX_TAG_NAMES],
            "removed": sorted(entry.tags_removed)[:_MAX_TAG_NAMES],
        }
    return out or None


def group_filter(first_id: int, last_id: int, action: str, source: str | None,
                 changed_by_user_id: int | None, batch_id: str | None):
    """The SQL condition selecting exactly the history rows of one entry."""
    def equals(column, value):
        return column.is_(None) if value is None else column == value
    return and_(
        TransactionHistory.id >= min(first_id, last_id),
        TransactionHistory.id <= max(first_id, last_id),
        TransactionHistory.action == action,
        equals(TransactionHistory.source, source),
        equals(TransactionHistory.changed_by_user_id, changed_by_user_id),
        equals(TransactionHistory.batch_id, batch_id),
    )


def group_transaction_ids(ref):
    """A subquery of the transaction ids an entry touched, for the
    Transactions screen's filter."""
    return select(TransactionHistory.transaction_id).where(group_filter(
        ref.first_id, ref.last_id, ref.action, ref.source, ref.changed_by_user_id, ref.batch_id))
