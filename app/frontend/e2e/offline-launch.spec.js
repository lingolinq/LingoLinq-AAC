// Offline launch through the offline app shell (lib/offline_shell.rb). Signs in, lets the service
// worker install and the boards sync, goes offline, and opens a board URL cold in each board view.
//
// Runs against RAILS with the shell on, not `ember serve`:
//   1. cd app/frontend && npx ember build && cd ../.. && bin/rails extras:assert_js
//   2. Seed a private local lingolinq-e2e* database with e2e/support/offline-launch.rb (its header has
//      the command), then serve it with the same blank upload settings, so nothing reaches the bucket:
//      AWS_KEY= AWS_SECRET= UPLOADS_S3_BUCKET= STATIC_S3_BUCKET= OFFLINE_APP_SHELL=on \
//        DATABASE_URL=postgres:///lingolinq-e2e-<name> bin/rails s -p 5077
//   3. cd app/frontend && E2E_BASE_URL=http://localhost:5077 npx playwright test --project=offline-launch
// Then restart Rails with OFFLINE_APP_SHELL=off and run --project=offline-kill-switch.

const { test, expect } = require('@playwright/test');
const { signIn } = require('./support/local-session');
const { markInstalled, openProfile, workerState } = require('./support/offline-shell');

const USERS = {
  classic: { user: 'e2e_offline_classic', board: 'e2e-offline-classic-home', path: (b) => `/e2e_offline_classic/board/${b}` },
  modern: { user: 'e2e_offline_modern', board: 'e2e-offline-modern-home', folder: 'e2e-offline-modern-folder', path: (b) => `/e2e_offline_modern/board-detail/${b}` },
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
  // On the web a device that has never synced does not sync on its own (models/user.js auto_sync:
  // off until ever_synced), so start the sync a person starts from the app, then wait for it.
  await page.evaluate(() => { window.persistence.sync('self', null, null, 'manual_sync').then(null, () => {}); });
  await page.waitForFunction(() => ['succeeded', 'finished'].indexOf(window.persistence.get('sync_status')) !== -1,
    null, { timeout: 300_000 });
  expect(await page.evaluate(() => window.persistence.get('sync_status')), 'sync finished without errors').toBe('succeeded');
  // The worker precached the generic page under its versioned cache.
  const state = await workerState(page);
  expect(state.registrations).toContain('/sw.js');
  expect(state.caches.length).toBe(1);
}

// The app's own error page (templates/error.hbs), found by its picture's address so it matches in any
// language. Offline the picture itself is not cached, so the element is present but has no size.
function errorPage(page) {
  return page.locator('img[src*="not-found.png"]');
}

// Goes offline and opens the board URL in a fresh navigation (a cold launch), then waits until the
// page settles on either `expected` or the app error page, and requires it not to be the error page.
async function launchOffline(context, page, url, expected) {
  await context.setOffline(true);
  // PLAYWRIGHT GAP: setOffline blocks the network, but a page loaded after it still reads
  // navigator.onLine === true (Playwright 1.62.1 on Chromium: seen on worker-served pages, a reload,
  // a data: URL, and with page-level CDP emulation). A device with no network reports false from the
  // start, and the app reads it at boot (services/persistence.js `online`). Report what an offline
  // device reports, for every page this context loads from here on. Wi-Fi with no internet still
  // reports true on a real device; that case is a known limit, not covered here.
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false, configurable: true });
  });
  const response = await page.goto(url);
  expect(response, 'a response, not the browser offline page').not.toBeNull();
  expect(response.fromServiceWorker(), 'answered by the worker').toBe(true);
  // Only the cached generic page carries this header (OfflineShellController#shell), so this proves
  // the answer was the cached shell and not a live response.
  expect(response.headers()['x-robots-tag']).toBe('noindex');
  await page.waitForFunction(() => !!(window.load_state && window.load_state.js_loaded), null, { timeout: 60_000 });
  await expect(page.locator('#ember-application-root')).toBeAttached();
  expect(await page.evaluate(() => navigator.onLine), 'the page sees what an offline device reports').toBe(false);
  await expect.poll(async () => (await errorPage(page).count()) > 0 || await expected.first().isVisible(),
    { message: 'the page settled on the expected element or the error page', timeout: 60_000 }).toBe(true);
  await expect(errorPage(page), 'not the app error page').toHaveCount(0);
  await expect(expected.first()).toBeVisible();
}

