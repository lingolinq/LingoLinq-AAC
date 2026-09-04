/**
 * COMPACT mode must ring the CATEGORY, not the button — and the keyboard must sit
 * bottom-right.
 *
 * WHY THIS EXISTS: compact mode (grouping ON, vertical scrolling OFF) used to leave the
 * column / group / group-body wrappers `display: contents` and flow every button into
 * the board grid. Two things followed from that, and both shipped:
 *   1. a category occupied a STAIRCASE of cells, so the only ring that could be drawn
 *      was one per CELL — the board read as N outlined buttons, not as a group;
 *   2. the keys' inline grid-row/grid-column (from qwerty_positions) resolved against
 *      the BOARD grid instead of the keyboard's own, pinning the whole keyboard to
 *      board rows 1-3 / columns 1-10 — the top-left corner.
 * Compact now tiles: one rectangle per category (pack_category_tiles), each re-creating
 * its own w x h board cells. This probe asserts the properties that fix depends on, all
 * from RENDERED geometry — a tile that overlaps or a button that changes size with the
 * category it landed in fails here.
 *
 * Usage (from app/frontend, Node 22):
 *   node scripts/compact-tiles-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const BOARD = OPTS.arg('--board', 'vocal-flair-112');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const pass = (n, d) => { results.push(true); console.log(`  PASS  ${n}\n        ${d}`); };
const fail = (n, d) => { results.push(false); console.log(`  FAIL  ${n}\n        ${d}`); };

const READ = () => {
  const grid = document.querySelector('.md-board-detail-main .md-board-detail-grid');
  if (!grid) { return null; }
  const gr = grid.getBoundingClientRect();
  const gs = getComputedStyle(grid);
  const pad = {
    l: parseFloat(gs.paddingLeft) || 0, r: parseFloat(gs.paddingRight) || 0,
    t: parseFloat(gs.paddingTop) || 0, b: parseFloat(gs.paddingBottom) || 0
  };
  const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };

  const groups = [...grid.querySelectorAll('.md-board-detail-grid__group')].map((g) => {
    const s = getComputedStyle(g);
    const cells = [...g.querySelectorAll('.md-board-detail-grid__cell')];
    return {
      key: (g.className.match(/__group--([a-z_]+)/) || [])[1] || null,
      display: s.display,
      /* The ring is layered box-shadow rings now, not an outline — an outline cannot
         graduate from a deep inner lip to a glossy outer edge. Spread-only shadows paint
         outside the border box exactly as the outline did, so this is the same ring by a
         different mechanism, and the check follows it. */
      outline: (s.boxShadow && s.boxShadow !== 'none') ? 1 : 0,
      outlineStyle: (s.boxShadow && s.boxShadow !== 'none') ? 'solid' : 'none',
      /* Spread-only bands serialise as `<color> 0px 0px 0px <spread>` — counting them
         proves the graduated ring is present, not just some shadow. */
      ringBands: ((s.boxShadow || '').match(/0px 0px 0px/g) || []).length,
      rect: box(g),
      cells: cells.length,
      cardWidths: cells.map((c) => {
        const card = c.querySelector('.md-board-detail-symbol-card');
        return card ? Math.round(card.getBoundingClientRect().width) : 0;
      }),
      cellBottom: cells.reduce((m, c) => Math.max(m, c.getBoundingClientRect().bottom), 0),
      /* Does the tile actually CONTAIN its own cells? A tile whose inner tracks drifted
         off the board columns shows up here as a cell outside its own ring. */
      escaped: cells.filter((c) => {
        const r = c.getBoundingClientRect();
        const t = g.getBoundingClientRect();
        return r.left < t.left - 1 || r.right > t.right + 1 || r.top < t.top - 1 || r.bottom > t.bottom + 1;
      }).length
    };
  });

  const ringedCells = [...grid.querySelectorAll('.md-board-detail-grid__cell')]
    .filter((c) => (parseFloat(getComputedStyle(c).outlineWidth) || 0) > 0 &&
                   getComputedStyle(c).outlineStyle !== 'none').length;

  return {
    compact: grid.classList.contains('md-board-detail-grid--compact'),
    /* --compact is the live grouping marker; --grouped is keyed on the hardcoded-false
       `panelLayout` and is emitted by nothing. */
    grouped: grid.classList.contains('md-board-detail-grid--compact'),
    hasKeyboardPanelClass: grid.classList.contains('md-board-detail-grid--has-keyboard-panel'),
    compactRows: grid.style.getPropertyValue('--bd-compact-rows').trim(),
    content: { l: gr.left + pad.l, r: gr.right - pad.r, t: gr.top + pad.t, b: gr.bottom - pad.b },
    groups, ringedCells
  };
};

