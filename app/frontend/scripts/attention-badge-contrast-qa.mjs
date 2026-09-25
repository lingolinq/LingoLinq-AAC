/*
 * Real-pixel contrast for the Communicators Need Attention status badges (Modern, Focused).
 *
 * These pills are alpha 0.12-0.18 over rows that are white radial gradients over the dark slate
 * card, so nothing short of a rendered pixel tells the truth about what the text sits on --
 * see the note in scripts/qa-pixels.mjs for the measurement that got this wrong first time.
 *
 *   node scripts/attention-badge-contrast-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';
import { decodePng, contrast } from './qa-pixels.mjs';

const args = cliArgs(process.argv);
const { browser, page } = await launch(args);
await login(page, args);
await page.goto(args.BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2400));
await page.evaluate(() => document.querySelector('.md-card--attention')?.scrollIntoView({ block: 'start' }));
await new Promise((r) => setTimeout(r, 900));

const badges = await page.evaluate(() => {
  const seen = new Set(); const out = [];
  for (const el of document.querySelectorAll('.md-card--attention .md-attention-item__status')) {
    const c = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (seen.has(c.color) || r.width < 8 || r.y < 0 || r.bottom > window.innerHeight) { continue; }
    seen.add(c.color);
    out.push({ text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30), color: c.color,
      size: parseFloat(c.fontSize), weight: Number(c.fontWeight) || 400,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height } });
  }
  return out;
});

const img = decodePng(await page.screenshot());
const parse = (s) => { const n = (s.match(/[\d.]+/g) || []).map(Number); return { r: n[0], g: n[1], b: n[2] }; };
console.log('\nATTENTION BADGES — contrast against the pixels actually painted behind them\n');
for (const b of badges) {
  /* SAMPLE THE PILL'S FILL STRIP, NOT ITS WHOLE BOX. The first attempt took the most common
     pixel in the box and got the TEXT back: the labels are 700-weight and cover more of the
     pill than any single shade of a gradient fill does. A 4px band just inside the top border
     is past the rounded corners' antialiasing and above the glyphs, so it is fill only. */
  const fg = parse(b.color);
  const x0 = Math.round(b.rect.x + 8), x1 = Math.round(b.rect.x + b.rect.width - 8);
  const y0 = Math.round(b.rect.y + 3), y1 = Math.round(b.rect.y + 7);
  let worst = Infinity, best = 0, worstPx = null;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const px = img.at(x, y);
      const c = contrast(fg, px);
      if (c < worst) { worst = c; worstPx = px; }
      if (c > best) { best = c; }
    }
  }
  const large = b.size >= 24 || (b.size >= 18.66 && b.weight >= 700);
  const need = large ? 3 : 4.5;
  /* THE WORST PIXEL IS THE VERDICT. The fill is a gradient, so the text has to stay legible at
     its least favourable point, not on average. */
  console.log('"' + b.text.padEnd(30) + '" ' + b.color.padEnd(19) +
    ' worst bg rgb(' + worstPx.r + ',' + worstPx.g + ',' + worstPx.b + ')  ' +
    worst.toFixed(2) + ':1 (best ' + best.toFixed(2) + ')  ' +
    (worst >= need ? 'PASS' : 'FAIL (needs ' + need + ')'));
}
await browser.close();
