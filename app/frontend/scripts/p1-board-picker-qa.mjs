#!/usr/bin/env node
/**
 * P1 manual-QA automation for board-picker supervisee context.
 *
 * NAVIGATION: `domcontentloaded`, never `networkidle`. This app polls in the background,
 * so the network never goes idle and `networkidle` times out at 60s — it failed here on
 * the bare /board-picker navigation while other navigations happened to settle, which
 * reads as a flaky product bug rather than a probe-harness choice. Every Puppeteer probe
 * in this directory already uses `domcontentloaded` plus an explicit wait.
 *
 * Run from app/frontend (that is where `playwright` resolves) under Node 22:
 *   node scripts/p1-board-picker-qa.mjs
 *     [--base http://localhost:8184] [--user marcus_williams_slp] [--pass 'demo2025!']
 *
 * Full pick-and-save E2E (mutates supervisee home board in dev DB):
 *   node scripts/p1-board-picker-qa.mjs --full-pick [--supervisee hannah_lee] [--pick-board keyboard]
 *   node scripts/p1-board-picker-qa.mjs --full-pick-only --user marcus_williams_slp --pass 'demo2025!'
 *
 * Needs the full dev stack, not just Rails + Ember: the pick goes through
 * copy_board_links, which is Progress.schedule'd, so a RESQUE WORKER must be
 * running or the completion callback never fires and the home board is never set.
 */
import { chromium } from 'playwright';

// 8184 is the port bin/ember-server binds (it proxies /api to Rails on :5000).
const BASE = (process.argv.find((a, i) => process.argv[i - 1] === '--base') || 'http://localhost:8184');
const USER = process.argv.find((a, i) => process.argv[i - 1] === '--user') || 'example';
const PASS = process.argv.find((a, i) => process.argv[i - 1] === '--pass') || 'password';
const FULL_PICK = process.argv.includes('--full-pick') || process.argv.includes('--full-pick-only');
const FULL_PICK_ONLY = process.argv.includes('--full-pick-only');
const SUPERVISEE = process.argv.find((a, i) => process.argv[i - 1] === '--supervisee') || null;
const PICK_BOARD = process.argv.find((a, i) => process.argv[i - 1] === '--pick-board') || 'keyboard';

const results = [];

