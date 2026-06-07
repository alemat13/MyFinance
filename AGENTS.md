# MyFinance

Personal Finance Manager — **Python FastAPI** backend + **React 19 / Vite 6** frontend.

## Architecture

```
backend/   FastAPI + SQLAlchemy 2.x + SQLite (single finance.db)
frontend/  React 19, TypeScript 5.6, Vite 6
```

- No monorepo tool, no workspaces.
- No tests, no linters, no formatters, no type-checking on Python side.
- No routing or state management libs on frontend.
- No Alembic — schema changes require `drop_all`/`create_all` via `seed.py`.

## Commands

### Backend

```sh
pip install -r requirements.txt          # install deps
uvicorn main:app --reload                # dev server on :8000
python seed.py                           # drops & recreates all data
```

### Frontend

```sh
npm install        # from frontend/
npm run dev        # Vite dev server on :5173
npm run build      # tsc && vite build
```

### Tests

```sh
cd backend && pytest          # backend tests (pytest + httpx, in-memory SQLite)
cd frontend && npm test       # frontend tests (vitest + @testing-library/react, jsdom)
cd frontend && npm test -- --watch  # frontend tests in watch mode
```

## Key gotchas

- **`seed.py` destroys existing data** — calls `Base.metadata.drop_all` then re-inserts sample rows.
- **CORS allows only `http://localhost:5173`** — hardcoded in `backend/main.py`.
- **API base URL hardcoded** — `http://localhost:8000/api` in `frontend/src/api/client.ts`.
- **No `.env` used** though `.env` is gitignored.
- **Full CRUD via REST** — each entity has `GET / POST / PUT / DELETE`.
- **Delete protected** — accounts/categories with transactions return **409 Conflict**. Users with account ownership also return 409.
- **Multi-user support** — `users` table with `account_users` junction (ownership percentage). Accounts can be joint-owned.
- **User filtering** — `?user_id=X` query param on `/api/transactions`, `/api/dashboard`, `/api/accounts` filters by accounts where user has >0% ownership.
- **Ownership validation** — account ownership percentages must sum to exactly 100% (backend returns 422 otherwise).
- **Frontend user selection** — dropdown in App.tsx header; stored in localStorage; filters all views.
- **Frontend entrypoint chain:** `index.html → main.tsx → App.tsx → Dashboard.tsx`.
- **Inline editing** — list views support New/Edit/Delete via inline forms, no modals. Account forms include a multi-row user ownership sub-table.
- **Backend test DB** — uses `sqlite:///:memory:` with `dependency_overrides[get_db]`; tables are created/dropped per test session
- **Frontend test mocks** — component tests mock `src/api/client` via `vi.mock`; API client tests mock `global.fetch` directly
- **`alert()`/`confirm()` in tests** — components using `alert()`/`confirm()` must have these mocked via `vi.spyOn` in component tests
