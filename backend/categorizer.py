"""Suggests a category and a payee for a transaction, from the household's own history.

Business logic only; the endpoints live in routers/categorizer.py.

**Why a model trained here rather than an off-the-shelf service or a rule
engine.** Measured on the production dataset (22 135 rows carrying both a
category and a raw bank label, trained on everything before 2025-10-01 and
tested on the twelve months after): a linear model reaches 74.0% exact
accuracy, 81.5% once a subcategory counts as its parent, and 94.4% over the
61.8% of rows where its confidence is at least 0.8. The obvious cheap
alternative — the majority category of each merchant seen before — only
recognises 58.3% of labels, so it lands at 54.4% overall. Stacking the two
("merchant memory first, model otherwise") measured *worse* than the model
alone, 73.1%, because the memory is less accurate than the model exactly where
it applies; that is why there is no lookup table here.

**The input is the raw bank label** (`Transaction.raw_label`), not the payee.
The payee is whatever the user renamed the row to, while a newly synced
transaction only carries what the bank said — training on cleaned labels and
predicting on raw ones would measure a precision the feature could never
deliver. Rows with no raw label at all (the migrated history whose Linxo
export was never obtained) fall back to the payee, which is better than
nothing and is the one place where the two vocabularies mix.

The payee side is a different animal and is documented on `_PayeeMemory`: a
gated lookup rather than a model, because 60% of past renames are annotations
no model could predict, while the recurring merchants that *are* renamed
consistently can simply be remembered.

scikit-learn is imported lazily inside the functions that need it: it costs
over a second to import and the backend's other 99% of requests never touch
it, so a Cloud Run cold start should not pay for it.
"""

import gzip
import pickle
import re
from typing import Any, Iterable

# Below this many labelled rows a trained model is noise; the endpoint 422s.
MIN_TRAINING_ROWS = 50
# Confidence at or above which a suggestion is considered high-confidence.
# Suggestions below it are still returned (and still applied, left
# unreconciled for review) — the threshold only labels them.
DEFAULT_CONFIDENCE_THRESHOLD = 0.8
# Thresholds the training report walks, so the UI can show the trade-off
# between how many rows get a suggestion and how often it is right.
REPORT_THRESHOLDS = (0.5, 0.6, 0.7, 0.8, 0.9)

# Payee memory gate (see _PayeeMemory): how many times a merchant must have
# been seen, and how dominant its most frequent name must be among those
# sightings, before that name is proposed for a new transaction.
DEFAULT_PAYEE_MIN_OCCURRENCES = 2
DEFAULT_PAYEE_MIN_STABILITY = 0.9

_PICKLE_PROTOCOL = 5

_DATEISH = re.compile(r"\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b")
_LONGNUM = re.compile(r"\b[A-Z]*\d{3,}[A-Z]*\b")
_NONWORD = re.compile(r"[^A-Za-z0-9 ]")
_SPACES = re.compile(r"\s+")


def label_text(t) -> str:
    """The text the model reads: what the bank reported, or the payee when the
    row predates the raw_* columns and no backfill could reach it."""
    return (t.raw_label or t.payee or "").strip()


def merchant_key(label: str) -> str:
    """A label stripped of everything that varies between two purchases at the
    same merchant — dates, card and reference numbers, punctuation. Used only
    by the naive baseline the training report compares against."""
    s = (label or "").upper()
    s = _DATEISH.sub(" ", s)
    s = _LONGNUM.sub(" ", s)
    s = _NONWORD.sub(" ", s)
    return _SPACES.sub(" ", s).strip()


