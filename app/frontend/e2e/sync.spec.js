// The offline board sync, end to end, on every platform project (playwright.config.js, sync-*): PCs (Chrome,
// Firefox, Safari's engine), Android Chrome, iPhone and iPad (WebKit with their screens and touch), and Chrome on a
// real Android emulator. Written for #1322 (docs/task-management/2026-11-14_android-sync-slow-problems.md) and the
// sync proposal (docs/task-management/2026-11-15_offline-sync-research-proposal.md): each later phase adds its
// scenarios here, and the same scenarios run before and after it.
//
// Setup (a PRIVATE LOCAL lingolinq-e2e* database; see support/sync-users.rb):
//   1. seed:   bin/rails runner app/frontend/e2e/support/sync-users.rb   (with the env from its header)
//   2. build:  cd app/frontend && npx ember build --environment production && cd ../.. && bin/rake extras:assert_js
//   3. server: bin/rails s -p 5077   (same database, upload settings blank)
//   4. run:    cd app/frontend && E2E_BASE_URL=http://localhost:5077 npx playwright test --project=sync-desktop-chrome
//              (or any sync-* project; sync-android-emulator needs an emulator in `adb devices`, E2E_ADB=<path to adb>)
// The specs reach the server through a local link on port 5078 (support/sync-link.js) so they can slow it or cut it.

const { signIn } = require('./support/local-session');
const {
  test, expect, waitForApp, startSync, waitForSyncEnd, syncState, deviceBoardKeys, devicePictureCount, dropDeviceBoards,
  openSyncDetails, closeSyncDetails, readSyncDetails, drawer, signOut, openBoard, tapCell, sentence,
} = require('./support/sync');

// Each test has its own browser context and its own link, so one failure does not stop the others. They still run one
// at a time (playwright.config.js workers: 1): every test uses the link's one port.

const SEED = 'sync-users.rb';
// What support/sync-users.rb creates.
const MODERN = {
  user: 'sync_e2e_modern', prefix: 'sync_e2e_modern/', home: 'sync_e2e_modern/sync-e2e-modern-home', name: 'Sync E2e Modern Home',
  boards: ['home', ...Array.from({ length: 12 }, (_, i) => `folder-${i + 1}`), 'deep'].map((s) => `sync_e2e_modern/sync-e2e-modern-${s}`),
  folders: 13, pictures: 16 + 12 * 24 + 24,
};
const BASIC = {
  user: 'sync_e2e_basic', prefix: 'sync_e2e_basic/', home: 'sync_e2e_basic/sync-e2e-basic-home', name: 'Sync E2e Basic Home',
  boards: ['home', ...Array.from({ length: 6 }, (_, i) => `folder-${i + 1}`), 'deep'].map((s) => `sync_e2e_basic/sync-e2e-basic-${s}`),
  folders: 7, pictures: 10 + 6 * 16 + 16,
};
const OTHER = { user: 'sync_e2e_other', prefix: 'sync_e2e_other/', name: 'Sync E2e Other Home' };

async function signedIn(page, who) {
  await signIn(page, who.user, SEED);
  await waitForApp(page);
  // The sign-in warm-up fetches the board tree; let it finish so it does not compete with the sync being tested.
  await page.waitForLoadState('networkidle').catch(() => {});
}

// Every board of the set and every picture is on the device, and the last sync finished cleanly.
async function expectAllSaved(page, who) {
  const keys = await deviceBoardKeys(page);
  expect(who.boards.filter((k) => !keys.includes(k)), 'boards missing from the device').toEqual([]);
  expect(await devicePictureCount(page), 'pictures kept on the device').toBeGreaterThanOrEqual(who.pictures);
}

test('a first sync saves every board and picture, and Sync Details groups the folders under their board', async ({ syncPage: page, pictures }) => {
  await signedIn(page, MODERN);
  await startSync(page);
  const saving = await drawer(page);
  const end = await waitForSyncEnd(page);
  expect(end.status).toBe('succeeded');
  expect(end.last.errors).toBe(0);
  await expectAllSaved(page, MODERN);
  expect(pictures.served).toBeGreaterThan(0);

  await openSyncDetails(page);
  const details = await readSyncDetails(page);
  const home = details.cards.find((c) => c.text.includes(MODERN.name));
  expect(home, 'a card for the home board').toBeTruthy();
  expect(home.text).toContain(`${MODERN.folders} folders inside`);
  expect(home.text).toContain(`${MODERN.folders} of ${MODERN.folders} folders saved`);
  expect(home.attention).toBe(false);
  expect(details.cards.some((c) => /Crisis Vocabulary/.test(c.text)), 'the sidebar board has its own card').toBe(true);
  expect(details.cards.some((c) => /Folder \d+ /.test(c.text)), 'folders are inside their board, not cards of their own').toBe(false);
  // No percentage (Traci, 2026-11-16): a finished sync with nothing missing says so in words, and every board and
  // folder counted is saved (components/sync-details.js headline and summary_line).
  expect(details.pct).toBe('All your boards are ready offline');
  expect(details.lines[0]).toMatch(/^(\d+) of \1 boards and folders are saved on this device\.$/);
  expect(details.sideScroll).toBe(false);
  await closeSyncDetails(page);
  // The drawer showed the sync while it ran (it may have finished before the first look on a fast link).
  if (saving.shown) { expect(saving.title).toMatch(/Saving your boards|ready offline/); }
});

