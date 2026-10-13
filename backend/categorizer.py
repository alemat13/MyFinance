"""Suggests a category for a transaction, from the household's own history.

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

Renaming payees is not this module's job any more: it was a gated lookup of
the names recurring merchants had been given, and it covered too few rows to
matter. Automatic rules (transaction_rules.py) replace it.

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

    def __init__(self, char_vec, word_vec, cat_enc, classifier, classes):
        self.char_vec = char_vec
        self.word_vec = word_vec
        self.cat_enc = cat_enc
        self.classifier = classifier
        self.classes = classes
        # Models trained before automatic rules also carry a `payee_memory`
        # attribute (see _PayeeMemory); nothing reads it.

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


def train(rows: list) -> tuple["_Model", dict[str, Any]]:
    """Fit the model on a selection of categorised transactions. Returns the
    model and the parameters it was fitted with, for the record kept
    alongside the stored blob.
    """
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import SGDClassifier
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

    # Probabilities are the whole point of the confidence threshold, so a
    # LinearSVC is out however well it scores. This is a logistic regression
    # fitted by SGD rather than by lbfgs, which is not a micro-optimisation:
    # measured on the production dataset (26 017 training rows, 89 classes,
    # 64 614 features) `LogisticRegression(max_iter=400, C=10)` took seven to
    # eight minutes, which Cloud Run would have cut off at 120 s, while this
    # takes 36 s on one core and scores slightly *better* — 73.2% exact and
    # 80.8% at parent level against 72.6% and 80.0%, and 95.2% over the 51.1%
    # of rows above confidence 0.8 against 94.4% over 61.8%.
    #
    # `tol=None` runs exactly `max_iter` epochs instead of stopping early, so
    # the time a fit takes is predictable from the row count — which is what
    # keeps the in-request design honest as the ledger grows. 30 epochs is a
    # measured optimum, not a guess: 15 scored 71.8% and 50 scored 72.6%,
    # both worse. `random_state` makes a fit reproducible.
    classifier = SGDClassifier(loss="log_loss", alpha=1e-5, max_iter=30,
                               tol=None, random_state=0)
    classifier.fit(x, y)

    model = _Model(char_vec, word_vec, cat_enc, classifier, list(classifier.classes_))
    params = {
        "features": int(x.shape[1]),
        "classes": len(model.classes),
        "char_ngrams": "3-5",
        "word_ngrams": "1-2",
        "classifier": "sgd_log_loss",
        "alpha": 1e-5,
        "epochs": 30,
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
    """Kept only so the models trained before automatic rules replaced it
    still unpickle (a pickle names its classes). Nothing reads it any more:
    renaming recurring merchants is now an explicit rule, which the household
    asked for after this lookup turned out to cover too few rows to matter."""

    def __init__(self, mapping: dict[str, str], min_occurrences: int, min_stability: float):
        self.mapping = mapping
        self.min_occurrences = min_occurrences
        self.min_stability = min_stability


def trainable(rows: Iterable) -> list:
    """The subset of a selection a model can actually learn from: a category to
    learn, and some text to learn it from."""
    return [t for t in rows if t.category_id is not None and label_text(t)]
