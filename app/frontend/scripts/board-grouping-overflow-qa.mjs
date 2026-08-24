/**
 * Does Fitzgerald grouping push buttons off-screen?
 *
 * The grouped grid keeps the base rule's definite `height: calc(100dvh - 120px)` and
 * declares NO `overflow`, so it computes to `visible`: content that does not fit is
 * painted past the box rather than scrolled to. The ungrouped grid cannot overflow —
 * it is `grid-template-rows: repeat(--board-rows, minmax(0,1fr))`, so cells shrink.
 *
 * Grouping adds a header and padding per category panel plus inter-panel gaps to the
 * SAME button area, so the question is whether a real board still fits. A button below
 * the fold is unreachable for a switch scanner, a dwell user or a head-pointer — they
 * cannot scroll — so this is a hard measurement, not a cosmetic one.
 *
 * Measures the same board twice, grouping OFF then ON, and counts cells whose bottom
 * edge falls below the grid box and below the viewport.
 *
 * Usage:
 *   node scripts/board-grouping-overflow-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const pass = (n, d) => { results.push({ n, ok: true }); console.log(`  PASS  ${n}\n        ${d}`); };
const fail = (n, d) => { results.push({ n, ok: false }); console.log(`  FAIL  ${n}\n        ${d}`); };

const MEASURE = () => {
  const grid = document.querySelector('.md-board-detail-grid');
  if (!grid) { return { grid: false }; }
  const gb = grid.getBoundingClientRect();
  const cs = getComputedStyle(grid);
  const cells = Array.from(grid.querySelectorAll('.md-board-detail-grid__cell'));
  const vh = window.innerHeight;
  let belowGrid = 0, belowViewport = 0;
  cells.forEach((c) => {
    const r = c.getBoundingClientRect();
    // 1px tolerance for sub-pixel rounding.
    if (r.bottom > gb.bottom + 1) { belowGrid++; }
    if (r.top >= vh - 1) { belowViewport++; }
  });
  return {
    grid: true,
    grouped: grid.classList.contains('md-board-detail-grid--grouped'),
    overflowY: cs.overflowY,
    gridHeight: Math.round(gb.height),
    gridBottom: Math.round(gb.bottom),
    viewportH: vh,
    cells: cells.length,
    panels: grid.querySelectorAll('.md-board-detail-grid__group-body').length,
    belowGrid,
    belowViewport,
    scrollable: grid.scrollHeight > grid.clientHeight + 1
  };
};

const clickSel = async (page, sel) => {
  const h = await page.$(sel); if (!h) { return false; }
  const b = await h.boundingBox(); if (!b) { return false; }
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); return true;
};

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
  const u = OPTS.USER;
  /* Tracks whether WE turned grouping on, so the dev account is left as found. */
  let flipped = false;
  try {
    console.log(`\nBASE ${OPTS.BASE}  USER ${OPTS.USER}`);
    await login(page, OPTS);
    const key = await page.evaluate(() => window.appState && window.appState.get('currentUser.preferences.home_board.key'));
    const name = String(key).split('/').pop();
    const boardUrl = `${OPTS.BASE}/${u}/board-detail/${name}`;

    /* --- Grouping OFF (control) --- */
    await page.goto(boardUrl, { waitUntil: 'domcontentloaded' });
    await sleep(9000);
    const off = await page.evaluate(MEASURE);
    console.log('  OFF: ' + JSON.stringify(off));
    if (!off.grid || off.cells === 0) { fail('precondition — board rendered with cells', JSON.stringify(off)); throw new Error('no grid'); }
    if (off.grouped) { fail('precondition — control run is UNGROUPED', 'grid already carries --grouped'); throw new Error('grouped'); }
    if (off.belowGrid === 0 && off.belowViewport === 0) {
      pass('control — ungrouped board fits entirely on screen', `${off.cells} buttons, 0 below the grid, 0 below the fold`);
    } else {
      fail('control — ungrouped board fits entirely on screen', JSON.stringify(off));
    }

    /* Grouping is enabled OUT OF BAND (a preference write) rather than through the
       Categorize panel. What H5 asks is whether the GROUPED RENDER fits — the toggle
       path is covered by board-categorize-toggle-qa, and driving it here only adds
       failure modes that look like product findings when they are probe problems.

       The write below was DESCRIBED by this comment but never actually implemented, so
       the probe measured the same ungrouped board twice and the ON phase could never be
       grouped — which is why H5 has been unverifiable. Grouping is strictly opt-in
       (board-detail-grid.js#groupingEnabled tests `=== true`), so it must be written
       explicitly; it is restored in `finally`. */
    const setPref = async (val) => page.evaluate(async (v) => {
      try {
        const u = window.appState.get('referenced_user');
        u.set('preferences.board_category_grouping.enabled', v);
        await u.save();
        /* Verify the STORED value, not a DOM class: in edit mode (and in the preview)
           the grid is ungrouped regardless of the preference, so a class check reports
           success while the preference is untouched. */
        return window.appState.get('referenced_user.preferences.board_category_grouping.enabled') === v;
      } catch (e) { return 'ERR ' + e.message; }
    }, val);

    const enabled = await setPref(true);
    if (enabled !== true) { fail('precondition — grouping preference could be written', String(enabled)); throw new Error('pref'); }
    flipped = true;

    /* Back to the plain board view so we measure the REAL grid, not the preview. */
    await page.goto(boardUrl, { waitUntil: 'domcontentloaded' });
    await sleep(9000);
    const on = await page.evaluate(MEASURE);
    console.log('  ON : ' + JSON.stringify(on));

    if (!on.grouped) {
      fail('precondition — grouping is actually ON for the measured board', JSON.stringify(on));
    } else {
      pass('precondition — grouping is actually ON', `${on.panels} category panels, ${on.cells} buttons`);
      if (on.belowGrid === 0 && on.belowViewport === 0) {
        pass('grouped board fits on screen — no button below the fold',
          `${on.cells} buttons across ${on.panels} panels, grid ${on.gridHeight}px, overflow-y=${on.overflowY}`);
      } else {
        fail('grouped board fits on screen — no button below the fold',
          `${on.belowGrid} button(s) below the grid box and ${on.belowViewport} below the viewport; ` +
          `overflow-y=${on.overflowY}, scrollable=${on.scrollable} — unreachable for switch/dwell/head-pointer users`);
      }
    }
  } catch (e) {
    if (!/no grid|grouped/.test(e.message)) { console.log('\nERROR ' + e.message); results.push({ n: 'probe completed', ok: false }); }
  } finally {
    if (flipped) {
      const restored = await page.evaluate(async () => {
        try {
          const u = window.appState.get('referenced_user');
          u.set('preferences.board_category_grouping.enabled', false);
          await u.save();
          return window.appState.get('referenced_user.preferences.board_category_grouping.enabled') === false;
        } catch (e) { return 'ERR ' + e.message; }
      }).catch((e) => 'ERR ' + e.message);
      console.log(restored === true
        ? '  (grouping restored to OFF — stored preference verified)'
        : `  (WARNING: could not restore grouping to OFF: ${restored}) — check the dev account`);
    }
    await browser.close();
  }
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} checks passed`);
  process.exit(bad ? 1 : 0);
})();
