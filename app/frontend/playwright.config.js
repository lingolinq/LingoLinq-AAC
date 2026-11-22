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
const { IPAD_AS_MAC } = require('./e2e/support/offline-shell');

// The sync suite (e2e/sync.spec.js) on every platform. Every page reaches the server through the local sync link
// (e2e/support/sync-link.js) on this address, so the spec can slow it or cut it. E2E_BASE_URL is the server itself.
const SYNC_LINK = `http://localhost:${process.env.E2E_SYNC_LINK_PORT || '5078'}`;
const syncProject = (name, use) => ({ name, testMatch: /sync\.spec\.js/, timeout: 300_000, use: { ...use, baseURL: SYNC_LINK } });
// Sync measurement (e2e/sync-measure.spec.js, phase 0.2 of the sync proposal): each shape synced at each link speed, with
// pictures and sounds using the link's bandwidth too. Run on demand; the setup is at the top of that spec.
const measureProject = (name, use) => ({ name, testMatch: /sync-measure\.spec\.js/, timeout: 3_600_000, use: { ...use, baseURL: SYNC_LINK, measureLink: true } });

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
    // The board page edit tour (2026-10-12).
    {
      name: 'board-edit-tour',
      testMatch: /board-edit-tour\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
    },
    // The #1141 review follow-ups (2026-10-22). Signs in as its own synthetic users
    // (e2e/support/users-1141.rb), so it needs no setup project.
    {
      name: '1141-followups',
      testMatch: /home-assign-and-preferences\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    // A board made in another language speaks it in Basic and Modern. Signs in as its own
    // synthetic users (e2e/support/users-language.rb), so it needs no setup project.
    {
      name: 'board-language',
      testMatch: /board-language\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Goal-chart date labels outside UTC (#1172). Signs in as its own synthetic user
    // (e2e/support/goals-1172.rb), so it needs no setup project.
    {
      name: 'goal-charts',
      testMatch: /goal-chart-labels\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Offline app shell (lib/offline_shell.rb). Against RAILS, not ember serve: E2E_BASE_URL must
    // point at a Rails server started with OFFLINE_APP_SHELL=on (then =off for the kill switch).
    // Signs in as its own synthetic users (e2e/support/offline-launch.rb) in persistent profiles
    // (e2e/support/offline-shell.js); see the header of each spec for the run order.
    {
      name: 'offline-launch',
      testMatch: /offline-launch\.spec\.js/,
      timeout: 600_000,
    },
    // The worker's slow-page, failed-update and update paths, run for real (same server as offline-launch).
    {
      name: 'offline-worker-lifecycle',
      testMatch: /offline-worker-lifecycle\.spec\.js/,
      timeout: 300_000,
    },
    // WebKit (Safari's engine) as an iPad, offline through an unreachable server (offline-webkit.spec.js
    // has why). Same server as offline-launch; needs `npx playwright install webkit` and its system
    // libraries.
    {
      name: 'offline-webkit',
      testMatch: /offline-webkit\.spec\.js/,
      timeout: 600_000,
    },
    {
      name: 'offline-kill-switch',
      testMatch: /offline-kill-switch\.spec\.js/,
      timeout: 180_000,
    },
    // The Modern top menu's height across pages, layouts and widths (2026-11-09). Signs in as its
    // own synthetic users (e2e/support/users-org-nav.rb), so it needs no setup project.
    {
      name: 'menu-positions',
      testMatch: /menu-positions\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Basic speak mode's Home button goes to the home board (2026-11-09). Signs in as its own
    // synthetic user (e2e/support/users-basic-speak.rb), so it needs no setup project.
    {
      name: 'basic-speak-home',
      testMatch: /basic-speak-home\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Board Save waits for uploads (PR #1354). Signs in as its own synthetic users
    // (e2e/support/users-save-waits.rb), so it needs no setup project.
    {
      name: 'save-waits',
      testMatch: /save-waits\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    // The offline board sync (#1322 and the sync proposal) on every platform: e2e/sync.spec.js has the setup.
    // PCs:
    syncProject('sync-desktop-chrome', { ...devices['Desktop Chrome'] }),
    syncProject('sync-desktop-firefox', { ...devices['Desktop Firefox'] }),
    syncProject('sync-desktop-safari', { ...devices['Desktop Safari'] }),
    // Phones and tablets: Android Chrome, and WebKit with an iPhone's or an iPad's screen and touch. Not iOS
    // itself (no Home Screen mode; WebKit on Linux is not Safari on a device).
    syncProject('sync-android-chrome', { ...devices['Pixel 7'] }),
    syncProject('sync-iphone', { ...devices['iPhone 15'] }),
    syncProject('sync-ipad', { ...IPAD_AS_MAC, browserName: 'webkit' }),
    // Chrome on a real Android emulator or device (the first one `adb devices` lists), through Playwright's Android
    // API and `adb reverse` (e2e/support/sync.js). Start the emulator first; E2E_ADB is the path to adb.
    syncProject('sync-android-emulator', { ...devices['Desktop Chrome'] }),
    measureProject('measure-desktop-chrome', { ...devices['Desktop Chrome'] }),
    measureProject('measure-android-chrome', { ...devices['Pixel 7'] }),
    measureProject('measure-iphone', { ...devices['iPhone 15'] }),
    measureProject('measure-android-emulator', { ...devices['Desktop Chrome'] }),
  ],
});
