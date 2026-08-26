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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const READ = () => {
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
