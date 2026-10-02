// Browser check: an SLP sets a home board FOR a communicator who has no copy of that board yet,
// and the app finishes the job: the copy is made, the communicator's home board is set, a success
// message shows and the page opens the new home board (2026-10-02, the "#11" fix in
// models/board.js reload_including_all_downstream).
//
// Before that fix the home board was saved, but a TypeError thrown after the copy job finished made
// the copy report failure: no navigation, an error modal, the button re-enabled. It only happened on
// a FIRST copy -- a reused copy skips that path -- so this picks a board the communicator does not
// own yet (their boards are read from the API, then picker cards are tried until one's slug is new).
//
// Flow: sarah_chen_slp (Basic) -> /board-picker?user_id=<communicator> -> a card -> Try this Board
// -> the Basic board page's "Set as Home Board for <communicator>" -> wait for the copy job.
//
// DATA (local dev DB): this makes one more copied board set in the communicator's account. Their
// original home board is read first and restored in a finally (restore verified and reported).
// Localhost only. Usage: node scripts/communicator-first-copy-qa.mjs [--headed]

import { cliArgs, launch, login } from './qa-helpers.mjs';

const { BASE, HEADED, arg } = cliArgs(process.argv);
const SLP = arg('--slp', 'sarah_chen_slp');
const SLP_PASS = arg('--slp-pass', 'demo2025!');
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`REFUSING: --base must be localhost, got ${BASE}`); process.exit(2);
}
const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const homeOf = (page, id) => page.evaluate(async (uid) => {
  const r = await window.persistence.ajax(`/api/v1/users/${uid}`, { type: 'GET' });
  return (r.user.preferences || {}).home_board || null;
}, id);

const boardKeysOf = (page, id) => page.evaluate(async (uid) => {
  const keys = [];
  let offset = 0;
  for (let i = 0; i < 20; i++) {
    const r = await window.persistence.ajax(`/api/v1/boards?user_id=${uid}&per_page=50&offset=${offset}`, { type: 'GET' });
    (r.board || []).forEach((b) => keys.push(b.key));
    if (!r.meta || !r.meta.more) { break; }
    offset = r.meta.next_offset;
  }
  return keys;
}, id);

const restoreHome = (page, id, original) => page.evaluate(async (uid, orig) => {
  const user = await window.LingoLinq.store.findRecord('user', uid, { reload: true });
  user.set('preferences.home_board', orig);
  await user.save();
  const r = await window.persistence.ajax(`/api/v1/users/${uid}`, { type: 'GET' });
  return ((r.user.preferences || {}).home_board || {}).key || null;
}, id, original);

const { browser, page } = await launch({ HEADED });
let comm = null;
let original = null;
try {
  await login(page, { BASE, USER: SLP, PASS: SLP_PASS });
  await page.setViewport({ width: 1280, height: 900 });
  const who = await page.evaluate(() => {
    const u = window.appState.get('currentUser');
    const sups = (u && u.get('supervisees')) || [];
    return { view: window.appState.get('effective_view_user.preferences.board_view_style'), sup: sups[0] ? { id: sups[0].id, user_name: sups[0].user_name } : null };
  });
  if (who.view !== 'classic') { throw new Error(`${SLP} is in "${who.view}", not Basic; switch to Basic and re-run`); }
  if (!who.sup) { throw new Error(`${SLP} supervises no communicator`); }
  comm = who.sup;
  original = await homeOf(page, comm.id);
  const owned = new Set((await boardKeysOf(page, comm.id)).map((k) => k.split('/')[1]));
  console.log(`\n${SLP} -> ${comm.user_name}: home ${original && original.key}; ${owned.size} boards owned`);

  // Try picker cards until one opens a board the communicator does not own a copy of.
  let slug = null;
  for (let i = 0; i < 15 && !slug; i++) {
    await page.goto(`${BASE}/board-picker?user_id=${encodeURIComponent(comm.id)}`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('.md-home-boards-picker__board', { timeout: 20000 });
    await wait(1500);
    const clicked = await page.evaluate((idx) => {
      const cards = [...document.querySelectorAll('.md-home-boards-picker__board:not(.board-picker__item--home)')];
      const c = cards[idx];
      if (!c) { return false; }
      (c.querySelector('a, button, [role="button"], .board_icon, img') || c).click();
      return true;
    }, i);
    if (!clicked) { break; }
    await page.waitForFunction(() => [...document.querySelectorAll('.md-board-preview__action')].some((x) => /Try this Board/i.test(x.textContent)), { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => { const b = [...document.querySelectorAll('.md-board-preview__action')].find((x) => /Try this Board/i.test(x.textContent)); b && b.click(); });
    await wait(5000);
    const m = new URL(page.url()).pathname.match(/^\/[^/]+\/board\/([^/?]+)/);
    if (m && !owned.has(m[1])) { slug = m[1]; }
  }
  record('found a board the communicator has no copy of', !!slug, slug ? `${new URL(page.url()).pathname}` : 'none in the first 15 cards');
  if (!slug) { throw new Error('no fresh board to copy'); }

  // Record every success and error the app reports.
  await page.evaluate(() => {
    window.__qa = { success: [], error: [] };
    const m = window.modal;
    const s = m.success.bind(m); const e = m.error.bind(m);
    m.success = function(t) { window.__qa.success.push(String(t)); return s.apply(m, arguments); };
    m.error = function(t) { window.__qa.error.push(String(t)); return e.apply(m, arguments); };
  });
  const blue = await page.evaluate(() => { const b = document.querySelector('.ll-basic-try-home'); return b ? b.textContent.replace(/\s+/g, ' ').trim() : null; });
  record('the blue button names the communicator', !!blue && blue.includes(comm.user_name), blue);
  const tried = new URL(page.url()).pathname;
  const t0 = Date.now();
  await page.evaluate(() => document.querySelector('.ll-basic-try-home').click());

  // The copy job runs on the server; allow up to 4 minutes.
  const moved = await page.waitForFunction((p) => window.location.pathname !== p, { timeout: 240000, polling: 1000 }, tried).then(() => true, () => false);
  const secs = Math.round((Date.now() - t0) / 1000);
  await wait(2500);
  const qa = await page.evaluate(() => window.__qa);
  const after = await homeOf(page, comm.id);
  const landed = new URL(page.url()).pathname;
  record('the page opened the communicator\'s new home board', moved && landed.includes(comm.user_name) && landed.includes(slug), `${landed} after ${secs}s`);
  record('no error was reported', qa.error.length === 0, qa.error.join(' | ') || 'none');
  record('the success message was shown', qa.success.length > 0, qa.success.join(' | '));
  record('the communicator\'s home board is their new copy', !!after && after.key === `${comm.user_name}/${slug}`, after && after.key);
} catch (e) {
  console.error('  harness error:', e && e.message);
  results.push({ name: 'harness', pass: false });
} finally {
  if (comm && original) {
    const restored = await restoreHome(page, comm.id, original).catch((e) => `ERROR ${e && e.message}`);
    record(`${comm.user_name}'s original home board restored`, restored === original.key, restored);
  }
  await browser.close();
}
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} passed / ${failed} failed`);
if (!results.length) { console.log('NO CHECKS RAN, treating as a failure.'); process.exit(1); }
process.exit(failed ? 1 : 0);
