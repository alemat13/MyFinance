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

### API types (OpenAPI)
```sh
cd backend && python export_openapi.py   # app.openapi() → frontend/src/api/openapi.json
cd frontend && npm run gen:api           # openapi.json → src/api/schema.d.ts (openapi-typescript)
```
Swagger UI is served at `/api/docs` (ReDoc at `/api/redoc`, the schema at `/api/openapi.json`), under `/api` because that is the only prefix the production load balancer sends to the backend, so it is reachable in production behind IAP like the rest of the API.
Run both, and commit both files, whenever a model in `schemas/` or a route's signature changes.
`backend/tests/test_openapi_export.py` fails while `openapi.json` is stale, and
`test-frontend` fails while `schema.d.ts` doesn't match it. `client.ts` aliases the
generated types (`export type Account = Schemas['AccountOut']`) instead of redeclaring
them, adjusted with its `With<>` (a narrower literal union where the backend says `str`)
and `Loose<>` (a field made optional so test fixtures can omit it) helpers; a hand-written
interface is left only for client-only shapes and endpoints with no `response_model`.
Every model in `schemas/` derives from `Schema` (`schemas/base.py`), whose
`json_schema_serialization_defaults_required` lists defaulted fields as required on the
response side (a response always carries them) while they stay optional in requests;
`gen:api` passes `--default-non-nullable false` so a request field with a default is
optional too. A model used both ways comes out as `X-Input`/`X-Output`.

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

