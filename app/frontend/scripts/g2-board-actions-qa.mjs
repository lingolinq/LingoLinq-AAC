#!/usr/bin/env node
/**
 * RETIRED 2026-08-26 — READ THIS BEFORE RUNNING.
 *
 * The "Board Actions" submenu this probe verifies was REMOVED from the
 * speak-mode options menu. Every check below will now fail, and that is the
 * correct outcome, not a regression: board_details, toggle_favorite,
 * add_to_sidebar and other_board_actions are edit-panel actions and are reached
 * from there. `a2c-click-tests-qa.mjs` check D guards the removal.
 *
 * Kept rather than deleted so the reachability walk it encodes is not lost if
 * these four ever need a view-mode route again. It REFUSES TO RUN by default and
 * exits 0: a probe that always fails is a landmine in a QA sweep — the next person
 * either wastes a session diagnosing it or, worse, "fixes" the removal to make it
 * green. Pass --run-retired to execute the walk anyway, which is only meaningful if
 * the submenu has actually been restored.
 *
 * ---- original header ----
 *
 * G2 — the four board actions that had NO view-mode route at all:
 * board_details, toggle_favorite, add_to_sidebar, other_board_actions.
 *
 * They lived in a "Board Actions" submenu in the view-mode options menu,
 * wired to the previously-orphaned `board_submenu_open` / `toggle_board_submenu`.
 * Reachability is the whole finding, so this walks the clicks a user makes
 * rather than querying the DOM for nodes that may be rendered-but-hidden.
 *
 * Run from app/frontend:  node scripts/g2-board-actions-qa.mjs [--headed]
 */
import { chromium } from 'playwright';

const arg = (n, d) => process.argv.find((a, i) => process.argv[i - 1] === n) || d;
const BASE = arg('--base', 'http://localhost:8184');
const USER = arg('--user', 'example');
const PASS = arg('--pass', 'password');
const BOARD = arg('--board', 'lingolinq/keyboard');
const HEADED = process.argv.includes('--headed');

const ACTIONS = ['board_details', 'toggle_favorite', 'add_to_sidebar', 'other_board_actions'];

const results = [];
function record(id, pass, detail) {
  results.push({ id, pass, detail });
  console.log(`[${pass === true ? 'PASS' : pass === false ? 'FAIL' : 'INFO'}] ${id}: ${detail}`);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('#identification', USER);
  await page.fill('#password', PASS);
  await page.locator('button.login-btn[type="submit"], form button[type="submit"]').first().click();
  await page.waitForTimeout(2500);
  const trust = page.locator('button.login-btn--device').first();
  if (await trust.isVisible({ timeout: 2500 }).catch(() => false)) { await trust.click(); await page.waitForTimeout(1500); }
  await page.waitForTimeout(1500);
}

