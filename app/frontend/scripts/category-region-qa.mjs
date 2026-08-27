/**
 * The KEYBOARD REGION of a categorised board, scrolling variant.
 *
 * The vocabulary bands are flex rows and the region is a grid of its OWN tracks (one
 * button-wide track per notch column plus a single track for the keyboard) — see the
 * `--bd-region-btn-w` block in app.scss and the `region` comment in board_categories.js.
 * The two things that go wrong there are invisible in a layout dump: a tray that does not
 * FILL the tile it was sized for (the surplus piles up on one side as dead board), and a
 * region whose tracks do not add up to the row.
 *
 * So this reports, per region tile: the tile box, the tray box inside it, the slack between
 * them and where it fell, and the button width. Plus the region total against the widest
 * band, and any horizontal overflow of the scroll container.
 *
 * Usage:
 *   node scripts/category-region-qa.mjs --user <u> --pass <p> --board <slug> \
 *     [--widths 2280,1280] [--shot-dir DIR]
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const BOARD = OPTS.arg('--board', null);
const WIDTHS = (OPTS.arg('--widths', '2280,1280')).split(',').map(Number);
const SHOT = OPTS.arg('--shot-dir', '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DUMP = () => {
  const grid = document.querySelector('.md-board-detail-grid');
  const region = document.querySelector('.md-board-detail-grid__column--region');
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, w: r.width, right: r.right }; };
  const tile = (g) => {
    const body = g.querySelector('.md-board-detail-grid__group-body');
    const btn = g.querySelector('.md-board-detail-symbol-card');
    const gb = box(g), bb = body ? box(body) : null;
    return {
      key: [...g.classList].map((c) => c.replace('md-board-detail-grid__group--', ''))
        .find((c) => c.indexOf('md-board-detail') === -1) || '(none)',
      w: Math.round(gb.w * 10) / 10,
      trayW: bb ? Math.round(bb.w * 10) / 10 : null,
      /* Where the slack fell. A tray that is sized for its tile but left-aligned reads as
         `left 0 / right N` — the failure this probe exists for. */
      left: bb ? Math.round((bb.x - gb.x) * 10) / 10 : null,
      right: bb ? Math.round((gb.right - bb.right) * 10) / 10 : null,
      btnW: btn ? Math.round(btn.getBoundingClientRect().width * 10) / 10 : null
    };
  };
  const bands = [...document.querySelectorAll('.md-board-detail-grid__column--band')]
    .map((b) => {
      const tiles = [...b.querySelectorAll(':scope > .md-board-detail-grid__group')];
      const first = tiles[0], last = tiles[tiles.length - 1];
      return {
        span: first && last
          ? Math.round((last.getBoundingClientRect().right - first.getBoundingClientRect().x) * 10) / 10
          : null,
        btnW: first ? tile(first).btnW : null
      };
    });
  return {
    has_region: !!region,
    regionW: region ? Math.round(box(region).w * 10) / 10 : null,
    notch_cols: region ? getComputedStyle(region).getPropertyValue('--bd-region-notch-cols').trim() : null,
    kb_cols: region ? getComputedStyle(region).getPropertyValue('--bd-region-kb-cols').trim() : null,
    tracks: region ? getComputedStyle(region).gridTemplateColumns : null,
    tiles: region
      ? [...region.querySelectorAll(':scope > .md-board-detail-grid__group')].map(tile)
      : [],
    bands: bands,
    /* The container's whole purpose is to scroll VERTICALLY; any horizontal scroll means a
       tile reached outside the grid's padding box. */
    overflowX: grid ? Math.round(grid.scrollWidth - grid.clientWidth) : null
  };
};

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  try {
    await login(page, OPTS);
    await page.goto(OPTS.BASE + '/' + OPTS.USER + '/board-detail/' + BOARD,
      { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('.md-board-detail-grid', { timeout: 30000 });
    await sleep(2000);

    const boardId = await page.evaluate(() =>
      document.querySelector('.md-board-detail-grid').getAttribute('data-id'));
    await page.evaluate(async (id) => {
      const u = window.appState.get('referenced_user') || window.appState.get('currentUser');
      const p = Object.assign({}, u.get('preferences'));
      const prev = p.board_category_grouping || {};
      const entry = { enabled: true, order: prev.order || [],
        show_category_names: true, vertical_scroll: true };
      p.board_category_grouping = Object.assign({}, prev, entry,
        { boards: Object.assign({}, prev.boards, { [id]: entry }) });
      u.set('preferences', p);
      if (!u.get('preferences.device')) { u.set('preferences.device', {}); }
      u.set('preferences.device.updated', true);
      await u.save();
    }, boardId);
    await sleep(3000);

    for (const w of WIDTHS) {
      await page.setViewport({ width: w, height: 900 });
      await sleep(2000);
      const d = await page.evaluate(DUMP);
      console.log(`\n=== ${BOARD} @ ${w}px ===`);
      if (!d.has_region) { console.log('  no keyboard region on this board'); continue; }
      console.log(`  region ${d.regionW}px   notch_cols=${d.notch_cols} kb_cols=${d.kb_cols}`);
      console.log(`  tracks ${d.tracks}`);
      d.tiles.forEach((t) => {
        console.log(`    ${t.key.padEnd(16)} tile=${String(t.w).padStart(7)}  tray=${String(t.trayW).padStart(7)}` +
          `  slack L/R ${String(t.left).padStart(6)}/${String(t.right).padStart(6)}  btnW=${t.btnW}`);
      });
      d.bands.forEach((b, i) => console.log(`  band ${i + 1} span=${b.span}  btnW=${b.btnW}`));
      const btns = [...new Set(d.tiles.map((t) => t.btnW))];
      console.log(`  --> region button widths: ${btns.join(', ')}` +
        (btns.length === 1 ? '  UNIFORM' : '  *** NOT UNIFORM ***'));
      const lopsided = d.tiles.filter((t) => Math.abs(t.left - t.right) > 1);
      console.log(`  --> trays off-centre in their tile: ${lopsided.length ? lopsided.map((t) => t.key).join(', ') : 'none'}`);
      console.log(`  --> horizontal overflow: ${d.overflowX}px${d.overflowX > 0 ? '  *** SCROLLBAR ***' : ''}`);
      if (SHOT) {
        const el = await page.$('.md-board-detail-grid__column--region');
        if (el) { await el.screenshot({ path: `${SHOT}/region-${BOARD}-${w}.png` }); }
        /* The whole grid as well: the point of the region work is how it reads NEXT TO the
           bands, and a crop of the region alone cannot show that. */
        const grid = await page.$('.md-board-detail-grid');
        if (grid) { await grid.screenshot({ path: `${SHOT}/board-${BOARD}-${w}.png` }); }
      }
    }
  } catch (e) {
    console.log('ERROR:', e.message, e.stack);
  } finally {
    await browser.close();
  }
})();
