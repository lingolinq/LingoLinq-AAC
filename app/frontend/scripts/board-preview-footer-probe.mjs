#!/usr/bin/env node
/**
 * Behavioural probe: does the board-preview footer render the RIGHT actions for
 * each context that opens it?
 *
 * board-preview.hbs has a three-way footer (lines 66/85/92):
 *
 *   pick_for_home_mode  -> dismiss + optional Back to List + "Pick this Board"
 *   return_only         -> "Close" ONLY
 *   otherwise           -> Back / Cancel / Copy For... + "Try This Board"
 *
 * The branch is chosen from flags the CALLER sets, and each caller sets them a
 * different way — which is exactly where this has broken before:
 *
 *   * tour  -> appState.tour_board_picker_active (tour-board-picker.js)
 *   * recommend -> opts.recommend, threaded utils/modal#board_preview ->
 *     services/modal -> board-preview-overlay.hbs:59 -> @recommend. This was
 *     threaded but read by NOTHING until pick_for_home_mode started consuming
 *     it, so the eval report's "Preview & choose for <user>" card rendered the
 *     ordinary footer and its CTA could not do what it said.
 *   * return -> board.preview_option = 'return' (button-settings.js:1392), read
 *     back at modal.js:569 through an expression whose `||` binds tighter than
 *     the `?:` around it. That line is load-bearing for this context.
 *
 * The unit specs (tests/unit/components/board-preview-pick-mode-test.js) pin the
 * pick_for_home_mode DECISION given flags; they do not pin the rendered markup,
 * and they do not exercise the caller-side flag plumbing above. This probe does
 * both, against the running dev stack.
 *
 * Run from app/frontend under Node 22 with the dev stack up:
 *   node scripts/board-preview-footer-probe.mjs --user marcus_williams_slp --pass 'demo2025!'
 *   node scripts/board-preview-footer-probe.mjs --headed --board someuser/some-board
 *
 * Exit 0 when every context renders its expected footer, 1 if a probe fails,
 * 2 on harness error.
 */
/* eslint-env node */
import { cliArgs, launch, login, assertAppReady } from './qa-helpers.mjs';

const opts = cliArgs(process.argv);
const BOARD = opts.arg('--board', null);

function record(name, pass, detail) {
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  return !!pass;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * Read the footer as the user sees it. Returns the trimmed label of every
 * button inside .md-board-preview__actions, or a string describing why there
 * was nothing to read — never null, so a FAIL always carries a reason.
 */
async function footerLabels(page) {
  return page.evaluate(() => {
    const row = document.querySelector('.md-board-preview__actions');
    if (!row) {
      return document.querySelector('.md-board-details-modal')
        ? 'overlay open but no .md-board-preview__actions (board-preview did not render)'
        : 'no board-preview overlay on the page';
    }
    return Array.from(row.querySelectorAll('button'))
      .map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length);
  });
}

/*
 * Open the preview the same way the product does — utils/modal#board_preview,
 * which delegates to the modal SERVICE. Any throw inside is returned as a
 * string rather than rejecting, so a caller-side crash (e.g. the modal.js:569
 * precedence trap firing on a plain-object board) is reported as a FAIL with
 * its message instead of aborting the run.
 */
