// Browser check: ONE home button after a Basic "Try this Board" (2026-10-01).
//
//   try for YOURSELF (example)            -> toolbar: grey "Set as Home" only (even with a home board)
//                                             board menu: one "Set as Home"
//   try for a COMMUNICATOR (sarah_chen_slp) -> toolbar: blue "Set as Home Board for X" only
//                                             board menu: no home item
//   no try (same board opened directly)   -> toolbar: no home button (user has a home board)
//                                             board menu: one "Set as Home"
//
//   SLP clicks the blue button            -> the COMMUNICATOR's home board changes (to a board they
//                                             own) and the SLP's does not (read back from the API)
//
// The unit and rendering tests cover the decision; this is for what they cannot see: that the real
// board page renders the right buttons and that the save lands on the right account.
// DATA: the SLP step changes the communicator's home board on the LOCAL dev database, and may
// create their copy of the board. The original home board is read first and restored in a
// `finally` through the same save the app uses (user.save); the copy, if one is made, stays.
// Both accounts must already be in Basic; the probe refuses rather than switching their view.
// Localhost only. Usage: node scripts/basic-try-home-buttons-qa.mjs [--headed] [--shots <dir>]

import { cliArgs, launch, login } from './qa-helpers.mjs';

const { BASE, HEADED, arg } = cliArgs(process.argv);
const SHOTS = arg('--shots', null);
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`REFUSING: --base must be localhost, got ${BASE}`); process.exit(2);
}
const ACCOUNTS = [
  { user: 'example', pass: 'password', forOther: false },
  { user: 'sarah_chen_slp', pass: 'demo2025!', forOther: true }
];

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Visible home controls on the page right now: the toolbar's grey "Set as Home", the blue try
// button, and the board menu's home items.
const homeControls = (page) => page.evaluate(() => {
  const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const text = (el) => (el.querySelector('.wide') || el).textContent.replace(/\s+/g, ' ').trim();
  const grey = [...document.querySelectorAll('a.btn.btn-default')].filter((a) => shown(a) && text(a) === 'Set as Home');
  const blue = [...document.querySelectorAll('.ll-basic-try-home')].filter(shown);
  const menu = [...document.querySelectorAll('.la-board-mobile-menu__item')].filter((b) => shown(b) && /Set as Home/.test(b.textContent));
  return { grey: grey.length, blue: blue.length, blueText: blue[0] ? text(blue[0]) : null, menu: menu.length };
});

// Home board keys straight from the API, not the client cache.
const homeBoards = (page, communicatorId) => page.evaluate(async (cid) => {
  const read = async (id) => { const r = await window.persistence.ajax(`/api/v1/users/${id}`, { type: 'GET' }); return (r.user.preferences || {}).home_board || null; };
  return { communicator: await read(cid), slp: await read('self') };
}, communicatorId);

const restoreHome = (page, communicatorId, original) => page.evaluate(async (cid, orig) => {
  const user = await window.LingoLinq.store.findRecord('user', cid, { reload: true });
  user.set('preferences.home_board', orig);
  await user.save();
  const r = await window.persistence.ajax(`/api/v1/users/${cid}`, { type: 'GET' });
  return ((r.user.preferences || {}).home_board || {}).key || null;
}, communicatorId, original);

const openBoardMenu = async (page) => {
  const opened = await page.evaluate(() => {
    const shown = (el) => !!el && el.getClientRects().length > 0;
    const t = [...document.querySelectorAll('.ll-board-more-btn, .la-board-hamburger')].find(shown);
    if (!t) { return false; }
    t.click(); return true;
  });
  await wait(800);
  return opened;
};
// Close by the menu's own trigger. Never click the page to dismiss it: on a board page that lands
// on a board button, which navigates (and in an AAC app may speak).
const closeBoardMenu = async (page) => { await openBoardMenu(page); await wait(300); };

