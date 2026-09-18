"""Generic DB-backed cache for aggregate query results (dashboard/balances/charts).

Backed by a plain table (AggregateCache) rather than an in-process dict or
functools.lru_cache: the backend deploys to Cloud Run with multiple instances,
so a per-process cache would go stale on every instance a write didn't land
on. Going through the same database every other query already uses avoids
introducing Redis or any other new infra.

A namespace groups related cache entries for bulk invalidation - e.g. every
aggregation derived from TransactionSplit shares the "balances"/"charts"
namespaces and gets dropped together whenever a mutation could have changed
any of them. This module has no idea what a "balance" or a "chart" is; each
caller shapes its own JSON-safe payload and picks its own namespace, so a new
aggregation never requires touching this file.
"""

import json
from typing import Any, Callable

from sqlalchemy.orm import Session

from models import AggregateCache


def _build_key(namespace: str, params: dict[str, Any]) -> str:
    parts = ":".join(f"{k}={params[k]}" for k in sorted(params))
    return f"{namespace}:{parts}" if parts else namespace


def get_or_compute(db: Session, namespace: str, params: dict[str, Any], compute: Callable[[], Any]) -> Any:
    """Return the cached payload for (namespace, params); compute and store it on a miss.

    `compute` must return JSON-serializable data (dicts/lists/primitives -
    tuples round-trip as lists). Commits the cache write itself, since GET
    endpoints don't otherwise commit.
    """
    key = _build_key(namespace, params)
    row = db.query(AggregateCache).filter(AggregateCache.cache_key == key).first()
    if row is not None:
        return json.loads(row.payload)

    value = compute()
    db.merge(AggregateCache(cache_key=key, namespace=namespace, payload=json.dumps(value)))
    db.commit()
    return value


def invalidate(db: Session, *namespaces: str) -> None:
    """Drop every cached entry in the given namespace(s).

    Does not commit - call this right before the mutation's own db.commit()
    so the invalidation lands atomically with the change that made it
    necessary.
    """
    db.query(AggregateCache).filter(AggregateCache.namespace.in_(namespaces)).delete(synchronize_session=False)


def invalidate_all(db: Session) -> None:
    """Drop every cached entry, any namespace - for mutation paths (bulk backup
    restore) that bypass per-site invalidation entirely. Does not commit."""
    db.query(AggregateCache).delete(synchronize_session=False)
