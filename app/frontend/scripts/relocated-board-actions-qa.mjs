#!/usr/bin/env node
/**
 * Board Ideas · Button Stash · Set as Home Board — relocated 2026-08-24 from the
 * board-detail edit panel into the Board Actions modal, just above View Style.
 *
 * Unit tests can prove the handlers EXIST. They cannot prove the rows are
 * REACHABLE, and reachability is the entire failure mode here: `suggestions` and
 * `open_button_stash` had no other render site in the app, so a bad move leaves
 * Button Stash unreachable from everywhere while every test stays green. That is
 * exactly how the board-detail redesign lost nine actions in the first place.
 *
 * So this drives real clicks, through both entry points to the modal:
 *   edit panel  → "Other Actions"  (the path these rows have always had)
 *   view mode   → Options → Board Actions → "Other Actions"  (the path they gain)
 *
 * Run from app/frontend, against a live dev stack:
 *   node scripts/relocated-board-actions-qa.mjs [--headed] [--board lingolinq/crisis-vocabulary]
 *
 * Read-only: every row is opened and dismissed with Escape. Nothing is saved.
 */
import { chromium } from 'playwright';

const arg = (n, d) => process.argv.find((a, i) => process.argv[i - 1] === n) || d;
const BASE = arg('--base', 'http://localhost:8184');
const USER = arg('--user', 'example');
const PASS = arg('--pass', 'password');
const BOARD = arg('--board', 'lingolinq/crisis-vocabulary');
const HEADED = process.argv.includes('--headed');

const ROWS = [
  { action: 'suggestions', label: 'Board Ideas' },
  { action: 'open_button_stash', label: 'Button Stash' },
  { action: 'set_as_home', label: 'Set as Home Board' },
];

