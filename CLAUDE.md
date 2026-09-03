# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

MyFinance — personal finance dashboard. **Python FastAPI** backend + **React 19 / Vite 6** frontend.

```
backend/   FastAPI + SQLAlchemy 2.x + SQLite (single finance.db) locally, Postgres in production via DATABASE_URL
frontend/  React 19, TypeScript 5.6, Vite 6, Tailwind CSS v4, recharts, lucide-react
```

No monorepo tool, no workspaces. No linters/formatters/type-checking configured on the Python side. No routing or state-management libs on the frontend. For local/dev, day-to-day schema changes go through `drop_all`/`create_all` via `seed.py` — fast and destructive, unrelated to Alembic below. Production (Cloud SQL Postgres, persistent real data, never reseeded on deploy) relies on two complementary mechanisms: `database.sync_schema()`, run at startup right after `create_all`, adds any model column missing from an already-existing table — **additive only** (backfills a sensible default for new NOT NULL columns, never drops/renames/retypes) — and **Alembic** (`backend/alembic/`), which handles everything `sync_schema()` can't: renames, retypes, drops, and any non-trivial backfill. `alembic upgrade head` runs automatically in CI/CD before every production deploy (see `.github/workflows/ci-cd.yml`'s `deploy` job) — see "Database migrations" below for the authoring workflow.

## Git workflow

- `main` is the production/deploy branch — pushing to it (via merged PR) triggers `.github/workflows/ci-cd.yml`'s `deploy` job, which redeploys both Cloud Run services. **`main` is branch-protected: direct pushes are rejected, merges require an open PR with passing `test-backend`/`test-frontend` checks.**
- `develop` is the default branch and where all feature work happens. Branch off `develop` for new work, open PRs back into `develop`. Pushes/PRs to `develop` run the test jobs but never deploy.
- To ship, open a PR from `develop` into `main`. Once merged, CI deploys automatically.
- Always create a feature branch off `develop` — never commit directly to `main`, and avoid committing directly to `develop` for anything non-trivial.

## Commands

### Backend
```sh
cd backend
pip install -r requirements.txt          # install deps
uvicorn main:app --reload                # dev server on :8000
python seed.py                           # drops & recreates all data
pytest                                   # run all backend tests
pytest tests/test_accounts.py            # run a single test file
pytest tests/test_accounts.py::test_name # run a single test
```

