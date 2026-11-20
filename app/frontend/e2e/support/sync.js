// Fixtures and helpers for the sync specs (e2e/sync.spec.js).
//
// One spec runs on every platform project in playwright.config.js (sync-*):
// - PCs: Chrome, Firefox and Safari's engine (WebKit) on a desktop screen;
// - phones and tablets: Android Chrome (Pixel 7 profile), iPhone 15 and iPad (WebKit with their screens and touch);
// - a real Android emulator (sync-android-emulator): Chrome on an emulator or device that `adb devices` lists,
//   driven through Playwright's Android API, reaching the server through `adb reverse`.
// Not iOS itself: WebKit on Linux has no Home Screen mode and is not Safari on an iPhone. A real device, or
// the iOS Simulator on a Mac, is still the check for iOS.
//
// Every page reaches the server through the sync link (support/sync-link.js), so a spec can slow it or take
// it down. Pictures are on the symbol CDN host the app fetches directly; the specs answer that host
// themselves (routePictures), so nothing leaves this machine.

const path = require('path');
const { execFileSync } = require('child_process');
const base = require('@playwright/test');
const { startSyncLink } = require('./sync-link');
const { assertLocalStack } = require('./local-session');

const { expect } = base;
const LINK_PORT = parseInt(process.env.E2E_SYNC_LINK_PORT || '5078', 10);
const PICTURE_HOST = 'https://d18vdu4p71yql0.cloudfront.net/e2e-sync/';
const PICTURE_FILE = path.join(__dirname, '../../../../public/images/Bubble-come-here.png');
const EMULATOR_PROJECT = 'sync-android-emulator';

function serverURL() {
  return process.env.E2E_BASE_URL || 'http://localhost:5077';
}

function adb() {
  return process.env.E2E_ADB || 'adb';
}

// Answer the picture host from a local file. A picture honours the link: refused while it is down, delayed by
// its latency. counter.served counts pictures answered.
async function routePictures(context, link, counter) {
  await context.route(PICTURE_HOST + '**', async (route) => {
    if (link.isDown()) { await route.abort('internetdisconnected'); return; }
    if (link.delay()) { await new Promise((r) => setTimeout(r, link.delay() * 2)); }
    if (link.isDown()) { await route.abort('internetdisconnected'); return; }
    counter.served += 1;
    await route.fulfill({ path: PICTURE_FILE, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } });
  });
}

// What a fresh device holds: nothing. Used on the emulator, whose browser keeps its data between tests.
async function clearSite(page) {
  await page.evaluate(async () => {
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* none */ }
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); }
    if (indexedDB.databases) {
      const dbs = await indexedDB.databases();
      await Promise.all(dbs.map((db) => new Promise((resolve) => {
        const req = indexedDB.deleteDatabase(db.name);
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      })));
    }
  });
}

const test = base.test.extend({
  // A new link for each test, on the port every platform uses.
  syncLink: async ({}, use) => {
    assertLocalStack();
    const link = await startSyncLink({ target: serverURL(), port: LINK_PORT });
    await use(link);
    await link.close();
  },

  pictures: async ({}, use) => { await use({ served: 0 }); },

  // The page a sync spec drives, with the picture host answered and the app reached through the link.
  syncPage: async ({ context, syncLink, pictures }, use, testInfo) => {
    if (testInfo.project.name === EMULATOR_PROJECT) {
      const devices = await base._android.devices();
      if (!devices.length) { throw new Error('no Android device: start the emulator first (adb devices lists none)'); }
      const device = devices[0];
      execFileSync(adb(), ['-s', device.serial(), 'reverse', `tcp:${LINK_PORT}`, `tcp:${LINK_PORT}`]);
      const emulated = await device.launchBrowser({ baseURL: syncLink.url });
      await routePictures(emulated, syncLink, pictures);
      const page = emulated.pages()[0] || await emulated.newPage();
      await page.goto('/login');
      await clearSite(page);
      await use(page);
      await emulated.close();
      await device.close();
      return;
    }
    if (testInfo.project.name === 'sync-ipad') {
      // An iPad sends Safari's Mac identity; WebKit on Linux reports no touch points (support/offline-shell.js).
      await context.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5, configurable: true });
        Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel', configurable: true });
      });
    }
    await routePictures(context, syncLink, pictures);
    await use(await context.newPage());
  },
});