const results = [];
function record(id, pass, detail) {
  results.push({ id, pass, detail });
  console.log(`  [${pass === true ? 'PASS' : pass === false ? 'FAIL' : 'INFO'}] ${id}: ${detail}`);
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

async function dismissPortrait(page) {
  const dis = page.locator('button[data-bd-action="dismiss_portrait_overlay"]').first();
  if (await dis.isVisible({ timeout: 3000 }).catch(() => false)) { await dis.click(); await page.waitForTimeout(1200); }
}

/* Open the Board Actions modal by whichever route, and confirm we are actually
   looking at IT — a modal that failed to render is otherwise indistinguishable
   from one with the rows missing. */
async function openModal(page, via) {
  const [owner, ...rest] = BOARD.split('/');
  const key = rest.join('/');
  const url = via === 'edit'
    ? `${BASE}/${owner}/board-detail/${key}/edit`
    : `${BASE}/${owner}/board-detail/${key}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await dismissPortrait(page);

  if (via === 'view') {
    const opts = page.locator('button[data-bd-action="toggle_options_menu"]').first();
    if (!(await opts.isVisible({ timeout: 5000 }).catch(() => false))) { return 'no options menu'; }
    await opts.click();
    await page.waitForTimeout(1200);
    const sub = page.locator('.md-board-detail-actions-menu button[data-bd-action="toggle_board_submenu"]').first();
    if (!(await sub.isVisible({ timeout: 4000 }).catch(() => false))) { return 'no Board Actions submenu'; }
    await sub.click();
    await page.waitForTimeout(900);
  } else {
    /* Editing this board has to be possible at all before the panel exists —
       report that as a SKIP, not a failure, or the harness blames the code for a
       fixture problem. */
    const editing = await page.evaluate(() =>
      location.pathname.endsWith('/edit') && !!document.querySelector('.md-board-edit-panel'));
    if (!editing) { return 'SKIP: could not enter edit mode on this board (no edit rights?) — pass --board with one you own'; }

    /* The panel's "Board Actions" group is a COLLAPSIBLE accordion
       (`board_actions_collapsed`); "Other Actions" lives inside it, so it is not
       in the DOM until the group is expanded. Missing this made the harness
       report "no Other Actions entry point" against perfectly good markup. */
    const collapsed = await page.evaluate(() => {
      const t = document.querySelector('button[data-bd-action="toggle_board_actions"]');
      return t ? t.getAttribute('aria-expanded') !== 'true' : null;
    });
    if (collapsed === null) { return 'no Board Actions group in the edit panel'; }
    if (collapsed) {
      await page.locator('button[data-bd-action="toggle_board_actions"]').first().click();
      await page.waitForTimeout(1000);
    }
  }

  const other = page.locator('button[data-bd-action="other_board_actions"]').first();
  if (!(await other.isVisible({ timeout: 5000 }).catch(() => false))) { return 'no "Other Actions" entry point'; }
  await other.click();
  await page.waitForTimeout(2000);

  const isModal = await page.evaluate(() =>
    !!Array.from(document.querySelectorAll('h3')).find((h) => /board actions/i.test(h.innerText || '')));
  return isModal ? null : 'Other Actions did not open the Board Actions modal';
}

async function rowState(page, label) {
  return page.evaluate((lbl) => {
    const item = Array.from(document.querySelectorAll('.la-board-actions-item')).find((el) =>
      (el.querySelector('.la-board-actions-item__label')?.innerText || '').trim() === lbl);
    if (!item) { return { missing: true }; }
    const r = item.getBoundingClientRect();
    return {
      disabled: !!item.disabled,
      visible: r.width > 0 && r.height > 0,
      y: Math.round(r.y),
      desc: (item.querySelector('.la-board-actions-item__desc')?.innerText || '').trim().slice(0, 60)
    };
  }, label);
}

(async () => {
  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log(`  [js error] ${String(e).slice(0, 140)}`));

  try {
    await login(page);

    for (const via of ['edit', 'view']) {
      console.log(`\n=== entry point: ${via === 'edit' ? 'edit panel' : 'view-mode options menu'} ===`);
      const failed = await openModal(page, via);
      if (failed) { record(`${via}-modal-opens`, failed.startsWith('SKIP:') ? null : false, failed); continue; }
      record(`${via}-modal-opens`, true, 'Board Actions modal is on screen');

      /* "Set as Home Board" is HIDDEN when the board on screen is already the
         subject's home board (board-actions.js#can_set_as_home). That is the
         intended behaviour, not a missing row — so recognise it rather than
         reporting a failure, which is what the first run did against
         example/communikate-home. */
      for (const row of ROWS) {
        const st = await rowState(page, row.label);
        if (st.missing && row.action === 'set_as_home') {
          record(`${via}-${row.action}-present`, null,
            `"Set as Home Board" absent — expected when this board IS already the home board (see can_set_as_home). Re-run with --board pointing at a NON-home board to exercise it.`);
          continue;
        }
        if (st.missing) { record(`${via}-${row.action}-present`, false, `"${row.label}" row is not in the modal`); continue; }
        record(`${via}-${row.action}-present`, st.visible,
          `"${row.label}" at y=${st.y}${st.disabled ? ' (disabled)' : ''} — "${st.desc}"`);
      }

      // Ordering: the three must sit AFTER Record Messages and BEFORE View Style.
      const order = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.la-board-actions-item .la-board-actions-item__label'))
          .map((el) => (el.innerText || '').trim()));
      const idx = (l) => order.indexOf(l);
      const placed = idx('Board Ideas') > idx('Record Messages') &&
                     idx('View Style') > idx('Button Stash') &&
                     idx('View Style') > idx('Board Ideas');
      record(`${via}-placement`, placed, `order: ${JSON.stringify(order)}`);
    }

    /* Wiring. A ctrlAction naming a handler that does not exist passes both
       linters and does nothing on click, so assert that a NEW modal actually
       appears — not merely that the click did not throw. Re-open the parent modal
       between rows because opening a child replaces it. */
    const VIA_FOR_WIRING = results.some((r) => r.id === 'edit-modal-opens' && r.pass === true) ? 'edit' : 'view';
    console.log(`\n=== each row actually opens something (via ${VIA_FOR_WIRING}) ===`);
    for (const row of ROWS) {
      const failed = await openModal(page, VIA_FOR_WIRING);
      if (failed) { record(`wired-${row.action}`, null, `could not reach the modal: ${failed}`); continue; }

      const st = await rowState(page, row.label);
      if (st.missing && row.action === 'set_as_home') {
        record(`wired-${row.action}`, null, 'row hidden because this board is already the home board; re-run with --board on a non-home board');
        continue;
      }
      if (st.missing) { record(`wired-${row.action}`, false, 'row absent'); continue; }
      if (st.disabled) { record(`wired-${row.action}`, null, 'row disabled here (no edit permission on this board); skipped'); continue; }

      /* Compare the MODAL HEADING, not a slice of document.body.innerText. The
         first version did the latter and reported a false failure on every row:
         the leading text is the nav sidebar, which is byte-identical before and
         after, because the modal renders elsewhere in the DOM. The heading is the
         thing that actually distinguishes "a new modal opened" from "the click
         did nothing". */
      const headingOf = () => page.evaluate(() =>
        (document.querySelector('.modal-dialog h3, .modal-content h3, .la-modal h3')?.innerText || '').trim().slice(0, 60));
      const before = await headingOf();
      await page.locator('.la-board-actions-item').filter({ hasText: row.label }).first().click();
      await page.waitForTimeout(2500);
      const after = await headingOf();
      const changed = !!after && after !== before;
      record(`wired-${row.action}`, changed,
        changed ? `"${before}" -> "${after}"` : `heading still "${before}" — silent dead action`);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(800);
    }
  } catch (e) {
    record('harness', false, `threw: ${e.message.slice(0, 150)}`);
  } finally {
    console.log('\n===== SUMMARY =====');
    const fail = results.filter((r) => r.pass === false);
    const info = results.filter((r) => r.pass === null);
    results.forEach((r) => console.log(`${r.pass === true ? 'PASS' : r.pass === false ? 'FAIL' : 'SKIP'}  ${r.id}`));
    console.log(`\n${results.filter((r) => r.pass === true).length} passed, ${fail.length} failed, ${info.length} skipped`);
    if (fail.length) { console.log('\nFAILURES:'); fail.forEach((f) => console.log(`  ${f.id}: ${f.detail}`)); }
    if (info.length) {
      console.log('\nSKIPPED — not passes; a skipped check verified nothing:');
      info.forEach((f) => console.log(`  ${f.id}: ${f.detail}`));
    }
    await browser.close();
    process.exit(fail.length ? 1 : 0);
  }
})();
