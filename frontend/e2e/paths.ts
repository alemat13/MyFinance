import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/** Throwaway SQLite database for the e2e suite. Never `backend/finance.db` —
 *  `seed.py` opens with `drop_all()`. Already covered by the `*.db` gitignore. */
export const E2E_DB_PATH = path.resolve(here, '../../backend/e2e-test.db')
export const E2E_DATABASE_URL = `sqlite:///${E2E_DB_PATH}`
export const BACKEND_DIR = path.resolve(here, '../../backend')
export const E2E_DATA_DIR = path.resolve(here, 'data')