def _amount_bucket(amount: float) -> str:
    return str(int(min(abs(amount or 0.0), 5000.0) // 50))


def _categorical_row(t) -> list[str]:
    return [
        str(t.account_id),
        "neg" if (t.amount or 0) < 0 else "pos",
        str(t.raw_transaction_code or ""),
        _amount_bucket(t.amount),
    ]


def _word_row(t) -> str:
    return f"{label_text(t)} {t.memo or ''}".strip()


class _Model:
    """The three fitted transformers plus the classifier, kept together so one
    pickle round-trips the whole thing.

    Instances are only ever built by `train()` and only ever unpickled from a
    blob this module wrote into the database — no endpoint accepts a model
    from a client, which is what makes loading a pickle here safe.
    """

    def __init__(self, char_vec, word_vec, cat_enc, classifier, classes, payee_memory=None):
        self.char_vec = char_vec
        self.word_vec = word_vec
        self.cat_enc = cat_enc
        self.classifier = classifier
        self.classes = classes
        # Carried in the same blob as the category model, so activating or
        # rolling back a version moves both heads together.
        self.payee_memory = payee_memory

    def _matrix(self, rows: list):
        from scipy.sparse import hstack

        return hstack([
            self.char_vec.transform([label_text(t) for t in rows]),
            self.word_vec.transform([_word_row(t) for t in rows]),
            self.cat_enc.transform([_categorical_row(t) for t in rows]),
        ]).tocsr()

    def predict(self, rows: list) -> list[tuple[int, float]]:
        """(category_id, confidence) per row, in the order given."""
        if not rows:
            return []
        proba = self.classifier.predict_proba(self._matrix(rows))
        best = proba.argmax(axis=1)
        return [(int(self.classes[b]), float(proba[i][b])) for i, b in enumerate(best)]

    def predict_top(self, rows: list, k: int = 3) -> list[list[tuple[int, float]]]:
        if not rows:
            return []
        proba = self.classifier.predict_proba(self._matrix(rows))
        out = []
        for row in proba:
            order = row.argsort()[::-1][:k]
            out.append([(int(self.classes[j]), float(row[j])) for j in order])
        return out


def train(rows: list,
          payee_min_occurrences: int = DEFAULT_PAYEE_MIN_OCCURRENCES,
          payee_min_stability: float = DEFAULT_PAYEE_MIN_STABILITY) -> tuple["_Model", dict[str, Any]]:
    """Fit both heads on a selection of transactions.

    The category head needs a category to learn from, so it only reads rows
    that have one; the payee memory reads every row with a payee, including
    uncategorised ones. Returns the model and the parameters it was fitted
    with, for the record kept alongside the stored blob.
    """
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import OneHotEncoder

    char_vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=3, sublinear_tf=True)
    word_vec = TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=2, sublinear_tf=True)
    cat_enc = OneHotEncoder(handle_unknown="ignore")

    from scipy.sparse import hstack

    x = hstack([
        char_vec.fit_transform([label_text(t) for t in rows]),
        word_vec.fit_transform([_word_row(t) for t in rows]),
        cat_enc.fit_transform([_categorical_row(t) for t in rows]),
    ]).tocsr()
    y = [t.category_id for t in rows]

    # Probabilities are the whole point of the confidence threshold, so this
    # is a logistic regression rather than the (faster) linear SVC that scored
    # identically without them.
    classifier = LogisticRegression(max_iter=400, C=10)
    classifier.fit(x, y)

    memory = build_payee_memory(rows, payee_min_occurrences, payee_min_stability)
    model = _Model(char_vec, word_vec, cat_enc, classifier, list(classifier.classes_), memory)
    params = {
        "features": int(x.shape[1]),
        "classes": len(model.classes),
        "char_ngrams": "3-5",
        "word_ngrams": "1-2",
        "classifier": "logistic_regression",
        "C": 10,
        "payee_min_occurrences": payee_min_occurrences,
        "payee_min_stability": payee_min_stability,
        "payee_merchants": len(memory.mapping),
    }
    return model, params


def dumps(model: "_Model") -> bytes:
    return gzip.compress(pickle.dumps(model, protocol=_PICKLE_PROTOCOL))


def loads(blob: bytes) -> "_Model":
    return pickle.loads(gzip.decompress(blob))


def _parent_of(categories: dict[int, Any], category_id: int) -> int:
    category = categories.get(category_id)
    if category is None:
        return category_id
    return category.parent_id or category.id


def evaluate(model: "_Model", rows: list, train_rows: list, categories: dict[int, Any]) -> dict[str, Any]:
    """Score the model on held-out rows, next to the naive baseline.

    The baseline is there to answer "is the model worth its cost" rather than
    just "is the model good": a merchant-majority lookup is almost free, so a
    model that barely beats it does not justify shipping scikit-learn.
    """
    if not rows:
        return {"tested_rows": 0}

    truth = [t.category_id for t in rows]
    predictions = model.predict(rows)
    tops = model.predict_top(rows, k=3)

    exact = sum(1 for (c, _), y in zip(predictions, truth) if c == y)
    parent = sum(
        1 for (c, _), y in zip(predictions, truth)
        if _parent_of(categories, c) == _parent_of(categories, y)
    )
    top3 = sum(1 for cands, y in zip(tops, truth) if y in [c for c, _ in cands])

    thresholds = []
    for threshold in REPORT_THRESHOLDS:
        covered = [(c, y) for (c, conf), y in zip(predictions, truth) if conf >= threshold]
        if not covered:
            continue
        thresholds.append({
            "threshold": threshold,
            "coverage": len(covered) / len(rows),
            "accuracy": sum(1 for c, y in covered if c == y) / len(covered),
            "parent_accuracy": sum(
                1 for c, y in covered if _parent_of(categories, c) == _parent_of(categories, y)
            ) / len(covered),
        })

    return {
        "tested_rows": len(rows),
        "accuracy": exact / len(rows),
        "parent_accuracy": parent / len(rows),
        "top3_accuracy": top3 / len(rows),
        "thresholds": thresholds,
        "baseline": _baseline(train_rows, rows, categories),
    }


