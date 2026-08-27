/**
 * Repro probe: does the board-detail Back button appear after opening a folder
 * while category grouping is ON?
 *
 * Reported: with categories turned on, tapping a folder navigates to the
 * sub-board but the Back control never renders.
 *
 * The probe walks several variants of the SAME folder tap and reports, for each,
 * the post-navigation board key, the length of `appState.board_detail_nav_history`,
 * and whether each Back control (sentence-row + header) is in the DOM, visible and
 * inside the viewport. That separates "history never got pushed" from "history is
 * there but the button is hidden or off-screen".
 *
 * Usage:
 *   node scripts/back-button-categories-qa.mjs --user <u> --pass <p> [--headed]
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = OPTS.arg('--shot-dir', '/tmp/claude-1000/-home-tracid-LingoLinq-AAC/d151f20e-60a6-4452-943d-09e53081e4dc/scratchpad/') ;

const STATE = () => {
  const box = (el) => {
    if (!el) { return null; }
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
      inView: r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth,
      /* The real "is it showing" test: getClientRects() is true for an element that is
         fully painted OVER by the grid. Ask the document what is actually on top at the
         control's centre and report it when it is not the control (or its own child). */
      occludedBy: (function() {
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (!top) { return 'nothing (outside viewport)'; }
        if (el === top || el.contains(top)) { return null; }
        return top.className && top.className.baseVal !== undefined
          ? '<svg> ' + top.className.baseVal
          : (top.tagName.toLowerCase() + '.' + String(top.className || '').split(' ').slice(0, 3).join('.'));
      })()
    };
  };
  const as = window.appState;
  const grid = document.querySelector('.md-board-detail-grid');
  const row = document.querySelector('.md-board-detail-sentence-row');
  return {
    url: window.location.pathname,
    speak: !!(as && as.get('speak_mode')),
    historyLen: (as && (as.get('board_detail_nav_history') || []).length),
    rowBack: box(document.querySelector('.md-board-detail-nav-stack__back')),
    headerBack: box(document.querySelector('.md-board-detail-nav-btns .md-board-detail-nav-btn')),
    home: box(document.querySelector('.md-board-detail-nav-stack .md-board-detail-home-btn')),
    row: box(row),
    /* --compact is the live grouping marker; --grouped is keyed on the hardcoded-false
       `panelLayout` and is emitted by nothing. */
    grouped: !!(grid && grid.classList.contains('md-board-detail-grid--compact')),
    compact: !!(grid && grid.classList.contains('md-board-detail-grid--compact')),
    compactScroll: !!(grid && grid.classList.contains('md-board-detail-grid--compact-scroll')),
    folders: document.querySelectorAll('.md-board-detail-grid__cell--folder').length
  };
};

/* Writes the SAME shape the Categorize switch writes (controller#_save_category_grouping):
   top-level default plus, when `boardId` is given, the per-board override that
   `board_category_settings` prefers. Without the override a board that already carries one
   ignores the default entirely. */
async function setGrouping(page, on, opts) {
  return page.evaluate(async (enabled, o) => {
    const as = window.appState;
    const u = as.get('referenced_user') || as.get('currentUser');
    const prefs = Object.assign({}, u.get('preferences'));
    /* ACCOUNT-WIDE, three flags. `board_category_grouping` no longer carries an `order`
       key or a per-board `boards` map — category order/layout is a property of the BOARD,
       and the server drops both on save. Setting the flags here turns grouping on for
       EVERY board on the account, not just the one under test, and does not restore it. */
    prefs.board_category_grouping = {
      enabled: enabled,
      show_category_names: o.names,
      vertical_scroll: o.scroll
    };
    u.set('preferences', prefs);
    await u.save();
    return JSON.stringify(u.get('preferences.board_category_grouping'));
  }, on, opts);
}

async function tapFolder(page, useTab, match) {
  return page.evaluate((tab, m) => {
    const cells = [...document.querySelectorAll('.md-board-detail-grid__cell--folder')];
    const cell = m
      ? cells.find((c) => (c.textContent || '').toLowerCase().includes(m))
      : cells[0];
    if (!cell) { return null; }
    const target = tab ? cell.querySelector('.md-folder-tab')
      : cell.querySelector('.md-board-detail-symbol-card');
    if (!target) { return null; }
    const label = (cell.querySelector('.md-board-detail-symbol-card')
      || {}).ariaLabel || cell.textContent.trim().slice(0, 24);
    target.click();
    return label;
  }, useTab, match || null);
}

async function scenario(page, cfg) {
  console.log(`\n=== ${cfg.label} ===`);
  await page.setViewport({ width: cfg.w || 1280, height: cfg.h || 900 });
  await page.goto(OPTS.BASE + cfg.home, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.md-board-detail-grid', { timeout: 30000 });
  await sleep(1500);

  const boardId = await page.evaluate(() => {
    const g = document.querySelector('.md-board-detail-grid');
    return g && g.getAttribute('data-id');
  });
  const written = await setGrouping(page, cfg.grouping,
    { names: cfg.names !== false, scroll: cfg.scroll !== false, boardId: boardId });
  console.log('  prefs:', written);
  await sleep(2500);

  /* The OTHER meaning of "categories turned on": the speak-page Categories reveal
     panel + its filter chips (controller#set_category), which is a different feature
     from the Categorize GROUPING preference above. */
  if (cfg.filter) {
    await page.evaluate((cat) => {
      const c = window.appState.get('controller');
      const bd = c && c.get('target') ? null : null;
      // The board-detail controller owns both actions; reach it through the router.
      const owner = window.LingoLinq && window.LingoLinq.__container__;
      const ctrl = owner
        ? owner.lookup('controller:user/board-detail')
        : null;
      if (!ctrl) { return 'no controller'; }
      ctrl.set('show_categories', true);
      ctrl.send('set_category', cat);
      return ctrl.get('active_category');
    }, cfg.filter);
    await sleep(1200);
  }

  if (cfg.speak) {
    await page.evaluate(() => { window.appState.set('speak_mode', true); });
    await sleep(1500);
  }

  const before = await page.evaluate(STATE);
  console.log('  before:', JSON.stringify(before));
  if (!before.folders) { console.log('  !! no folders — cannot probe'); return; }

  const tapped = await tapFolder(page, cfg.tab, cfg.match);
  console.log('  tapped:', tapped, cfg.tab ? '(folder tab)' : '(front card)');
  await sleep(4000);
  console.log('  after: ', JSON.stringify(await page.evaluate(STATE)));
  if (cfg.shot) {
    await page.screenshot({ path: cfg.shot });
    console.log('  screenshot ->', cfg.shot);
  }

  if (cfg.second) {
    const t2 = await tapFolder(page, false);
    console.log('  tapped 2nd level:', t2);
    await sleep(4000);
    console.log('  after2:', JSON.stringify(await page.evaluate(STATE)));
  }
}

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  try {
    await login(page, OPTS);
    const home = await page.evaluate(() => {
      const as = window.appState;
      const h = as.get('currentUser.preferences.home_board');
      if (!h || !h.key) { return null; }
      const parts = h.key.split('/');
      return '/' + parts[0] + '/board-detail/' + parts.slice(1).join('/');
    });
    if (!home) { throw new Error('no home board set for this user'); }
    console.log('home board path:', home);

    await scenario(page, { label: 'B: categories ON (global + per-board)', home, grouping: true, scroll: true, second: true, shot: SHOT + 'back-' + OPTS.USER + '.png' });
  } catch (e) {
    console.log('ERROR:', e.message, e.stack);
  } finally {
    await browser.close();
  }
})();
