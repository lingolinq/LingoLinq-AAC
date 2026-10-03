/* Do the Extras page's setup-card icon tiles render the SAME surface as the dashboard's
 * badge-action tiles in Focused View? Both now read `$focus-icon-tile-*` from
 * _variables.scss; before 2026-09-21 the Extras copy was a drifted opaque hand-copy.
 * Extras must be reached by CLICKING -- a direct goto hits the home-board redirect.
 *   node scripts/extras-icon-tile-qa.mjs --user lingolinq_admin --pass 'admin2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';
import { mkdirSync } from 'fs';
const args = cliArgs(process.argv);
const BASE = args.arg('--base', 'http://localhost:8184');
const USER = args.arg('--user', 'lingolinq_admin');
const PASS = args.arg('--pass', 'admin2025!');
const OUT  = args.arg('--out', '/tmp/shots');
mkdirSync(OUT, { recursive: true });
const { browser, page } = await launch(args);

const read = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) { return null; }
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return { backgroundImage: cs.backgroundImage, border: cs.border,
           boxShadow: cs.boxShadow, backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
           size: Math.round(r.width) + 'x' + Math.round(r.height) };
}, sel);

await page.setViewport({ width: 1440, height: 1000 });
await login(page, { BASE, USER, PASS });
await page.goto(`${BASE}/${USER}/home`, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
const dash = await read('.md-card--create-board .md-card__icon');
console.log('DASHBOARD badge-action tile:\n', JSON.stringify(dash, null, 2));

for (const el of await page.$$('.md-pillnav__pill')) {
  const t = await page.evaluate((e) => (e.textContent || '').trim(), el);
  if (/^Extras$/i.test(t)) { await el.click(); break; }
}
await new Promise((r) => setTimeout(r, 3200));
const extras = await read('.md-extras-card__icon-wrap');
console.log('\nEXTRAS setup-card tile:\n', JSON.stringify(extras, null, 2));

console.log('\n=== MATCH ===');
if (!extras) { console.log('extras tile NOT FOUND — page may not have rendered'); }
else {
  for (const k of ['backgroundImage', 'border', 'boxShadow', 'backdrop']) {
    const same = dash && dash[k] === extras[k];
    console.log(`  ${k}: ${same ? 'IDENTICAL' : 'DIFFERENT'}`);
    if (!same && dash) { console.log(`     dash:   ${String(dash[k]).slice(0, 110)}`);
                          console.log(`     extras: ${String(extras[k]).slice(0, 110)}`); }
  }
  const card = await page.$('.md-extras-card');
  if (card) { await card.screenshot({ path: `${OUT}/extras-card.png` }); console.log(`shot: ${OUT}/extras-card.png`); }
}
await browser.close();
