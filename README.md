# MyFinance

Personal finance dashboard for tracking accounts and transactions.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2.x, SQLite (local/dev) / Postgres (production, via `DATABASE_URL`) |
| Frontend | React 19, TypeScript 5.6, Vite 6, Tailwind CSS v4, recharts, lucide-react |

## Architecture

```
backend/     FastAPI app with full CRUD REST API
frontend/    Single-page React app with state-based view switching
```

All data is stored in a single `backend/finance.db` SQLite file (not tracked in git — recreated via `seed.py`).

## Prerequisites

- Python 3.11+
- Node.js 18+

## Getting Started

### 1. Backend

```sh
cd backend
pip install -r requirements.txt
python seed.py              # creates database with sample data
uvicorn main:app --reload   # http://localhost:8000
```

### 2. Frontend

```sh
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Open http://localhost:5173 in your browser.

> **Note:** The backend `seed.py` script **drops and recreates** all data each time it runs. Any manually added data will be lost.

## API Endpoints

### Users

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | List all users |
| POST | `/api/users` | Create a user |
| PUT | `/api/users/{id}` | Update a user |
| DELETE | `/api/users/{id}` | Delete a user (409 if owns accounts) |

### Accounts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/accounts?user_id=X` | List accounts (optional filter by user ownership) |
| POST | `/api/accounts` | Create an account (with optional `users` array) |
| PUT | `/api/accounts/{id}` | Update an account |
| DELETE | `/api/accounts/{id}` | Delete an account (409 if has transactions) |

### Categories

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/categories` | List all categories |
| POST | `/api/categories` | Create a new category |
| PUT | `/api/categories/{id}` | Update a category |
| DELETE | `/api/categories/{id}` | Delete a category (409 if has transactions) |

### Transactions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/transactions?user_id=X` | List transactions (optional filter by user ownership) |
| POST | `/api/transactions/search` | Filtered, paginated transaction search |
| POST | `/api/transactions` | Create a transaction (optional `?actor_user_id=X` for the audit trail) |
| PUT | `/api/transactions/{id}` | Update a transaction (optional `?actor_user_id=X`) |
| DELETE | `/api/transactions/{id}` | Delete a transaction (optional `?actor_user_id=X`) |
| GET | `/api/transactions/{id}/history` | Audit trail (create/update/delete snapshots) for a transaction |

### Splits & Balances

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/split-weights` | Get the household's global split weights |
| PUT | `/api/split-weights` | Update the household's global split weights |
| POST | `/api/split-preview` | Preview how a transaction would be split without saving it |
| GET | `/api/balances` | Net position (`paid − share`) for every user, per currency |

### CSV Import

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/import/detect` | Auto-detect a CSV's delimiter/encoding/column mapping |
| POST | `/api/import/preview` | Preview parsed rows for a given column mapping before committing |
| POST | `/api/import/commit` | Commit a previewed CSV import as transactions (optional `?actor_user_id=X`) |

### Backup & Restore

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/backup/export` | Export the full database as a zipped JSON archive |
| POST | `/api/backup/import?mode=overwrite\|append` | Restore/merge a previously exported archive |

### Dashboard

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard?user_id=X` | All accounts + 10 most recent transactions + balances (optional filter by user) |

### Charts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/charts?user_id=X&currency=Y` | Per-category, per-month, and net chart data |

## Running Tests

### Backend

```sh
cd backend
pytest
```

Uses `pytest` with `httpx` for the test client. An in-memory SQLite database is used automatically — no external database setup required.

### Frontend

```sh
cd frontend
npm test
```

Uses `vitest` with `@testing-library/react` and `jsdom`. Component tests mock the API client module.

## Project Structure

