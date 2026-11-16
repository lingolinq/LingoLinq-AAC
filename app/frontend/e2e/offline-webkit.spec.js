// Synced boards offline in WebKit (Safari's engine), as a current iPad (support/offline-shell.js
// IPAD_AS_MAC: an iPad screen and touch, Safari's Mac identity).
//
// Why a separate spec: in WebKit, Playwright cannot take a page offline once a service worker controls
// it. A navigation after context.setOffline(true) fails inside WebKit ("WebKit encountered an internal
// error"), and context.route never sees the page's requests (checked 2026-11-07 with Playwright 1.62.1:
// a routed abort saw 0 requests and the request reached Rails). So offline-launch.spec.js cannot run in
// WebKit. Here the profile reaches Rails through a local pass-through proxy (support/worker-proxy.js), and
// going offline closes it: nothing answers, as on a device with no network, and the page reports
// navigator.onLine false, as an iPad in Airplane Mode does.
//
// Not iOS: no Home Screen mode, and WebKit on Linux is not Safari on an iPad. A real device is still needed.
//
//   OFFLINE_APP_SHELL=on bin/rails s -p 5077   (seeded with e2e/support/offline-launch.rb)
//   cd app/frontend && E2E_BASE_URL=http://localhost:5077 npx playwright test --project=offline-webkit

const path = require('path');
const { test, expect } = require('@playwright/test');
const { signIn } = require('./support/local-session');
const { openProfile, baseURL } = require('./support/offline-shell');
const { startWorkerProxy } = require('./support/worker-proxy');

test.describe.configure({ mode: 'serial' });

const PICTURE = 'https://d18vdu4p71yql0.cloudfront.net/e2e-offline/bubble.png';
const CASES = [
  { view: 'Modern', user: 'e2e_offline_modern', home: '/e2e_offline_modern/board-detail/e2e-offline-modern-home', word: 'all done', folder: 'cookie' },
  { view: 'Basic', user: 'e2e_offline_classic', home: '/e2e_offline_classic/board/e2e-offline-classic-home', word: 'all done', folder: 'cookie' },
  { view: 'Basic (pictures)', user: 'e2e_offline_pictures_classic', home: '/e2e_offline_pictures_classic/board/e2e-offline-pictures', word: 'bird', picture: true },
];

for (const c of CASES) {
  test(`WebKit as an iPad: ${c.view} view opens synced boards with no network`, async () => {
    const proxy = await startWorkerProxy(baseURL());
    let open = true;
    const context = await openProfile(`webkit-${c.user}`, { browser: 'webkit', baseURL: proxy.url });
    try {
      await context.route('https://d18vdu4p71yql0.cloudfront.net/e2e-offline/**', (route) => route.fulfill({
        path: path.join(__dirname, '../../../public/images/Bubble-come-here.png'),
        contentType: 'image/png',
        headers: { 'access-control-allow-origin': '*' },
      }));
      const page = context.pages()[0] || await context.newPage();
      await signIn(page, c.user, 'offline-launch.rb');
      expect(await page.evaluate(() => window.offline_shell_enabled), 'Rails must run with OFFLINE_APP_SHELL=on').toBe(true);
      expect(await page.evaluate(() => window.persistence.get('local_system.available')), 'no file storage, as on an iPad').toBe(false);
      await page.waitForFunction(async () => {
        const r = await navigator.serviceWorker.getRegistration('/');
        return !!(r && r.active && r.active.state === 'activated');
      }, null, { timeout: 120_000 });
      await page.evaluate(() => { window.persistence.sync('self', null, null, 'manual_sync').then(null, () => {}); });
      await page.waitForFunction(() => ['succeeded', 'finished'].indexOf(window.persistence.get('sync_status')) !== -1, null, { timeout: 300_000 });
      expect(await page.evaluate(() => window.persistence.get('sync_status')), 'sync finished without errors').toBe('succeeded');
      if (c.picture) {
        await expect.poll(() => page.evaluate((u) => window.persistence.find('dataCache', u).then((d) => !!d.data_uri, () => false), PICTURE),
          { message: 'the sync saved the picture in the database', timeout: 20_000 }).toBe(true);
      }
      // Loaded once more online, so the worker controls the page and has cached the shell.
      await page.goto(c.home);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60_000 });

      await context.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false, configurable: true });
      });
      await proxy.close();
      open = false;

      const response = await page.goto(c.home);
      expect(response && response.headers()['x-robots-tag'], 'the cached app page, from the worker').toBe('noindex');
      await expect(page.getByText(c.word, { exact: true }).first(), 'the synced board, offline').toBeVisible({ timeout: 60_000 });
      await expect(page.locator('img[src*="not-found.png"]'), 'not the app error page').toHaveCount(0);
      if (c.folder) {
        // Modern's buttons are buttons; Basic's tiles are found by their label (as in offline-launch.spec.js).
        const more = c.view === 'Modern' ? page.getByRole('button', { name: 'more', exact: true }) : page.getByText('more', { exact: true }).first();
        await more.click({ timeout: 30_000 });
        await expect(page.getByText(c.folder, { exact: true }), 'a synced folder, offline').toBeVisible({ timeout: 30_000 });
      }
      if (c.picture) {
        await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('img')]
          .some((img) => img.src.startsWith('data:image/png') && img.complete && img.naturalWidth > 0)),
        { message: 'the saved picture shows offline', timeout: 20_000 }).toBe(true);
      }
    } finally {
      await context.close();
      if (open) { await proxy.close(); }
    }
  });
}
