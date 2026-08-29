# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

MyFinance — personal finance dashboard. **Python FastAPI** backend + **React 19 / Vite 6** frontend.

```
backend/   FastAPI + SQLAlchemy 2.x + SQLite (single finance.db)
frontend/  React 19, TypeScript 5.6, Vite 6
```

No monorepo tool, no workspaces. No linters/formatters/type-checking configured on the Python side. No routing or state-management libs on the frontend. No Alembic — for local/dev, schema changes go through `drop_all`/`create_all` via `seed.py`. Production (Cloud SQL Postgres, persistent real data, never reseeded on deploy) instead relies on `database.sync_schema()`, run at startup right after `create_all`: it adds any model column missing from an already-existing table. This is **additive only** — it backfills a sensible default for new NOT NULL columns but never drops, renames, or retypes a column, so renaming a column or changing its type still needs a manual, hand-written migration.

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

- **Entities**: `User`, `Account`, `Category`, `Transaction`, plus `AccountUser` (junction table for account ownership). Full ERD and column details in `docs/data-model.md`.
- **Multi-user ownership**: accounts can be jointly owned via `account_users`, which stores an `ownership_percentage` per (account, user). The backend enforces percentages sum to exactly 100% per account (422 if not, within 0.01 tolerance).
- **User-scoped filtering**: `GET /api/transactions`, `/api/accounts`, `/api/dashboard` accept `?user_id=X`, filtering to accounts where that user has `ownership_percentage > 0`.
- **Delete protection**: deleting an account/category with existing transactions returns 409; deleting a user who still owns an account returns 409.
- **Backend layout**: `main.py` (routes), `models.py` (SQLAlchemy ORM), `schemas.py` (Pydantic I/O schemas), `database.py` (engine/session), `seed.py` (destructive seeder).
- **Frontend entrypoint chain**: `index.html → main.tsx → App.tsx → Dashboard.tsx`. `App.tsx` owns view-switching (no router) and the user-selector dropdown (persisted to `localStorage`, filters all views via `user_id`).
- **Frontend list views** (`AccountsList`, `CategoriesList`, `TransactionsPage`, `UsersList`) do full CRUD with inline New/Edit/Delete forms — no modals. The account form includes a multi-row sub-table for editing per-user ownership percentages.
- **API client**: `frontend/src/api/client.ts`, fetch-based, base URL hardcoded to `http://localhost:8000/api`.

## Key gotchas

- `seed.py` **destroys existing data** — `drop_all` then re-inserts sample rows. Never run it against production.
- Adding a new nullable-with-scalar-default column to a model is safe to deploy straight to production — `sync_schema()` backfills it automatically on next startup. Anything else (rename, retype, drop, a NOT NULL column with no usable default) needs a hand-written migration before merging, or production will 500 on every query touching that table until one is applied.
- CORS allows only `http://localhost:5173`, hardcoded in `backend/main.py`.
- No `.env` is actually used, though `.env` is gitignored.
- Backend tests use `sqlite:///:memory:` with `dependency_overrides[get_db]`; tables are created/dropped per test session (see `backend/tests/conftest.py`).
- Frontend component tests mock `src/api/client` via `vi.mock`; API-client tests mock `global.fetch` directly instead.
- Components using `alert()`/`confirm()` need those mocked with `vi.spyOn` in their tests.
