# `backend/migrations/`

This directory holds **historical, hand-run SQL migrations** written before this repo
adopted Alembic. They predate any migration tooling and were never applied
automatically — each one was a one-off runbook step, executed manually via `psql
"$DATABASE_URL" -f backend/migrations/000X_*.sql` against production before the
backend deploy that depended on it. They're kept here for the historical record only;
nothing runs them for you.

**All schema changes from now on are Alembic revisions** under `backend/alembic/versions/`
— see the "Database migrations" section in the root `CLAUDE.md` for the day-to-day
workflow. `alembic upgrade head` also runs automatically in CI/CD before every
production deploy, so there's no manual `psql` step for anything written as an
Alembic migration.
