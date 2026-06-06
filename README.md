# MyFinance

Personal finance dashboard for tracking accounts and transactions.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2.x, SQLite |
| Frontend | React 19, TypeScript 5.6, Vite 6 |

## Architecture

```
backend/     FastAPI app with 4 read-only GET endpoints
frontend/    Single-page React app with no routing or state management
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

All endpoints are read-only and return JSON.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/accounts` | All accounts with balances |
| GET | `/api/categories` | All transaction categories |
| GET | `/api/transactions` | All transactions (with account/category names) |
| GET | `/api/dashboard` | All accounts + 10 most recent transactions |

## Project Structure

```
backend/
├── database.py      SQLAlchemy engine and session
├── main.py          FastAPI app and route definitions
├── models.py        ORM models: Account, Category, Transaction
├── schemas.py       Pydantic response schemas
├── seed.py          Database seeder (destructive)
└── requirements.txt

frontend/
├── src/
│   ├── main.tsx                 App entrypoint
│   ├── App.tsx                  Root component
│   ├── App.css                  Global styles
│   ├── api/
│   │   └── client.ts            API client (fetch-based)
│   └── components/
│       ├── Dashboard.tsx        Main dashboard view
│       ├── AccountCard.tsx      Account balance card
│       └── TransactionList.tsx  Transaction table
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```