const NEEDS_CONNECTION = 'This board needs an Internet connection to do that.';
// The server's refusal of the view permission (application_controller#allowed?).
const DENIED = JSON.stringify({ error: 'Not authorized', unauthorized: true, permission: 'view', status: 400 });

function deviceCopyNotice(page) {
  return page.locator('.md-board-detail-device-copy');
}

// The board page's options menu. Some of its controls also exist hidden, so only visible ones count.
async function tapMenuItem(page, action) {
  const visible = (name) => page.locator(`[data-bd-action="${name}"]:visible`).first();
  await visible('toggle_options_menu').click({ timeout: 10_000 });
  await visible(action).click({ timeout: 10_000 });
}

function tapEdit(page) {
  return tapMenuItem(page, 'enter_edit_mode');
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
      // user.board-alt reads the board from IndexedDB; its buttons render.
      await launchOffline(context, page, USERS.classic.path(USERS.classic.board), page.getByText('all done', { exact: true }));
      // An API request offline is never answered from the cache.
      expect(await apiAnsweredOffline(page)).toBe('network error');
      await context.setOffline(false);
      // Left installed for offline-kill-switch.spec.js.
      const state = await workerState(page);
      expect(state.registrations).toContain('/sw.js');
      expect(state.caches.length).toBe(1);
      markInstalled('classic', state);
    } finally {
      await context.close();
    }
  });

  // The worker caches the interface language file the first time it loads through the worker
  // (`cacheOnFirstUse`). initializers/attempt_lang.js sets <html lang> to the language it loaded, or back
  // to 'en' when the file cannot be fetched. The worker never takes over a page that is already open (no
  // clients.claim), and sign-in can reload the page before the worker is active, so the load that caches
  // the file is the first one after the worker is active: here an online reload, on a device its next launch.
  test('a Spanish-language device keeps its interface language offline', async () => {
    const context = await openProfile('classic-es', { locale: 'es-ES' });
    try {
      const page = context.pages()[0] || await context.newPage();
      await prepare(page, USERS.classic);
      await page.reload();
      expect(await page.evaluate(() => !!navigator.serviceWorker.controller), 'the reloaded page is the worker\'s').toBe(true);
      await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('lang')), { timeout: 30_000 }).toBe('es');
      const cached = await page.evaluate(async () => !!(await caches.match('/locales/es.json')));
      expect(cached, 'es.json cached on its first load through the worker').toBe(true);
      await launchOffline(context, page, USERS.classic.path(USERS.classic.board), page.getByText('all done', { exact: true }));
      await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('lang')), { timeout: 30_000 }).toBe('es');
      // Left installed for the kill switch's removal-worker-only case.
      await context.setOffline(false);
      markInstalled('classic-es', await workerState(page));
    } finally {
      await context.setOffline(false).catch(() => {});
      await context.close();
    }
  });

  // Added 2026-11-05 (review follow-up). On a shared device the server ends an idle session, but offline
  // nothing can, and the app would read the last person from the device. So a shared sign-in removes the
  // worker and its copy (utils/offline_shell.js follow_device_trust), and the device then cannot open the
  // app offline at all, as before the worker. Here a trusted user signs out and the next person signs in
  // on the same browser as "Shared Device".
  test('after a shared sign-in, the worker and its copy are gone and the app does not open offline', async () => {
    const context = await openProfile('shared');
    try {
      const page = context.pages()[0] || await context.newPage();
      await signIn(page, USERS.classic.user, 'offline-launch.rb');
      await page.waitForFunction(async () => {
        const r = await navigator.serviceWorker.getRegistration('/');
        return !!(r && r.active && r.active.state === 'activated');
      }, null, { timeout: 120_000 });
      expect((await workerState(page)).caches.length, 'installed for the trusted user').toBe(1);
      await page.evaluate(() => window.LingoLinq.session.invalidate(true));
      await page.waitForURL((url) => url.pathname === '/' || /^\/login/.test(url.pathname), { timeout: 60_000 });
      await signIn(page, USERS.modern.user, 'offline-launch.rb', { shared: true });
      expect(await page.evaluate(() => window.LingoLinq.appState.get('sessionUser.preferences.device.long_token')),
        'the server recorded this device as shared for the second user').toBe(false);
      await expect.poll(async () => workerState(page), { timeout: 60_000 }).toEqual({ registrations: [], caches: [] });
      await context.setOffline(true);
      await expect(page.goto(USERS.modern.path(USERS.modern.board)), 'the browser\'s offline page, not the app').rejects.toThrow(/ERR_INTERNET_DISCONNECTED/);
    } finally {
      await context.setOffline(false).catch(() => {});
      await context.close();
    }
  });

  // Added 2026-11-05 (review round 2). A device with no preferences of its own borrows another device's
  // (the same user's, with the same browser name), and used to borrow its "Trust this Device" choice with
  // them, so a classroom browser could get the worker before anyone chose. The server now reports this
  // device's own choice (lib/json_api/user.rb). Runs after the Classic case, which leaves this user with
  // a trusted device of the same browser name.
  test('before the trust choice is made, a new device gets no worker, though the user trusted another like it', async () => {
    const context = await openProfile('undecided');
    try {
      const page = context.pages()[0] || await context.newPage();
      await page.goto('/login');
      await expect(page.locator('#identification')).toBeVisible({ timeout: 30_000 });
      await page.locator('#identification').fill(USERS.classic.user);
      await page.locator('#password').fill('password');
      await page.locator('button.login-btn[type="submit"]').click();
      await page.waitForURL(/login\/device/, { timeout: 30_000 });
      await page.waitForFunction(() => !!(window.LingoLinq && window.LingoLinq.appState && window.LingoLinq.appState.get('sessionUser')),
        null, { timeout: 30_000 });
      expect(await page.evaluate(() => window.LingoLinq.appState.get('sessionUser.preferences.device.long_token')),
        'this device has not been trusted').not.toBe(true);
      await page.waitForLoadState('networkidle');
      expect(await workerState(page), 'no worker while the choice is open').toEqual({ registrations: [], caches: [] });
    } finally {
      await context.close();
    }
  });

  // Added 2026-11-05 (review round 3). A web app opened from an iPad Home Screen reports
  // navigator.standalone, and its sign-in used to be trusted without asking (like an installed app), so a
  // shared classroom iPad kept the worker for everyone. It now asks, as a browser does. Chromium has no
  // Home Screen mode, so the page reports standalone from the start (utils/capabilities.js reads it as
  // `browserless`).
  test('a Home Screen sign-in asks whether the device is shared, and a shared one gets no worker', async () => {
    const context = await openProfile('standalone');
    try {
      await context.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });
      });
      const page = context.pages()[0] || await context.newPage();
      await page.goto('/login');
      expect(await page.evaluate(() => navigator.standalone), 'the page reports a Home Screen launch').toBe(true);
      await expect(page.locator('#identification')).toBeVisible({ timeout: 30_000 });
      await page.locator('#identification').fill(USERS.modern.user);
      await page.locator('#password').fill('password');
      await page.locator('button.login-btn[type="submit"]').click();
      const shared = page.locator('.login-device-buttons button.login-btn--device.login-btn--outline');
      await expect(shared, 'the Trust / Shared question').toBeVisible({ timeout: 30_000 });
      await shared.click();
      await page.waitForFunction(() => !!(window.LingoLinq && window.LingoLinq.appState && window.LingoLinq.appState.get('sessionUser')),
        null, { timeout: 60_000 });
      await expect.poll(() => page.evaluate(() => window.LingoLinq.appState.get('sessionUser.preferences.device.long_token')),
        { timeout: 30_000 }).toBe(false);
      await page.waitForLoadState('networkidle');
      expect(await workerState(page), 'no worker on a shared Home Screen device').toEqual({ registrations: [], caches: [] });
    } finally {
      await context.close();
    }
  });

  // Modern view's board page reads the device when the server gives no usable answer (#1213,
  // routes/user/board-detail.js). The copy opens for speaking only: it can be older than the server's
  // board, and a save goes back with no conflict check.
  test('Modern view opens a synced board offline, for speaking only, and Edit recovers on reconnect', async () => {
    const context = await openProfile('modern');
    try {
      const page = context.pages()[0] || await context.newPage();
      await prepare(page, USERS.modern);
      await launchOffline(context, page, USERS.modern.path(USERS.modern.board), page.getByText('all done', { exact: true }));
      await expect(deviceCopyNotice(page), 'the page says this is the saved copy').toBeVisible();
      expect(await apiAnsweredOffline(page)).toBe('network error');

      await page.getByRole('button', { name: 'more' }).click();
      await expect(page.getByText('cookie', { exact: true }), 'a synced folder opens offline').toBeVisible({ timeout: 30_000 });
      await expect(deviceCopyNotice(page)).toBeVisible();

      await tapEdit(page);
      await expect(page.getByText(NEEDS_CONNECTION).first(), 'Edit says why it stopped').toBeVisible();
      expect(page.url(), 'Edit did not open').not.toContain('/edit');

      // A direct way into Edit, on a cold launch.
      await page.goto(USERS.modern.path(USERS.modern.board) + '/edit');
      await expect(page.getByText('all done', { exact: true })).toBeVisible({ timeout: 60_000 });
      await expect.poll(() => new URL(page.url()).pathname, { message: 'sent back to the board', timeout: 30_000 })
        .toBe(USERS.modern.path(USERS.modern.board));

      // Back online. The copy stays on screen until Edit asks the server, which rebuilds it.
      await context.setOffline(false);
      await page.evaluate(() => {
        Object.defineProperty(Navigator.prototype, 'onLine', { get: () => true, configurable: true });
        window.dispatchEvent(new Event('online'));
      });
      await expect.poll(() => page.evaluate(() => window.persistence.get('online')), { timeout: 40_000 }).toBe(true);
      await expect(deviceCopyNotice(page), 'no swap on reconnect').toBeVisible();
      await tapEdit(page);
      await expect(deviceCopyNotice(page), 'the server answered').toBeHidden({ timeout: 30_000 });
      await expect(page.getByText('all done', { exact: true }), 'the rebuilt grid').toBeVisible();
      await tapEdit(page);
      await expect.poll(() => new URL(page.url()).pathname, { message: 'Edit opens on the server copy', timeout: 30_000 })
        .toBe(USERS.modern.path(USERS.modern.board) + '/edit');
    } finally {
      await context.setOffline(false).catch(() => {});
      await context.close();
    }
  });

  // Online, through the real router: what the board page does with each kind of server failure. The
  // folder, not the home board, because a home board keeps its copy after a denial.
  test('Modern view online: a hung server, an outage, and a denial that holds through Try Again', async () => {
    const context = await openProfile('modern-online');
    const folderPath = USERS.modern.path(USERS.modern.folder);
    const cookie = (page) => page.getByText('cookie', { exact: true });
    const errorState = (page) => page.locator('.md-board-detail-error[role="alert"]');
    const folderApi = `**/api/v1/boards/${USERS.modern.user}/${USERS.modern.folder}**`;
    try {
      const page = context.pages()[0] || await context.newPage();
      await prepare(page, USERS.modern);
      await page.goto(folderPath);
      await expect(cookie(page), 'the normal load').toBeVisible({ timeout: 60_000 });
      await expect(deviceCopyNotice(page), 'no notice on a server copy').toBeHidden();

      // A server that never answers: one bounded try, then the copy, not minutes of retries.
      await context.route(folderApi, () => {});
      const started = Date.now();
      await page.reload();
      await expect(cookie(page)).toBeVisible({ timeout: 30_000 });
      await expect(deviceCopyNotice(page)).toBeVisible();
      expect(Date.now() - started, 'well before the retries run out').toBeLessThan(30_000);
      await context.unroute(folderApi);

      // An outage: the copy shows.
      await context.route(folderApi, (route) => route.fulfill({ status: 503, body: '' }));
      await page.reload();
      await expect(cookie(page)).toBeVisible({ timeout: 30_000 });
      await expect(deviceCopyNotice(page)).toBeVisible();
      await context.unroute(folderApi);

      // A real denial: the error page, never the copy.
      await context.route(folderApi, (route) => route.fulfill({ status: 400, contentType: 'application/json', body: DENIED }));
      await page.reload();
      await expect(errorState(page)).toBeVisible({ timeout: 30_000 });
      await expect(cookie(page)).toBeHidden();
      await context.unroute(folderApi);

      // The denial sticks: Try Again with no answer from the server still does not open the copy.
      await context.route(folderApi, (route) => route.abort('failed'));
      await page.locator('[data-bd-action="re_transition"]').click();
      await expect(errorState(page), 'still refused').toBeVisible({ timeout: 30_000 });
      await expect(cookie(page)).toBeHidden();
      await context.unroute(folderApi);

      // Try Again, on the real router, once the server allows the board.
      await page.locator('[data-bd-action="re_transition"]').click();
      await expect(cookie(page), 'Try Again reaches the board').toBeVisible({ timeout: 30_000 });
      await expect(errorState(page)).toBeHidden();
      await expect(deviceCopyNotice(page)).toBeHidden();
    } finally {
      await context.unrouteAll().catch(() => {});
      await context.close();
    }
  });
});
