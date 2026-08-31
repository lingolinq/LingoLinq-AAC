/*
 * Does the caseload goal/badge bottom row FIT at narrow widths?
 *
 * It was `display:none` at <=480px because the nowrap "+ Add goal" chip overflowed the
 * card. Showing it again is only correct if it no longer overflows — this measures that
 * directly (scrollWidth vs clientWidth) rather than trusting the CSS.
 */
import { cliArgs, launch, login } from './qa-helpers.mjs';
const args = cliArgs(process.argv);
const { browser, page } = await launch(args);
try {
  await login(page, args);
  await page.goto(args.BASE + '/caseload', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.md-caseload__list', { timeout: 30000 });
  // The bottom row lives inside the EXPANDED panel (same reason the tour's badge/goal
  // steps are `expand: true`), so open the first roster row before measuring.
  await page.click('.md-caseload__list-trigger').catch(() => {});
  await page.waitForSelector('.md-caseload__card', { timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 700));
  for (const w of [480, 430, 375, 320]) {
    await page.setViewport({ width: w, height: 900 });
    await new Promise(r => setTimeout(r, 500));
    const out = await page.evaluate(() => {
      const row = document.querySelector('.md-caseload__bottom-row');
      const card = document.querySelector('.md-caseload__list-item, .md-caseload__card') ||
                   (row && row.closest('li,article,div'));
      const cs = row ? getComputedStyle(row) : null;
      const overflow = [];
      document.querySelectorAll('.md-caseload__bottom-row, .md-caseload__goal-row, .md-caseload__goal, .md-caseload__goal-add')
        .forEach(el => { if (el.scrollWidth > el.clientWidth + 1) overflow.push(el.className.split(' ')[0] + ` (${el.scrollWidth}>${el.clientWidth})`); });
      return {
        rowShown: !!(cs && cs.display !== 'none'),
        rowW: row ? Math.round(row.getBoundingClientRect().width) : null,
        cardW: card ? Math.round(card.getBoundingClientRect().width) : null,
        docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        overflowing: overflow
      };
    });
    console.log(`${String(w).padStart(4)}px  shown:${String(out.rowShown).padEnd(5)} row:${String(out.rowW).padStart(4)}  page-h-scroll:${out.docOverflow}  overflowing:${out.overflowing.length ? out.overflowing.join(', ') : 'none'}`);
  }
} finally { await browser.close(); }
