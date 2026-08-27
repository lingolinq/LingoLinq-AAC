/**
 * Repro probe #2 for the missing speak-page Back button.
 *
 * Probe #1 (back-button-categories-qa.mjs) set the grouping PREFERENCE and reloaded
 * the page before tapping a folder, and Back rendered every time. This probe drives
 * the real SEQUENCE instead — one page session, no reloads, using the same
 * `toggle_categorize` action the Categorize switch fires — because the report is
 * "it disappears as soon as categories are turned on and the user clicks into a
 * folder", and a reload between the two steps is exactly what a real user does not do.
 *
 * Two orders, because "disappears" could mean either:
 *   S1  home -> toggle categorize ON -> tap folder      (does Back fail to appear?)
 *   S2  home -> tap folder (Back appears) -> toggle ON  (does Back vanish in place?)
 *
 * Usage:
 *   node scripts/back-button-categorize-sequence-qa.mjs --user <u> --pass <p> [--headed]
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STATE = () => {
  const box = (el) => {
    if (!el) { return null; }
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x) };
  };
  const as = window.appState;
  const grid = document.querySelector('.md-board-detail-grid');
  return {
    board: (window.location.pathname.split('/board-detail/')[1] || '?'),
    hist: (as && (as.get('board_detail_nav_history') || []).length),
    back: box(document.querySelector('.md-board-detail-nav-stack__back')),
    home: box(document.querySelector('.md-board-detail-nav-stack .md-board-detail-home-btn')),
    compact: !!(grid && grid.classList.contains('md-board-detail-grid--compact')),
    folders: document.querySelectorAll('.md-board-detail-grid__cell--folder').length
  };
};

/* Reaching the board-detail controller from page context. `window.LingoLinq.__container__`
   does NOT exist on this build (it resolves to undefined and every send() is a silent
   no-op — which is how the first run of this probe reported "no controller"). The AMD
   loader is exposed though, so go through Ember's own getOwner off the application
   controller that app_state already holds. */
const CTRL_SRC = `(function(){
  var Ember = window.require('ember').default;
  var owner = Ember.getOwner(window.appState.get('controller'));
  return owner && owner.lookup('controller:user/board-detail');
})()`;

async function show(page, tag) {
  const s = await page.evaluate(STATE);
  console.log(`  ${tag.padEnd(26)} board=${s.board} hist=${s.hist} compact=${s.compact} ` +
    `folders=${s.folders} BACK=${s.back ? s.back.w + 'x' + s.back.h : 'ABSENT'} ` +
    `home=${s.home ? s.home.w + 'x' + s.home.h : 'ABSENT'}`);
  return s;
}

/* The real switch action, not a hand-written preference write. Returns the resolved
   per-board value so the log shows the toggle actually landed. */
async function toggleCategorize(page) {
  const r = await page.evaluate(`(function(){
    var c = ${CTRL_SRC};
    if (!c) { return 'no controller'; }
    c.send('toggle_categorize');
    return 'sent';
  })()`);
  await sleep(4000);
  const resolved = await page.evaluate(`(function(){
    var c = ${CTRL_SRC};
    return c ? String(c.get('categorize_enabled')) + '/grouping_active=' + String(c.get('grouping_active')) : '?';
  })()`);
  return r + ' -> categorize_enabled=' + resolved;
}

async function tapFolder(page) {
  const label = await page.evaluate(() => {
    const cell = document.querySelector('.md-board-detail-grid__cell--folder');
    const card = cell && cell.querySelector('.md-board-detail-symbol-card');
    if (!card) { return null; }
    card.click();
    return (card.getAttribute('aria-label') || '').trim();
  });
  await sleep(4500);
  return label;
}

async function goHome(page, home) {
  await page.goto(OPTS.BASE + home, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.md-board-detail-grid', { timeout: 30000 });
  await sleep(2500);
}

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  try {
    await login(page, OPTS);
    const home = await page.evaluate(() => {
      const h = window.appState.get('currentUser.preferences.home_board');
      if (!h || !h.key) { return null; }
      const parts = h.key.split('/');
      return '/' + parts[0] + '/board-detail/' + parts.slice(1).join('/');
    });
    if (!home) { throw new Error('no home board set'); }
    console.log('home:', home);

    // Baseline: make sure grouping starts OFF on every board this run touches.
    await goHome(page, home);
    /* PRESERVE `boards`. This used to assign a literal `boards: {}`, which is a wholesale
       replacement, not a baseline reset — it destroyed every curated per-board category
       arrangement on the account, with no restore anywhere in this file. That is real data
       loss on a shared dev/demo account, and it silently invalidated the setup that
       `category-pref-scope-qa.mjs` tells you to seed first.
       Only the TOP-LEVEL default needs to start OFF for this probe; the per-board map is
       carried through untouched. */
    await page.evaluate(async () => {
      const u = window.appState.get('referenced_user') || window.appState.get('currentUser');
      const p = Object.assign({}, u.get('preferences'));
      const prev = p.board_category_grouping || {};
      p.board_category_grouping = {
        enabled: false,
        order: [],
        show_category_names: true,
        vertical_scroll: true,
        boards: (prev.boards && typeof prev.boards === 'object') ? prev.boards : {}
      };
      u.set('preferences', p);
      if (!u.get('preferences.device')) { u.set('preferences.device', {}); }
      u.set('preferences.device.updated', true);
      await u.save();
    });
    await sleep(2000);

    console.log('\n=== S1: home -> toggle categorize ON -> tap folder -> tap folder ===');
    await goHome(page, home);
    await show(page, 'on home (grouping off)');
    console.log('  toggle:', await toggleCategorize(page));
    await show(page, 'after toggle ON');
    console.log('  tapped:', await tapFolder(page));
    await show(page, 'on sub-board');
    console.log('  tapped:', await tapFolder(page));
    await show(page, 'on sub-sub-board');

    console.log('\n=== S2: home -> tap folder (Back appears) -> toggle categorize ON ===');
    await goHome(page, home);
    await show(page, 'on home');
    console.log('  tapped:', await tapFolder(page));
    await show(page, 'on sub-board');
    console.log('  toggle:', await toggleCategorize(page));
    await show(page, 'after toggle ON');
    console.log('  tapped:', await tapFolder(page));
    await show(page, 'on sub-sub-board');
  } catch (e) {
    console.log('ERROR:', e.message, e.stack);
  } finally {
    await browser.close();
  }
})();
