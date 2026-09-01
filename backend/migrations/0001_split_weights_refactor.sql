-- Split-management refactor: integer weight tiers + account-level tier.
--
-- Not run by any tooling — this repo has no migration runner (no Alembic).
-- Run this ONCE by hand against production before deploying the backend
-- change that ships alongside it (main.py/models.py/schemas.py expect the
-- columns below to already be in their new shape):
--
--   psql "$DATABASE_URL" -f backend/migrations/0001_split_weights_refactor.sql
--
-- Local/dev needs no migration: seed.py's drop_all/create_all handles it.
--
-- `database.sync_schema()` (run at prod startup, see database.py) is
-- additive-only — it can add a new nullable/defaulted column or a brand-new
-- table, but it never renames or retypes an existing column. Both changes
-- below are therefore NOT handled automatically:
--   - category_splits.split_percentage (float, sum-to-100) is renamed AND
--     retyped to weight (integer, no sum requirement).
--   - global_split_weights.weight retypes float -> integer in place.
-- (transaction_splits.weight and the new account_split_weights table are
-- both additive-safe and need no manual step — sync_schema()/create_all()
-- pick them up automatically on next startup.)

-- category_splits: split_percentage (float) -> weight (int)
-- Scaled by 100 (not a plain ROUND) so 2-decimal percentages such as
-- 33.33/33.33/33.34 survive the float->int conversion as distinct weights
-- (3333/3333/3334) instead of collapsing into indistinguishable integers.
-- Every weight in a given split is scaled by the same factor, so relative
-- proportions — and therefore every future prorata result — are unchanged.
ALTER TABLE category_splits ADD COLUMN weight INTEGER;
UPDATE category_splits SET weight = ROUND(split_percentage * 100)::INTEGER;
ALTER TABLE category_splits ALTER COLUMN weight SET NOT NULL;
ALTER TABLE category_splits ALTER COLUMN weight SET DEFAULT 0;
ALTER TABLE category_splits DROP COLUMN split_percentage;

-- global_split_weights: retype weight float -> int in place, same x100 scaling.
ALTER TABLE global_split_weights ALTER COLUMN weight TYPE INTEGER USING ROUND(weight * 100)::INTEGER;
ALTER TABLE global_split_weights ALTER COLUMN weight SET DEFAULT 0;

-- Cosmetic only — transaction_splits.source is display-only, never used for
-- logic, so this remap is safe to skip if you want a smaller first pass.
UPDATE transaction_splits SET source = 'category' WHERE source = 'category_default';
UPDATE transaction_splits SET source = 'global' WHERE source = 'global_default';
UPDATE transaction_splits SET source = 'custom' WHERE source = 'manual';