### End-to-end tests
```sh
cd e2e
npm install
npx playwright install --with-deps chromium   # one-time browser install
npx playwright test                           # runs against a real backend + frontend + finance.db
npx playwright test tests/01-crud.spec.ts     # run a single spec file
npx playwright show-report                    # view the HTML report from the last run
```
A real full-stack suite (Playwright + Chromium) — no mocked API. `playwright.config.ts`'s
`webServer` entries start the real `uvicorn` backend and `vite` dev server (ports
8000/5173) and wait for both to be healthy; its `globalSetup` then runs `backend/seed.py`
once to reset `finance.db` to a deterministic state before any test file runs. Runs sequentially
(`workers: 1`) against the same SQLite file, so specs are numbered (`01-crud`,
`02-transactions-splits`, `03-import-csv`, `04-backup-restore`) to guarantee order — the
last one exercises "Overwrite all data" backup restore, which must run after everything
else. Wired into CI as the `test-e2e` job (`.github/workflows/ci-cd.yml`), gating `deploy`
alongside `test-backend`/`test-frontend`. `@playwright/test` is pinned to an exact version
in `e2e/package.json` (not a range) because Playwright requires its installed package
version and bundled browser binaries to stay in lockstep — installing a browser for a
different version than what's pinned will fetch the wrong revision. To bump it: `npm
install @playwright/test@<version> --save-exact` in `e2e/`, then `npx playwright install
--with-deps chromium` to fetch the matching browser revision, then re-run the suite before
committing the version bump.

## Architecture

The full reference (how each feature works, and why) is **`docs/architecture.md`**: read the section for the feature you touch before changing it, and update it in the same PR. Entities and columns: `docs/data-model.md`. What follows is the map.

**Backend** (`backend/`): `main.py` registers the routers and handlers only (no route bodies); `routers/` holds one `APIRouter` per resource; business logic lives in same-named top-level modules (`backup.py`, `charts.py`, `onedrive.py`, `enable_banking.py`… distinct from `routers/<name>.py`). `models.py` is the SQLAlchemy ORM, `schemas/` the Pydantic models (one module per area, everything re-exported by `schemas/__init__.py`, so `from schemas import X` works), `serializers.py` builds responses, `rules.py` holds cross-field validation (`RuleViolation` → 422; unrelated to `transaction_rules.py`), `filtering.py` the shared transaction filters (`apply_transaction_filters()`, used by search, the categorizer and rules).

**Frontend** (`frontend/src/`): `App.tsx` switches between views with plain `useState` (no router; `nav.ts` lists them, `NavShell.tsx` draws the nav) and keeps view state in the query string (`utils/urlState.ts`). `api/client.ts` is the fetch client, typed from the generated `schema.d.ts`. `components/ui/` holds the design-system primitives (`Modal`/`Sheet` wrap Radix). `useIsMobile()` picks a different markup tree on mobile; `md:` classes handle the rest. The Transactions screen is `TransactionsPage.tsx` plus `components/transactions/` (card list, table, initial URL state); one transaction opens in `TransactionDetail`.

Rules that cut across features:

- **Splits are mandatory.** Every transaction stores an integer `weight` per involved user in `transaction_splits`; `share_amount` is derived (`split_engine.prorate()`, mirrored by `utils/splitWeights.ts`). Omitted weights resolve through account > category > global (`resolve_default_weights()`); the global tier is never empty. Ownership (`account_users.ownership_percentage`, summing to 100) only drives visibility and the "paid" side of balances.
- **Balances are derived**, never stored: `Account.balance_offset` + the sum of its transactions. Aggregates (`balances`, `charts`, `account_totals`, `category_usage`) are cached in the `aggregate_cache` table (`cache_service.py`); every mutation that can move them calls `cache_service.invalidate()` right before its own commit. A new aggregation = a namespace + `get_or_compute()` + invalidations.
- **Every transaction write leaves history** (`audit.py`, `transaction_history`); a write touching many rows runs inside `audit.batch()`. Checkpoint rows are re-derived by `checkpoints.recompute()` at every site that can move an earlier row.
- **Three feeds, one path**: bank sync (`enable_banking.py` + `bank_transactions.py`), CSV/QIF import (`import_csv.py`, `import_qif.py`) and manual entry share the split cascade, history and invalidation. Bank sync and import also run the active categorisation model (`auto_categorize.py`) and the automatic rules (`transaction_rules.py`); a failure there never fails the feed.
- `raw_*` columns are the frozen copy of what a source reported: absent from create/update, editable only in admin mode, used by no computation.
- **Backup archive** (`backup.py`): every table except the OneDrive settings and the categorizer models; `overwrite` and `partial` restore modes. A new table means a decision on both.
- **Admin mode** (`?admin` in the URL, `utils/admin.ts`) only hides destructive UI; the endpoints are not gated (the app is behind IAP).

## Documentation

- User-facing behavior changes (new/changed views, forms, buttons, flows) **must** be reflected in `docs/user-guide.md` in the same PR — don't leave it stale. Schema/entity changes likewise require updating `docs/data-model.md`. When editing `models.py`, `main.py` routes, or `frontend/src/` in ways that change what a user sees or does, check whether `docs/user-guide.md` needs a matching update before considering the task done, update the feature's section of `docs/architecture.md` when how it works changes, and this file (`CLAUDE.md`) when the map above, commands, or workflow change. Keep `CLAUDE.md` to instructions and the map: detail and history belong in `docs/architecture.md`, `docs/data-model.md`, or the PR description.

## Key gotchas

- **CSRF guard** (`backend/main.py`, MYF-14): every `POST`/`PUT`/`PATCH`/`DELETE` must carry an `X-MyFinance-Client` header (any value; `client.ts`'s `CLIENT_HEADER` sends it on every call) or gets a 403. A cross-site page can't set it without a CORS preflight, which `allow_origins` refuses, so the IAP cookie alone no longer lets another site write. Only the two Cloud Scheduler `run-due` endpoints (shared-secret header of their own) are exempt; a script writing to the API, test clients included (`conftest.py`), must send it. `POST /api/backup/import` also requires `mode` now.
- **Query style**: app code queries in SQLAlchemy 2.0 style (`db.scalars(select(X).where(...))`, `db.execute(select(a, b))`, `db.scalar(...)`, `db.execute(delete(X).where(...))`), never the legacy `db.query()` (MYF-33). A single-row lookup keeps the `.limit(1)` that `Query.first()` used to add. Tests and the already-applied Alembic migrations still use `db.query()`, on purpose: the tests stayed as they were to check the conversion, and a migration is history.
- **Text search wildcards**: `contains`/`starts_with`/`ends_with` conditions and the simple filter's search box read `*` (any run) and `?` (one character); `%`, `_` and `\` are literal (`filtering.like_pattern()`, mirrored by `transaction_rules._wildcard_regex()`).
- **Frontend nginx** (`frontend/nginx.conf`) sends a strict Content-Security-Policy (`script-src 'self'`, so no inline script: the dark-mode bootstrap is `public/theme.js`), `X-Frame-Options`, `nosniff`, and `Cache-Control` (immutable under `/assets/`, `no-cache` elsewhere so a deploy shows at once). An external script, font, image or API call needs a CSP change there.
- `seed.py` **destroys existing data** — `drop_all` then re-inserts sample rows. Never run it against production.
- Adding a new nullable-with-scalar-default column to a model is safe to deploy straight to production — `sync_schema()` backfills it automatically on next startup, no migration needed. Anything else (rename, retype, drop, a NOT NULL column with no usable default) needs an Alembic migration (`alembic revision --autogenerate`, reviewed and tested locally) committed alongside the model change — CI/CD applies it automatically before deploy, so a merged PR with the migration file just works.
- The backend's minimum Cloud Run instance count is the repo variable `BACKEND_MIN_INSTANCES` (default `0`, read by the `deploy` job's `--min-instances`). At 0 every first visit after a quiet spell pays a ~5 s cold start; `1` keeps an instance warm for a few euros a month. It applies on the next deploy (`gh variable set BACKEND_MIN_INSTANCES --body 1`), or at once with `gcloud run services update myfinance-backend --min-instances=1`, which the next deploy then realigns on the variable.
- CORS origins default to `http://localhost:5173` alone (`backend/main.py`; a LAN/Tailscale dev origin goes in the env var, never in the public repo), but are fully overridable via the `CORS_ALLOWED_ORIGINS` env var (comma-separated) — production sets this explicitly in `ci-cd.yml`.
- No `.env` is actually used, though `.env` is gitignored — runtime env vars (`DATABASE_URL`, `CORS_ALLOWED_ORIGINS`, `VITE_API_URL`) are instead set via Docker build args / Cloud Run env vars in CI.
- OneDrive automatic backup needs six env vars the app doesn't set defaults for meaningfully in production: `ONEDRIVE_CLIENT_ID`/`ONEDRIVE_CLIENT_SECRET`/`ONEDRIVE_REDIRECT_URI` (from a one-time, manual Azure AD app registration granting `Files.ReadWrite offline_access`), `ONEDRIVE_TOKEN_ENCRYPTION_KEY` (a `cryptography.fernet.Fernet.generate_key()` value — generate once and never rotate without also re-encrypting any already-stored tokens, or reconnecting), `ONEDRIVE_SCHEDULER_SECRET` (shared secret the Cloud Scheduler job sends as `X-Backup-Scheduler-Secret`), and `FRONTEND_BASE_URL` (where `/auth/callback` redirects back to after connecting). The Cloud Scheduler job itself is also a one-time manual `gcloud scheduler jobs create http` setup, not something CI/CD provisions.
- Bank sync needs four env vars with no useful defaults in production: `ENABLE_BANKING_APPLICATION_ID` and `ENABLE_BANKING_PRIVATE_KEY` (from a one-time, manual application registration in Enable Banking's Control Panel — the private key is the RSA key whose public half was uploaded there, and it is the *entire* credential, so it lives in Secret Manager and never in the repo; a literal `\n`-escaped PEM is handled), `ENABLE_BANKING_REDIRECT_URL` (must match a redirect URL registered on that application, and points at `/api/bank-sync/callback`), and `BANK_SYNC_SCHEDULER_SECRET` (shared secret the Cloud Scheduler job sends as `X-Bank-Sync-Scheduler-Secret`). Like OneDrive's, the Cloud Scheduler job itself is a one-time manual `gcloud scheduler jobs create http` setup, not something CI/CD provisions.
- Email alerts need `SMTP_PASSWORD` in Secret Manager (`myfinance-smtp-password`, created by hand **before** the deploy that references it, or `gcloud run deploy` fails) and the repo variable `SMTP_USERNAME`; `SMTP_HOST`/`SMTP_PORT`/`ALERT_FROM_ADDRESS` default in `ci-cd.yml` to Brevo's relay, 587 and `myfinance@olivex.fr` (repo variables override them). Without `SMTP_HOST` the screen says sending isn't set up and nothing goes out. No scheduler job of their own: they run at the end of the bank-sync job. The sender domain's SPF/DKIM/DMARC records live in OVH DNS, not in the repo.
- An Enable Banking application activated in **restricted production mode** (the free, self-serve tier this uses) only ever returns accounts that were explicitly linked to it in Enable Banking's Control Panel. Every other account the bank hands back is filtered out server-side, so a consent can be perfectly valid and still come back with `accounts: 0, accounts_data: 0` — which is exactly how a bank that was never linked there looks, and is indistinguishable from a bank that granted nothing. Linking one account does not activate the application for the rest; each bank needs its own. That, not the code and not the consent, is the first thing to check when a connected bank lists no account.
- scikit-learn, scipy and numpy add ~205 MB to the backend image — the real price of automatic categorisation, paid in cold-start time rather than money (training itself costs well under a cent either way). Keep the import lazy in `categorizer.py`: a module-level `import sklearn` would make every cold start pay for it.
- A trained categorizer model is a few megabytes of pickle in `categorizer_models.blob`. It is never in a backup archive (retraining rebuilds it in seconds) but the table is left out of the overwrite restore's wipe alongside `onedrive_backup_settings`, so a restore doesn't silently throw away the active model.
- Backend tests use `sqlite:///:memory:` with `dependency_overrides[get_db]`; tables are created/dropped per test session (see `backend/tests/conftest.py`).
- Frontend component tests mock `src/api/client` via `vi.mock`; API-client tests mock `global.fetch` directly instead.
- Components using `alert()`/`confirm()` need those mocked with `vi.spyOn` in their tests.
