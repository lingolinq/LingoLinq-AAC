/**
 * EDIT mode, categorised board: the grid runs edge to edge.
 *
 * The categorised board is the widest thing on the edit page and the page chrome around it
 * is sized for a form, not for a board. This probe measures the horizontal chain —
 * layout → main → sidebar wrap → grid — and asserts that in a category view neither <main>
 * nor the grid keeps side padding, that the grid ends flush with <main> (a 12px bleed past it
 * was built and then removed on request), and that the outer tiles keep their rings without
 * the page picking up a horizontal scrollbar.
 *
 * Usage (from app/frontend, Node 22):
 *   node scripts/edit-grid-bleed-qa.mjs --user marcus_williams_slp --pass 'demo2025!' [--scroll]
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const BOARD = OPTS.arg('--board', 'vocal-flair-112');
const VW = parseInt(OPTS.arg('--width', '1280'), 10);
const VH = parseInt(OPTS.arg('--height', '750'), 10);
/* Both category views share the chrome, so both are worth a run: --scroll picks the
   scrolling one, the default is the non-scrolling (compact) one. */
const SCROLL = process.argv.includes('--scroll');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const pass = (n, d) => { results.push(true); console.log(`  PASS  ${n}\n        ${d}`); };
const fail = (n, d) => { results.push(false); console.log(`  FAIL  ${n}\n        ${d}`); };

const READ = () => {
  const pick = (sel) => document.querySelector(sel);
  const read = (sel) => {
    const el = pick(sel);
    if (!el) { return null; }
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width),
      pl: Math.round(parseFloat(s.paddingLeft) || 0), pr: Math.round(parseFloat(s.paddingRight) || 0),
      ml: Math.round(parseFloat(s.marginLeft) || 0), mr: Math.round(parseFloat(s.marginRight) || 0),
      ox: s.overflowX, oy: s.overflowY
    };
  };
  const grid = pick('.md-board-detail-main .md-board-detail-grid');
  const tiles = [...document.querySelectorAll('.md-board-detail-grid__group')].filter((g) => /__group--/.test(g.className));
  const ring = grid ? parseFloat(getComputedStyle(grid).getPropertyValue('--bd-ring')) || 0 : 0;
  /* `overflow-clip-margin` is what lets a ring paint outside the grid's padding box now that
     the side padding is gone, so the ring budget is the clear space PLUS that margin. */
  const clipMargin = grid ? (parseFloat(getComputedStyle(grid).overflowClipMargin) || 0) : 0;
  return {
    compact: !!grid && grid.classList.contains('md-board-detail-grid--compact'),
    compactScroll: !!grid && grid.classList.contains('md-board-detail-grid--compact-scroll'),
    ring, clipMargin,
    layout: read('.md-board-detail-layout'),
    /* The edit rails FLOAT over the centre column in this layout
       (`… :not(--collapsed) { grid-template-columns: 1fr !important }`), so a board that
       bleeds sideways can end up UNDER them. Their rects decide how far the bleed may go. */
    /* EDIT mode's own rails: the Action Panel on the left and the Settings Panel on the
       right (`.md-board-detail-sidebar` / `.md-board-detail-right-panel` are the SPEAK-mode
       pair and are 0-width here — measuring those reads every board as clear). */
    leftRail: read('.md-board-edit-panel'),
    rightRail: read('.md-board-edit-right-panel'),
    collapsed: !!document.querySelector('.md-board-detail-layout--collapsed'),
    main: read('.md-board-detail-main'),
    wrap: read('.md-board-detail-grid-sidebar-wrap'),
    grid: read('.md-board-detail-main .md-board-detail-grid'),
    /* The outermost tile edges, ring included — what actually has to stay on screen. */
    tileL: tiles.length ? Math.round(Math.min(...tiles.map((t) => t.getBoundingClientRect().left))) : null,
    tileR: tiles.length ? Math.round(Math.max(...tiles.map((t) => t.getBoundingClientRect().right))) : null,
    docScrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth
  };
};

