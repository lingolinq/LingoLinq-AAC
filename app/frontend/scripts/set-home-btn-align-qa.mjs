/**
 * "Set / Change Home Board" alignment across breakpoints.
 *
 * Three tiers govern it: the base rule pins right with `margin-left: auto`; a ≤768px rule
 * used to re-centre it with symmetric auto margins; and at ≤640px the header becomes a
 * COLUMN, where the cross axis is horizontal and `align-self` — not margin — decides.
 * Both were changed to right-align, and they have to agree: a centred `align-self` would
 * beat the right-pinned margin on the narrow tier only.
 *
 * Reports the gap from the button's right edge to its container's right edge. Small and
 * even = right-aligned; large and roughly equal on both sides = centred.
 *
 * Usage:  node scripts/set-home-btn-align-qa.mjs --user <u> --pass <p>
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MEASURE = () => {
  const b = document.querySelector('.ub-boards-page__set-home-btn');
  if (!b) { return { none: true }; }
  const p = b.parentElement;
  const br = b.getBoundingClientRect();
  const pr = p.getBoundingClientRect();
  const cs = getComputedStyle(b);
  const left = Math.round(br.left - pr.left);
  const right = Math.round(pr.right - br.right);
  return {
    label: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 22),
    leftGap: left, rightGap: right,
    verdict: Math.abs(left - right) < 12 ? 'CENTRED' : (right < left ? 'right-aligned' : 'left-aligned'),
    align_self: cs.alignSelf, ml: cs.marginLeft, mr: cs.marginRight,
    parent_dir: getComputedStyle(p).flexDirection || '(not flex)'
  };
};

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  try {
    await login(page, OPTS);
    await page.goto(`${OPTS.BASE}/${OPTS.USER}/boards`, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(6000);
    for (const w of [1200, 900, 760, 700, 640, 560, 480]) {
      await page.setViewport({ width: w, height: 900 });
      await sleep(1400);
      const m = await page.evaluate(MEASURE);
      if (m.none) { console.log(`  ${String(w).padStart(4)}px  button not rendered`); continue; }
      console.log(`  ${String(w).padStart(4)}px  ${m.verdict.padEnd(14)} leftGap=${String(m.leftGap).padStart(5)} rightGap=${String(m.rightGap).padStart(4)}  align-self=${m.align_self.padEnd(10)} margin=${m.ml}/${m.mr}  parent=${m.parent_dir}`);
    }
  } finally { await browser.close(); }
})();
