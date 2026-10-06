/*
 * Vocal Flair 112 in its SAVED category layout (2026-10-05): does every button sit exactly where
 * Traci's map puts it, outlined exactly on the map's block boundaries, on one non-scrolling page?
 *
 * Expectations come from the committed layout file, lib/category_layouts/vocal_flair_112.json
 * (ids, labels, blocks), so this checks the rendering against the same source the seeder wrote.
 * Categories are switched on IN MEMORY only (the flag and the board user's preference on the
 * loaded records, never saved), so it needs no server flag and changes no account.
 *
 * Checks, each PASS/FAIL, exit 1 on any FAIL:
 *   1. the grid renders in category-layout mode, 8 x 14;
 *   2. each of the 112 buttons is at its map row/column;
 *   3. each cell's outline sides match the map's block boundaries;
 *   4. the board fits without scrolling;
 *   5. edit mode shows the board without categories and says so.
 *
 *   node scripts/category-layout-vf112-qa.mjs --user marcus_williams_slp --pass 'demo2025!' \
 *     [--board marcus_williams_slp/vocal-flair-112]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cliArgs, launch, login } from './qa-helpers.mjs';

const args = cliArgs(process.argv);
const BOARD = args.arg('--board', args.USER + '/vocal-flair-112');
const here = path.dirname(fileURLToPath(import.meta.url));
const layout = JSON.parse(fs.readFileSync(path.join(here, '../../../lib/category_layouts/vocal_flair_112.json'), 'utf8'));
const { browser, page } = await launch(args);
await page.setViewport({ width: 1400, height: 1000 });
let failed = 0;
const check = (name, ok, detail) => { if (!ok) { failed++; } console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };

// Expected outline sides from the map's blocks, the same rule utils/category_layout.js applies.
const expectedEdges = (r, c) => {
  const me = layout.cells[r][c];
  const same = (rr, cc) => rr >= 0 && cc >= 0 && rr < layout.rows && cc < layout.columns && layout.cells[rr][cc] === me;
  return { top: !same(r - 1, c), right: !same(r, c + 1), bottom: !same(r + 1, c), left: !same(r, c - 1) };
};

const switchOn = () => page.evaluate(() => {
  const a = window.LingoLinq.appState;
  if (!a.get('feature_flags')) { a.set('feature_flags', {}); }
  a.set('feature_flags.board_category_grouping', true);
  const u = a.get('referenced_user') || a.get('currentUser');
  if (!u.get('preferences.board_category_grouping')) { u.set('preferences.board_category_grouping', {}); }
  u.set('preferences.board_category_grouping.enabled', true);
});

try {
  await login(page, args);
  await page.goto(`${args.BASE}/${BOARD.replace(/\/.*/, '')}/board-detail/${BOARD.replace(/^[^/]*\//, '')}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.md-board-detail-grid', { timeout: 30000 });
  await switchOn();
  await page.waitForSelector('.md-board-detail-grid--category-layout', { timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  const seen = await page.evaluate(() => {
    const grid = document.querySelector('.md-board-detail-grid');
    const cs = getComputedStyle(grid);
    const cells = Array.from(grid.querySelectorAll('.md-board-detail-grid__cell--layout')).map(el => {
      const s = getComputedStyle(el);
      return {
        id: el.getAttribute('data-id'),
        row: parseInt(s.gridRowStart, 10) - 1,
        col: parseInt(s.gridColumnStart, 10) - 1,
        edges: ['top', 'right', 'bottom', 'left'].reduce((o, side) => { o[side] = el.classList.contains('md-board-detail-grid__cell--edge-' + side); return o; }, {})
      };
    });
    return {
      layoutMode: grid.classList.contains('md-board-detail-grid--category-layout'),
      tracks: [cs.gridTemplateRows.split(' ').length, cs.gridTemplateColumns.split(' ').length],
      cells,
      scrolls: grid.scrollHeight > grid.clientHeight + 1 || document.scrollingElement.scrollHeight > window.innerHeight + 1
    };
  });

  check('renders in category-layout mode', seen.layoutMode);
  check('grid is 8 rows x 14 columns', seen.tracks[0] === layout.rows && seen.tracks[1] === layout.columns, `got ${seen.tracks.join(' x ')}`);
  check('one layout cell per map cell', seen.cells.length === layout.rows * layout.columns, `got ${seen.cells.length}`);

  const byPos = {};
  seen.cells.forEach(c => { byPos[c.row + ',' + c.col] = c; });
  let misplaced = [];
  let badEdges = [];
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.columns; c++) {
      const want = String(layout.order[r][c]);
      const got = byPos[r + ',' + c];
      if (!got || got.id !== want) { misplaced.push(`${r},${c} ${layout.labels[r][c]}: got id ${got ? got.id : 'none'}`); continue; }
      const exp = expectedEdges(r, c);
      if (JSON.stringify(exp) !== JSON.stringify(got.edges)) { badEdges.push(`${r},${c} ${layout.labels[r][c]}`); }
    }
  }
  check('every button is at its map row/column', misplaced.length === 0, misplaced.slice(0, 5).join('; '));
  check('outlines sit exactly on the map block boundaries', badEdges.length === 0, badEdges.slice(0, 5).join('; '));
  check('fits on one page without scrolling', !seen.scrolls);

  // Edit mode: the board without categories, and the notice.
  await page.goto(`${args.BASE}/${BOARD.replace(/\/.*/, '')}/board-detail/${BOARD.replace(/^[^/]*\//, '')}/edit`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.md-board-detail-grid', { timeout: 30000 });
  await switchOn();
  await new Promise(r => setTimeout(r, 1500));
  const edit = await page.evaluate(() => ({
    layoutMode: !!document.querySelector('.md-board-detail-grid--category-layout'),
    note: !!document.querySelector('.md-board-edit-panel__categorized-note')
  }));
  check('edit mode shows the board without categories', !edit.layoutMode);
  check('edit mode says categories are edited in Categorize', edit.note);
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} FAIL` : '\nall PASS');
process.exit(failed ? 1 : 0);
