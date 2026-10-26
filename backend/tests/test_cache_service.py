import cache_service
from models import AggregateCache


def test_get_or_compute_caches_on_miss(db):
    calls = []

    def compute():
        calls.append(1)
        return {"total": 42}

    result = cache_service.get_or_compute(db, "balances", {"user_id": 1}, compute)
    assert result == {"total": 42}
    assert len(calls) == 1

    row = db.query(AggregateCache).filter(AggregateCache.namespace == "balances").first()
    assert row is not None
    assert row.cache_key == "balances:user_id=1"


def test_get_or_compute_hit_does_not_recompute(db):
    calls = []

    def compute():
        calls.append(1)
        return [1, 2, 3]

    first = cache_service.get_or_compute(db, "charts", {"user_id": 5}, compute)
    second = cache_service.get_or_compute(db, "charts", {"user_id": 5}, compute)
    assert first == second == [1, 2, 3]
    assert len(calls) == 1


def test_get_or_compute_key_independent_of_params_order(db):
    calls = []

    def compute():
        calls.append(1)
        return "value"

    cache_service.get_or_compute(db, "charts", {"user_id": 5, "currency": "EUR"}, compute)
    cache_service.get_or_compute(db, "charts", {"currency": "EUR", "user_id": 5}, compute)
    assert len(calls) == 1


def test_get_or_compute_distinct_params_are_distinct_entries(db):
    cache_service.get_or_compute(db, "balances", {"user_id": 1}, lambda: "for-1")
    cache_service.get_or_compute(db, "balances", {"user_id": 2}, lambda: "for-2")
    assert db.query(AggregateCache).filter(AggregateCache.namespace == "balances").count() == 2


def test_invalidate_only_clears_named_namespace(db):
    cache_service.get_or_compute(db, "balances", {}, lambda: "b")
    cache_service.get_or_compute(db, "charts", {}, lambda: "c")

    cache_service.invalidate(db, "balances")
    db.commit()

    assert db.query(AggregateCache).filter(AggregateCache.namespace == "balances").count() == 0
    assert db.query(AggregateCache).filter(AggregateCache.namespace == "charts").count() == 1


def test_invalidate_recomputes_on_next_get(db):
    calls = []

    def compute():
        calls.append(1)
        return len(calls)

    first = cache_service.get_or_compute(db, "balances", {}, compute)
    cache_service.invalidate(db, "balances")
    db.commit()
    second = cache_service.get_or_compute(db, "balances", {}, compute)

    assert first == 1
    assert second == 2


def test_invalidate_all_clears_every_namespace(db):
    cache_service.get_or_compute(db, "balances", {}, lambda: "b")
    cache_service.get_or_compute(db, "charts", {}, lambda: "c")

    cache_service.invalidate_all(db)
    db.commit()

    assert db.query(AggregateCache).count() == 0



def test_get_or_compute_survives_concurrent_miss(db):
    """Another request storing the same key between our lookup and our write
    (two parallel GET /api/accounts) must not turn this read into a 409."""
    from sqlalchemy import event

    from tests.conftest import TestingSessionLocal

    fired = []

    def other_request_stores_it_first(session, flush_context, instances):
        if fired:
            return
        fired.append(1)
        other = TestingSessionLocal()
        other.add(AggregateCache(cache_key="account_totals", namespace="account_totals", payload="[1]"))
        other.commit()
        other.close()

    event.listen(db, "before_flush", other_request_stores_it_first)

    assert cache_service.get_or_compute(db, "account_totals", {}, lambda: [1]) == [1]
    event.remove(db, "before_flush", other_request_stores_it_first)
    assert db.query(AggregateCache).count() == 1


def _cached_namespaces(db):
    return {row.namespace for row in db.query(AggregateCache).all()}


def _fill_cache(db):
    for namespace in ("balances", "charts", "account_totals", "category_usage"):
        cache_service.get_or_compute(db, namespace, {}, lambda: 1)


def test_transaction_edit_keeps_caches_it_cannot_affect(client, db, sample_transaction):
    """A rename, a memo or a reconciled tick feeds no aggregate, so it must not
    send the dashboard back to recomputing balances."""
    _fill_cache(db)

    response = client.put(
        f"/api/transactions/{sample_transaction.id}",
        json={"payee": "Renamed", "memo": "note", "reconciled": True},
    )
    assert response.status_code == 200
    db.expire_all()
    assert _cached_namespaces(db) == {"balances", "charts", "account_totals", "category_usage"}


def test_transaction_edit_drops_only_the_caches_it_affects(client, db, sample_transaction):
    _fill_cache(db)
    response = client.put(f"/api/transactions/{sample_transaction.id}", json={"amount": 120.0})
    assert response.status_code == 200
    db.expire_all()
    assert _cached_namespaces(db) == {"category_usage"}

    _fill_cache(db)
    response = client.put(f"/api/transactions/{sample_transaction.id}", json={"category_id": None})
    assert response.status_code == 200
    db.expire_all()
    assert _cached_namespaces(db) == {"balances", "account_totals"}
