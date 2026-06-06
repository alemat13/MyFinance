# MyFinance

Personal finance dashboard for tracking accounts and transactions.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2.x, SQLite |
| Frontend | React 19, TypeScript 5.6, Vite 6 |

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

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/accounts` | List all accounts |
| POST | `/api/accounts` | Create a new account |
| PUT | `/api/accounts/{id}` | Update an account |
| DELETE | `/api/accounts/{id}` | Delete an account (409 if has transactions) |
| GET | `/api/categories` | List all categories |
| POST | `/api/categories` | Create a new category |
| PUT | `/api/categories/{id}` | Update a category |
| DELETE | `/api/categories/{id}` | Delete a category (409 if has transactions) |
| GET | `/api/transactions` | List all transactions (with account/category names) |
| POST | `/api/transactions` | Create a transaction |
| PUT | `/api/transactions/{id}` | Update a transaction |
| DELETE | `/api/transactions/{id}` | Delete a transaction |
| GET | `/api/dashboard` | All accounts + 10 most recent transactions |

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
├── database.py      SQLAlchemy engine and session
├── main.py          FastAPI app and route definitions
├── models.py        ORM models: Account, Category, Transaction
├── schemas.py       Pydantic response schemas
├── seed.py          Database seeder (destructive)
├── requirements.txt
└── tests/
    ├── conftest.py          Shared fixtures (in-memory DB, test client)
    ├── test_accounts.py     Account CRUD + error tests
    ├── test_categories.py   Category CRUD + error tests
    ├── test_transactions.py Transaction CRUD + error tests
    └── test_dashboard.py    Dashboard aggregate tests

frontend/
├── src/
│   ├── main.tsx                 App entrypoint
│   ├── App.tsx                  Root component (view router)
│   ├── App.css                  Global styles
│   ├── setupTests.ts            Test setup (jest-dom matchers)
│   ├── api/
│   │   ├── client.ts            API client (fetch-based)
│   │   └── __tests__/
│   │       └── client.test.ts   API client unit tests
│   └── components/
│       ├── Dashboard.tsx        Main dashboard view
│       ├── AccountCard.tsx      Account balance card
│       ├── TransactionList.tsx  Transaction table
│       ├── AccountsList.tsx     Full accounts CRUD view
│       ├── CategoriesList.tsx   Categories CRUD view
│       ├── TransactionsPage.tsx Full transactions CRUD view
│       └── __tests__/
│           ├── AccountCard.test.tsx
│           ├── Dashboard.test.tsx
│           ├── AccountsList.test.tsx
│           ├── CategoriesList.test.tsx
│           ├── TransactionList.test.tsx
│           └── TransactionsPage.test.tsx
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```
