#!/usr/bin/env node
/**
 * Behavioural probe: does the board-picker guided tour arm its flag?
 *
 * `tour-board-picker.js` USED TO declare two `init` keys; in a JS object
 * literal the last wins, so the first never ran and
 * `this.set('appState.tour_board_picker_active', true)` never executed. That
 * flag is what makes a card tap inside the tour open the board PREVIEW (CTA
 * "Pick this Board") instead of navigating the user away to Speak Mode and
 * abandoning the tour — see board-icon.js and board-preview.js#tour_pick. The
 * only other writer that sets it TRUE is board-preview-overlay.js
 * #_handlePickError, an error path, so nothing compensated on the normal open.
 * Merged 2026-08-11; this probe is the regression guard.
 *
 * Run from app/frontend under Node 22 with the dev stack up:
 *   node scripts/tour-board-picker-probe.mjs
 *   node scripts/tour-board-picker-probe.mjs --headed
 *
 * Exit 0 when the flag behaves, 1 if a probe fails, 2 on harness error.
 */
/* eslint-env node */
import { cliArgs, launch, login, assertAppReady } from './qa-helpers.mjs';

const opts = cliArgs(process.argv);

function record(name, pass, detail) {
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  return pass;
}

async function main() {
  // launch() INSIDE the try with a single close in finally: previously a
  // failing launch left the rejection unhandled and the Chromium child
  // outliving Node, and Node exits 1 for that — indistinguishable from the
  // documented "bug is present" exit code.
  let browser;
  let allPass = true;
  try {
    const launched = await launch(opts);
    browser = launched.browser;
    const page = launched.page;
    await login(page, opts);
    await assertAppReady(page);

    const readFlag = () => page.evaluate(() => {
      const svc = window.modal._getService();
      const app = svc && svc.get('appState');
      return app ? !!app.get('tour_board_picker_active') : 'no appState';
    });

    const before = await readFlag();
    allPass = allPass & record('flag starts false', before === false, `got ${before}`);

    /*
     * `modal.open()` returns an RSVP promise that settles only when the modal
     * CLOSES, and page.evaluate awaits whatever the function returns — so
     * returning it deadlocks until protocolTimeout. Swallow it and return a
     * plain value instead.
     */
    await page.evaluate(() => { window.modal.open('tour-board-picker'); return true; });
    const appeared = await page.waitForSelector('.modal', { timeout: 8000 })
      .then(() => true).catch(() => false);
    allPass = allPass & record('tour modal renders', appeared);

    const during = await readFlag();
    allPass = allPass & record(
      'tour_board_picker_active is TRUE while the tour is open',
      during === true,
      `got ${during} — false means the dead first init() never ran, so a card tap ` +
      'inside the tour navigates away instead of opening the preview'
    );

    await page.evaluate(() => { window.modal.close(); return true; });
    await new Promise((r) => setTimeout(r, 500));
    const after = await readFlag();
    allPass = allPass & record('flag cleared after close', after === false, `got ${after}`);
  } catch (e) {
    console.error('\nPROBE ERROR:', e.message);
    process.exitCode = 2;
    return;
  } finally {
    if (browser) { await browser.close().catch(() => {}); }
  }
  console.log(allPass ? '\nAll probes passed.' : '\nProbe FAILED — bug is present.');
  process.exitCode = allPass ? 0 : 1;
}

main().catch((e) => {
  console.error('\nPROBE ERROR:', e && e.message ? e.message : e);
  process.exit(2);
});
