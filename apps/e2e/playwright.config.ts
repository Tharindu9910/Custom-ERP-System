import { defineConfig, devices } from '@playwright/test';
import { API_PORT, WEB_PORT } from './support/env';

/**
 * Browser tests for the Super Admin and Supervisor screens.
 * Starts its own API (:3100) and web (:5180) so the dev API on :3000 and anything
 * on :5173 are never touched. The database in DATABASE_URL is reset and seeded first
 * (E2E_SKIP_RESET=1 keeps it).
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1, // one shared database
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './support/global-setup.ts',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  // Installed Google Chrome by default (no browser download); E2E_CHANNEL=chromium uses Playwright's own
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, channel: process.env.E2E_CHANNEL === 'chromium' ? undefined : (process.env.E2E_CHANNEL ?? 'chrome') },
    },
  ],
  webServer: [
    {
      // Reset + build + serve; cwd apps/api so the API finds the root .env. Builds into its own
      // folder so the dev API (`nest start --watch`, which runs from dist/) is never disturbed.
      command: 'node test/reset-db.mjs && rm -rf dist-e2e && npx tsc -p tsconfig.build.json --outDir dist-e2e --incremental false && node dist-e2e/main',
      cwd: '../api',
      url: `http://localhost:${API_PORT}/health`,
      env: { API_PORT: String(API_PORT), THROTTLE_LIMIT: '1000000', THROTTLE_AUTH_LIMIT: '1000000', NODE_ENV: 'development' },
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: '../web',
      url: `http://localhost:${WEB_PORT}`,
      env: { VITE_API_BASE_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
