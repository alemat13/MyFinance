import { execSync } from 'node:child_process'

// Resets backend/finance.db to a deterministic seeded state. Playwright starts
// and health-checks the webServer entries before running globalSetup, so
// uvicorn is already up when this runs — that's fine: seed.py's drop_all +
// create_all only rewrites tables within the same file, and no test (or
// anything else) queries the backend until this — and the whole global
// setup phase — has finished, so the resulting seeded state is exactly what
// every test file sees at the start of the run.
export default function globalSetup() {
  execSync('python seed.py', { cwd: '../backend', stdio: 'inherit' })
}