async function openPreview(page, { key, previewOption, recommend, remove, plainBoard }) {
  const err = await page.evaluate(async (key, previewOption, recommend, remove, plainBoard) => {
    try {
      window.__probeRemoveFired = false;
      /* plainBoard: a bare object with no .get, which is what utils/modal.js:569
         used to choke on when it also carried a truthy preview_option. The
         overlay already supports this shape (board-preview-overlay.js:96 reads
         `board.get ? board.get('key') : board.key`). */
      const board = plainBoard
        ? { key: key, preview_locale: null }
        : await window.LingoLinq.store.findRecord('board', key);
      // Mirror the callers exactly: preview_option is assigned as a PLAIN
      // property on the record (button-settings.js:1392, board-icon.js:318/399),
      // not via .set().
      if (previewOption) { board.preview_option = previewOption; }
      else if (!plainBoard) { delete board.preview_option; }
      /* board-icon.js:330-340 shape. The callback is a closure bound in
         available-boards-section.hbs; here it just records that it ran. */
      board.preview_remove = remove
        ? {
          type: 'delete',
          label: 'Delete Board',
          icon: 'glyphicon glyphicon-trash',
          callback: function() { window.__probeRemoveFired = true; }
        }
        : null;
      const locale = board.get ? (board.get('preview_locale') || board.get('locale')) : board.preview_locale;
      if (recommend) {
        // utils/recommended_home_board.js:94
        window.modal.board_preview(board, locale, false, null, { recommend: true });
      } else if (previewOption === 'return') {
        // button-settings.js:1394
        window.modal.board_preview(board, locale, false, null);
      } else {
        // board-icon.js:346
        window.modal.board_preview(board, locale, false, function() {});
      }
      return null;
    } catch (e) { return 'threw: ' + (e && e.message ? e.message : String(e)); }
  }, key, previewOption || null, !!recommend, !!remove, !!plainBoard);
  if (err) { return err; }
  const appeared = await page
    .waitForSelector('.md-board-preview__actions', { timeout: 15000 })
    .then(() => null)
    .catch(() => 'footer never rendered within 15s');
  if (appeared) { return appeared; }
  // The footer paints before the board model resolves; give the branch flags a
  // render tick to settle so we assert the final state, not an interim one.
  await sleep(600);
  return null;
}

async function closePreview(page) {
  await page.evaluate(() => { window.modal.close_board_preview(); return true; });
  await page
    .waitForFunction(() => !document.querySelector('.md-board-preview__actions'), { timeout: 8000 })
    .catch(() => {});
  await sleep(300);
}

function setTourFlag(page, value) {
  return page.evaluate((value) => {
    const app = window.modal._getService().get('appState');
    app.set('tour_board_picker_active', value);
    return !!app.get('tour_board_picker_active');
  }, value);
}

/*
 * expect: { has: [...labels that MUST appear], hasNot: [...], exact: n|null }
 */
function check(name, labels, expect) {
  if (typeof labels === 'string') { return record(name, false, labels); }
  const shown = labels.join(' | ') || '(no buttons)';
  for (const want of expect.has || []) {
    if (!labels.includes(want)) {
      return record(name, false, `missing "${want}" — footer showed: ${shown}`);
    }
  }
  for (const nope of expect.hasNot || []) {
    if (labels.includes(nope)) {
      return record(name, false, `unexpected "${nope}" — footer showed: ${shown}`);
    }
  }
  if (expect.exact != null && labels.length !== expect.exact) {
    return record(name, false, `expected exactly ${expect.exact} button(s), got ${labels.length}: ${shown}`);
  }
  return record(name, true, shown);
}

