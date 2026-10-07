import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run the real stack: API, worker and web app built from this repo, against
 * PostgreSQL, Redis and Mailpit. Start those three services first (docker compose up -d postgres
 * redis mailpit, or the CI service containers), apply migrations, then run `pnpm test:e2e`.
 */
const root = '../..';
const env = {
  NODE_ENV: 'production',
  LOG_LEVEL: 'warn',
  DATABASE_URL:
    process.env.DATABASE_URL ?? 'postgresql://openteam:openteam@localhost:5432/openteam',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  APP_URL: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:3000',
  // Plain HTTP on localhost, so the production Secure-cookie rule is relaxed for this run only.
  COOKIE_SECURE: 'false',
  NEXT_PUBLIC_API_URL: 'http://localhost:4000',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: process.env.MAILPIT_SMTP_PORT ?? '1025',
};

// The worker has no HTTP port for Playwright to wait on, so global setup starts it.
export const e2eEnv = env;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@responsive/ },
  ],
  webServer: [
    {
      command: `node ${root}/apps/api/dist/main.js`,
      url: 'http://localhost:4000/api/v1/health/ready',
      env: { ...env, NODE_ENV: 'test' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm exec next start --port 3000',
      url: 'http://localhost:3000',
      env,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
