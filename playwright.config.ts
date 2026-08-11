import { defineConfig, devices } from '@playwright/test';

/**
 * LingoLinq Playwright config.
 *
 * Default target: staging. Override with PLAYWRIGHT_BASE_URL for local
 * (http://localhost:8184) or another environment.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'https://lingolinq-staging.onrender.com';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Enable when browser coverage is needed:
    // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
