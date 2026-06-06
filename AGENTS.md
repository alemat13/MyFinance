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

## Key gotchas

- **`seed.py` destroys existing data** — calls `Base.metadata.drop_all` then re-inserts sample rows.
- **CORS allows only `http://localhost:5173`** — hardcoded in `backend/main.py`.
- **API base URL hardcoded** — `http://localhost:8000/api` in `frontend/src/api/client.ts`.
- **No `.env` used** though `.env` is gitignored.
- **Backend endpoints are read-only** — only GET `/api/accounts`, `/api/categories`, `/api/transactions`, `/api/dashboard`.
- **Frontend entrypoint chain:** `index.html → main.tsx → App.tsx → Dashboard.tsx`.
