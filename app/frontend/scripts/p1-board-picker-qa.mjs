#!/usr/bin/env node
/**
 * P1 manual-QA automation for board-picker supervisee context.
 * Usage: node scripts/p1-board-picker-qa.mjs [--base http://localhost:8185]
 */
import { chromium } from 'playwright';

const BASE = (process.argv.find((a, i) => process.argv[i - 1] === '--base') || 'http://localhost:8185');
const USER = process.argv.find((a, i) => process.argv[i - 1] === '--user') || 'example';
const PASS = process.argv.find((a, i) => process.argv[i - 1] === '--pass') || 'password';

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
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
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

async function findSupervisee(page, userName) {
  const superviseesResp = await apiGet(page, `/api/v1/users/${encodeURIComponent(userName)}/supervisees?per_page=25`);
  const list = superviseesResp && superviseesResp.user ? superviseesResp.user : [];
  let fallback = null;
  for (const s of list) {
    const id = s.id || s.user_id;
    const un = s.user_name;
    if (!id || !un) continue;
    const detail = await apiGet(page, `/api/v1/users/${encodeURIComponent(un)}`);
    const user = detail && (detail.user || detail);
    const perms = user && user.permissions;
    if (perms && (perms.edit || perms.supervise)) {
      const homeKey = user.preferences && user.preferences.home_board && user.preferences.home_board.key;
      const candidate = {
        id: String(id),
        user_name: un,
        hasHome: !!homeKey,
        homeKey: homeKey || null,
        hasEdit: !!perms.edit,
        hasSupervise: !!perms.supervise
      };
      if (!homeKey && !s.modeling_only) {
        return candidate;
      }
      fallback = fallback || candidate;
    }
  }
  return fallback;
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
    console.log(`\n=== P1 board-picker QA @ ${BASE} as ${USER} ===\n`);
    await login(page);
    record('login', true, `Logged in as ${USER}, now at ${page.url()}`);

    const meResp = await apiGet(page, `/api/v1/users/${encodeURIComponent(USER)}`);
    const me = meResp && (meResp.user || meResp);
    const currentUserId = me && me.id;
    record('current-user-id', !!currentUserId, currentUserId ? `currentUser.id=${currentUserId}` : 'Could not read current user via API');

    // --- Self flow: /board-picker ---
    await page.goto(`${BASE}/board-picker`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    const selfUrl = page.url();
    record('self-picker-url', !selfUrl.includes('user_id='), selfUrl);
    const selfHeader = await page.locator('.md-hero__title').first().textContent().catch(() => '');
    record('self-picker-header', /Pick Your Home Board/i.test(selfHeader), selfHeader.trim());
    const allAvailableTab = page.locator('.md-home-boards-picker__category-label, .md-home-boards-picker__tabs a').filter({ hasText: /All Available Boards/i });
    record('self-all-available-tab', await allAvailableTab.count() > 0, `found ${await allAvailableTab.count()} All Available Boards tab(s)`);

    // Click All Available Boards if present
    if (await allAvailableTab.count() > 0) {
      await allAvailableTab.first().click();
      await page.waitForTimeout(4000);
      const gridItems = await page.locator('.md-home-boards-picker__board').count();
      record('self-all-available-grid', gridItems > 0, `${gridItems} board cards in All Available Boards`);
    }

    // --- Supervisee flow ---
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    const supervisee = await findSupervisee(page, USER);
    if (!supervisee) {
      record('supervisee-found', false, 'No supervise-able communicatee found — skipping supervisor flows');
    } else {
      record('supervisee-found', true, `${supervisee.user_name} (id=${supervisee.id}, hasHome=${supervisee.hasHome})`);

      // Boards page link
      await page.goto(`${BASE}/${supervisee.user_name}/boards`, { waitUntil: 'networkidle', timeout: 60000 });
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
      await page.goto(`${BASE}/caseload`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(4000);
      const chooseBoardBtn = page.locator('.md-caseload__list-row').filter({ hasText: supervisee.user_name }).locator('.md-caseload__quick-action--choose-board').first();
      const chooseVisible = await chooseBoardBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (chooseVisible) {
        await chooseBoardBtn.click();
        await page.waitForTimeout(4000);
        const caseloadUrl = page.url();
        record('caseload-choose-board', caseloadUrl.includes(`user_id=${supervisee.id}`), caseloadUrl);
      } else {
        record('caseload-choose-board', false, `Choose Board quick action not visible (supervisee may already have home board: ${supervisee.hasHome})`);
      }

      // Direct URL permission / resolution
      await page.goto(`${BASE}/board-picker?user_id=${supervisee.id}`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(4000);
      const directUrl = page.url();
      const directError = await page.locator('.text-danger').first().textContent().catch(() => '');
      record('direct-user-id-url', directUrl.includes(`user_id=${supervisee.id}`) && !directError, directError || directUrl);
      const pickerVisible = await page.locator('.md-home-boards-picker__layout').isVisible({ timeout: 3000 }).catch(() => false);
      record('direct-picker-rendered', pickerVisible, pickerVisible ? 'BoardPicker rendered' : 'BoardPicker not visible');

      // Pick flow (preview only — full pick is slow)
      if (pickerVisible) {
        const firstBoard = page.locator('.md-home-boards-picker__board .simple_board_icon, .md-home-boards-picker__board button').first();
        if (await firstBoard.isVisible({ timeout: 3000 }).catch(() => false)) {
          await firstBoard.click();
          await page.waitForTimeout(3000);
          const pickBtn = page.locator('button').filter({ hasText: /Pick this Board/i }).first();
          const pickVisible = await pickBtn.isVisible({ timeout: 5000 }).catch(() => false);
          record('supervisee-pick-cta', pickVisible, pickVisible ? 'Pick this Board CTA visible in preview' : 'Preview/pick CTA not found');
        } else {
          record('supervisee-pick-cta', false, 'No board card to click');
        }
      }

      // Permission denied with bogus id
      await page.goto(`${BASE}/board-picker?user_id=999999999`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(3000);
      const permErr = await page.locator('.text-danger').first().textContent().catch(() => '');
      record('permission-denied', /permission|error loading user/i.test(permErr), permErr.trim() || 'No error shown');
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