```
backend/
├── database.py         SQLAlchemy engine, session, sync_schema() (additive prod migration)
├── main.py             FastAPI app and route definitions
├── models.py           ORM models: User, Account, Category, Transaction, AccountUser,
│                          CategorySplit, GlobalSplitWeight, TransactionSplit, TransactionHistory
├── schemas.py          Pydantic I/O schemas
├── seed.py             Database seeder (destructive)
├── accounting_month.py Derives accounting_month from date + accounting_month_offset
├── audit.py            Writes TransactionHistory snapshots on create/update/delete
├── backup.py           Full DB export/import (zipped JSON archive)
├── charts.py           Per-category/per-month/net chart data aggregation
├── filtering.py        Transaction search filter-building
├── import_csv.py       CSV column detection, preview, and commit
├── split_engine.py     Split resolution (manual > category > global) and balance computation
├── Dockerfile
├── requirements.txt
└── tests/
    ├── conftest.py                    Shared fixtures (in-memory DB, test client)
    ├── test_accounts.py               Account CRUD + ownership tests
    ├── test_categories.py             Category CRUD + error tests
    ├── test_dashboard.py              Dashboard aggregate + user filtering tests
    ├── test_transactions.py           Transaction CRUD + user filtering tests
    ├── test_transaction_history.py    Audit trail tests
    ├── test_users.py                  User CRUD + ownership 409 tests
    ├── test_split_engine.py           Split resolution tests
    ├── test_split_weights.py          Global split weight endpoint tests
    ├── test_balances.py               Balance computation/endpoint tests
    ├── test_import.py                 CSV import detect/preview/commit tests
    ├── test_backup.py                 Backup export/import tests
    ├── test_charts.py                 Charts endpoint tests
    └── test_database.py               sync_schema() tests

frontend/
├── src/
│   ├── main.tsx                 App entrypoint
│   ├── App.tsx                  Root component (view switching, user selection)
│   ├── index.css                Tailwind CSS v4 entrypoint/global styles
│   ├── setupTests.ts            Test setup (jest-dom matchers)
│   ├── test-utils.tsx           Shared test render helpers
│   ├── vite-env.d.ts            Vite/env-var type declarations
│   ├── __tests__/
│   │   └── App.test.tsx         App-level view-switching tests
│   ├── api/
│   │   ├── client.ts            API client (fetch-based)
│   │   └── __tests__/
│   │       └── client.test.ts   API client unit tests
│   ├── context/
│   │   ├── ThemeContext.tsx     Dark/light theme state
│   │   └── ToastContext.tsx     Toast notification state
│   ├── utils/
│   │   ├── currency.ts          Currency formatting helpers
│   │   ├── download.ts          Browser file-download helper
│   │   ├── transactions.ts      Transaction grouping/formatting helpers
│   │   ├── urlState.ts          Filter/pagination state synced to the URL
│   │   └── __tests__/
│   │       └── urlState.test.ts
│   └── components/
│       ├── Dashboard.tsx             Main dashboard view (user-filterable)
│       ├── AccountCard.tsx           Account balance card
│       ├── TransactionList.tsx       Transaction table
│       ├── AccountsList.tsx          Full accounts CRUD (with user ownership sub-table)
│       ├── CategoriesList.tsx        Categories CRUD view (with category split editing)
│       ├── TransactionsPage.tsx      Full transactions CRUD (user-filterable, filters/pagination)
│       ├── UsersList.tsx             Full users CRUD view
│       ├── SplitWeightsSettings.tsx  Global split weight settings view
│       ├── SplitEditor.tsx           Per-transaction split override editor
│       ├── BalanceWidget.tsx         Net-position (who-owes-whom) display
│       ├── ChartsPage.tsx            recharts-based per-category/per-month/net charts
│       ├── CsvImportPage.tsx         CSV upload → detect → preview → commit flow
│       ├── BackupPage.tsx            Full database export/import UI
│       ├── FirstLaunchUserPrompt.tsx First-run overlay prompting for a user to select
│       ├── ui/                       Shared design-system primitives
│       │   ├── Button.tsx, IconButton.tsx, Card.tsx, Input.tsx, Table.tsx,
│       │   │   Badge.tsx, Modal.tsx, ConfirmDialog.tsx, StatusMessage.tsx, Toast.tsx
│       │   └── index.ts
│       └── __tests__/
│           ├── AccountCard.test.tsx
│           ├── Dashboard.test.tsx
│           ├── AccountsList.test.tsx
│           ├── CategoriesList.test.tsx
│           ├── TransactionList.test.tsx
│           ├── TransactionsPage.test.tsx
│           ├── UsersList.test.tsx
│           ├── SplitWeightsSettings.test.tsx
│           ├── BalanceWidget.test.tsx
│           ├── ChartsPage.test.tsx
│           ├── CsvImportPage.test.tsx
│           ├── BackupPage.test.tsx
│           └── FirstLaunchUserPrompt.test.tsx
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```
