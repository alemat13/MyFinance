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
| POST | `/api/transactions` | Create a transaction |
| PUT | `/api/transactions/{id}` | Update a transaction |
| DELETE | `/api/transactions/{id}` | Delete a transaction |

### Dashboard

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard?user_id=X` | All accounts + 10 most recent transactions (optional filter by user) |

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
├── models.py        ORM models: User, Account, Category, Transaction, AccountUser
├── schemas.py       Pydantic response schemas
├── seed.py          Database seeder (destructive)
├── requirements.txt
└── tests/
    ├── conftest.py              Shared fixtures (in-memory DB, test client)
    ├── test_accounts.py         Account CRUD + ownership tests
    ├── test_categories.py       Category CRUD + error tests
    ├── test_dashboard.py        Dashboard aggregate + user filtering tests
    ├── test_transactions.py     Transaction CRUD + user filtering tests
    └── test_users.py            User CRUD + ownership 409 tests

frontend/
├── src/
│   ├── main.tsx                 App entrypoint
│   ├── App.tsx                  Root component (view router, user selection)
│   ├── App.css                  Global styles
│   ├── setupTests.ts            Test setup (jest-dom matchers)
│   ├── api/
│   │   ├── client.ts            API client (fetch-based)
│   │   └── __tests__/
│   │       └── client.test.ts   API client unit tests
│   └── components/
│       ├── Dashboard.tsx        Main dashboard view (user-filterable)
│       ├── AccountCard.tsx      Account balance card
│       ├── TransactionList.tsx  Transaction table
│       ├── AccountsList.tsx     Full accounts CRUD (with user ownership sub-table)
│       ├── CategoriesList.tsx   Categories CRUD view
│       ├── TransactionsPage.tsx Full transactions CRUD (user-filterable)
│       ├── UsersList.tsx        Full users CRUD view
│       └── __tests__/
│           ├── AccountCard.test.tsx
│           ├── Dashboard.test.tsx
│           ├── AccountsList.test.tsx
│           ├── CategoriesList.test.tsx
│           ├── TransactionList.test.tsx
│           ├── TransactionsPage.test.tsx
│           └── UsersList.test.tsx
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```
