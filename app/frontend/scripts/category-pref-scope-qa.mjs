/**
 * Does a per-board category override keyed by BOARD KEY actually apply — and only to that
 * board?
 *
 * `board_category_grouping.boards` used to be keyed by global_id, which is unique to ONE
 * database, so a curated per-board arrangement could not be shipped with the board it
 * belongs to. It is now keyed by `username/board-slug`, with the id still read as a legacy
 * fallback.
 *
 * READ-ONLY: unlike the other board probes this one never writes the preference, because the
 * preference IS what is under test. Seed it server-side first.
 *
 * Usage:
 *   node scripts/category-pref-scope-qa.mjs --user <u> --pass <p> --boards a,b
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const BOARDS = (OPTS.arg('--boards', '')).split(',').filter(Boolean);
/* ABORT rather than exiting 0 having done nothing. With no --boards the loop body never
   ran, so the script printed NOTHING and exited 0 — indistinguishable from a clean pass to
   anyone who wired it into a sweep. */
if (!BOARDS.length) {
  console.error('category-pref-scope-qa: --boards is required.');
  console.error('  Usage: node scripts/category-pref-scope-qa.mjs --boards user/slug-a,user/slug-b');
  console.error('  It compares the per-board preference REF against each board key, to prove the');
  console.error('  override is keyed by `username/board-slug` and not by global_id.');
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const READ = () => {
  /* NOTE: the grid emits `data-id` and `data-filter` only — there is no `data-key`
     (board-detail-grid.hbs). Read the key from the ROUTE instead, which is where the board
     slug actually lives. */
  const grid = document.querySelector('.md-board-detail-grid');
  let pref = null;
  try {
    const u = window.appState.get('referenced_user') || window.appState.get('currentUser');
    const g = u.get('preferences.board_category_grouping') || {};
    pref = { top: g.enabled, refs: Object.keys(g.boards || {}) };
  } catch (e) { pref = { error: true }; }
  return {
    key: grid ? grid.getAttribute('data-key') : null,
    grouped: !!(grid && grid.className.match(/md-board-detail-grid--(compact|grouped)/)),
    groups: document.querySelectorAll('.md-board-detail-grid__group').length,
    pref
  };
};

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  try {
    await login(page, OPTS);
    for (const b of BOARDS) {
      await page.goto(`${OPTS.BASE}/${OPTS.USER}/board-detail/${b}`, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForSelector('.md-board-detail-grid', { timeout: 30000 });
      await sleep(3000);
      const s = await page.evaluate(READ);
      console.log(`${b.padEnd(26)} grouped=${s.grouped ? 'YES' : 'no '}  categoryPanels=${String(s.groups).padStart(3)}`);
      console.log(`${''.padEnd(26)} pref: top-level enabled=${JSON.stringify(s.pref.top)}  boards refs=${JSON.stringify(s.pref.refs)}`);
    }
  } finally { await browser.close(); }
})();
