/**
 * Dumps the CATEGORY TILE LAYOUT of a categorised board.
 *
 * The arrangement is not CSS — `pack_category_tiles` (utils/board_categories.js) computes
 * a rectangle per category (grid-column / grid-row spans on the board's own grid) and the
 * template stamps it on `.md-board-detail-grid__group` as an inline style. So to change
 * the arrangement you have to see what the PACKER produced, not what the stylesheet says.
 *
 * Prints, per category, the placement the packer chose and the rendered box, in reading
 * order (top-to-bottom, then left-to-right). `--no-scroll` runs the non-scrolling variant.
 *
 * Usage:
 *   node scripts/category-layout-dump-qa.mjs --user <u> --pass <p> --board <slug> \
 *     [--widths 1280,1024] [--no-scroll] [--shot-dir DIR]
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const BOARD = OPTS.arg('--board', null);
const WIDTHS = (OPTS.arg('--widths', '1280')).split(',').map(Number);
const SHOT = OPTS.arg('--shot-dir', '');
const SCROLL = !process.argv.includes('--no-scroll');
const LABELS = process.argv.includes('--labels');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DUMP = () => {
  const grid = document.querySelector('.md-board-detail-grid');
  const cs = grid && getComputedStyle(grid);
  const groups = [...document.querySelectorAll('.md-board-detail-grid__group')]
    .map((g) => {
      const r = g.getBoundingClientRect();
      const gcs = getComputedStyle(g);
      const key = [...g.classList]
        .map((c) => c.replace('md-board-detail-grid__group--', ''))
        .find((c) => c.indexOf('md-board-detail') === -1) || '(none)';
      return {
        key, col: gcs.gridColumn, row: gcs.gridRow,
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
        buttons: g.querySelectorAll('.md-board-detail-symbol-card').length,
        /* The invariant that matters when categories are on: a button is a board column
           wide wherever it lives, so every category's buttons measure the same. A tile
           whose SPAN exceeds its inner track count breaks it silently — the ring just
           looks roomier — so measure the button, not the tile. */
        btnW: (function() {
          const b = g.querySelector('.md-board-detail-symbol-card');
          return b ? Math.round(b.getBoundingClientRect().width * 10) / 10 : null;
        })(),
        /* WHICH buttons landed in this category, in DOM order. A count alone cannot answer
           "why is there a one-button Controls tile on this board" — and the label may be a
           text-symbol rather than a `__label` span (buttons with no image render that way),
           so read the card's text, not one known child. */
        /* The HEADER text and the resolved tint — the category key is not the name a user
           reads (some names depend on what the category holds), and the tint can be an
           inline literal rather than the registry variable. */
        header: (function() {
          const h = g.querySelector('.md-board-detail-grid__group-header');
          return h ? (h.textContent || '').trim().slice(0, 20) : '';
        })(),
        fill: getComputedStyle(g).getPropertyValue('--bd-group-fill').trim(),
        labels: [...g.querySelectorAll('.md-board-detail-symbol-card')]
          .map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 14))
      };
    })
    .filter((g) => g.w > 0)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));
  return {
    cols: cs && cs.gridTemplateColumns.split(' ').length,
    compactRows: cs && cs.getPropertyValue('--bd-compact-rows').trim(),
    scrollClass: !!(grid && grid.classList.contains('md-board-detail-grid--compact-scroll')),
    groups
  };
};

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  try {
    await login(page, OPTS);
    const path = '/' + OPTS.USER + '/board-detail/' + BOARD;
    await page.goto(OPTS.BASE + path, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('.md-board-detail-grid', { timeout: 30000 });
    await sleep(2000);

    const boardId = await page.evaluate(() =>
      document.querySelector('.md-board-detail-grid').getAttribute('data-id'));

    await page.evaluate(async (id, scroll) => {
      const u = window.appState.get('referenced_user') || window.appState.get('currentUser');
      const p = Object.assign({}, u.get('preferences'));
      const prev = p.board_category_grouping || {};
      /* ACCOUNT-WIDE, three flags: `board_category_grouping` no longer carries an `order`
         key or a per-board `boards` map — category order/layout is a property of the BOARD
         and the server drops both on save. This turns grouping on for EVERY board on the
         account, not just the one under test, and does not restore it. */
      p.board_category_grouping = { enabled: true,
        show_category_names: true, vertical_scroll: scroll };
      u.set('preferences', p);
      if (!u.get('preferences.device')) { u.set('preferences.device', {}); }
      u.set('preferences.device.updated', true);
      await u.save();
    }, boardId, SCROLL);
    await sleep(3000);

    for (const w of WIDTHS) {
      await page.setViewport({ width: w, height: 900 });
      await sleep(2000);
      const d = await page.evaluate(DUMP);
      console.log(`\n=== ${BOARD} @ ${w}px  scroll=${d.scrollClass}  ` +
        `(${d.cols} cols, --bd-compact-rows=${d.compactRows}) ===`);
      d.groups.forEach((g) => {
        console.log(`  ${g.key.padEnd(16)} col=${String(g.col).padEnd(14)} row=${String(g.row).padEnd(12)} ` +
          `${String(g.w).padStart(4)}x${String(g.h).padStart(3)}px  btns=${g.buttons}  btnW=${g.btnW}`);
        if (LABELS) {
          console.log(`  ${''.padEnd(16)} header="${g.header}"  fill=${g.fill}`);
          console.log(`  ${''.padEnd(16)} [${(g.labels || []).join('] [')}]`);
        }
      });
      const widths = [...new Set(d.groups.filter((g) => g.key !== 'keyboard' && g.btnW).map((g) => g.btnW))];
      console.log(`  --> distinct button widths (excl. keyboard): ${widths.sort((a, b) => a - b).join(', ')}` +
        (widths.length === 1 ? '  UNIFORM' : '  *** NOT UNIFORM ***'));
      if (SHOT) { await page.screenshot({ path: `${SHOT}layout-${BOARD}-${SCROLL ? 'scroll' : 'noscroll'}-${w}.png` }); }
    }
  } catch (e) {
    console.log('ERROR:', e.message, e.stack);
  } finally {
    await browser.close();
  }
})();