async function main() {
  let browser;
  let allPass = true;
  const pass = (v) => { allPass = allPass && v; };

  try {
    const launched = await launch(opts);
    browser = launched.browser;
    const page = launched.page;
    page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

    await login(page, opts);
    await assertAppReady(page);

    // Pick a board to preview: --board wins, else the signed-in user's first.
    const key = BOARD || await page.evaluate(async () => {
      const list = await window.LingoLinq.store.query('board', { user_id: 'self', per_page: 5 });
      const arr = list.toArray ? list.toArray() : Array.from(list);
      const rec = arr.find((b) => b.get('key'));
      return rec ? rec.get('key') : null;
    });
    if (!key) { throw new Error('no board found to preview — pass --board <user/board-key>'); }
    console.log(`Previewing board: ${key}\n`);

    // Every context below assumes the tour flag is OFF unless it turns it on.
    const flag = await setTourFlag(page, false);
    pass(record('precondition: tour_board_picker_active is false', flag === false, `got ${flag}`));

    // ---- Context 1: library / board-list preview (board-icon.js:346) --------
    let err = await openPreview(page, { key });
    pass(check('library preview -> "Try This Board"', err || await footerLabels(page), {
      has: ['Try This Board'],
      hasNot: ['Pick this Board', 'Back to Picker', 'Close']
    }));
    await closePreview(page);

    // ---- Context 2: board-picker TOUR (board-icon.js:416 -> flag) ----------
    // Set the flag through the real tour modal so this also covers
    // tour-board-picker.js arming it, not just the computed reading it.
    await page.evaluate(() => { window.modal.open('tour-board-picker'); return true; });
    await page.waitForSelector('.modal', { timeout: 8000 }).catch(() => {});
    await sleep(400);
    const tourArmed = await page.evaluate(() =>
      !!window.modal._getService().get('appState').get('tour_board_picker_active'));
    pass(record('tour modal arms tour_board_picker_active', tourArmed === true, `got ${tourArmed}`));

    err = await openPreview(page, { key });
    pass(check('board-picker tour -> "Back to Picker" + "Pick this Board"', err || await footerLabels(page), {
      has: ['Back to Picker', 'Pick this Board'],
      hasNot: ['Try This Board', 'Cancel']
    }));
    await closePreview(page);
    await page.evaluate(() => { window.modal.close(); return true; });
    await sleep(400);
    await setTourFlag(page, false);

    // ---- Context 3: button-settings Preview (button-settings.js:1392) ------
    // preview_option='return' has to survive modal.js:569 to reach @option.
    err = await openPreview(page, { key, previewOption: 'return' });
    pass(check('button-settings preview -> "Close" only', err || await footerLabels(page), {
      has: ['Close'],
      hasNot: ['Try This Board', 'Pick this Board', 'Back to Picker', 'Copy For...'],
      exact: 1
    }));
    await closePreview(page);

    // ---- Context 4: eval report recommended board (recommended_home_board.js:94)
    // Same ASSIGN footer as the tour, but dismiss reads "Cancel" — there is no
    // picker behind it to go back to (board-preview.js#dismiss_label).
    err = await openPreview(page, { key, recommend: true });
    pass(check('recommended preview -> "Cancel" + "Pick this Board"', err || await footerLabels(page), {
      has: ['Cancel', 'Pick this Board'],
      hasNot: ['Back to Picker', 'Try This Board']
    }));
    await closePreview(page);

    // ---- Context 5: PLAIN-OBJECT board carrying preview_option ------------
    // Regression guard for the modal.js:569 precedence trap. `||` binds tighter
    // than `?:`, so the old expression evaluated `board.get('preview_option')`
    // whenever preview_option was truthy — including for boards with no .get,
    // which threw TypeError and opened nothing at all.
    err = await openPreview(page, { key, previewOption: 'return', plainBoard: true });
    pass(check('plain-object board + preview_option does not throw', err || await footerLabels(page), {
      has: ['Close'],
      exact: 1
    }));
    await closePreview(page);

    // ---- Context 6: contextual remove reaches the footer -------------------
    // board.preview_remove -> utils/modal.js:564,572 -> services/modal.js
    // _openBoardPreview -> board-preview-overlay.hbs @removeContext. The service
    // used to drop it, so this button never rendered on any surface.
    err = await openPreview(page, { key, remove: true });
    const withRemove = err || await footerLabels(page);
    pass(check('remove context renders the contextual remove button', withRemove, {
      has: ['Delete Board', 'Try This Board']
    }));

    // ...and it has to actually DO something: fire the tile's callback and
    // close the preview. A rendered-but-inert button is the same bug again.
    if (typeof withRemove !== 'string') {
      const clicked = await page.evaluate(() => {
        const btn = document.querySelector('.md-board-preview__action--remove');
        if (!btn) { return 'no .md-board-preview__action--remove in the DOM'; }
        btn.click();
        return null;
      });
      await sleep(600);
      const fired = await page.evaluate(() => !!window.__probeRemoveFired);
      const closed = await page.evaluate(() => !document.querySelector('.md-board-preview__actions'));
      pass(record('remove button fires the tile callback', clicked ? false : fired,
        clicked || `callback fired: ${fired}`));
      pass(record('remove button closes the preview first', closed,
        `preview still open: ${!closed}`));
    }
    await closePreview(page);
  } catch (e) {
    console.error('\nPROBE ERROR:', e && e.message ? e.message : e);
    process.exitCode = 2;
    return;
  } finally {
    if (browser) { await browser.close().catch(() => {}); }
  }

  console.log(allPass ? '\nAll footer contexts correct.' : '\nProbe FAILED — see above.');
  process.exitCode = allPass ? 0 : 1;
}

main().catch((e) => {
  console.error('\nPROBE ERROR:', e && e.message ? e.message : e);
  process.exit(2);
});