test('on a slow link, every board still saves (large boards are not cut off and thrown away)', async ({ syncPage: page, syncLink }) => {
  await signedIn(page, BASIC);
  await dropDeviceBoards(page, BASIC.prefix, BASIC.home);
  syncLink.setRate(256); // kilobits per second, shared, like a weak phone signal
  syncLink.setDelay(150);
  await startSync(page);
  const end = await waitForSyncEnd(page, 540_000);
  syncLink.setRate(null);
  syncLink.setDelay(0);
  expect(end.status).toBe('succeeded');
  expect(end.last.errors).toBe(0);
  await expectAllSaved(page, BASIC);
});

test('the link drops during a sync and comes back: the boards that failed are tried again and saved', async ({ syncPage: page, syncLink }) => {
  test.setTimeout(600_000);
  await signedIn(page, BASIC);
  await dropDeviceBoards(page, BASIC.prefix, BASIC.home);
  syncLink.setDelay(400); // slow enough that the drop lands while boards are still downloading
  await startSync(page);
  await page.waitForFunction(() => (window.persistence.get('sync_progress.visited') || 0) >= 2, null, { timeout: 120_000 });
  syncLink.down();
  // While it is down, failed boards are parked to be tried again (utils/board_retry.js), not given up on.
  await page.waitForFunction(() => (window.persistence.get('sync_progress.parked') || 0) > 0, null, { timeout: 120_000 });
  await page.waitForTimeout(5_000);
  syncLink.up();
  syncLink.setDelay(0);
  const end = await waitForSyncEnd(page, 480_000);
  expect(end.status, JSON.stringify(end)).toBe('succeeded');
  await expectAllSaved(page, BASIC);
});

test('a link that stays down: the drawer and Sync Details say what needs attention, and Try again saves the rest', async ({ syncPage: page, syncLink }) => {
  test.setTimeout(900_000);
  await signedIn(page, BASIC);
  await dropDeviceBoards(page, BASIC.prefix, BASIC.home);
  syncLink.setDelay(400);
  await startSync(page);
  await page.waitForFunction(() => (window.persistence.get('sync_progress.visited') || 0) >= 2, null, { timeout: 120_000 });
  syncLink.down();
  // Every retry fails (about 10, 30 and 90 s apart), so the sync ends with boards that did not save.
  const end = await waitForSyncEnd(page, 600_000);
  expect(['finished', 'failed']).toContain(end.status);
  if (end.status === 'finished') {
    // The drawer stays out of Speak Mode on a board page (a Basic user signs in onto their board), so read it where it
    // shows: the dashboard. It waits there until dismissed.
    await page.evaluate(() => { window.appState.get('router').transitionTo('index'); });
    await page.waitForFunction(() => window.appState.get('router.currentRouteName') !== 'user.board-alt.index', null, { timeout: 30_000 });
    await expect(page.locator('.ll-copy-drawer')).toBeVisible({ timeout: 30_000 });
    const card = await drawer(page);
    expect(card.shown).toBe(true);
    expect(card.title).toMatch(/of \d+ boards are ready offline/);
    expect(card.buttons.join(' ')).toMatch(/Try again/);
    await openSyncDetails(page);
    const details = await readSyncDetails(page);
    const attention = details.tabs.find((t) => /Needs attention/.test(t.text));
    expect(attention.text).not.toMatch(/\b0\b/);
    expect(details.cards.some((c) => c.attention), 'a card marked as needing attention').toBe(true);
    await closeSyncDetails(page);
  }
  syncLink.up();
  syncLink.setDelay(0);
  // Try again, as the drawer's button does (when the sync failed outright there is no drawer card: Sync Now).
  if (end.status === 'finished') {
    await page.locator('.ll-copy-drawer .ll-copy-drawer__btn--primary').click();
  } else {
    await startSync(page);
  }
  const again = await waitForSyncEnd(page, 480_000);
  expect(again.status).toBe('succeeded');
  await expectAllSaved(page, BASIC);
});

test('Cancel is logged as canceled; the cards keep the last full sync, after a reload too', async ({ syncPage: page, syncLink }) => {
  test.setTimeout(600_000);
  await signedIn(page, BASIC);
  await startSync(page);
  expect((await waitForSyncEnd(page)).status).toBe('succeeded');
  await dropDeviceBoards(page, BASIC.prefix, BASIC.home);
  syncLink.setDelay(300);
  await startSync(page);
  await page.waitForFunction(() => (window.persistence.get('sync_progress.visited') || 0) >= 1, null, { timeout: 120_000 });
  await page.evaluate(() => window.persistence.cancel_sync());
  const end = await waitForSyncEnd(page);
  syncLink.setDelay(0);
  expect(end.last.canceled).toBe(true);
  expect(end.last.errored).toBe(false);

  const check = async () => {
    await openSyncDetails(page);
    const details = await readSyncDetails(page);
    expect(details.lead).toBe('The last sync was canceled.');
    expect(details.lines.join(' ')).toMatch(/These results are from an earlier sync/);
    expect(details.cards.some((c) => c.text.includes(BASIC.name))).toBe(true);
    await closeSyncDetails(page);
  };
  await check();
  await page.reload();
  await waitForApp(page);
  await page.waitForFunction(() => (window.persistence.get('sync_log') || []).length >= 2, null, { timeout: 60_000 });
  await check();
});