function record(id, pass, detail) {
  results.push({ id, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${id}: ${detail}`);
}

async function dismissDevicePrompt(page) {
  for (let i = 0; i < 3; i++) {
    const trust = page.locator('button.login-btn--device').first();
    const trustAlt = page.getByRole('button', { name: /Trust this Device|Keep me logged in/i });
    if (await trust.isVisible({ timeout: 2000 }).catch(() => false)) {
      await trust.click();
      await page.waitForTimeout(800);
      return;
    }
    if (await trustAlt.isVisible({ timeout: 500 }).catch(() => false)) {
      await trustAlt.click();
      await page.waitForTimeout(800);
      return;
    }
  }
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('#identification', USER);
  await page.fill('#password', PASS);
  await page.locator('button.login-btn[type="submit"], form button[type="submit"]').first().click();
  await page.waitForTimeout(2500);
  await dismissDevicePrompt(page);
  await page.waitForTimeout(2000);
  const url = page.url();
  if (url.includes('/login')) {
    const err = await page.locator('.alert-danger, .text-danger, .login-error').first().textContent().catch(() => '');
    throw new Error(`Login failed for ${USER}. Still on login. ${err}`);
  }
}

async function getAccessToken(page) {
  return page.evaluate(() => {
    try {
      const raw = localStorage.getItem('lingolinqStash-auth_settings');
      return raw ? JSON.parse(raw).access_token : null;
    } catch (e) {
      return null;
    }
  });
}

async function apiGet(page, path) {
  const token = await getAccessToken(page);
  if (!token) return null;
  return page.evaluate(async ({ path, token }) => {
    const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { error: res.status, body: await res.text() };
    return res.json();
  }, { path, token });
}

async function getUserDetail(page, userName) {
  const detail = await apiGet(page, `/api/v1/users/${encodeURIComponent(userName)}`);
  if (!detail || detail.error) {
    return null;
  }
  const user = detail.user || detail;
  const homeKey = user.preferences && user.preferences.home_board && user.preferences.home_board.key;
  const perms = user.permissions || {};
  return {
    id: String(user.id),
    user_name: user.user_name || userName,
    hasHome: !!homeKey,
    homeKey: homeKey || null,
    hasEdit: !!perms.edit,
    hasSupervise: !!perms.supervise
  };
}

async function findSupervisee(page, userName) {
  const superviseesResp = await apiGet(page, `/api/v1/users/${encodeURIComponent(userName)}/supervisees?per_page=25`);
  const list = superviseesResp && superviseesResp.user ? superviseesResp.user : [];
  let fallback = null;
  for (const s of list) {
    const id = s.id || s.user_id;
    const un = s.user_name;
    if (!id || !un) continue;
    const detail = await getUserDetail(page, un);
    if (!detail) continue;
    if (detail.hasEdit || detail.hasSupervise) {
      const candidate = {
        id: detail.id,
        user_name: detail.user_name,
        hasHome: detail.hasHome,
        homeKey: detail.homeKey,
        hasEdit: detail.hasEdit,
        hasSupervise: detail.hasSupervise
      };
      if (!detail.hasHome && !s.modeling_only) {
        return candidate;
      }
      fallback = fallback || candidate;
    }
  }
  return fallback;
}

async function resolveSupervisee(page, slpUserName) {
  if (SUPERVISEE) {
    const detail = await getUserDetail(page, SUPERVISEE);
    if (!detail) {
      record('supervisee-resolve', false, `Could not load --supervisee ${SUPERVISEE}`);
      return null;
    }
    if (!detail.hasEdit && !detail.hasSupervise) {
      record('supervisee-resolve', false, `${SUPERVISEE} is not supervise-able by ${slpUserName}`);
      return null;
    }
    return detail;
  }
  return findSupervisee(page, slpUserName);
}

async function pollSuperviseeHomeBoard(page, userName, previousKey, timeoutMs = 300000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const detail = await getUserDetail(page, userName);
    const key = detail && detail.homeKey;
    if (key && key !== previousKey) {
      return { key, detail };
    }
    await page.waitForTimeout(3000);
  }
  return null;
}

function isPickSaveResponse(res) {
  const url = res.url();
  const method = res.request().method();
  if (!url.includes('/api/v1/')) {
    return false;
  }
  if (url.includes('/copy_board_links') && method === 'POST') {
    return true;
  }
  if (/\/api\/v1\/users\/[^/?#]+$/.test(url) && ['PUT', 'PATCH'].includes(method)) {
    return true;
  }
  if (url.includes('/api/v1/boards') && method === 'POST') {
    return true;
  }
  return false;
}

async function waitForBoardPickerGrid(page) {
  const loading = page.locator('.md-home-boards-picker__grid-message').filter({ hasText: /Loading boards/i });
  if (await loading.isVisible({ timeout: 2000 }).catch(() => false)) {
    await loading.waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
  }
  await page.locator('.md-home-boards-picker__board').first().waitFor({ state: 'visible', timeout: 60000 });
}

async function waitForPreviewReady(page) {
  await page.locator('.md-board-preview__title').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('.md-board-details-modal__header-loading').waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
  await page.locator('.md-board-preview__status').filter({ hasText: /Loading board/i }).waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
}

async function selectBoardForPick(page, pickFilter) {
  const filterInput = page.locator('#board-picker-search-q');
  const tryFilters = [pickFilter, 'keyboard', 'emoji', 'numbers'].filter(Boolean);
  const seen = new Set();

  for (const filter of tryFilters) {
    if (!filter || seen.has(filter)) continue;
    seen.add(filter);

    if (await filterInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await filterInput.fill(filter);
      await page.waitForTimeout(1500);
    }

    const noneFound = await page.locator('.md-home-boards-picker__grid-message').filter({ hasText: /None found/i }).isVisible().catch(() => false);
    const boardCard = page.locator('.md-home-boards-picker__grid .md-home-boards-picker__board').first();
    if (!noneFound && await boardCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await boardCard.locator('.simple_board_icon, button').first().click();
      return filter;
    }
  }

  throw new Error(`No pickable board found for filters: ${[...seen].join(', ')}`);
}

async function runPreviewPickCheck(page) {
  const pickerVisible = await page.locator('.md-home-boards-picker__layout').isVisible({ timeout: 3000 }).catch(() => false);
  if (!pickerVisible) {
    record('supervisee-pick-cta', false, 'BoardPicker not visible');
    return;
  }
  const firstBoard = page.locator('.md-home-boards-picker__board .simple_board_icon, .md-home-boards-picker__board button').first();
  if (await firstBoard.isVisible({ timeout: 3000 }).catch(() => false)) {
    await firstBoard.click();
    await page.waitForTimeout(3000);
  /* The picker CTA was RENAMED on this branch: board-preview.hbs now emits
     {{t "Set as Home Board" key="set_as_home_board_cta"}}. "Pick this Board" survives only
     in comments and SCSS comments — zero rendered text — so every locator filtering on the
     old label matched nothing and failed on every run (and the one at :281 `return`ed,
     killing the 8 checks below it as dead code). try-this-board-qa.mjs:59 asserts the old
     label is gone, so the two probes on this same branch contradicted each other.
     Matched permissively so a further rename does not silently re-break this. */
    const pickBtn = page.locator('button').filter({ hasText: /Set as Home Board|Pick this Board/i }).first();
    const pickVisible = await pickBtn.isVisible({ timeout: 5000 }).catch(() => false);
    record('supervisee-pick-cta', pickVisible, pickVisible ? 'Set as Home Board CTA visible in preview' : 'Preview/pick CTA not found');
  } else {
    record('supervisee-pick-cta', false, 'No board card to click');
  }
}

async function runFullPickE2E(page, supervisee) {
  const before = await getUserDetail(page, supervisee.user_name);
  const beforeKey = before && before.homeKey || null;
  record(
    'full-pick-before',
    true,
    beforeKey ? `home_board.key=${beforeKey} (will assert change after pick)` : 'no home board before pick'
  );

  await page.goto(`${BASE}/board-picker?user_id=${supervisee.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  try {
    await waitForBoardPickerGrid(page);
  } catch (err) {
    record('full-pick-grid', false, `Board grid did not load: ${err.message}`);
    return;
  }
  record('full-pick-grid', true, `${await page.locator('.md-home-boards-picker__board').count()} board cards visible`);

  try {
    const usedFilter = await selectBoardForPick(page, PICK_BOARD);
    record('full-pick-board-select', true, `Selected board using filter "${usedFilter}"`);
  } catch (err) {
    record('full-pick-board-select', false, err.message);
    return;
  }

  try {
    await waitForPreviewReady(page);
  } catch (err) {
    record('full-pick-preview', false, `Preview did not finish loading: ${err.message}`);
    return;
  }
  record('full-pick-preview', true, 'Board preview loaded');

  const pickBtn = page.getByRole('button', { name: /Set as Home Board|Pick this Board/i });
  if (!(await pickBtn.isVisible({ timeout: 10000 }).catch(() => false))) {
    record('full-pick-cta', false, 'Set as Home Board CTA not visible in preview');
    return;
  }

  const saveResponses = [];
  const onResponse = (res) => {
    if (isPickSaveResponse(res)) {
      saveResponses.push(res);
    }
  };
  page.on('response', onResponse);

  /* Not a check — the real assertion is the `record('full-pick-cta', false, ...)` guard
     above, which returns when the CTA is missing. A hardcoded `true` here only inflated the
     pass count, so this is a plain log line now. */
  console.log(`  → clicking Set as Home Board (target: ${PICK_BOARD})`);
  await pickBtn.click();

  const pickStarted = await page.locator('text=/Setting up your board|Preparing your Board/i').first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  record('full-pick-started', pickStarted, pickStarted ? 'Copy/save overlay visible' : 'No copy overlay after click');

  if (!pickStarted) {
    const errText = await page.locator('.alert-danger, .modal .text-danger, .md-board-preview__status--error').first().textContent().catch(() => '');
    if (errText) {
      record('full-pick-error', false, errText.trim());
    }
    page.off('response', onResponse);
    return;
  }

  // Fail fast if copy overlay clears without navigation or API activity (silent stall).
  await page.waitForTimeout(15000);
  const stillCopying = await page.locator('text=/Setting up your board|Preparing your Board/i').first().isVisible().catch(() => false);
  if (!stillCopying && saveResponses.length === 0 && page.url().includes('board-picker')) {
    record('full-pick-stalled', false, 'Copy overlay cleared but no save API call and still on board-picker');
    page.off('response', onResponse);
    return;
  }

  await Promise.race([
    page.waitForURL(new RegExp(`/${supervisee.user_name}/boards`), { timeout: 300000 }),
    page.getByText(/Great! This is now the user's home board!/i).waitFor({ state: 'visible', timeout: 300000 })
  ]).catch(() => {});

  const afterPoll = await pollSuperviseeHomeBoard(page, supervisee.user_name, beforeKey, 300000);
  page.off('response', onResponse);
  const afterKey = afterPoll && afterPoll.key;

  if (saveResponses.length > 0) {
    const last = saveResponses[saveResponses.length - 1];
    record(
      'full-pick-save-request',
      last.ok(),
      `${saveResponses.length} save-related API call(s); last ${last.request().method()} ${last.url()} → ${last.status()}`
    );
  } else {
    record('full-pick-save-request', false, 'No board copy / user save API response observed');
  }

  record(
    'full-pick-api-save',
    !!afterKey && afterKey !== beforeKey,
    afterKey
      ? `home_board.key=${afterKey}${beforeKey ? ` (was ${beforeKey})` : ''}`
      : 'home_board not set or unchanged after pick'
  );

  const appNavigated = page.url().includes(`/${supervisee.user_name}/boards`);
  record('full-pick-navigation', appNavigated, appNavigated ? page.url() : `Still on ${page.url()} after pick`);

  if (!afterKey) {
    return;
  }

  if (!appNavigated) {
    await page.goto(`${BASE}/${supervisee.user_name}/boards`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }

  await page.waitForTimeout(4000);
  const homeCount = await page.locator('.ub-boards-page__board-item--home').count();
  record('full-pick-home-badge', homeCount >= 1, `${homeCount} tile(s) with --home badge on boards page`);

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  const afterReload = await getUserDetail(page, supervisee.user_name);
  record(
    'full-pick-persist-reload',
    !!(afterReload && afterReload.homeKey === afterKey),
    afterReload && afterReload.homeKey ? `home_board.key=${afterReload.homeKey} after reload` : 'home board missing after reload'
  );
  const homeCountReload = await page.locator('.ub-boards-page__board-item--home').count();
  record('full-pick-badge-after-reload', homeCountReload >= 1, `${homeCountReload} home badge(s) after reload`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('  [console.error]', msg.text().slice(0, 200));
    }
  });

  try {
    console.log(`\n=== P1 board-picker QA @ ${BASE} as ${USER}${FULL_PICK ? ' (full pick E2E)' : ''} ===\n`);
    await login(page);
    record('login', true, `Logged in as ${USER}, now at ${page.url()}`);

    const meResp = await apiGet(page, `/api/v1/users/${encodeURIComponent(USER)}`);
    const me = meResp && (meResp.user || meResp);
    const currentUserId = me && me.id;
    record('current-user-id', !!currentUserId, currentUserId ? `currentUser.id=${currentUserId}` : 'Could not read current user via API');

    if (!FULL_PICK_ONLY) {
    // --- Self flow: /board-picker ---
    await page.goto(`${BASE}/board-picker`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    const selfUrl = page.url();
    record('self-picker-url', !selfUrl.includes('user_id='), selfUrl);
    const selfHeader = await page.locator('.md-hero__title').first().textContent().catch(() => '');
    record('self-picker-header', /Pick Your Home Board/i.test(selfHeader), selfHeader.trim());
    const allAvailableTab = page.locator('.md-home-boards-picker__category-label, .md-home-boards-picker__tabs a').filter({ hasText: /All Available Boards/i });
    record('self-all-available-tab', await allAvailableTab.count() > 0, `found ${await allAvailableTab.count()} All Available Boards tab(s)`);

    await page.waitForTimeout(3000);
    let gridItems = await page.locator('.md-home-boards-picker__board').count();
    if (gridItems === 0 && await allAvailableTab.count() > 0) {
      await allAvailableTab.first().click();
      await page.waitForTimeout(4000);
      gridItems = await page.locator('.md-home-boards-picker__board').count();
    }
    record('self-all-available-grid', gridItems > 0, `${gridItems} board cards in All Available Boards`);
    }

    // --- Supervisee flow ---
    if (!FULL_PICK_ONLY) {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    const supervisee = await resolveSupervisee(page, USER);
    if (!supervisee) {
      record('supervisee-found', false, 'No supervise-able communicatee found — skipping supervisor flows');
    } else {
      record('supervisee-found', true, `${supervisee.user_name} (id=${supervisee.id}, hasHome=${supervisee.hasHome})`);

      // Boards page link
      await page.goto(`${BASE}/${supervisee.user_name}/boards`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(4000);
      const setHomeBtn = page.locator('.ub-boards-page__set-home-btn').first();
      if (await setHomeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await setHomeBtn.click();
        await page.waitForTimeout(4000);
        const boardsPickerUrl = page.url();
        record('boards-page-link', boardsPickerUrl.includes(`user_id=${supervisee.id}`), boardsPickerUrl);
        const ctxBanner = await page.locator('.board-picker-page__context').textContent().catch(() => '');
        record('boards-page-banner', ctxBanner.includes(supervisee.user_name), ctxBanner.trim() || '(no banner)');
        const forUserHeader = await page.locator('.md-hero__title').first().textContent().catch(() => '');
        record('boards-page-header', forUserHeader.includes(supervisee.user_name) || /Choose a home board/i.test(forUserHeader), forUserHeader.trim());
      } else {
        record('boards-page-link', false, 'Set/Change Home Board button not visible');
      }

      // Caseload Choose Board
      await page.goto(`${BASE}/caseload`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(4000);
      const chooseBoardBtn = page.locator('.md-caseload__list-row').filter({ hasText: supervisee.user_name }).locator('.md-caseload__quick-action--choose-board').first();
      const chooseVisible = await chooseBoardBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (chooseVisible) {
        await chooseBoardBtn.click();
        await page.waitForTimeout(4000);
        const caseloadUrl = page.url();
        record('caseload-choose-board', caseloadUrl.includes(`user_id=${supervisee.id}`), caseloadUrl);
      } else {
        record('caseload-choose-board', supervisee.hasHome, `Choose Board not visible (supervisee hasHome=${supervisee.hasHome})`);
      }

      // Direct URL permission / resolution
      await page.goto(`${BASE}/board-picker?user_id=${supervisee.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(4000);
      const directUrl = page.url();
      const directError = await page.locator('.text-danger').first().textContent().catch(() => '');
      record('direct-user-id-url', directUrl.includes(`user_id=${supervisee.id}`) && !directError, directError || directUrl);
      const pickerVisible = await page.locator('.md-home-boards-picker__layout').isVisible({ timeout: 3000 }).catch(() => false);
      record('direct-picker-rendered', pickerVisible, pickerVisible ? 'BoardPicker rendered' : 'BoardPicker not visible');

      if (!FULL_PICK && pickerVisible) {
        await runPreviewPickCheck(page);
      }

      // Permission denied with bogus id
      await page.goto(`${BASE}/board-picker?user_id=999999999`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);
      const permErr = await page.locator('.text-danger').first().textContent().catch(() => '');
      record('permission-denied', /permission|error loading user/i.test(permErr), permErr.trim() || 'No error shown');
    }
    }

    if (FULL_PICK) {
      const supervisee = await resolveSupervisee(page, USER);
      if (!supervisee) {
        record('supervisee-found', false, 'No supervise-able communicatee found for full pick');
      } else {
        record('supervisee-found', true, `${supervisee.user_name} (id=${supervisee.id}, hasHome=${supervisee.hasHome})`);
        await runFullPickE2E(page, supervisee);
      }
    }

  } catch (err) {
    record('fatal', false, err.message);
    console.error(err);
  } finally {
    await browser.close();
  }

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n=== Summary: ${passed} passed, ${failed} failed / ${results.length} checks ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
