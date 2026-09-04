/**
 * CATEGORIZED + SCROLLING: every button must stay inside its own category tile.
 *
 * WHY THIS EXISTS: the grid root carries BOTH `--compact` and `--compact-scroll`
 * (board-detail-grid.js — compactCategories is `groupingEnabled`, compactScroll is
 * `groupingEnabled && categoryScrollEnabled`), and the two root rules are the SAME
 * specificity. While `--compact` was declared later in app.scss it won the pair the
 * scrolling variant depends on — `height` and `grid-template-rows` — so with scrolling ON
 * the board kept the NON-scrolling geometry: a definite height and `minmax(0, 1fr)` rows.
 * Each tile then came out `k x (height / rows)` tall while its `__group-body` rows hold a
 * 76px floor, so the body was taller than the tile it sits in and the buttons painted
 * outside their tinted background and over the tiles below.
 *
 * The three assertions are the ones that fix has to keep true: the rows are the scrolling
 * variant's (`auto` max, not `1fr`), no cell escapes its tile, and no two tiles overlap.
 *
 * Usage (from app/frontend, Node 22):
 *   node scripts/category-scroll-spill-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const BOARD = OPTS.arg('--board', 'vocal-flair-112');
/* The spill is width-dependent — the packer's column spans and the tray's tracks are both
   functions of the board width — so the viewport is a parameter, not a constant. Defaults
   to the shared helper's 1280x900; Traci's report came from a ~2300px-wide window. */
const VW = parseInt(OPTS.arg('--width', '1280'), 10);
const VH = parseInt(OPTS.arg('--height', '900'), 10);
/* EDIT mode is a separate geometry, not a skin: `.md-shell--board-detail-edit … .md-board-detail-grid`
   carries its own `height … !important` at (0,3,0), so it beats anything the mode rules on
   the grid root can say. Probe both. */
