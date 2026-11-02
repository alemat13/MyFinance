from models import Category, GlobalSplitWeight


def _create_transaction(
    client, sample_account, sample_category, sample_user, amount=500.0, payee="Original Payee"
):
    response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": payee,
            "amount": amount,
            "split_weights": [{"user_id": sample_user.id, "weight": 1}],
        },
    )
    assert response.status_code == 201
    return response.json()


def test_divide_into_two_parts_succeeds(
    client, sample_transaction, sample_category, sample_user, db
):
    other_category = Category(name="Other Category", type=sample_category.type)
    db.add(other_category)
    db.commit()

    response = client.post(
        f"/api/transactions/{sample_transaction.id}/divide",
        json={
            "parts": [
                {
                    "date": "2026-01-15",
                    "payee": "Groceries",
                    "amount": 300.0,
                    "category_id": sample_category.id,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
                {
                    "date": "2026-02-01",
                    "payee": "Party",
                    "amount": 200.0,
                    "category_id": other_category.id,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
            ]
        },
    )
    assert response.status_code == 200
    transactions = response.json()["transactions"]
    assert len(transactions) == 2
    assert transactions[0]["id"] == sample_transaction.id
    assert transactions[0]["amount"] == 300.0
    assert transactions[0]["payee"] == "Groceries"
    assert transactions[1]["amount"] == 200.0
    assert transactions[1]["payee"] == "Party"
    assert transactions[1]["date"] == "2026-02-01"
    # Both parts share the anchor (original) transaction's id as their group id.
    assert transactions[0]["divide_group_id"] == sample_transaction.id
    assert transactions[1]["divide_group_id"] == sample_transaction.id


def test_divide_into_three_parts_succeeds(client, sample_transaction, sample_category, sample_user):
    response = client.post(
        f"/api/transactions/{sample_transaction.id}/divide",
        json={
            "parts": [
                {
                    "date": "2026-01-15",
                    "payee": "Part A",
                    "amount": 100.0,
                    "category_id": sample_category.id,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
                {
                    "date": "2026-01-15",
                    "payee": "Part B",
                    "amount": 150.0,
                    "category_id": sample_category.id,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
                {
                    "date": "2026-01-15",
                    "payee": "Part C",
                    "amount": 250.0,
                    "category_id": sample_category.id,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
            ]
        },
    )
    assert response.status_code == 200
    transactions = response.json()["transactions"]
    assert len(transactions) == 3
    assert sum(t["amount"] for t in transactions) == 500.0
    group_ids = {t["divide_group_id"] for t in transactions}
    assert group_ids == {sample_transaction.id}


def test_divide_reuses_original_id_and_history_stays_reachable(
    client, sample_account, sample_category, sample_user
):
    created = _create_transaction(client, sample_account, sample_category, sample_user)
    transaction_id = created["id"]

    response = client.post(
        f"/api/transactions/{transaction_id}/divide",
        json={
            "parts": [
                {
                    "date": "2026-01-15",
                    "payee": "Original Payee",
                    "amount": 300.0,
                    "category_id": sample_category.id,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
                {
                    "date": "2026-01-15",
                    "payee": "New Part",
                    "amount": 200.0,
                    "category_id": sample_category.id,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
            ]
        },
    )
    assert response.status_code == 200

    history = client.get(f"/api/transactions/{transaction_id}/history").json()
    assert [h["action"] for h in history] == ["created", "updated"]
    assert history[1]["source"] == "divide"
    assert history[1]["changes"]["amount"] == {"old": 500.0, "new": 300.0}

    new_id = response.json()["transactions"][1]["id"]
    new_history = client.get(f"/api/transactions/{new_id}/history").json()
    assert len(new_history) == 1
    assert new_history[0]["action"] == "created"
    assert new_history[0]["source"] == "divide"


def test_divide_amount_mismatch_422(client, sample_transaction, sample_category, sample_user):
    response = client.post(
        f"/api/transactions/{sample_transaction.id}/divide",
        json={
            "parts": [
                {
                    "date": "2026-01-15",
                    "payee": "A",
                    "amount": 300.0,
                    "category_id": sample_category.id,
                },
                {
                    "date": "2026-01-15",
                    "payee": "B",
                    "amount": 100.0,
                    "category_id": sample_category.id,
                },
            ]
        },
    )
    assert response.status_code == 422


def test_divide_requires_at_least_two_parts_422(client, sample_transaction, sample_category):
    response = client.post(
        f"/api/transactions/{sample_transaction.id}/divide",
        json={
            "parts": [
                {
                    "date": "2026-01-15",
                    "payee": "A",
                    "amount": 500.0,
                    "category_id": sample_category.id,
                },
            ]
        },
    )
    assert response.status_code == 422


def test_divide_zero_amount_part_422(client, sample_transaction, sample_category):
    response = client.post(
        f"/api/transactions/{sample_transaction.id}/divide",
        json={
            "parts": [
                {
                    "date": "2026-01-15",
                    "payee": "A",
                    "amount": 0.0,
                    "category_id": sample_category.id,
                },
                {
                    "date": "2026-01-15",
                    "payee": "B",
                    "amount": 500.0,
                    "category_id": sample_category.id,
                },
            ]
        },
    )
    assert response.status_code == 422


def test_divide_on_archived_account_422(client, sample_transaction, sample_category, sample_user):
    client.put(f"/api/accounts/{sample_transaction.account_id}", json={"archived": True})
    response = client.post(
        f"/api/transactions/{sample_transaction.id}/divide",
        json={
            "parts": [
                {
                    "date": "2026-01-15",
                    "payee": "A",
                    "amount": 300.0,
                    "category_id": sample_category.id,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
                {
                    "date": "2026-01-15",
                    "payee": "B",
                    "amount": 200.0,
                    "category_id": sample_category.id,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
            ]
        },
    )
    assert response.status_code == 422


def test_divide_unknown_transaction_404(client, sample_category):
    response = client.post(
        "/api/transactions/999/divide",
        json={
            "parts": [
                {
                    "date": "2026-01-15",
                    "payee": "A",
                    "amount": 100.0,
                    "category_id": sample_category.id,
                },
                {
                    "date": "2026-01-15",
                    "payee": "B",
                    "amount": 100.0,
                    "category_id": sample_category.id,
                },
            ]
        },
    )
    assert response.status_code == 404


def test_divide_part_omitting_split_weights_resolves_cascade(
    client, sample_transaction, sample_category, sample_user, db
):
    db.add(GlobalSplitWeight(user_id=sample_user.id, weight=100))
    db.commit()

    response = client.post(
        f"/api/transactions/{sample_transaction.id}/divide",
        json={
            "parts": [
                {
                    "date": "2026-01-15",
                    "payee": "A",
                    "amount": 300.0,
                    "category_id": sample_category.id,
                },
                {
                    "date": "2026-01-15",
                    "payee": "B",
                    "amount": 200.0,
                    "category_id": sample_category.id,
                },
            ]
        },
    )
    assert response.status_code == 200
    transactions = response.json()["transactions"]
    for t in transactions:
        assert t["splits"] == [
            {
                "user_id": sample_user.id,
                "user_name": sample_user.name,
                "weight": 100,
                "share_amount": t["amount"],
                "source": "global",
            },
        ]


def test_divide_siblings_endpoint_returns_other_parts(
    client, sample_transaction, sample_category, sample_user
):
    response = client.post(
        f"/api/transactions/{sample_transaction.id}/divide",
        json={
            "parts": [
                {
                    "date": "2026-01-15",
                    "payee": "A",
                    "amount": 300.0,
                    "category_id": sample_category.id,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
                {
                    "date": "2026-01-15",
                    "payee": "B",
                    "amount": 200.0,
                    "category_id": sample_category.id,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
            ]
        },
    )
    new_id = response.json()["transactions"][1]["id"]

    siblings_of_anchor = client.get(
        f"/api/transactions/{sample_transaction.id}/divide-siblings"
    ).json()
    assert [s["id"] for s in siblings_of_anchor] == [new_id]

    siblings_of_new = client.get(f"/api/transactions/{new_id}/divide-siblings").json()
    assert [s["id"] for s in siblings_of_new] == [sample_transaction.id]


def test_divide_siblings_empty_for_never_divided_transaction(client, sample_transaction):
    response = client.get(f"/api/transactions/{sample_transaction.id}/divide-siblings")
    assert response.status_code == 200
    assert response.json() == []


def test_dividing_a_non_anchor_sibling_is_rejected(
    client, sample_transaction, sample_category, sample_user
):
    response = client.post(
        f"/api/transactions/{sample_transaction.id}/divide",
        json={
            "parts": [
                {
                    "date": "2026-01-15",
                    "payee": "A",
                    "amount": 300.0,
                    "category_id": sample_category.id,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
                {
                    "date": "2026-01-15",
                    "payee": "B",
                    "amount": 200.0,
                    "category_id": sample_category.id,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
            ]
        },
    )
    non_anchor_id = response.json()["transactions"][1]["id"]

    second_divide = client.post(
        f"/api/transactions/{non_anchor_id}/divide",
        json={
            "parts": [
                {
                    "date": "2026-01-15",
                    "payee": "C",
                    "amount": 100.0,
                    "category_id": sample_category.id,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
                {
                    "date": "2026-01-15",
                    "payee": "D",
                    "amount": 100.0,
                    "category_id": sample_category.id,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
            ]
        },
    )
    assert second_divide.status_code == 422


def test_re_dividing_the_anchor_grows_the_same_group(
    client, sample_transaction, sample_category, sample_user
):
    first = client.post(
        f"/api/transactions/{sample_transaction.id}/divide",
        json={
            "parts": [
                {
                    "date": "2026-01-15",
                    "payee": "A",
                    "amount": 300.0,
                    "category_id": sample_category.id,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
                {
                    "date": "2026-01-15",
                    "payee": "B",
                    "amount": 200.0,
                    "category_id": sample_category.id,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
            ]
        },
    )
    sibling_id = first.json()["transactions"][1]["id"]

    second = client.post(
        f"/api/transactions/{sample_transaction.id}/divide",
        json={
            "parts": [
                {
                    "date": "2026-01-15",
                    "payee": "A1",
                    "amount": 100.0,
                    "category_id": sample_category.id,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
                {
                    "date": "2026-01-15",
                    "payee": "A2",
                    "amount": 200.0,
                    "category_id": sample_category.id,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
            ]
        },
    )
    assert second.status_code == 200
    new_sibling_id = second.json()["transactions"][1]["id"]

    siblings = client.get(f"/api/transactions/{sample_transaction.id}/divide-siblings").json()
    assert {s["id"] for s in siblings} == {sibling_id, new_sibling_id}


def _divide(client, transaction, category, user, amounts):
    response = client.post(
        f"/api/transactions/{transaction.id}/divide",
        json={
            "parts": [
                {
                    "date": "2026-01-15",
                    "payee": f"Part {i}",
                    "amount": amount,
                    "category_id": category.id,
                    "split_weights": [{"user_id": user.id, "weight": 1}],
                }
                for i, amount in enumerate(amounts)
            ]
        },
    )
    assert response.status_code == 200
    return [t["id"] for t in response.json()["transactions"]]


def test_deleting_a_part_returns_its_amount_to_the_anchor(
    client, sample_transaction, sample_category, sample_user
):
    anchor_id, part_id, other_id = _divide(
        client, sample_transaction, sample_category, sample_user, [300.0, 150.0, 50.0]
    )

    assert client.delete(f"/api/transactions/{part_id}").status_code == 204

    anchor = client.get(f"/api/transactions/{anchor_id}").json()
    other = client.get(f"/api/transactions/{other_id}").json()
    assert anchor["amount"] == 450.0
    assert anchor["splits"][0]["share_amount"] == 450.0
    assert anchor["divide_group_id"] == anchor_id
    assert anchor["amount"] + other["amount"] == 500.0

    history = client.get(f"/api/transactions/{anchor_id}/history").json()
    returned = [
        h
        for h in history
        if h["source"] == "divide" and (h["changes"] or {}).get("amount", {}).get("new") == 450.0
    ]
    assert returned[0]["changes"]["amount"] == {"old": 300.0, "new": 450.0}


def test_deleting_the_last_part_makes_the_anchor_an_ordinary_transaction(
    client, sample_transaction, sample_category, sample_user
):
    anchor_id, part_id = _divide(
        client, sample_transaction, sample_category, sample_user, [300.0, 200.0]
    )

    assert client.delete(f"/api/transactions/{part_id}").status_code == 204

    anchor = client.get(f"/api/transactions/{anchor_id}").json()
    assert anchor["amount"] == 500.0
    assert anchor["divide_group_id"] is None


def test_deleting_the_anchor_while_parts_remain_is_refused(
    client, sample_transaction, sample_category, sample_user
):
    anchor_id, part_id = _divide(
        client, sample_transaction, sample_category, sample_user, [300.0, 200.0]
    )

    response = client.delete(f"/api/transactions/{anchor_id}")
    assert response.status_code == 422
    assert "other parts first" in str(response.json())
    assert client.get(f"/api/transactions/{part_id}").status_code == 200

    response = client.request(
        "DELETE", "/api/transactions/bulk-delete", json={"transaction_ids": [anchor_id]}
    )
    assert response.status_code == 422


def test_bulk_deleting_parts_returns_their_amounts_to_the_anchor(
    client, sample_transaction, sample_category, sample_user
):
    anchor_id, *part_ids = _divide(
        client, sample_transaction, sample_category, sample_user, [300.0, 150.0, 50.0]
    )

    response = client.request(
        "DELETE", "/api/transactions/bulk-delete", json={"transaction_ids": part_ids}
    )
    assert response.status_code == 200

    anchor = client.get(f"/api/transactions/{anchor_id}").json()
    assert anchor["amount"] == 500.0
    assert anchor["divide_group_id"] is None


def test_deleting_parts_of_mixed_signs_keeps_the_group_total(
    client, sample_transaction, sample_category, sample_user
):
    # The real case behind this rule: a withdrawal whose first part kept the
    # full amount, with +265 / -120 / -145 beside it, then deleted one by one.
    anchor_id, refund_id, cash_id, tax_id = _divide(
        client, sample_transaction, sample_category, sample_user, [500.0, 265.0, -120.0, -145.0]
    )

    assert client.delete(f"/api/transactions/{refund_id}").status_code == 204
    assert client.delete(f"/api/transactions/{cash_id}").status_code == 204

    anchor = client.get(f"/api/transactions/{anchor_id}").json()
    tax = client.get(f"/api/transactions/{tax_id}").json()
    assert anchor["amount"] + tax["amount"] == 500.0
