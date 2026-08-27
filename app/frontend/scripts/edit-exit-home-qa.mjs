/**
 * "Exit to Home" on the board-detail EDIT page: does it confirm only when there is
 * something to lose?
 *
 * `exit_to_home_from_edit` used to open confirm-discard-changes unconditionally. It now
 * skips straight to `exit_to_home` when `edit_session_has_changes` is false — and that
 * computed is assembled from every vector `cancel_edit` rolls back, not just the undo stack,
 * because a board RECOLOUR never enters the undo stack (it is what turns undo off).
 *
 * Drives the real link and watches for the real modal, in both directions:
 *   B. a pending change  -> the confirm must still appear, and the page must NOT navigate
 *   C. nothing pending   -> no confirm, and the browser must land on the home page
 *
 * Usage:
 *   node scripts/edit-exit-home-qa.mjs --user <u> --pass <p> --board <slug>
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const BOARD = OPTS.arg('--board', null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STATE = () => {
  const c = window.editManager && window.editManager.controller;
  return {
    has_controller: !!c,
    noUndo: c ? c.get('noUndo') : '(n/a)',
    recolored: c ? !!c.get('board_recolored') : '(n/a)',
    borders: c ? !!c.get('borders_matched') : '(n/a)',
    dirty: c ? !!c.get('model.hasDirtyAttributes') : '(n/a)',
    /* WHICH attributes — `hasDirtyAttributes` came back true on a freshly opened editor
       before any user action, so the flag alone cannot mean "the user changed something". */
    baseline: (function() {
      try { var b = c && c.get('_edit_dirty_baseline'); return b ? Object.keys(b).join(',') : '(none)'; }
      catch (e) { return '(err)'; }
    })(),
    changed: (function() {
      try {
        var m = c && c.get('model');
        return m && m.changedAttributes ? Object.keys(m.changedAttributes()).join(',') : '(n/a)';
      } catch (e) { return '(err)'; }
    })(),
    has_changes: c ? c.edit_session_has_changes() : '(n/a)',
    modal_open: !!document.querySelector('.md-modal-title'),
    modal_title: (document.querySelector('.md-modal-title') || {}).textContent || '',
    path: window.location.pathname
  };
};

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  try {
    await login(page, OPTS);
    await page.goto(`${OPTS.BASE}/${OPTS.USER}/board-detail/${BOARD}/edit`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('[data-bd-action="exit_to_home_from_edit"]', { timeout: 30000 });
    await sleep(2500);
    let s = await page.evaluate(STATE);
    console.log(`A. on the edit page (${s.path})`);
    console.log(`   noUndo=${s.noUndo} recolored=${s.recolored} borders=${s.borders} dirty=${s.dirty} -> has_changes=${s.has_changes}`);
    console.log(`   changedAttributes on open: [${s.changed}]   baseline: [${s.baseline}]`);

    // B. with a pending change, the confirm must still appear
    await page.evaluate(() => { window.editManager.controller.set('board_recolored', true); });
    await sleep(400);
    await page.evaluate(() => { document.querySelector('[data-bd-action="exit_to_home_from_edit"]').click(); });
    await sleep(2000);
    s = await page.evaluate(STATE);
    console.log(`B. with a pending recolour -> has_changes=${s.has_changes}`);
    console.log(`   confirm shown: ${s.modal_open} ("${s.modal_title.trim()}")   still on: ${s.path}`);

    // close it and clear the change
    await page.evaluate(() => {
      const close = document.querySelector('.la-modal-close');
      if (close) { close.click(); }
    });
    await sleep(1200);
    await page.evaluate(() => { window.editManager.controller.set('board_recolored', false); });
    await sleep(400);

    // C. nothing pending -> straight home
    s = await page.evaluate(STATE);
    console.log(`C. cleared -> has_changes=${s.has_changes}  (modal closed: ${!s.modal_open})`);
    await page.evaluate(() => { document.querySelector('[data-bd-action="exit_to_home_from_edit"]').click(); });
    await sleep(4000);
    s = await page.evaluate(STATE);
    console.log(`   confirm shown: ${s.modal_open}   landed on: ${s.path}`);
  } finally { await browser.close(); }
})();