### Database migrations
```sh
cd backend
alembic revision --autogenerate -m "describe the change"  # write a new migration
alembic upgrade head                                      # apply pending migrations locally
alembic downgrade -1                                      # revert the most recent one
alembic history                                            # list all revisions
```
Write a migration **before** running `seed.py`/reseeding — with your local DB still at
the *old* schema, `--autogenerate` diffs it against the *new* `models.py` and gets the
right result. Always review the generated script: autogenerate sees a column rename as
a drop+add, so rewrite those to `op.alter_column(...)` by hand (same reasoning as the
old hand-written SQL migrations in `backend/migrations/`, now superseded — see that
directory's README). Test with `alembic upgrade head` locally before committing. CI/CD
runs `alembic upgrade head` automatically before every production deploy — no manual
`psql` step needed for a change captured as a migration.

### Frontend
```sh
cd frontend
npm install
npm run dev                     # Vite dev server on :5173
npm run build                   # tsc && vite build
npm test                        # vitest, run once
npm test -- --watch             # vitest, watch mode
npm test -- AccountsList        # run tests matching a name/file
```

## Architecture

- **Entities**: `User`, `Account`, `Category`, `Transaction`, `AccountUser` (junction table for account ownership), plus `CategorySplit`, `GlobalSplitWeight`, `AccountSplitWeight` (the three split-weight prefill tiers), `TransactionSplit` (a transaction's own stored weight + derived share) and `TransactionHistory` (audit trail). Full ERD and column details in `docs/data-model.md`.
- **Multi-user ownership**: accounts can be jointly owned via `account_users`, which stores an `ownership_percentage` per (account, user). The backend enforces percentages sum to exactly 100% per account (422 if not, within 0.01 tolerance). This is entirely separate from split weights (below) — ownership only drives visibility filtering and the "paid" side of balances, never share amounts.
- **User-scoped filtering**: `GET /api/transactions`, `/api/accounts`, `/api/dashboard` accept `?user_id=X`, filtering to accounts where that user has `ownership_percentage > 0`.
- **Delete protection**: deleting an account/category with existing transactions returns 409; deleting a user who still owns an account returns 409.
- **Splits & balances** (`backend/split_engine.py`): every transaction stores its own integer `weight` per involved user in `transaction_splits`, freely editable by the client or bulk-filled via a quick-access button from one of three prefill-only tiers — `global_split_weights` (lowest priority) → `account_split_weights` (middle) → `category_splits` (highest) — resolved by `resolve_default_weights()` only to suggest defaults, never to live-recompute an existing transaction. `share_amount` is always derived from `weight` + the current `amount` via `prorate()` (2-decimal rounding, remainder to the highest `user_id`) and recomputed/persisted on every create/update; it's never itself client-editable. `GET /api/balances` (and `GET /api/dashboard`) reports each user's net position (`paid − share`) per currency, still driven by `ownership_percentage` on the "paid" side. `GET/PUT /api/split-weights` and `GET/PUT /api/accounts/{id}/split-weights` back the global and account weight-tier settings UI.
- **CSV import** (`backend/import_csv.py`): `POST /api/import/detect`, `/preview`, `/commit` drive column auto-detection and a preview-before-commit flow for bulk transaction upload.
- **Backup & restore** (`backend/backup.py`): `GET /api/backup/export` / `POST /api/backup/import` export/import the full database as a zipped JSON archive.
- **Audit trail** (`backend/audit.py`): every transaction create/update/delete writes a snapshot row to `transaction_history`, readable via `GET /api/transactions/{id}/history`. Its FK-like columns (`transaction_id`, `changed_by_user_id`) are deliberately plain integers, not real foreign keys — see the comment in `models.py`.
- **Backend layout**: `main.py` (routes), `models.py` (SQLAlchemy ORM), `schemas.py` (Pydantic I/O schemas), `database.py` (engine/session, `sync_schema()`), `seed.py` (destructive seeder), `alembic/` (migration environment + `versions/`, see "Database migrations" above), plus `accounting_month.py`, `audit.py`, `backup.py`, `charts.py`, `filtering.py`, `import_csv.py`, `split_engine.py`.
- **Frontend entrypoint chain**: `index.html → main.tsx → App.tsx → Dashboard.tsx`. `App.tsx` owns view-switching (no router, plain `useState`) across 9 views — `dashboard`, `accounts`, `categories`, `transactions`, `users`, `split-settings`, `import`, `backup`, `charts` — and the user-selector dropdown (persisted to `localStorage`, filters all views via `user_id`), plus a `FirstLaunchUserPrompt` overlay shown before a user is chosen.
- **Frontend list views** (`AccountsList`, `CategoriesList`, `TransactionsPage`, `UsersList`) do full CRUD with inline New/Edit/Delete forms — no modals, except `TransactionsPage`: creating a transaction is still an inline form, but clicking an existing row opens `TransactionDetail`, a `Modal`-based view/edit/delete/history panel (bookmarkable via a `?transaction=` URL param). The account form includes two independent multi-row sub-tables: per-user ownership percentages, and the account's own split-weight tier. `CategoriesList` edits the category weight tier the same way. Transaction create/edit (`TransactionsPage`, `TransactionDetail`) share `TransactionSplitFields` — an always-visible integer-weight editor with "Global"/"Account"/"Category" tier quick-fill buttons, a "Split Evenly" button, a quick-fill button per user (assigns that user alone), and a live-computed (client-side `prorateWeights()`, mirroring the backend) read-only euro amount per row. Other views: `SplitWeightsSettings` (global weight tier settings) + `SplitEditor` (the generic row-editor reused by all four weight/percentage tables), `BalanceWidget` (net-position display), `ChartsPage` (recharts-based per-category/per-month/net charts), `CsvImportPage`, `BackupPage`.
- **Shared frontend infra**: `components/ui/` holds the design-system primitives (`Button`, `Card`, `Modal`, `Table`, `Toast`, etc.), `context/` holds `ThemeContext` (dark mode) and `ToastContext`, `utils/` holds `currency.ts`, `download.ts`, `splitWeights.ts` (client-side `prorateWeights()`/`resolveDefaultSplitRows()`, mirroring `split_engine.py`), `transactions.ts`, `urlState.ts`. Styling is Tailwind CSS v4 utility classes (`index.css`), not a hand-rolled stylesheet.
- **API client**: `frontend/src/api/client.ts`, fetch-based. Base URL is `` `http://${window.location.hostname}:8000/api` `` unless overridden by the `VITE_API_URL` build-time env var — not hardcoded to `localhost`.

## Documentation

- User-facing behavior changes (new/changed views, forms, buttons, flows) **must** be reflected in `docs/user-guide.md` in the same PR — don't leave it stale. Schema/entity changes likewise require updating `docs/data-model.md`. When editing `models.py`, `main.py` routes, or `frontend/src/` in ways that change what a user sees or does, check whether `docs/user-guide.md` needs a matching update before considering the task done, and do the same for this file (`CLAUDE.md`) when architecture, commands, or workflow change.

## Key gotchas

- `seed.py` **destroys existing data** — `drop_all` then re-inserts sample rows. Never run it against production.
- Adding a new nullable-with-scalar-default column to a model is safe to deploy straight to production — `sync_schema()` backfills it automatically on next startup, no migration needed. Anything else (rename, retype, drop, a NOT NULL column with no usable default) needs an Alembic migration (`alembic revision --autogenerate`, reviewed and tested locally) committed alongside the model change — CI/CD applies it automatically before deploy, so a merged PR with the migration file just works.
- CORS origins default to `http://localhost:5173` plus a couple of LAN/Tailscale dev origins (`backend/main.py`), but are fully overridable via the `CORS_ALLOWED_ORIGINS` env var (comma-separated) — production sets this explicitly in `ci-cd.yml`.
- No `.env` is actually used, though `.env` is gitignored — runtime env vars (`DATABASE_URL`, `CORS_ALLOWED_ORIGINS`, `VITE_API_URL`) are instead set via Docker build args / Cloud Run env vars in CI.
- Backend tests use `sqlite:///:memory:` with `dependency_overrides[get_db]`; tables are created/dropped per test session (see `backend/tests/conftest.py`).
- Frontend component tests mock `src/api/client` via `vi.mock`; API-client tests mock `global.fetch` directly instead.
- Components using `alert()`/`confirm()` need those mocked with `vi.spyOn` in their tests.