// ---- In-page helpers. Plain scripts, so they run the same in every engine and on the emulator. ----

async function waitForApp(page) {
  await page.waitForFunction(() => !!(window.persistence && window.persistence.ajax && window.appState && window.lingoLinqExtras
    && window.lingoLinqExtras.storage && window.LingoLinq && window.LingoLinq.session && window.LingoLinq.session.get('isAuthenticated')), null, { timeout: 120_000 });
}

// Start a sync as the Sync Now button does (persistence.sync('self', true)), without waiting for it.
async function startSync(page) {
  await page.evaluate(() => {
    window.__syncE2E = null;
    window.persistence.sync('self', true).then(() => { window.__syncE2E = 'resolved'; }, () => { window.__syncE2E = 'rejected'; });
  });
}

// Wait until no sync runs (whoever started it), then report how the last one ended.
async function waitForSyncEnd(page, timeout) {
  await page.waitForFunction(() => window.persistence.get('syncing') === true || window.__syncE2E !== null, null, { timeout: 30_000 }).catch(() => {});
  await page.waitForFunction(() => !window.persistence.get('syncing') && window.persistence.get('sync_status') !== 'syncing', null, { timeout: timeout || 300_000, polling: 500 });
  return syncState(page);
}

async function syncState(page) {
  return page.evaluate(() => {
    const p = window.persistence;
    const log = p.get('sync_log') || [];
    const last = log[log.length - 1] || null;
    return {
      syncing: !!p.get('syncing'),
      status: p.get('sync_status') || null,
      error: p.get('sync_status_error') || null,
      summary: last ? last.summary : null,
      failed: last ? (last.statuses || []).filter((st) => st.error).map((st) => st.key + ': ' + st.error).slice(0, 5) : [],
      parked: p.get('sync_progress.parked') || 0,
      log: log.length,
      last: last && { canceled: !!last.canceled, errored: !!last.errored, issues: !!last.issues, rows: (last.statuses || []).length,
        errors: (last.statuses || []).filter((s) => s.error).length },
    };
  });
}

// Keys of the boards in the device database. find_all answers rows as {store, data: {id, raw}}.
async function deviceBoardKeys(page) {
  return page.evaluate(() => window.lingoLinqExtras.storage.find_all('board').then((rows) => rows.map((r) => { const d = r.data || r; return (d.raw || d).key; }).filter(Boolean)));
}

// Pictures from the e2e picture host kept on the device (the dataCache rows, keyed by URL).
async function devicePictureCount(page) {
  return page.evaluate(() => window.lingoLinqExtras.storage.find_all('dataCache')
    .then((rows) => rows.filter((r) => JSON.stringify(r).indexOf('/e2e-sync/') !== -1).length, () => 0));
}

// Remove this user's boards from the device database (except the home board, which the page shows) and
// reload, so the next sync downloads them instead of finding them in memory or on the device.
async function dropDeviceBoards(page, prefix, keep) {
  await page.evaluate(([pre, keepKey]) => window.lingoLinqExtras.storage.find_all('board').then((rows) => Promise.all(rows
    .map((r) => r.data || r)
    .filter((d) => { const k = (d.raw || d).key || ''; return k.indexOf(pre) === 0 && k !== keepKey; })
    .map((d) => window.lingoLinqExtras.storage.remove('board', d.id)))), [prefix, keep || '']);
  await page.reload();
  await waitForApp(page);
}

