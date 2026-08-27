/**
 * Caseload quick-action: why does one communicator show "No board" instead of "Choose Board"?
 *
 * The template branches (caseload.hbs:157):
 *   resolved_home_board_key      -> "Model"
 *   else modeling_only === true  -> "No board"   (muted, no action)
 *   else                         -> "Choose Board"
 *
 * `resolved_home_board_key` is built by caseload.js#resolveSuperviseeHomeBoardKey from four
 * candidate fields on the SUPERVISEE PAYLOAD. This dumps all of them per communicator, so a
 * missing field is visible rather than inferred.
 *
 * Usage:  node scripts/caseload-home-board-qa.mjs --user <supervisor> --pass <p>
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  try {
    await login(page, OPTS);
    await page.goto(`${OPTS.BASE}/caseload`, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(7000);
    /* Read the RENDERED rows. `LingoLinq.__container__` is not exposed here, and the
       rendered quick-action is the thing being reported anyway. */
    const rows = await page.evaluate(() => {
      return [...document.querySelectorAll('.md-caseload__list-row, [class*="caseload__list"]')]
        .map((row) => {
          const name = (row.querySelector('[class*="name"]') || {}).textContent || '';
          const q = row.querySelector('.md-caseload__quick-action');
          const label = (row.querySelector('.md-caseload__quick-label') || {}).textContent || '';
          const kind = q ? (q.className.match(/quick-action--(\w+)/) || [])[1] : null;
          return { name: name.replace(/\s+/g, ' ').trim().slice(0, 22), label: label.trim(), kind };
        })
        .filter((r) => r.name && r.kind);
    });
    console.log(`rows with a quick action: ${rows.length}`);
    rows.forEach((r) => console.log(`  ${r.name.padEnd(22)} ${String(r.kind).padEnd(14)} "${r.label}"`));
  } finally { await browser.close(); }
})();