async function runAccount(acct) {
  const tag = acct.user;
  const { browser, page } = await launch({ HEADED });
  let original = null;
  try {
    await login(page, { BASE, USER: acct.user, PASS: acct.pass });
    const who = await page.evaluate(() => {
      const as = window.appState;
      const u = as.get('currentUser');
      const sups = (u && u.get('supervisees')) || [];
      return { view: as.get('effective_view_user.preferences.board_view_style'),
               home: !!(u && u.get('preferences.home_board.key')),
               sup: sups[0] ? { id: sups[0].id, user_name: sups[0].user_name } : null };
    });
    if (who.view !== 'classic') { throw new Error(`${tag} is in "${who.view}", not Basic; switch it to Basic and re-run`); }
    record(`${tag}: signed in, in Basic`, true, `has a home board: ${who.home}`);
    if (acct.forOther && !who.sup) { throw new Error(`${tag} has no communicator to try a board for`); }

    // Picker -> preview -> Try this Board.
    const pickerUrl = `${BASE}/board-picker${acct.forOther ? `?user_id=${encodeURIComponent(who.sup.id)}` : ''}`;
    await page.goto(pickerUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(3000);
    const at = new URL(page.url());
    record(`${tag}: the board picker opened${acct.forOther ? ' for the communicator' : ''}`, /board-picker/.test(at.pathname), at.pathname + at.search);
    // The default category already lists boards. Click the card element itself (not by
    // coordinates, which can land on whatever re-rendered under them), skipping the home board:
    // on it every home control is hidden by design.
    const clicked = await page.evaluate(() => {
      const c = document.querySelector('.md-home-boards-picker__board:not(.board-picker__item--home)');
      const target = c && (c.querySelector('a, button, [role="button"], .board_icon, img') || c);
      if (!target) { return null; }
      target.click();
      return c.textContent.replace(/\s+/g, ' ').trim().slice(0, 40);
    });
    if (!clicked) { throw new Error(`${tag}: the picker shows no board other than the home board`); }
    await page.waitForFunction(() => [...document.querySelectorAll('.md-board-preview__action')].some((x) => /Try this Board/i.test(x.textContent)), { timeout: 15000 }).catch(() => {});
    const tried = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.md-board-preview__action')].find((x) => /Try this Board/i.test(x.textContent));
      if (!b) { return false; }
      b.click(); return true;
    });
    if (!tried) {
      const seen = await page.evaluate(() => [...document.querySelectorAll('.md-board-preview__action, .md-board-preview__actions button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
      throw new Error(`${tag}: no "Try this Board" button in the preview (at ${new URL(page.url()).pathname + new URL(page.url()).search}; actions: ${JSON.stringify(seen)})`);
    }
    await wait(6000);
    const boardPath = new URL(page.url()).pathname;
    record(`${tag}: Try opened the board page`, !/board-picker/.test(boardPath), boardPath);

    const t = await homeControls(page);
    if (acct.forOther) {
      record(`${tag}: toolbar shows the blue button`, t.blue === 1, t.blueText);
      record(`${tag}: it names the communicator`, !!t.blueText && t.blueText.includes(who.sup.user_name), t.blueText);
      record(`${tag}: no grey "Set as Home" beside it`, t.grey === 0, `grey=${t.grey}`);
    } else {
      record(`${tag}: toolbar shows the grey "Set as Home"`, t.grey === 1, `grey=${t.grey}`);
      record(`${tag}: no blue button for your own try`, t.blue === 0, `blue=${t.blue}`);
    }
    if (SHOTS) { await page.screenshot({ path: `${SHOTS}/${tag}-try-toolbar.png` }); }

    record(`${tag}: board menu opens`, await openBoardMenu(page));
    const m = await homeControls(page);
    if (acct.forOther) {
      record(`${tag}: board menu has no home item during a try for someone else`, m.menu === 0, `menu=${m.menu}`);
    } else {
      record(`${tag}: board menu has exactly one home item`, m.menu === 1, `menu=${m.menu}`);
    }
    if (SHOTS) { await page.screenshot({ path: `${SHOTS}/${tag}-try-menu.png` }); }
    await closeBoardMenu(page);

    // The SLP sets the board as the COMMUNICATOR's home board: the save must land on them.
    if (acct.forOther) {
      const before = await homeBoards(page, who.sup.id);
      original = { id: who.sup.id, home: before.communicator };
      const clickedBlue = await page.evaluate(() => { const b = document.querySelector('.ll-basic-try-home'); if (!b) { return false; } b.click(); return true; });
      record(`${tag}: clicked "Set as Home Board for ${who.sup.user_name}"`, clickedBlue);
      const consoleErrors = [];
      page.on('console', (m) => { if (m.type() === 'error') { consoleErrors.push(m.text().slice(0, 200)); } });
      page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e && e.message).slice(0, 200)));
      const t0 = Date.now();
      const moved = await page.waitForFunction((p) => window.location.pathname !== p, { timeout: 45000 }, boardPath).then(() => true, () => false);
      const state = await page.evaluate(() => ({ busy: !!(document.querySelector('.ll-basic-try-home') || {}).disabled, blue: !!document.querySelector('.ll-basic-try-home'), flash: [...document.querySelectorAll('.alert, .flash, [class*="flash"], [class*="toast"]')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 3) }));
      console.log(`    (after click: moved=${moved} in ${Date.now() - t0}ms, button busy=${state.busy}, still shown=${state.blue}, notices=${JSON.stringify(state.flash)}, console errors=${JSON.stringify(consoleErrors.slice(0, 5))})`);
      await wait(3000);
      const after = await homeBoards(page, who.sup.id);
      const newKey = after.communicator && after.communicator.key;
      record(`${tag}: the communicator's home board changed`, !!newKey && newKey !== (before.communicator && before.communicator.key), `${before.communicator && before.communicator.key} -> ${newKey}`);
      record(`${tag}: it is a board the communicator owns`, !!newKey && newKey.indexOf(`${who.sup.user_name}/`) === 0, newKey);
      record(`${tag}: the SLP's own home board did NOT change`, JSON.stringify(after.slp) === JSON.stringify(before.slp), after.slp && after.slp.key);
      const landed = new URL(page.url()).pathname;
      record(`${tag}: it then opens the communicator's new home board`, !!newKey && landed.indexOf(newKey.split('/')[1]) !== -1 && landed.indexOf(who.sup.user_name) !== -1, landed);
      if (SHOTS) { await page.screenshot({ path: `${SHOTS}/${tag}-after-set.png` }); }
    }

    // Control: the same board opened directly (a reload drops the in-memory try marker).
    if (!acct.forOther) {
      await page.goto(`${BASE}${boardPath}`, { waitUntil: 'networkidle2', timeout: 60000 });
      await wait(5000);
      const c = await homeControls(page);
      record(`${tag}: no try -> no toolbar home button (has a home board)`, c.grey === 0 && c.blue === 0, `grey=${c.grey} blue=${c.blue}`);
      await openBoardMenu(page);
      const cm = await homeControls(page);
      record(`${tag}: no try -> board menu has exactly one home item`, cm.menu === 1, `menu=${cm.menu}`);
      if (SHOTS) { await page.screenshot({ path: `${SHOTS}/${tag}-no-try-menu.png` }); }
    }
  } catch (e) {
    console.error(`  harness error (${tag}):`, e && e.message);
    results.push({ name: `harness ${tag}`, pass: false });
  } finally {
    if (original && original.home) {
      const restored = await restoreHome(page, original.id, original.home).catch((e) => `ERROR ${e && e.message}`);
      record(`${tag}: communicator's original home board restored`, restored === original.home.key, `${restored}`);
    }
    await browser.close();
  }
}

for (const acct of ACCOUNTS) {
  console.log(`\n${acct.user}`);
  await runAccount(acct);
}
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} passed / ${failed} failed`);
if (!results.length) { console.log('NO CHECKS RAN, treating as a failure.'); process.exit(1); }
process.exit(failed ? 1 : 0);
