/**
 * Measures the CLEAR SPACE BETWEEN CATEGORIES on a categorised board with scrolling
 * enabled, at a range of viewport widths.
 *
 * The number that matters is not any single declaration: in the scrolling variant the
 * tile draws no ring (`--compact-scroll` sets `box-shadow: none`), so the visible
 * channel between two categories is the board's `gap` PLUS both tiles' margins —
 * `--bd-compact-gap + 2 x --bd-tile-margin`. This probe reads it off the rendered
 * boxes instead of trusting that arithmetic: for every pair of `.md-board-detail-grid__group`
 * elements it reports the smallest horizontal and vertical edge-to-edge distance.
 *
 * Usage:
 *   node scripts/category-gap-qa.mjs --user <u> --pass <p> [--widths 1280,1024,900]
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const WIDTHS = (OPTS.arg('--widths', '1280,1100,1024,900')).split(',').map(Number);
const SHOT = OPTS.arg('--shot-dir', '');
/* --no-scroll measures the NON-scrolling variant, the regression control: the ≤1024px
   rule is scoped to `--compact-scroll`, so these numbers must not move. */
const SCROLL = !process.argv.includes('--no-scroll');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MEASURE = () => {
  const grid = document.querySelector('.md-board-detail-grid');
  const groups = [...document.querySelectorAll('.md-board-detail-grid__group')]
    .filter((g) => g.getBoundingClientRect().width > 0);
  const cs = grid ? getComputedStyle(grid) : null;
  const rects = groups.map((g) => {
    const r = g.getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom };
  });
  let hGap = Infinity, vGap = Infinity;
  for (let i = 0; i < rects.length; i++) {
    for (let j = 0; j < rects.length; j++) {
      if (i === j) { continue; }
      const a = rects[i], b = rects[j];
      // Side by side: vertical ranges overlap, b starts after a ends.
      if (b.l >= a.r - 0.5 && a.t < b.b - 1 && b.t < a.b - 1) { hGap = Math.min(hGap, b.l - a.r); }
      // Stacked: horizontal ranges overlap, b starts below a.
      if (b.t >= a.b - 0.5 && a.l < b.r - 1 && b.l < a.r - 1) { vGap = Math.min(vGap, b.t - a.b); }
    }
  }
  const v = (n) => (cs ? cs.getPropertyValue(n).trim() : '');
  return {
    groups: groups.length,
    scroll: !!(grid && grid.classList.contains('md-board-detail-grid--compact-scroll')),
    compact: !!(grid && grid.classList.contains('md-board-detail-grid--compact')),
    gapVar: v('--bd-compact-gap'), marginVar: v('--bd-tile-margin'), ringVar: v('--bd-ring'),
    rowGap: cs && cs.rowGap, colGap: cs && cs.columnGap,
    hGap: hGap === Infinity ? null : Math.round(hGap * 10) / 10,
    vGap: vGap === Infinity ? null : Math.round(vGap * 10) / 10
  };
};

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  try {
    await login(page, OPTS);
    const home = await page.evaluate(() => {
      const h = window.appState.get('currentUser.preferences.home_board');
      if (!h || !h.key) { return null; }
      const p = h.key.split('/');
      return '/' + p[0] + '/board-detail/' + p.slice(1).join('/');
    });
    if (!home) { throw new Error('no home board set'); }

    // Grouping ON with scrolling ON, as the user default AND on this board.
    await page.goto(OPTS.BASE + home, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('.md-board-detail-grid', { timeout: 30000 });
    await sleep(1500);
    await page.evaluate(async (scroll) => {
      const u = window.appState.get('referenced_user') || window.appState.get('currentUser');
      const p = Object.assign({}, u.get('preferences'));
      /* ACCOUNT-WIDE, three flags. This used to merge an entry into a per-board `boards`
         map keyed by the grid's data-id; that map no longer exists (category order/layout
         is a property of the BOARD, and the server drops a `boards` key on save), so the
         probe now sets the account flags directly. Note the consequence for anyone running
         this against a real account: it turns grouping ON for EVERY board, not just the one
         under test, and does not restore it. */
      p.board_category_grouping = {
        enabled: true,
        show_category_names: true,
        vertical_scroll: scroll
      };
      u.set('preferences', p);
      if (!u.get('preferences.device')) { u.set('preferences.device', {}); }
      u.set('preferences.device.updated', true);
      await u.save();
    }, SCROLL);
    await sleep(2500);

    for (const w of WIDTHS) {
      await page.setViewport({ width: w, height: 900 });
      await sleep(1800);
      const m = await page.evaluate(MEASURE);
      console.log(`  ${String(w).padStart(4)}px  groups=${m.groups} scroll=${m.scroll} ` +
        `gapVar=${m.gapVar} marginVar=${m.marginVar} ringVar=${m.ringVar} ` +
        `computedGap=${m.rowGap}/${m.colGap}  ==> BETWEEN CATEGORIES h=${m.hGap} v=${m.vGap}`);
      if (SHOT) { await page.screenshot({ path: `${SHOT}cat-gap-${w}.png` }); }
    }
  } catch (e) {
    console.log('ERROR:', e.message, e.stack);
  } finally {
    await browser.close();
  }
})();