// board-detail hides its header behind a "Larger screen recommended" overlay;
// without clearing it, header-adjacent measurements are meaningless.
async function openBoardAndMenu(page) {
  const [owner, ...rest] = BOARD.split('/');
  await page.goto(`${BASE}/${owner}/board-detail/${rest.join('/')}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);
  const dis = page.locator('button[data-bd-action="dismiss_portrait_overlay"]').first();
  if (await dis.isVisible({ timeout: 3000 }).catch(() => false)) { await dis.click(); await page.waitForTimeout(1500); }
  await page.locator('button[data-bd-action="toggle_options_menu"]').first().click();
  await page.waitForTimeout(1400);
  const sub = page.locator('.md-board-detail-actions-menu button[data-bd-action="toggle_board_submenu"]').first();
  if (await sub.isVisible({ timeout: 4000 }).catch(() => false)) {
    await sub.click();
    await page.waitForTimeout(1100);
    return true;
  }
  return false;
}

const RUN_RETIRED = process.argv.includes('--run-retired');

(async () => {
  if (!RUN_RETIRED) {
    console.log('g2-board-actions-qa: RETIRED 2026-08-26 — not run.');
    console.log('');
    console.log('  The "Board Actions" submenu this probe walks was removed from the');
    console.log('  speak-mode options menu. board_details, toggle_favorite, add_to_sidebar');
    console.log('  and other_board_actions are edit-panel actions and are reached there.');
    console.log('');
    console.log('  The REMOVAL is guarded by a2c-click-tests-qa.mjs check D, which fails if');
    console.log('  the submenu comes back:  node scripts/a2c-click-tests-qa.mjs --only D');
    console.log('');
    console.log('  To run this walk anyway (only meaningful if the submenu was restored):');
    console.log('    node scripts/g2-board-actions-qa.mjs --run-retired');
    /* Exit 0. Skipping is not a failure, and a retired probe must not colour a sweep red. */
    process.exit(0);
  }
  console.log('g2-board-actions-qa: running a RETIRED probe (--run-retired).');
  console.log('Expect every check to FAIL unless the Board Actions submenu has been restored.\n');
  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log(`  [js error] ${String(e).slice(0, 140)}`));

  try {
    await login(page);
    const opened = await openBoardAndMenu(page);
    record('G2-submenu-present', opened, opened ? '"Board Actions" submenu opens from the view-mode options menu' : 'toggle_board_submenu not offered in the options menu');
    if (!opened) throw new Error('submenu unreachable');

    // We must be in VIEW mode, or this proves nothing.
    const viewMode = await page.evaluate(() => !!document.querySelector('button[data-bd-action="enter_edit_mode"]') && !location.pathname.includes('/edit'));
    record('G2-view-mode', viewMode, `enter_edit_mode offered and not on /edit — so these are not coming from the edit panel`);

    for (const a of ACTIONS) {
      const el = page.locator(`.md-board-detail-actions-menu button[data-bd-action="${a}"]`).first();
      const vis = await el.isVisible().catch(() => false);
      const label = vis ? (await el.innerText()).trim().replace(/\s+/g, ' ') : null;
      record(`G2-${a}-reachable`, vis, vis ? `visible, label "${label}"` : 'not reachable in the view-mode options menu');
    }

    /* Wiring: a ctrlAction naming a non-existent action passes both linters and
       silently does nothing. Reload between each so menu state is deterministic. */
    for (const a of ACTIONS) {
      await openBoardAndMenu(page);
      const el = page.locator(`.md-board-detail-actions-menu button[data-bd-action="${a}"]`).first();
      if (!(await el.isVisible().catch(() => false))) { record(`G2-${a}-wired`, null, 'not reachable; skipped'); continue; }

      if (a === 'toggle_favorite') {
        // No modal — assert the model actually flips instead.
        const before = await page.evaluate(() => !!document.querySelector('.md-board-detail-actions-menu button[data-bd-action="toggle_favorite"]')?.innerText.match(/Remove/i));
        await el.click();
        await page.waitForTimeout(2200);
        const after = await page.evaluate(() => {
          const b = document.querySelector('.md-board-detail-actions-menu button[data-bd-action="toggle_favorite"]');
          return b ? !!b.innerText.match(/Remove/i) : null;
        });
        record('G2-toggle_favorite-wired', after !== null && after !== before,
          after === null ? 'menu closed after click, could not read the label back' : `favourite label flipped ${before} -> ${after}`);
        continue;
      }

      const before = await page.evaluate(() => document.querySelectorAll('.modal, .modal-dialog, .modal-backdrop').length);
      await el.click();
      await page.waitForTimeout(2600);
      const after = await page.evaluate(() => ({
        n: document.querySelectorAll('.modal, .modal-dialog, .modal-backdrop').length,
        text: (document.querySelector('.modal-dialog, .modal')?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 120),
      }));
      record(`G2-${a}-wired`, after.n > before,
        after.n > before ? `opened: "${after.text}"` : `click changed nothing (modals ${before} -> ${after.n}) — silent dead action`);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(900);
    }
  } catch (e) {
    record('harness', false, `threw: ${e.message.slice(0, 150)}`);
  } finally {
    console.log('\n===== SUMMARY =====');
    results.forEach((r) => console.log(`${r.pass === true ? 'PASS' : r.pass === false ? 'FAIL' : 'INFO'}  ${r.id}`));
    const f = results.filter((r) => r.pass === false).length;
    console.log(`\n${results.filter((r) => r.pass === true).length} passed, ${f} failed`);
    await browser.close();
    process.exit(f ? 1 : 0);
  }
})();