test('the sync log survives a reload, and only its owner sees it', async ({ syncPage: page }) => {
  test.setTimeout(600_000);
  await signedIn(page, BASIC);
  await startSync(page);
  expect((await waitForSyncEnd(page)).status).toBe('succeeded');

  await page.reload();
  await waitForApp(page);
  await page.waitForFunction(() => (window.persistence.get('sync_log') || []).length >= 1, null, { timeout: 60_000 });
  await openSyncDetails(page);
  expect((await readSyncDetails(page)).cards.some((c) => c.text.includes(BASIC.name)), 'restored after a reload').toBe(true);
  await closeSyncDetails(page);

  await signOut(page);
  await signedIn(page, OTHER);
  await openSyncDetails(page);
  const theirs = await readSyncDetails(page);
  expect(theirs.cards.some((c) => c.text.includes(BASIC.name)), "another person never sees this person's results").toBe(false);
  await closeSyncDetails(page);

  await signOut(page);
  await signedIn(page, BASIC);
  await page.waitForFunction(() => (window.persistence.get('sync_log') || []).length >= 1, null, { timeout: 60_000 });
  await openSyncDetails(page);
  expect((await readSyncDetails(page)).cards.some((c) => c.text.includes(BASIC.name)), 'back for its owner').toBe(true);
  await closeSyncDetails(page);
});

test('using the board during a sync: the sentence stays through a folder, Speak Mode hides the drawer, the sync is not cancelled', async ({ syncPage: page, syncLink }) => {
  test.setTimeout(600_000);
  await signedIn(page, MODERN);
  await openBoard(page, MODERN.home);
  await dropDeviceBoards(page, MODERN.prefix, MODERN.home);
  await openBoard(page, MODERN.home);
  syncLink.setDelay(200);
  await startSync(page);
  await tapCell(page, 'sync e2e modern home word 1');
  await tapCell(page, 'sync e2e modern home word 2');
  const before = await sentence(page);
  expect(before).toMatch(/word 1.*word 2/);
  await tapCell(page, 'folder 3');
  await page.waitForFunction(() => /sync-e2e-modern-folder-3$/.test(location.pathname) && document.querySelectorAll('.md-board-detail-grid__cell').length > 4, null, { timeout: 180_000 });
  expect(await sentence(page), 'the sentence is kept through the folder hop').toBe(before);
  const speaking = await page.evaluate(() => ({ speak: !!window.appState.get('speak_mode'), syncing: !!window.persistence.get('syncing') }));
  if (speaking.speak && speaking.syncing) {
    expect((await drawer(page)).shown, 'nothing covers the board in Speak Mode').toBe(false);
  }
  expect(await page.evaluate(() => !!window.persistence.get('sync_progress.canceled'))).toBe(false);
  syncLink.setDelay(0);
  const end = await waitForSyncEnd(page);
  expect(end.status).toBe('succeeded');
  expect(end.last.canceled).toBe(false);
});

test('Basic view: a synced folder opens with no network', async ({ syncPage: page, syncLink }) => {
  test.setTimeout(600_000);
  await signedIn(page, BASIC);
  await startSync(page);
  expect((await waitForSyncEnd(page)).status).toBe('succeeded');
  syncLink.down();
  await page.evaluate(() => { window.appState.get('router').transitionTo('user.board-alt', 'sync_e2e_basic', 'sync-e2e-basic-folder-2'); });
  await expect(page.locator('.button:visible', { hasText: 'sync e2e basic folder 2 word 1' }).first()).toBeVisible({ timeout: 60_000 });
  syncLink.up();
});

test('Sync Details fits the screen: one row of tabs on wide screens, stacked rows on a phone', async ({ syncPage: page }) => {
  await signedIn(page, BASIC);
  await startSync(page);
  expect((await waitForSyncEnd(page)).status).toBe('succeeded');
  await openSyncDetails(page);
  const details = await readSyncDetails(page);
  const width = await page.evaluate(() => window.innerWidth);
  const rows = new Set(details.tabs.map((t) => t.top)).size;
  if (width < 560) {
    expect(rows, 'stacked as one row each on a phone').toBe(3);
  } else {
    expect(rows, 'side by side').toBe(1);
  }
  expect(details.tabs.filter((t) => t.selected).length).toBe(1);
  expect(details.sideScroll, 'nothing scrolls sideways').toBe(false);
  await closeSyncDetails(page);
});

// Keep the state helper referenced for specs that add scenarios later.
void syncState;
