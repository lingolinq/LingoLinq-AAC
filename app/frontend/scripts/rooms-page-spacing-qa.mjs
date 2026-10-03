/*
 * The vertical run of the Modern rooms page: what sits where between the nav and the first
 * room card, and how big each gap is.
 *
 * Written for 2026-09-23's "you moved the Rooms content up too far" -- the page TOP is
 * confirmed level with the home page at y=106 (account-pages-top-alignment-qa.mjs), so
 * whatever moved is INSIDE the page, and a single content-start number cannot show it.
 *
 *   node scripts/rooms-page-spacing-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const args = cliArgs(process.argv);
const { browser, page } = await launch(args);
const PATH = args.arg('--rooms', '/organizations/1_27/rooms');

function probe() {
  const px = (v) => Math.round(parseFloat(v) || 0);
  const rows = [];
  const add = (label, sel) => {
    const el = document.querySelector(sel);
    if (!el) { rows.push({ label, missing: true }); return; }
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    rows.push({
      label, top: Math.round(r.y), bottom: Math.round(r.bottom), h: Math.round(r.height),
      mt: px(cs.marginTop), mb: px(cs.marginBottom), pt: px(cs.paddingTop), pb: px(cs.paddingBottom)
    });
  };
  add('nav',        '.ll-appshell__navbar');
  add('hero',       '.md-hero--org');
  add('switcher',   '.ch-org-switcher');
  add('main',       '.md-main--org');
  add('stats-main', '.md-stats-main');
  add('divider',    '.md-stats-main > .md-org-report-divider');
  add('grid',       '.md-rooms__grid');
  add('first card', '.md-room-card');
  return rows;
}

await login(page, args);
await page.goto(args.BASE + PATH, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
const rows = await page.evaluate(probe);
console.log('\nModern rooms page — vertical run at 1280\n');
console.log('element        top   bottom     h    margin(t/b)  padding(t/b)');
console.log('-'.repeat(66));
let prevBottom = null;
for (const r of rows) {
  if (r.missing) { console.log(r.label.padEnd(13) + '  (not rendered)'); continue; }
  const gap = prevBottom == null ? '' : '   gap above: ' + (r.top - prevBottom) + 'px';
  console.log(
    r.label.padEnd(13) + String(r.top).padStart(5) + String(r.bottom).padStart(8) +
    String(r.h).padStart(7) + ('  ' + r.mt + '/' + r.mb).padStart(13) +
    ('  ' + r.pt + '/' + r.pb).padStart(13) + gap);
  if (r.label !== 'switcher') { prevBottom = r.bottom; }
}
await browser.close();
