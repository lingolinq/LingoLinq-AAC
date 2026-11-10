// The offline app shell's worker (app/views/offline_shell/service_worker.js.erb), run for real: what it
// does with a slow page online, with an update that fails to install, and with an update that installs
// while a page it controls is still open. The source checks in spec/controllers/offline_shell_controller_spec.rb
// cannot show any of this.
//
// Runs against RAILS with the shell on, like offline-launch.spec.js (its header has the build, seed and
// server steps), with no sync, so it is quick:
//   cd app/frontend && E2E_BASE_URL=http://localhost:5077 npx playwright test --project=offline-worker-lifecycle
//
// A "new version" of the worker is the one Rails serves with its cache name changed (and, for the failed
// install, one file that does not exist added to its list). Playwright's routing does not see the
// browser's fetch of the worker script, so the profile talks to Rails through a local pass-through proxy
// (support/worker-proxy.js) that applies the edit to /sw.js; the browser installs it exactly as it would
// a new deploy. Routing (context.route) does see the worker's own requests, and delays its request for
// the slow page.

const { test, expect } = require('@playwright/test');
const { signIn } = require('./support/local-session');
const { baseURL, openProfile, workerState } = require('./support/offline-shell');
const { startWorkerProxy } = require('./support/worker-proxy');

const USER = 'e2e_offline_classic';
const PAGE = `/${USER}/home`;
// The profile's browser language is Spanish, so the app loads /locales/es.json, which the worker keeps.
const LOCALE = 'es-ES';
const LANGUAGE_FILE = '/locales/es.json';
const SECOND_LANGUAGE_FILE = '/locales/fr.json';

test.describe.configure({ mode: 'serial' });

let proxy;
test.beforeAll(async () => { proxy = await startWorkerProxy(baseURL()); });
test.afterAll(async () => { if (proxy) { await proxy.close(); } });
test.beforeEach(() => { proxy.state.edit = null; });

function open() {
  return openProfile('lifecycle', { locale: LOCALE, baseURL: proxy.url });
}

// Signs in on a trusted device, waits for the worker, then reloads so the page is the worker's and the
// worker has kept the language file.
async function prepare(page) {
  await signIn(page, USER, 'offline-launch.rb');
  expect(await page.evaluate(() => window.offline_shell_enabled), 'Rails must be running with OFFLINE_APP_SHELL=on').toBe(true);
  await page.waitForFunction(async () => {
    const r = await navigator.serviceWorker.getRegistration('/');
    return !!(r && r.active && r.active.state === 'activated');
  }, null, { timeout: 120_000 });
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller), 'the reloaded page is the worker\'s').toBe(true);
  await expect.poll(() => page.evaluate((f) => caches.match(f).then((r) => !!r), LANGUAGE_FILE), { timeout: 30_000 }).toBe(true);
}

// The registration as the page sees it.
async function registrationState(page) {
  return page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration('/');
    if (!r) { return null; }
    return { active: !!r.active, waiting: !!r.waiting, installing: !!r.installing };
  });
}

// From now on the browser gets Rails' worker with `edit` applied (support/worker-proxy.js). Returns how
// many edited copies were served before, so a case can show the browser really fetched one.
function serveEditedWorker(edit) {
  proxy.state.edit = edit;
  return proxy.state.served;
}

function renameCache(source) {
  return source.replace(/var CACHE_NAME = "(ll-offline-shell-[0-9a-f]+)";/, 'var CACHE_NAME = "$1-next";');
}

function addMissingFile(source) {
  return source.replace('var PRECACHE = [', 'var PRECACHE = ["/e2e-offline-shell-missing-file.png",');
}

test('online, a slow page load waits for the network instead of answering with the cached copy', async () => {
  const context = await open();
  try {
    const page = context.pages()[0] || await context.newPage();
    await prepare(page);
    // Only the worker's own request for the page is held back (the page's navigation goes to the worker).
    let delayed = 0;
    await context.route((url) => url.pathname === PAGE, async (route) => {
      delayed += 1;
      await new Promise((resolve) => setTimeout(resolve, 6_000));
      await route.continue();
    });
    const started = Date.now();
    const response = await page.goto(PAGE);
    const elapsed = Date.now() - started;
    expect(delayed, 'the worker\'s request for the page was the one held back').toBeGreaterThan(0);
    expect(response.fromServiceWorker(), 'answered by the worker').toBe(true);
    // Only the cached generic page carries this header (OfflineShellController#shell).
    expect(response.headers()['x-robots-tag'], 'the live page, not the cached copy').toBeUndefined();
    expect(elapsed, 'it waited for the network').toBeGreaterThan(5_500);
    await context.unroute((url) => url.pathname === PAGE);
  } finally {
    await context.close();
  }
});