async function openSyncDetails(page) {
  // After a reload the modal service is set up by the application route a moment after the app answers.
  await page.waitForFunction(() => !!window.require('frontend/utils/modal').default.route, null, { timeout: 60_000 });
  await page.evaluate(() => { window.require('frontend/utils/modal').default.open('sync-details', {}); });
  await expect(page.locator('.la-sync-details-modal-wrap')).toBeVisible();
}

async function closeSyncDetails(page) {
  await page.evaluate(() => { window.require('frontend/utils/modal').default.close(); });
  await expect(page.locator('.la-sync-details-modal-wrap')).toBeHidden();
}

async function readSyncDetails(page) {
  return page.evaluate(() => {
    const text = (el) => ((el && el.innerText) || '').replace(/\s+/g, ' ').trim();
    return {
      lead: text(document.querySelector('.la-sync-details-lead')),
      lines: Array.from(document.querySelectorAll('.la-sync-details-summary-line')).map(text),
      pct: text(document.querySelector('.la-sync-details-summary-pct')),
      tabs: Array.from(document.querySelectorAll('.la-sync-tab')).map((t) => ({ text: text(t), selected: t.getAttribute('aria-selected') === 'true',
        top: Math.round(t.getBoundingClientRect().top) })),
      cards: Array.from(document.querySelectorAll('.la-sync-card')).map((c) => ({ text: text(c.querySelector('.la-sync-card-head')),
        attention: c.classList.contains('la-sync-card--attention') })),
      sideScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
}

async function drawer(page) {
  return page.evaluate(() => {
    const d = document.querySelector('.ll-copy-drawer');
    const text = (el) => ((el && el.innerText) || '').replace(/\s+/g, ' ').trim();
    return d ? { shown: true, title: text(d.querySelector('.ll-copy-drawer__title')), hints: Array.from(d.querySelectorAll('.ll-copy-drawer__hint')).map(text),
      buttons: Array.from(d.querySelectorAll('.ll-copy-drawer__btn')).map(text) } : { shown: false };
  });
}

async function signOut(page) {
  await page.evaluate(() => { window.LingoLinq.session.invalidate(true); });
  await page.waitForURL((url) => /^\/(login)?$/.test(url.pathname) || /login/.test(url.pathname), { timeout: 60_000 });
  await page.waitForFunction(() => !!(window.LingoLinq && window.LingoLinq.session && !window.LingoLinq.session.get('isAuthenticated')), null, { timeout: 60_000 });
}

// Board-page helpers for the Modern view (user.board-detail): open a board, tap a cell by its label, and read
// the sentence bar.
async function openBoard(page, key) {
  await page.evaluate((k) => { const parts = k.split('/'); window.appState.get('router').transitionTo('user.board-detail', parts[0], parts[1]); }, key);
  await page.waitForFunction((k) => location.pathname.endsWith('/' + k.split('/')[1]) && document.querySelectorAll('.md-board-detail-grid__cell').length > 1, key, { timeout: 120_000 });
}

// A board button by its accessible name (the label), as a person using a screen reader would find it. On a phone a
// board wider than 8 columns first shows "Larger screen recommended" (templates/user/board-detail.hbs,
// portrait_overlay_active); a person taps "Continue Anyway", and so does this.
async function tapCell(page, label) {
  const overlay = page.locator('.md-board-detail-portrait-overlay [data-bd-action="dismiss_portrait_overlay"]');
  if (await overlay.isVisible().catch(() => false)) { await overlay.click(); }
  await page.locator('.md-board-detail-grid').getByRole('button', { name: label, exact: true }).first().click();
}

async function sentence(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('.md-board-detail-sentence-bar__utterance'))
    .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()).join(' ').trim());
}

module.exports = {
  test, expect, EMULATOR_PROJECT,
  waitForApp, startSync, waitForSyncEnd, syncState, deviceBoardKeys, devicePictureCount, dropDeviceBoards,
  openSyncDetails, closeSyncDetails, readSyncDetails, drawer, signOut, openBoard, tapCell, sentence,
};
