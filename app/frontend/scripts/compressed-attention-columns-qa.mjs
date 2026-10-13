/*
 * Compressed + Focused home: does the Communicators Need Attention list use the same number of
 * columns as the Rooms card directly below it?
 *
 * Written for the PR #1108 follow-up: in Compressed the attention list kept Focused's 260px
 * track (3 columns at 1400px, 2 at 800px) while Compressed Rooms falls back to the base 360px
 * track (2 at 1400px, 1 at 800px), so the two cards' columns did not line up.
 *
 * Compressed is switched on IN MEMORY ONLY (the `compressed_view` feature flag and preference on
 * the loaded user record, never saved), the same two values app-state reads to stamp
 * `body.ll-density-compressed`. Needs a Focused supervisor with rooms and communicators needing
 * attention (the seeded marcus_williams_slp).
 *
 * PASS when the two grids report the same column count at every width. Exit code 1 on any FAIL.
 *
 *   node scripts/compressed-attention-columns-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const args = cliArgs(process.argv);
const WIDTHS = [1400, 1200, 1024, 900, 800, 769, 768, 640, 400];
const { browser, page } = await launch(args);
let failed = 0;

try {
  await login(page, args);
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(args.BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.md-grid--layout-focused .md-card--attention .md-attention__list', { timeout: 30000 });
  await page.evaluate(() => {
    const u = window.LingoLinq.appState.get('currentUser');
    if (!u.get('feature_flags')) { u.set('feature_flags', {}); }
    u.set('feature_flags.compressed_view', true);
    u.set('preferences.compressed_view', true);
  });
  await page.waitForFunction(() => document.body.classList.contains('ll-density-compressed'), { timeout: 15000 })
    .catch(() => { throw new Error('Compressed did not switch on (body.ll-density-compressed missing)'); });
  await new Promise(r => setTimeout(r, 1500));

  for (const w of WIDTHS) {
    await page.setViewport({ width: w, height: 900 });
    await new Promise(r => setTimeout(r, 700));
    const m = await page.evaluate(() => {
      const cols = el => el ? getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length : null;
      return {
        attention: cols(document.querySelector('.md-card--attention .md-attention__list')),
        rooms: cols(document.querySelector('.md-card--rooms .md-rooms__grid'))
      };
    });
    const ok = m.attention !== null && m.attention === m.rooms;
    if (!ok) { failed++; }
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(w).padStart(4)}px  attention ${m.attention} col(s), rooms ${m.rooms} col(s)`);
  }
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} FAIL` : '\nall PASS');
process.exit(failed ? 1 : 0);