const run = async () => {
  const { browser, page } = await launch(OPTS);
  let before = null;
  try {
    await page.setViewport({ width: VW, height: VH });
    await login(page, OPTS);

    await page.goto(`${OPTS.BASE}/${OPTS.USER}/board-detail/${BOARD}/edit`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.md-board-detail-grid__cell', { timeout: 45000 });
    await sleep(6000);

    before = await page.evaluate(async (scroll) => {
      const u = window.appState.get('referenced_user');
      const g = u.get('preferences.board_category_grouping') || {};
      const was = { enabled: g.enabled, vertical_scroll: g.vertical_scroll };
      u.set('preferences.board_category_grouping.enabled', true);
      u.set('preferences.board_category_grouping.vertical_scroll', scroll);
      await u.save();
      return was;
    }, SCROLL);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.md-board-detail-grid__cell', { timeout: 45000 });
    await sleep(6000);

    const shot = OPTS.arg('--shot', null);
    if (shot) { await page.screenshot({ path: shot }); console.log(`  (screenshot: ${shot})`); }

    const s = await page.evaluate(READ);
    if (!s.grid) { fail('precondition — edit board rendered', 'no grid'); throw new Error('no grid'); }
    if (s.compactScroll === SCROLL) {
      pass(`precondition — edit mode, category view (${SCROLL ? 'scrolling' : 'non-scrolling'})`,
        `main ${s.main.w}px (pad ${s.main.pl}/${s.main.pr}), wrap ${s.wrap.w}px (pad ${s.wrap.pl}/${s.wrap.pr}), grid ${s.grid.w}px (pad ${s.grid.pl}/${s.grid.pr}, margin ${s.grid.ml}/${s.grid.mr}) in a ${s.innerW}px viewport`);
    } else {
      fail('precondition — edit mode, category view', `compact=${s.compact} compact-scroll=${s.compactScroll}`);
      throw new Error('wrong mode');
    }

    if (s.grid.pl === 0 && s.grid.pr === 0) {
      pass('the grid keeps no side padding of its own', 'padding-left / padding-right both 0');
    } else {
      fail('the grid keeps no side padding of its own', `padding-left ${s.grid.pl}px, padding-right ${s.grid.pr}px`);
    }

    if (s.main.pl === 0 && s.main.pr === 0) {
      pass('<main> keeps no side padding in a category view', 'padding-left / padding-right both 0');
    } else {
      fail('<main> keeps no side padding in a category view', `padding-left ${s.main.pl}px, padding-right ${s.main.pr}px`);
    }

    /* The board ends FLUSH with <main>. A 12px bleed past it was built and then removed on
       request, so this asserts the absence: same edges, neither inset by leftover padding nor
       hanging outside on a stray negative margin. */
    const outL = s.main.l - s.grid.l;
    const outR = s.grid.r - s.main.r;
    if (outL === 0 && outR === 0) {
      pass('the grid ends flush with <main> on both sides', `same left and right edges (board ${s.grid.w}px of a ${s.innerW}px viewport)`);
    } else {
      fail('the grid ends flush with <main> on both sides', `left ${outL}px, right ${outR}px past <main> — negative means still inset, positive means it bleeds out`);
    }

    /* Bleeding out must not cost the outer tiles their ring, and must not put the page on a
       horizontal scrollbar — the grid clips at its own padding box, and `overflow-y` other
       than visible forces `overflow-x` to compute to auto. */
    const ringL = s.tileL - s.grid.l;
    const ringR = s.grid.r - s.tileR;
    if (ringL + s.clipMargin >= s.ring - 1 && ringR + s.clipMargin >= s.ring - 1) {
      pass('the outer tiles keep their ring', `${ringL}px / ${ringR}px clear plus a ${s.clipMargin}px clip margin, for a ${s.ring}px ring`);
    } else {
      fail('the outer tiles keep their ring', `${ringL}px / ${ringR}px clear plus a ${s.clipMargin}px clip margin is short of the ${s.ring}px ring — the outer rings are sheared at the grid's clip box`);
    }

    /* Nothing the board draws may sit under a rail — a hidden button is worse than a
       narrower board. The bleed is exactly the edit layout's 12px column gap (app.scss:
       `.md-shell--board-detail-edit .md-board-detail-layout … { gap: 12px }`), so the board's
       edge lands ON the rail's edge whatever width the rail currently has — collapsed at
       68px or expanded to its 15%/225px. This check is what proves that claim per run. */
    const railL = s.leftRail && s.leftRail.w ? s.leftRail.r : 0;
    const railR = s.rightRail && s.rightRail.w ? s.rightRail.l : s.innerW;
    const underL = railL - s.tileL;
    const underR = s.tileR - railR;
    if (underL <= 0 && underR <= 0) {
      pass('no part of the board sits under a rail',
        `rails ${s.collapsed ? '(collapsed) ' : ''}end at ${railL}px / start at ${railR}px; board spans ${s.tileL}-${s.tileR}px`);
    } else {
      fail('no part of the board sits under a rail',
        `${underL > 0 ? underL + 'px under the left rail' : ''}${underL > 0 && underR > 0 ? ', ' : ''}${underR > 0 ? underR + 'px under the right rail' : ''} (board ${s.tileL}-${s.tileR}px, rails ${railL}/${railR})`);
    }

    if (s.docScrollW <= s.innerW + 1) {
      pass('no horizontal scrollbar', `document scrollWidth ${s.docScrollW}px vs viewport ${s.innerW}px`);
    } else {
      fail('no horizontal scrollbar', `document scrollWidth ${s.docScrollW}px overflows the ${s.innerW}px viewport`);
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
  console.log(`\n${results.length - failed}/${results.length} passed at ${VW}x${VH} (${SCROLL ? 'scrolling' : 'non-scrolling'})`);
  process.exit(failed ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
