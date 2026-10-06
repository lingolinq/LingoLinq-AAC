/*
 * Focused home: do the small action buttons' icon glyphs (Create a Board, Edit Dashboard, and
 * on an org dashboard My Caseload / Speak Mode) reach 3:1 against their slate icon tile?
 *
 * Written for the PR #1108 follow-up: the glyphs measured about 2:1 on the slate tile. The
 * icon is aria-hidden and the title names the action, so this is a legibility target rather
 * than a WCAG 1.4.11 failure, but 3:1 is the threshold that criterion uses for graphics.
 *
 * Reads the glyph's computed `stroke` with its computed `filter: brightness()` applied, and the
 * tile's computed background colour, then computes the WCAG contrast ratio. Computed colours,
 * not pixels: a 1.5px stroke antialiases, so on screen the edges read a little lower.
 * Exit code 1 if any visible glyph is under --min (default 3).
 *
 *   node scripts/focused-action-glyph-contrast-qa.mjs --user example --pass password
 */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const args = cliArgs(process.argv);
const MIN = Number(args.arg('--min', '3'));
const { browser, page } = await launch(args);
let failed = 0;

try {
  await login(page, args);
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(args.BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.md-grid--layout-focused .md-card--create-board', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));
  const rows = await page.evaluate(() => {
    const rgb = s => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    return Array.from(document.querySelectorAll('.md-grid--layout-focused > .md-card.md-card--badge-action.md-card--as-button'))
      .filter(c => c.getBoundingClientRect().height > 0)
      .map(c => {
        const icon = c.querySelector('.md-card__icon');
        const glyph = icon.querySelector('svg');
        const gcs = getComputedStyle(glyph);
        const m = /brightness\(([\d.]+)\)/.exec(gcs.filter || '');
        const k = m ? Number(m[1]) : 1;
        const stroke = rgb(gcs.stroke).map(v => Math.min(255, Math.round(v * k)));
        const tile = rgb(getComputedStyle(icon).backgroundColor);
        return { name: (c.className.match(/md-card--(create-board|edit-dashboard|caseload-action|speak-action|account|reports)/) || [])[1],
          stroke: stroke.join(','), filter: gcs.filter, tile: tile.join(','), ratio: Math.round(ratio(stroke, tile) * 100) / 100 };
      });
  });
  for (const r of rows) {
    const ok = r.ratio >= MIN;
    if (!ok) { failed++; }
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(r.name).padEnd(15)} ${r.ratio}:1  glyph rgb(${r.stroke}) [filter ${r.filter}] on tile rgb(${r.tile})`);
  }
  if (!rows.length) { failed++; console.log('FAIL  no visible action cards'); }
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} FAIL` : '\nall PASS');
process.exit(failed ? 1 : 0);