test('an update that fails to install leaves the installed worker and its copy in place', async () => {
  const context = await open();
  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(PAGE);
    const before = await workerState(page);
    expect(before.caches.length, 'one installed copy').toBe(1);
    const servedBefore = serveEditedWorker((source) => addMissingFile(renameCache(source)));
    await page.evaluate(() => navigator.serviceWorker.getRegistration('/').then((r) => r.update()).then(null, () => {}));
    expect(proxy.state.served, 'the browser fetched the edited worker').toBeGreaterThan(servedBefore);
    // The browser tries the install, a precache fetch fails, and the install is abandoned.
    await expect.poll(() => registrationState(page), { timeout: 60_000 }).toEqual({ active: true, waiting: false, installing: false });
    const after = await workerState(page);
    expect(after.caches, 'the failed version left no cache behind, and the installed copy is still there').toEqual(before.caches);
    proxy.state.edit = null;
    // The installed worker still opens the app with no network.
    await context.setOffline(true);
    const response = await page.goto(PAGE);
    expect(response.fromServiceWorker()).toBe(true);
    expect(response.headers()['x-robots-tag'], 'the cached copy').toBe('noindex');
  } finally {
    await context.setOffline(false).catch(() => {});
    await context.close();
  }
});

// Added 2026-11-05 (review round 3). A changed worker can keep the cache name of the installed one (a
// change the name does not cover). If its install then fails, it must not delete that cache: it belongs
// to the installed worker.
test('an update that keeps the cache name and fails to install leaves the installed copy in place', async () => {
  const context = await open();
  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(PAGE);
    const before = await workerState(page);
    expect(before.caches.length, 'one installed copy').toBe(1);
    const servedBefore = serveEditedWorker(addMissingFile);
    await page.evaluate(() => navigator.serviceWorker.getRegistration('/').then((r) => r.update()).then(null, () => {}));
    expect(proxy.state.served, 'the browser fetched the edited worker').toBeGreaterThan(servedBefore);
    await expect.poll(() => registrationState(page), { timeout: 60_000 }).toEqual({ active: true, waiting: false, installing: false });
    expect((await workerState(page)).caches, 'the installed copy is still there').toEqual(before.caches);
    proxy.state.edit = null;
    await context.setOffline(true);
    const response = await page.goto(PAGE);
    expect(response.fromServiceWorker()).toBe(true);
    expect(response.headers()['x-robots-tag'], 'the cached copy still opens the app').toBe('noindex');
  } finally {
    await context.setOffline(false).catch(() => {});
    await context.close();
  }
});

test('an update waits until the old worker\'s pages close, then replaces its copy and keeps the language file', async () => {
  let context = await open();
  let next;
  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(PAGE);
    const before = await workerState(page);
    expect(before.caches.length).toBe(1);
    next = before.caches[0] + '-next';
    const servedBefore = serveEditedWorker(renameCache);
    await page.evaluate(() => navigator.serviceWorker.getRegistration('/').then((r) => r.update()));
    expect(proxy.state.served, 'the browser fetched the edited worker').toBeGreaterThan(servedBefore);
    // Installed, and waiting: the open page is still the old worker's.
    await expect.poll(() => registrationState(page), { timeout: 60_000 }).toEqual({ active: true, waiting: true, installing: false });
    expect((await workerState(page)).caches.sort(), 'both copies while the old worker still has a page').toEqual([before.caches[0], next].sort());
    expect(await page.evaluate(({ name, file }) => caches.open(name).then((c) => c.match(file)).then((r) => !!r), { name: next, file: LANGUAGE_FILE }),
      'the language file carried into the new copy at install').toBe(true);
    // A language file first loaded while the update waits (someone switched language meanwhile) goes
    // into the old copy only; activation must carry it over too.
    expect(await page.evaluate((f) => fetch(f).then((r) => r.ok), SECOND_LANGUAGE_FILE)).toBe(true);
    await expect.poll(() => page.evaluate(({ name, file }) => caches.open(name).then((c) => c.match(file)).then((r) => !!r),
      { name: before.caches[0], file: SECOND_LANGUAGE_FILE })).toBe(true);
  } finally {
    await context.close();
  }
  // Every page of the old worker is closed: the next launch gets the new one, which removes the old copy.
  context = await open();
  try {
    // Still the new version: the browser checks /sw.js again on this launch.
    serveEditedWorker(renameCache);
    const page = context.pages()[0] || await context.newPage();
    await page.goto(PAGE);
    await expect.poll(() => registrationState(page), { timeout: 60_000 }).toEqual({ active: true, waiting: false, installing: false });
    await expect.poll(async () => (await workerState(page)).caches, { timeout: 30_000 }).toEqual([next]);
    expect(await page.evaluate((f) => caches.match(f).then((r) => !!r), LANGUAGE_FILE), 'the language file survived the update').toBe(true);
    expect(await page.evaluate((f) => caches.match(f).then((r) => !!r), SECOND_LANGUAGE_FILE),
      'the language file cached while the update waited survived it too').toBe(true);
  } finally {
    await context.close();
  }
});
