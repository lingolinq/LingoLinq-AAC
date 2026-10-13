// Browser check: on the Basic board in Speak mode, a long label keeps the same size as every other
// label (2026-10-02, requested: shrink-to-fit option A, "verify that is only the case on the
// board-alt page").
//
// Labels on labelled buttons stopped shrinking on 2026-09-15 (utils/button.js, "same word, same size
// on every button"; long labels clip at one line, `.button span.button-label` in app.scss), but only
// in the browsing renderer. Speak mode on the Basic board renders through models/board.js
// render_fast_html (edit_manager.process_for_displaying: speak_mode && !board-detail), which still
// scaled long labels down to 8px. Text-only buttons are fitted to their tile by design and skipped.
//
// Passes when, in Speak mode, no labelled button's label carries an inline font-size and every
// visible label renders at one size. The window is narrowed so some labels are too long to fit.
// DATA: the user's view preference is switched and restored. Localhost only.
// Usage: node scripts/speak-label-size-qa.mjs [--user example --pass password] [--width 700] [--headed]

import { cliArgs, launch, login } from './qa-helpers.mjs';

const { BASE, USER, PASS, HEADED, arg } = cliArgs(process.argv);
const WIDTH = parseInt(arg('--width', '700'), 10);
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`REFUSING: --base must be localhost, got ${BASE}`); process.exit(2);
}
const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const getView = (page) => page.evaluate(() => window.appState.get('currentUser.preferences.board_view_style'));
const setView = (page, v) => page.evaluate(async (style) => { const u = window.appState.get('currentUser'); u.set('preferences.board_view_style', style); await u.save(); }, v);

const { browser, page } = await launch({ HEADED });
let original = null;
try {
  await login(page, { BASE, USER, PASS });
  await page.setViewport({ width: WIDTH, height: 800 });
  original = await getView(page);
  await setView(page, 'classic');
  const home = await page.evaluate(() => window.appState.get('currentUser.preferences.home_board.key'));
  if (!home) { throw new Error(`${USER} has no home board`); }
  await page.goto(`${BASE}/${home}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(3000);
  await page.evaluate(() => window.appState.home_in_speak_mode());
  await wait(6000);
  const r = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('.board .button:not(.empty) span.button-label')].filter((s) => s.getClientRects().length && s.textContent.trim());
    const labelled = spans.filter((s) => !s.closest('.button').classList.contains('text_only'));
    const inline = labelled.filter((s) => /font-size/.test(s.getAttribute('style') || ''));
    const sizes = [...new Set(labelled.map((s) => getComputedStyle(s).fontSize))];
    const clipped = labelled.filter((s) => s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent.trim());
    return { route: window.appState.get('current_route'), speak: !!window.appState.get('speak_mode'), labelled: labelled.length, inline: inline.map((s) => `${s.textContent.trim()} (${s.getAttribute('style')})`), sizes, clipped };
  });
  console.log(`  ${JSON.stringify(r)}`);
  record('on the Basic board in Speak mode', r.speak && /^user\.board-alt/.test(r.route || '') && r.labelled > 0, `${r.route}, ${r.labelled} labels`);
  record('no labelled button shrinks its label', r.inline.length === 0, r.inline.slice(0, 4).join('; '));
  record('every label renders at one size', r.sizes.length === 1, r.sizes.join(', '));
} catch (e) {
  console.error('  harness error:', e && e.message);
  results.push({ name: 'harness', pass: false });
} finally {
  if (original) {
    await page.evaluate(() => window.appState.get('speak_mode') && window.appState.toggle_mode('speak')).catch(() => {});
    await setView(page, original).catch(() => {});
    record(`${USER}'s view restored`, (await getView(page).catch(() => null)) === original, original);
  }
  await browser.close();
}
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} passed / ${failed} failed`);
if (!results.length) { console.log('NO CHECKS RAN, treating as a failure.'); process.exit(1); }
process.exit(failed ? 1 : 0);
