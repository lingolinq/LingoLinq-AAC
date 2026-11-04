// Offline launch through the offline app shell (lib/offline_shell.rb). Signs in, lets the service
// worker install and the boards sync, goes offline, and opens a board URL cold in each board view.
//
// Runs against RAILS with the shell on, not `ember serve`:
//   1. cd app/frontend && npx ember build && cd ../.. && bin/rails extras:assert_js
//   2. OFFLINE_APP_SHELL=on bin/rails s -p 5077   (development, a local lingolinq-e2e* database)
//   3. bin/rails runner app/frontend/e2e/support/offline-launch.rb
//   4. cd app/frontend && E2E_BASE_URL=http://localhost:5077 npx playwright test --project=offline-launch
// Then restart Rails with OFFLINE_APP_SHELL=off and run --project=offline-kill-switch.

const { test, expect } = require('@playwright/test');
const { signIn } = require('./support/local-session');
const { openProfile, workerState } = require('./support/offline-shell');

const USERS = {
  classic: { user: 'e2e_offline_classic', board: 'e2e-offline-classic-home', path: (b) => `/e2e_offline_classic/board/${b}` },
  modern: { user: 'e2e_offline_modern', board: 'e2e-offline-modern-home', path: (b) => `/e2e_offline_modern/board-detail/${b}` },
};

// Signs in, then waits for the worker to finish installing and a sync to succeed.
async function prepare(page, who) {
  await signIn(page, who.user, 'offline-launch.rb');
  const enabled = await page.evaluate(() => window.offline_shell_enabled);
  expect(enabled, 'the page must come from Rails with OFFLINE_APP_SHELL=on').toBe(true);
  await page.waitForFunction(async () => {
    const r = await navigator.serviceWorker.getRegistration('/');
    return !!(r && r.active && r.active.state === 'activated');
  }, null, { timeout: 120_000 });
  await page.waitForFunction(() => window.persistence && window.persistence.get('sync_status') === 'succeeded',
    null, { timeout: 180_000 });
  // The worker precached the generic page under its versioned cache.
  const state = await workerState(page);
  expect(state.registrations).toContain('/sw.js');
  expect(state.caches.length).toBe(1);
}

// Goes offline and opens the board URL in a fresh navigation (a cold launch).
async function launchOffline(context, page, url) {
  await context.setOffline(true);
  const response = await page.goto(url);
  expect(response, 'a response, not the browser offline page').not.toBeNull();
  expect(response.fromServiceWorker(), 'answered by the worker').toBe(true);
  // Only the cached generic page carries this header (OfflineShellController#shell), so this proves
  // the answer was the cached shell and not a live response.
  expect(response.headers()['x-robots-tag']).toBe('noindex');
  await page.waitForFunction(() => !!(window.load_state && window.load_state.js_loaded), null, { timeout: 60_000 });
  await expect(page.locator('#ember-application-root')).toBeAttached();
  await expect(page.getByText('Unavailable offline'), 'not the app error page').toHaveCount(0);
}

async function apiAnsweredOffline(page) {
  return page.evaluate(() => fetch('/api/v1/users/self').then((r) => 'answered ' + r.status, () => 'network error'));
}

test.describe('offline launch from the offline app shell', () => {
  test('Classic view opens the board from the device with no network', async () => {
    const context = await openProfile('classic');
    try {
      const page = context.pages()[0] || await context.newPage();
      await prepare(page, USERS.classic);
      await launchOffline(context, page, USERS.classic.path(USERS.classic.board));
      // user.board-alt reads the board from IndexedDB; its buttons render.
      await expect(page.getByText('all done', { exact: true }).first()).toBeVisible({ timeout: 60_000 });
      // An API request offline is never answered from the cache.
      expect(await apiAnsweredOffline(page)).toBe('network error');
      await context.setOffline(false);
      // Left installed for offline-kill-switch.spec.js.
      const state = await workerState(page);
      expect(state.registrations).toContain('/sw.js');
      expect(state.caches.length).toBe(1);
    } finally {
      await context.close();
    }
  });

  // The interface language file is cached the first time it loads online. initializers/attempt_lang.js
  // sets <html lang> to the language it loaded, or back to 'en' when the file cannot be fetched.
  test('a Spanish-language device keeps its interface language offline', async () => {
    const context = await openProfile('classic-es', { locale: 'es-ES' });
    try {
      const page = context.pages()[0] || await context.newPage();
      await prepare(page, USERS.classic);
      await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('lang'))).toBe('es');
      const cached = await page.evaluate(async () => !!(await caches.match('/locales/es.json')));
      expect(cached, 'es.json cached on its first online load').toBe(true);
      await launchOffline(context, page, USERS.classic.path(USERS.classic.board));
      await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('lang')), { timeout: 30_000 }).toBe('es');
    } finally {
      await context.setOffline(false).catch(() => {});
      await context.close();
    }
  });

  // #1213 (open): Modern view's board page does not read boards from the device, so offline it shows
  // its own "could not load" state. This proves the app boots offline in Modern view, not the board.
  test('Modern view boots offline and shows its board-unavailable state', async () => {
    const context = await openProfile('modern');
    try {
      const page = context.pages()[0] || await context.newPage();
      await prepare(page, USERS.modern);
      await launchOffline(context, page, USERS.modern.path(USERS.modern.board));
      await expect(page.locator('.md-board-detail-error[role="alert"]')).toBeVisible({ timeout: 60_000 });
      expect(await apiAnsweredOffline(page)).toBe('network error');
    } finally {
      await context.setOffline(false).catch(() => {});
      await context.close();
    }
  });
});