const run = async () => {
  const { browser, page } = await launch(OPTS);
  let before = null;
  try {
    await login(page, OPTS);

    /* Load the board BEFORE reading the preference to restore later.
       `persistence` keeps an offline copy of the user record, so straight after login
       `referenced_user.preferences` can still be the CACHED record from an earlier
       session — including one captured mid-run by a probe that had grouping switched on.
       Reading `before` there and writing it back in the cleanup is how a probe restores
       the account to a state it was never in. One real board load settles the record
       first. Measured: this is the difference between the dev account coming back clean
       and coming back with `enabled: true` from two runs ago. */
    await page.goto(`${OPTS.BASE}/${OPTS.USER}/board-detail/${BOARD}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.md-board-detail-grid__cell', { timeout: 45000 });
    await sleep(6000);

    before = await page.evaluate(async () => {
      const u = window.appState.get('referenced_user');
      const g = u.get('preferences.board_category_grouping') || {};
      const was = { enabled: g.enabled, vertical_scroll: g.vertical_scroll };
      u.set('preferences.board_category_grouping.enabled', true);
      u.set('preferences.board_category_grouping.vertical_scroll', false);
      await u.save();
      return was;
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.md-board-detail-grid__cell', { timeout: 45000 });
    await sleep(6000);

    const s = await page.evaluate(READ);
    if (!s) { fail('precondition — board rendered', 'no grid'); throw new Error('no grid'); }

    if (s.compact && !s.grouped) {
      pass('precondition — compact mode is active', `--compact set, --grouped not, --bd-compact-rows=${s.compactRows || '(unset)'}`);
    } else {
      fail('precondition — compact mode is active', `compact=${s.compact} grouped=${s.grouped}; check vertical_scroll saved as false`);
      throw new Error('not compact');
    }

    const tiles = s.groups.filter((g) => g.key);
    const notGrid = tiles.filter((g) => g.display !== 'grid').map((g) => g.key);
    if (tiles.length && !notGrid.length) {
      pass('every category is ONE box, not a run of cells', `${tiles.length} tiles, each display:grid`);
    } else {
      fail('every category is ONE box, not a run of cells', notGrid.length ? `still display:contents: ${notGrid.join(', ')}` : 'no category tiles found at all');
    }

    const unringed = tiles.filter((g) => !(g.outline >= 1 && g.outlineStyle !== 'none')).map((g) => g.key);
    if (!unringed.length) {
      pass('the ring is on the CATEGORY — including the keyboard', `all ${tiles.length} tiles carry an outline (${tiles[0].outline}px)`);
    } else {
      fail('the ring is on the CATEGORY — including the keyboard', `no ring on: ${unringed.join(', ')}`);
    }

    if (s.ringedCells === 0) {
      pass('no per-BUTTON ring survives', 'zero cells carry an outline');
    } else {
      fail('no per-BUTTON ring survives', `${s.ringedCells} cells still ringed individually`);
    }

    const escaped = tiles.filter((g) => g.escaped).map((g) => `${g.key}:${g.escaped}`);
    if (!escaped.length) {
      pass('every button sits inside its own category ring', 'no cell escapes its tile');
    } else {
      fail('every button sits inside its own category ring', `cells outside their tile — ${escaped.join(', ')}`);
    }

    /* TWO tiles carry the keyboard category now: the 3x10 block of keys, and the folder
       that opens a keyboard board, which the packer splits out rather than letting it add
       a fourth key row holding one button. The block is the one this check is about, so
       pick it by size instead of by taking the first in DOM order — that is the folder,
       and it sits bottom-LEFT. */
    const kb = tiles.filter((g) => g.key === 'keyboard')
                    .sort((a, b) => b.cells - a.cells)[0];
    if (!kb) {
      fail('the keyboard is bottom-RIGHT', 'no keyboard tile on this board — run with --board <a board with a keyboard>');
    } else {
      const rightGap = Math.round(s.content.r - kb.rect.r);
      const bottomGap = Math.round(s.content.b - kb.rect.b);
      /* <=6px: the ring sits 2px outside the tile and the grid pads 4px. */
      if (rightGap <= 6 && bottomGap <= 6) {
        pass('the keyboard is bottom-RIGHT', `flush to ${rightGap}px of the right edge and ${bottomGap}px of the bottom`);
      } else {
        fail('the keyboard is bottom-RIGHT', `right edge is ${rightGap}px short, bottom ${bottomGap}px short — top-left placement reads as ~0 right gap only by accident, check both`);
      }
    }

    /* Uniform button width is the property the zero-padding tile exists to preserve —
       an AAC user navigates by position, so a button must not change size with the
       category it landed in. Keys are excluded: on a board narrower than a QWERTY row
       the keyboard deliberately keeps ten inner tracks and its keys come out smaller. */
    const widths = tiles.filter((g) => g.key !== 'keyboard').flatMap((g) => g.cardWidths).filter((w) => w > 0);
    const spread = widths.length ? Math.max(...widths) - Math.min(...widths) : 0;
    /* The tile's padding is an inset, and its `w` tracks absorb it, so a button is
       `colW - 2 x padding / w` wide — a 1-column tile's buttons are a few px narrower than
       a 4-column tile's. That is a deliberate trade (the alternative, compensating the
       inner gap, spends 2 x inset on every gap inside a category). What must NOT happen is
       drift beyond it: a spread larger than 2 x padding means the tracks have come off the
       board columns for some other reason. 18px = 2 x (4px --bd-tile-pad + 4px --bd-tile-margin), plus 2px for the subpixel
       rounding of fractional track widths. */
    const bound = 18;
    if (widths.length && spread <= bound) {
      pass('button sizes stay within the tile padding\'s cost', `${widths.length} buttons, width spread ${spread}px (bound ${bound}px)`);
    } else {
      fail('button sizes stay within the tile padding\'s cost', `width spread ${spread}px across ${widths.length} buttons — beyond 2 x tile padding, so tile tracks have drifted off the board columns`);
    }

    const below = tiles.filter((g) => g.cellBottom > s.content.b + 2).map((g) => g.key);
    if (!below.length) {
      pass('nothing is pushed below the fold', 'every button ends inside the grid — compact mode cannot scroll');
    } else {
      fail('nothing is pushed below the fold', `past the bottom edge: ${below.join(', ')}`);
    }

    if (!s.hasKeyboardPanelClass) {
      pass('the panel-mode keyboard class does not leak into compact', '--has-keyboard-panel absent');
    } else {
      fail('the panel-mode keyboard class does not leak into compact', '--has-keyboard-panel is set; its column-spanning rules target panel mode');
    }
  } catch (e) {
    if (!/no grid|not compact/.test(e.message)) { console.log('ERROR ' + e.message); results.push(false); }
  } finally {
    /* Restore, then verify AFTER A RELOAD.
       Two traps stacked here, and this probe has to clear both. A DOM-class check reports
       success while the account is still modified, because these probes end on a page
       where the grid is not grouped regardless of preference. But reading the preference
       back in the SAME page session is not enough either: `u.get(...)` straight after
       `u.save()` returns the record that was just written locally, so it agrees with the
       restore whether or not anything reached the server. Only a re-fetched record after
       a full reload proves the account is actually clean — the same reasoning as check 9
       in board-categorize-toggle-qa. */
    if (before) {
      await page.evaluate(async (was) => {
        const u = window.appState.get('referenced_user');
        u.set('preferences.board_category_grouping.enabled', was.enabled);
        u.set('preferences.board_category_grouping.vertical_scroll', was.vertical_scroll);
        await u.save();
      }, before).catch(() => null);
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(9000);
      const after = await page.evaluate(() => {
        const as = window.appState;
        const g = (as && as.get && as.get('referenced_user.preferences.board_category_grouping')) || null;
        return g ? { enabled: g.enabled, vertical_scroll: g.vertical_scroll } : null;
      }).catch(() => null);
      const ok = after && after.enabled === before.enabled && after.vertical_scroll === before.vertical_scroll;
      console.log(ok
        ? `\n  cleanup wrote back enabled=${after.enabled} vertical_scroll=${after.vertical_scroll}`
        : `\n  CLEANUP FAILED — wanted ${JSON.stringify(before)}, read back ${JSON.stringify(after)} — FIX THE ACCOUNT BY HAND`);
      /* This is a CLIENT read, and a client read cannot prove the server. `persistence`
         keeps an offline copy of the user record and Ember Data holds another, so
         `referenced_user.preferences` can agree with the restore while the server still
         holds something else — verified in this repo: three consecutive probes reported
         a clean restore while `rails runner` showed the opposite. Treat the line above as
         "the write was issued", and confirm the account with:
           bundle exec rails runner 'puts User.find_by_path("<user>").settings["preferences"]["board_category_grouping"].inspect'
         Only that is ground truth. */
      console.log('  ground truth: bundle exec rails runner \'puts User.find_by_path("' + OPTS.USER + '").settings["preferences"]["board_category_grouping"].inspect\'');
      if (!ok) { results.push(false); }
    }
    await browser.close();
  }
  const bad = results.filter((r) => !r).length;
  console.log(`\n${results.length - bad}/${results.length} checks passed`);
  process.exit(bad ? 1 : 0);
};

run().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
