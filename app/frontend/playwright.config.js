// Playwright config for LingoLinq-AAC end-to-end specs.
//
// These are TARGETED interaction specs, deliberately distinct from
// `scripts/ember-route-crawl.mjs` (the read-only route sweep used by
// /ember-audit-run, which never clicks anything). This suite DOES click, so it
// must only ever run against a local dev stack seeded with the example user —
// never production. An AAC app's buttons speak, purchase, and message.
//
// Prereqs:
//   1. Rails + Ember running:  bin/fresh_start   (Rails :5000, Ember :8184)
//   2. Seeded dev user:        rails db:seed     (example / password)
//   3. Browsers are already in the local Playwright cache; if not:
//        npx playwright install chromium
//
// Run:
//   cd app/frontend && npx playwright test
//   npx playwright test --headed --project=create-board-new
//   npx playwright test --ui

const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8184';

module.exports = defineConfig({
  testDir: './e2e',
  // The board preview does real layout/animation work (staggered nb-chooser-rise,
  // grid reflow on every pref change), so give assertions room without making a
  // genuinely hung UI take forever to report.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Serial locally: the specs share one seeded user, and parallel workers mutating
  // the same user's device preferences would race. CI can raise this once the
  // suite gets per-worker fixture users.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Wide enough that the Edit Tools rail renders beside the preview rather than
    // collapsing to the <=1024px single-open-section layout, which changes the
    // markup the section specs assert against.
    viewport: { width: 1440, height: 900 },
  },

  projects: [
    // Logs in once and writes storage state; every other project reuses it.
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    {
      name: 'create-board-new',
      testMatch: /create-board-new.*\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
    },
  ],
});
