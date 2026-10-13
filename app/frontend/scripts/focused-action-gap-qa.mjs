/*
 * Focused home: is the icon -> text gap on the small action buttons (Create a Board, Edit
 * Dashboard, and on an org dashboard My Caseload / Speak Mode) the same at every width?
 *
 * Written for the PR #1108 follow-up: between 461 and 640px a shared rule gave every action
 * card's head `gap: 28px`, while Focused uses 12px above 640px and at <=460px. Measures the
 * computed `column-gap` on each visible card's `.md-card__head` and the rendered distance
 * from the icon tile's right edge to the text's left edge.
 *
 * PASS when every visible badge-action card measures the expected gap at every width.
 * Exit code 1 on any FAIL.
 *
 *   node scripts/focused-action-gap-qa.mjs --user example --pass password
 *   node scripts/focused-action-gap-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const args = cliArgs(process.argv);
const EXPECTED = Number(args.arg('--gap', '12'));
const WIDTHS = [1400, 900, 641, 640, 600, 500, 461, 460, 400];
const { browser, page } = await launch(args);
let failed = 0;

try {
  await login(page, args);
  await page.goto(args.BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.md-grid--layout-focused .md-card--create-board', { timeout: 30000 });
  for (const w of WIDTHS) {
    await page.setViewport({ width: w, height: 900 });
    await new Promise(r => setTimeout(r, 700));
    const cards = await page.evaluate(() => Array.from(document.querySelectorAll('.md-grid--layout-focused > .md-card.md-card--badge-action.md-card--as-button'))
      .filter(c => c.getBoundingClientRect().height > 0)
      .map(c => {
        const head = c.querySelector('.md-card__head');
        const icon = head.querySelector('.md-card__icon');
        const text = head.querySelector('.md-card__titles');
        return {
          name: (c.className.match(/md-card--(create-board|edit-dashboard|caseload-action|speak-action|account|reports)/) || [])[1],
          css: parseFloat(getComputedStyle(head).columnGap),
          px: Math.round(text.getBoundingClientRect().left - icon.getBoundingClientRect().right)
        };
      }));
    for (const c of cards) {
      const ok = c.css === EXPECTED && c.px === EXPECTED;
      if (!ok) { failed++; }
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(w).padStart(4)}px  ${String(c.name).padEnd(15)} gap css=${c.css}px rendered=${c.px}px (expected ${EXPECTED})`);
    }
    if (!cards.length) { failed++; console.log(`FAIL  ${w}px  no visible action cards`); }
  }
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} FAIL` : '\nall PASS');
process.exit(failed ? 1 : 0);