def _baseline(train_rows: list, rows: list, categories: dict[int, Any]) -> dict[str, Any]:
    """Majority category per merchant key, learned from the training rows."""
    from collections import Counter, defaultdict

    seen: dict[str, Counter] = defaultdict(Counter)
    for t in train_rows:
        seen[merchant_key(label_text(t))][t.category_id] += 1
    majority = {k: c.most_common(1)[0][0] for k, c in seen.items()}
    fallback = Counter(t.category_id for t in train_rows).most_common(1)[0][0] if train_rows else None

    covered = [t for t in rows if merchant_key(label_text(t)) in majority]
    hits = sum(1 for t in covered if majority[merchant_key(label_text(t))] == t.category_id)
    overall = sum(
        1 for t in rows
        if majority.get(merchant_key(label_text(t)), fallback) == t.category_id
    )
    return {
        "coverage": len(covered) / len(rows),
        "accuracy_on_covered": hits / len(covered) if covered else 0.0,
        "accuracy": overall / len(rows),
    }


class _PayeeMemory:
    """Proposes the name the household already gave a recurring merchant.

    Not a model and nothing learned: a GROUP BY over past transactions,
    keyed by `merchant_key`. It earns its place through a gate rather than
    through cleverness.

    **Why the gate is on stability and not on recurrence.** Measured on the
    production dataset, 60% of past renames are annotations rather than
    cleanups — `CARTE 17/05/23 AFD CB*4325` became `Soirée Barcarolle -
    Pizzas`, which no amount of history can predict. Restricting to merchants
    seen at least twenty times only brings that down to 43%, and proposing
    their last seen name is right just 65% of the time, because a recurring
    merchant gets annotated too. But requiring that one name account for most
    of a merchant's sightings separates the two populations cleanly: at two
    sightings and 90% stability the rule covers 23.7% of rows at 91.0%
    precision, and at five sightings and 90% it covers 17.9% at 95.2%. Below
    the gate it proposes nothing at all, which is the point — a wrong rename
    is worse than none, even though `raw_label` keeps the original.

    This covers the deliberate renames of recurring merchants (`PRLV SEPA
    SFR` → `SFR`). The purely mechanical cleanups (stripping a `CARTE 06/10`
    prefix) are a different population, handled by the regexes in
    bank_sync_config.json rather than here.
    """

    def __init__(self, mapping: dict[str, str], min_occurrences: int, min_stability: float):
        self.mapping = mapping
        self.min_occurrences = min_occurrences
        self.min_stability = min_stability

    def suggest(self, t) -> str | None:
        return self.mapping.get(merchant_key(label_text(t)))


def build_payee_memory(rows: list, min_occurrences: int, min_stability: float) -> "_PayeeMemory":
    from collections import Counter, defaultdict

    seen: dict[str, Counter] = defaultdict(Counter)
    for t in rows:
        payee = (t.payee or "").strip()
        key = merchant_key(label_text(t))
        if payee and key:
            seen[key][payee] += 1

    mapping = {}
    for key, names in seen.items():
        total = sum(names.values())
        name, count = names.most_common(1)[0]
        if total >= min_occurrences and count / total >= min_stability:
            mapping[key] = name
    return _PayeeMemory(mapping, min_occurrences, min_stability)


def evaluate_payee(memory: "_PayeeMemory", rows: list) -> dict[str, Any]:
    """Coverage and precision of the payee memory on held-out rows.

    Precision is what matters here, not accuracy over everything: the rule
    stays silent on most rows by design, so a number averaged over rows it
    never speaks about would say nothing useful.
    """
    scored = [t for t in rows if (t.payee or "").strip()]
    if not scored:
        return {"tested_rows": 0, "merchants": len(memory.mapping)}
    proposed = [(t, memory.suggest(t)) for t in scored]
    covered = [(t, name) for t, name in proposed if name is not None]
    hits = sum(1 for t, name in covered if name == (t.payee or "").strip())
    changes = sum(1 for t, name in covered if name != (t.payee or "").strip())
    return {
        "tested_rows": len(scored),
        "merchants": len(memory.mapping),
        "coverage": len(covered) / len(scored),
        "precision": hits / len(covered) if covered else 0.0,
        "would_change": changes,
    }


def trainable(rows: Iterable) -> list:
    """The subset of a selection a model can actually learn from: a category to
    learn, and some text to learn it from."""
    return [t for t in rows if t.category_id is not None and label_text(t)]