const EDIT = process.argv.includes('--edit');
const PATH = EDIT ? `board-detail/${BOARD}/edit` : `board-detail/${BOARD}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const pass = (n, d) => { results.push(true); console.log(`  PASS  ${n}\n        ${d}`); };
const fail = (n, d) => { results.push(false); console.log(`  FAIL  ${n}\n        ${d}`); };

const READ = () => {
  const grid = document.querySelector('.md-board-detail-main .md-board-detail-grid');
  if (!grid) { return null; }
  const gs = getComputedStyle(grid);
  const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };

  const groups = [...grid.querySelectorAll('.md-board-detail-grid__group')].map((g) => {
    const body = g.querySelector('.md-board-detail-grid__group-body');
    const cells = [...g.querySelectorAll('.md-board-detail-grid__cell')];
    const t = g.getBoundingClientRect();
    return {
      key: (g.className.match(/__group--([a-z_]+)/) || [])[1] || null,
      rect: box(g),
      bodyH: body ? Math.round(body.getBoundingClientRect().height) : 0,
      /* The tinted frame holds a glass TRAY (`__group-body`); the tray escaping the frame
         is the same failure one level in — measured as how far each edge runs past the
         group's own padding box. */
      bodyOut: body ? (() => {
        const t = g.getBoundingClientRect(); const b = body.getBoundingClientRect();
        const cs = getComputedStyle(g);
        const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
        const pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
        return {
          l: Math.round((t.left + pl) - b.left), r: Math.round(b.right - (t.right - pr)),
          t: Math.round((t.top + pt) - b.top), b: Math.round(b.bottom - (t.bottom - pb)),
          w: Math.round(b.width), gw: Math.round(t.width)
        };
      })() : null,
      cells: cells.length,
      /* How far the buttons run past the tile that is supposed to hold them. */
      spill: Math.round(cells.reduce((m, c) => Math.max(m, c.getBoundingClientRect().bottom - t.bottom), 0)),
      escaped: cells.filter((c) => {
        const r = c.getBoundingClientRect();
        return r.left < t.left - 1 || r.right > t.right + 1 || r.top < t.top - 1 || r.bottom > t.bottom + 1;
      }).length
    };
  });

  /* The category NAME is nowrap + ellipsis, so "it fits" is exactly
     `scrollWidth <= clientWidth`. utils/label_fit.js shrinks it (down to its 9px floor)
     until that holds — a header still reporting overflow means the fit never ran on it,
     or measured the wrong string (canvas measureText applies neither `text-transform` nor
     `letter-spacing`, and the header has both). */
  const names = [...grid.querySelectorAll('.md-board-detail-grid__group-name')].map((n) => {
    const head = n.closest('.md-board-detail-grid__group-header');
    const tile = n.closest('.md-board-detail-grid__group');
    const hs = head ? getComputedStyle(head) : null;
    const ts = tile ? getComputedStyle(tile) : null;
    /* The room the name actually has: the header's content box. A name wider than that
       overflows the header, then the tile, and is finally sheared by the GRID's clip — which
       is what a reader sees as "QUESTIO". The span's own scrollWidth cannot see any of it:
       nothing constrains the span, so it always sizes to its own text. */
    const headW = head ? head.clientWidth - (parseFloat(hs.paddingLeft) || 0) - (parseFloat(hs.paddingRight) || 0) : 0;
    const tileW = tile ? tile.clientWidth - (parseFloat(ts.paddingLeft) || 0) - (parseFloat(ts.paddingRight) || 0) : 0;
    return {
      text: (n.textContent || '').trim(),
      px: Math.round(parseFloat(getComputedStyle(n).fontSize)),
      w: Math.round(n.getBoundingClientRect().width),
      headW: Math.round(headW),
      tileW: Math.round(tileW),
      /* Two ways a name can be too big, and both have to be clear: it can overflow the box
         (a nowrap INLINE span just runs out of the tile), or it can fit the box only because
         the browser ellipsised it (scrollWidth past clientWidth on the flex item). */
      over: Math.max(
        Math.round(n.getBoundingClientRect().width - Math.min(headW || Infinity, tileW || Infinity)),
        n.scrollWidth - n.clientWidth
      )
    };
  });

  return {
    names,
    compact: grid.classList.contains('md-board-detail-grid--compact'),
    compactScroll: grid.classList.contains('md-board-detail-grid--compact-scroll'),
    compactRows: grid.style.getPropertyValue('--bd-compact-rows').trim(),
    height: Math.round(parseFloat(gs.height)),
    scrollHeight: grid.scrollHeight,
    overflowY: gs.overflowY,
    /* The tell: `1fr` tracks under a definite height come out all-equal and CANNOT grow
       past their share; the scrolling variant's `minmax(76px, auto)` tracks size to their
       content instead. Serialised as px either way, so compare the SPREAD across tracks
       and the total against the grid's own height. */
    rowTracks: gs.gridTemplateRows.split(' ').map((v) => Math.round(parseFloat(v))).filter((n) => !isNaN(n)),
    groups
  };
};

const run = async () => {
  const { browser, page } = await launch(OPTS);
  let before = null;
  try {
    await page.setViewport({ width: VW, height: VH });
    await login(page, OPTS);

    /* One real board load before reading `before`: straight after login
       `referenced_user.preferences` can still be persistence's cached copy, and restoring
       THAT in the cleanup puts the account into a state it was never in. Same reasoning as
       compact-tiles-qa.mjs. */
    await page.goto(`${OPTS.BASE}/${OPTS.USER}/${PATH}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.md-board-detail-grid__cell', { timeout: 45000 });
    await sleep(6000);

    before = await page.evaluate(async () => {
      const u = window.appState.get('referenced_user');
      const g = u.get('preferences.board_category_grouping') || {};
      const was = { enabled: g.enabled, vertical_scroll: g.vertical_scroll };
      u.set('preferences.board_category_grouping.enabled', true);
      u.set('preferences.board_category_grouping.vertical_scroll', true);
      await u.save();
      return was;
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.md-board-detail-grid__cell', { timeout: 45000 });
    await sleep(6000);

    const s = await page.evaluate(READ);
    if (!s) { fail('precondition — board rendered', 'no grid'); throw new Error('no grid'); }

    if (s.compactScroll) {
      pass('precondition — categorized WITH scrolling is active',
        `--compact-scroll set, --bd-compact-rows=${s.compactRows || '(unset)'}, grid ${s.height}px / scrollHeight ${s.scrollHeight}px, overflow-y:${s.overflowY}`);
    } else {
      fail('precondition — categorized WITH scrolling is active',
        `compact=${s.compact} compact-scroll=${s.compactScroll}; check vertical_scroll saved as true`);
      throw new Error('not compact-scroll');
    }

    /* Rows sized to CONTENT, not to an equal share of a definite height. `minmax(0, 1fr)`
       under a fixed height makes every track identical and unable to grow, which is what
       squeezed the tiles under their own bodies. Content-sized tracks vary. */
    const spread = s.rowTracks.length ? Math.max(...s.rowTracks) - Math.min(...s.rowTracks) : 0;
    const trackSum = s.rowTracks.reduce((a, b) => a + b, 0);
    if (s.rowTracks.length && (spread > 1 || trackSum > s.height)) {
      pass('board rows size to their CONTENT, not to a fixed share of the viewport',
        `${s.rowTracks.length} tracks, spread ${spread}px, total ${trackSum}px vs grid ${s.height}px`);
    } else {
      fail('board rows size to their CONTENT, not to a fixed share of the viewport',
        `${s.rowTracks.length} equal ${s.rowTracks[0]}px tracks totalling ${trackSum}px inside a ${s.height}px grid — these are minmax(0,1fr) rows, so the --compact root rule is still winning height/grid-template-rows`);
    }

    const tiles = s.groups.filter((g) => g.key);
    const spilling = tiles.filter((g) => g.escaped).map((g) => `${g.key}: ${g.escaped}/${g.cells} cells, ${g.spill}px past the bottom (tile ${Math.round(g.rect.h)}px, body ${g.bodyH}px)`);
    if (tiles.length && !spilling.length) {
      pass('every button sits inside its own category background', `${tiles.length} tiles, no cell escapes its tile`);
    } else {
      fail('every button sits inside its own category background',
        spilling.length ? spilling.join('\n        ') : 'no category tiles found at all');
    }

    /* One level in: the tinted frame holds a glass tray, and the tray must stay inside
       the frame's padding box. A tray wider or taller than its frame paints the category
       colour on two edges only and the tray's own corners land on the board. */
    const trayOut = tiles.filter((g) => g.bodyOut && (g.bodyOut.l > 1 || g.bodyOut.r > 1 || g.bodyOut.t > 1 || g.bodyOut.b > 1))
      .map((g) => `${g.key}: tray ${g.bodyOut.w}px in a ${g.bodyOut.gw}px frame, out by l${g.bodyOut.l} r${g.bodyOut.r} t${g.bodyOut.t} b${g.bodyOut.b}`);
    if (tiles.length && !trayOut.length) {
      pass('every group BODY stays inside its group frame', `${tiles.length} trays, all within their frame's padding box`);
    } else {
      fail('every group BODY stays inside its group frame', trayOut.join('\n        ') || 'no category tiles found at all');
    }

    console.log('        headers: ' + s.names.map((n) => `${n.text}=${n.w}px in ${n.headW}/${n.tileW}@${n.px}px`).join(', '));
    /* 9px is utils/label_fit.js's floor (MIN_FONT_PX) and it is deliberate — below it a
       category name is not readable, so an ellipsis is the better failure. A name still over
       its box AT the floor has been shrunk as far as the fitter is allowed to go; a name over
       its box ABOVE the floor means the fit stopped early, which is the real defect. */
    const floored = s.names.filter((n) => n.over > 1 && n.px <= 9);
    const clipped = s.names.filter((n) => n.over > 1 && n.px > 9).map((n) => `${n.text} (${n.px}px, ${n.over}px over)`);
    if (s.names.length && !clipped.length) {
      const shrunk = s.names.filter((n) => n.px < 16).map((n) => `${n.text}@${n.px}px`);
      pass('every category NAME fits its header — shrunk when it has to be',
        `${s.names.length} headers${shrunk.length ? '; shrunk: ' + shrunk.join(', ') : '; none needed shrinking'}` +
        (floored.length ? `; at the 9px floor and still ellipsised: ${floored.map((n) => n.text).join(', ')}` : ''));
    } else if (!s.names.length) {
      fail('every category NAME fits its header — shrunk when it has to be',
        'no headers rendered — turn on preferences.board_category_grouping.show_category_names');
    } else {
      fail('every category NAME fits its header — shrunk when it has to be', clipped.join(', '));
    }

    /* POSITIVE CONTROL for the check above. On most boards every category name already fits
       at 16px, so "none ellipsised" on its own would also pass if the fit never ran at all.
       Force a name that cannot fit, re-run the fit (the component refits on resize, and the
       fit's cache is keyed on the text so changed text always re-measures), and require that
       it came out smaller AND unclipped. */
    const control = await page.evaluate(async () => {
      const el = document.querySelector('.md-board-detail-grid__group-name');
      if (!el) { return null; }
      const was = el.textContent;
      el.textContent = 'EXTRAORDINARILY LONG CATEGORY NAME';
      window.dispatchEvent(new Event('resize'));
      await new Promise((r) => setTimeout(r, 1200));
      const out = {
        px: Math.round(parseFloat(getComputedStyle(el).fontSize)),
        over: el.scrollWidth - el.clientWidth,
        boxW: el.clientWidth
      };
      el.textContent = was;
      return out;
    });
    if (!control) {
      fail('positive control — an over-long name IS shrunk', 'no header to test');
    } else if (control.px < 16 && control.over <= 1) {
      pass('positive control — an over-long name IS shrunk', `34 characters in a ${control.boxW}px header came out at ${control.px}px, unclipped`);
    } else if (control.px === 9 && control.over > 1) {
      pass('positive control — an over-long name IS shrunk', `34 characters in a ${control.boxW}px header hit the 9px floor (${control.over}px still clipped) — the fit ran and bottomed out, which is the documented floor`);
    } else {
      fail('positive control — an over-long name IS shrunk', `still ${control.px}px with ${control.over}px of overflow — the fit did not run on this element`);
    }

    /* GROW BACK. The fit is shrink-only from the CSS size and re-measures from scratch, so a
       label returns to 16px on its own once there is room — but only if it RUNS, and it is
       skipped when the cached signature is unchanged. The header sits in neither a card nor a
       cell, so until the group joined that key its signature was `text|0x0|basePx` — constant
       — and a name shrunk on a narrow board stayed small after the board widened. Narrow the
       viewport, widen it back, and require the sizes to return. */
    const before_px = s.names.map((n) => n.px);
    await page.setViewport({ width: Math.round(VW * 0.62), height: VH });
    await sleep(2500);
    await page.setViewport({ width: VW, height: VH });
    await sleep(2500);
    const after = await page.evaluate(READ);
    const stuck = after.names.map((n, i) => ({ text: n.text, was: before_px[i], now: n.px }))
      .filter((n) => n.now < n.was);
    if (!stuck.length) {
      pass('a label shrunk on a narrow board grows back when the board widens',
        `all ${after.names.length} headers returned to their earlier size after a narrow round trip`);
    } else {
      fail('a label shrunk on a narrow board grows back when the board widens',
        stuck.map((n) => `${n.text} ${n.was}px -> ${n.now}px`).join(', ') + ' — the fit did not re-run, so the cached signature is not tracking the box');
    }

    /* A tile that is shorter than its content does not just spill — the tile BELOW it is
       still placed on the squeezed track, so the two overlap and a button paints over a
       neighbouring category's background. */
    const overlaps = [];
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        const a = tiles[i].rect, b = tiles[j].rect;
        const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
        const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (ox > 1 && oy > 1) { overlaps.push(`${tiles[i].key} x ${tiles[j].key} (${Math.round(ox)}x${Math.round(oy)}px)`); }
      }
    }
    if (!overlaps.length) {
      pass('no two category tiles overlap', `${tiles.length} tiles, all disjoint`);
    } else {
      fail('no two category tiles overlap', overlaps.join(', '));
    }
  } finally {
    if (before) {
      await page.evaluate(async (was) => {
        const u = window.appState.get('referenced_user');
        u.set('preferences.board_category_grouping.enabled', was.enabled);
        u.set('preferences.board_category_grouping.vertical_scroll', was.vertical_scroll);
        await u.save();
      }, before).catch(() => {});
    }
    await browser.close();
  }

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed at ${VW}x${VH}${EDIT ? ' (edit mode)' : ''}`);
  process.exit(failed ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
