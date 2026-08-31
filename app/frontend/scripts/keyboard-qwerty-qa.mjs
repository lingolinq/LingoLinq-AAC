/**
 * A keyboard board must render in QWERTY, never regrouped.
 *
 * WHY THIS EXISTS: category grouping sorts buttons into part-of-speech panels. The real
 * vocal-flair-84-keyboard carries `numeral`, `verb` and `conjunction` buttons across 66
 * keys in three colours, so grouping scatters its rows and QWERTY is gone — the layout
 * is SPATIAL (a speller navigates by position, like touch-typing), not vocabulary.
 * board-detail-grid.js#groupingEnabled bails on `isKeyboardBoard` before it even
 * consults forceGrouping, so neither the board nor the Categorize preview can regroup it.
 *
 * Asserts the three letter rows land intact and unwrapped:
 *   q..p (10)   a..l (9)   z..m (7)
 * Rows are derived from RENDERED geometry (offsetTop), not from the stored order, so a
 * row that wraps because the grid is too narrow fails here — which is the other half of
 * "the keyboard fits".
 *
 * Usage (from app/frontend, Node 22):
 *   node scripts/keyboard-qwerty-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const BOARD = OPTS.arg('--board', 'vocal-flair-84-keyboard');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const pass = (n, d) => { results.push(true); console.log(`  PASS  ${n}\n        ${d}`); };
const fail = (n, d) => { results.push(false); console.log(`  FAIL  ${n}\n        ${d}`); };

const ROWS = [
  { name: 'row 1  q..p', expect: ['q','w','e','r','t','y','u','i','o','p'] },
  { name: 'row 2  a..l', expect: ['a','s','d','f','g','h','j','k','l'] },
  { name: 'row 3  z..m', expect: ['z','x','c','v','b','n','m'] }
];

/* Group rendered cells into visual rows by offsetTop, then keep only the single
   letters — the real rows also carry shift/space, which are not part of the run. */
const READ = () => {
  const grid = document.querySelector('.md-board-detail-main .md-board-detail-grid');
  if (!grid) { return null; }
  const cells = [...grid.querySelectorAll('.md-board-detail-grid__cell')];
  const byTop = new Map();
  cells.forEach((c) => {
    /* Read the CARD's aria-label, not `__label`. With the text_symbol_fallback flag on
       (and outside edit mode) a single-letter button renders its letter as a
       `__text-symbol` and the `__label` span is not emitted at all — so a label-only
       read sees every letter as blank and reports the rows as split when they are fine.
       aria-label is `{{or btn.label btn.vocalization}}`, present either way. */
    const card = c.querySelector('.md-board-detail-symbol-card');
    const label = (card && card.getAttribute('aria-label')) ||
                  (c.querySelector('.md-board-detail-symbol-card__text-symbol') || {}).textContent ||
                  (c.querySelector('.md-board-detail-symbol-card__label') || {}).textContent || '';
    const top = Math.round(c.getBoundingClientRect().top);
    if (!byTop.has(top)) { byTop.set(top, []); }
    byTop.get(top).push(label.trim());
  });
  return {
    /* --compact is the live grouping marker. Reading the dead --grouped made the
       headline assertion ('the keyboard is NOT regrouped') pass on ANY board, grouped
       or not — it could not fail even if isKeyboardBoard regressed. */
    grouped: grid.classList.contains('md-board-detail-grid--compact'),
    rows: [...byTop.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v)
  };
};

const run = async () => {
  const { browser, page } = await launch(OPTS);
  try {
    await login(page, OPTS);
    /* Grouping ON for the whole run — the point is that it must not APPLY here. */
    await page.evaluate(async () => {
      const u = window.appState.get('referenced_user');
      u.set('preferences.board_category_grouping.enabled', true);
      await u.save();
    });
    await page.goto(`${OPTS.BASE}/${OPTS.USER}/board-detail/${BOARD}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.md-board-detail-grid__cell', { timeout: 45000 });
    await sleep(6000);

    const state = await page.evaluate(READ);
    if (!state) { fail('precondition — keyboard board rendered', 'no grid'); throw new Error('no grid'); }

    if (!state.grouped) {
      pass('the keyboard is NOT regrouped even with grouping ON',
        'grid does not carry --grouped, so the authored row structure survives');
    } else {
      fail('the keyboard is NOT regrouped even with grouping ON',
        'grid carries --grouped — QWERTY has been sorted into category panels');
    }

    ROWS.forEach((spec) => {
      const letters = spec.expect;
      const hit = state.rows.find((r) => r.includes(letters[0]) && r.includes(letters[letters.length - 1]));
      if (!hit) {
        fail(spec.name, `no single rendered row holds both "${letters[0]}" and "${letters[letters.length - 1]}" — the run is split across rows`);
        return;
      }
      const got = hit.filter((l) => letters.includes(l));
      if (got.join('') === letters.join('')) {
        pass(spec.name, `${letters.length} keys, in order, on ONE row: ${got.join(' ')}`);
      } else {
        fail(spec.name, `expected ${letters.join(' ')} — got ${got.join(' ')}`);
      }
    });
  } catch (e) {
    if (!/no grid/.test(e.message)) { console.log('ERROR ' + e.message); results.push(false); }
  } finally {
    await page.evaluate(async () => {
      const u = window.appState.get('referenced_user');
      u.set('preferences.board_category_grouping.enabled', false);
      await u.save();
    }).catch(() => {});
    await browser.close();
  }
  const bad = results.filter((r) => !r).length;
  console.log(`\n${results.length - bad}/${results.length} checks passed`);
  process.exit(bad ? 1 : 0);
};

run().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
