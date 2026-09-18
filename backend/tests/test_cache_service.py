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
