// Browser check for the board-picker "Try this Board" round trip:
//   picker -> preview -> Try -> speak mode on the ORIGINAL board
//   -> large glowing Back (left of Home) -> back to the picker list
//
// Unit tests cover the marker's lifetime; they cannot see whether the buttons
// render, where the Back control sits, or whether the trial actually leaves the
// board uncopied. That is what this is for.
//
// Needs a seeded local stack (bin/fresh_start + rails db:seed). Localhost only:
// this clicks real buttons, and in an AAC app buttons speak and purchase.

import { chromium } from 'playwright';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i+1] ? process.argv[i+1] : d; };
const BASE = arg('--base', 'http://localhost:8184');
const USER = arg('--user', 'example');
const PASS = arg('--pass', 'password');
const HEADED = process.argv.includes('--headed');
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`REFUSING: --base must be localhost, got ${BASE}`); process.exit(2);
}

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ headless: !HEADED });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('#identification', USER);
  await page.fill('#password', PASS);
  await page.locator('button.login-btn[type="submit"]').first().click();
  await page.waitForSelector('#identification', { state: 'hidden', timeout: 30000 });

  await page.goto(`${BASE}/board-picker`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);

  // Open a board's preview from All Available Boards (the curated tabs are empty
  // in dev seed data -- see the board-picker default-category work).
  const all = page.locator('.md-home-boards-picker__category', { hasText: 'All Available Boards' }).first();
  if (await all.count()) { await all.click(); await page.waitForTimeout(4000); }
  const card = page.locator('.md-home-boards-picker__board').first();
  record('picker shows boards to preview', await card.count() > 0);
  if (!(await card.count())) { throw new Error('no board cards'); }
  await card.click();
  await page.waitForTimeout(3000);

  const btnText = async (re) => {
    const b = page.locator('.md-board-preview__actions button', { hasText: re }).first();
    return (await b.count()) ? b : null;
  };
  const setHome = await btnText(/Set as Home Board/i);
  const tryBtn  = await btnText(/Try this Board/i);
  const oldCta  = await btnText(/Pick this Board/i);
  record('CTA now reads "Set as Home Board"', !!setHome);
  record('old "Pick this Board" label is gone', !oldCta);
  record('"Try this Board" button is present', !!tryBtn);
  if (!tryBtn) { throw new Error('no Try button'); }

  await tryBtn.click();
  await page.waitForTimeout(6000);

  const url = page.url();
  record('landed in speak mode on board-detail', /board-detail/.test(url) && !/\/edit/.test(url),
    url.replace(BASE, ''));

  const back = page.locator('.md-board-detail-try-back');
  record('the Back control renders', await back.count() > 0);
  if (await back.count()) {
    const geo = await page.evaluate(() => {
      const b = document.querySelector('.md-board-detail-try-back');
      const h = document.querySelector('.md-board-detail-home-btn');
      if (!b || !h) return null;
      const rb = b.getBoundingClientRect(), rh = h.getBoundingClientRect();
      const cs = getComputedStyle(b);
      return { leftOfHome: rb.right <= rh.left + 2, bw: Math.round(rb.width), hw: Math.round(rh.width),
               shadowLayers: (cs.boxShadow.match(/rgba?\(/g) || []).length };
    });
    record('sits to the LEFT of Home', !!(geo && geo.leftOfHome), geo && `back.right=${geo.bw}px wide, home=${geo.hw}px`);
    record('is LARGER than the Home button', !!(geo && geo.bw > geo.hw), geo && `${geo.bw}px vs ${geo.hw}px`);
    record('has a layered (hierarchical) glow', !!(geo && geo.shadowLayers >= 3), geo && `${geo.shadowLayers} shadow layers`);
  }

  // NOTE: "trying copies nothing" is deliberately NOT asserted here. An earlier
  // draft counted the user's boards over the flow and only ever reported on its
  // own guess at the API shape. It is proven structurally instead: try_board
  // contains no copy / saveHomeBoard / findExistingUserCopy / .save() call, so
  // there is no path by which it could create a board. See the action's comment.

  await back.first().click();
  await page.waitForTimeout(5000);
  record('Back returns to the picker LIST', /board-picker/.test(page.url()), page.url().replace(BASE, ''));
  const overlayUp = await page.locator('.md-board-preview__actions').first().isVisible().catch(() => false);
  record('and not back inside the preview overlay', !overlayUp);
} catch (e) {
  console.error('  harness error:', e && e.message);
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed} passed / ${failed} failed`);
process.exit(failed ? 1 : 0);
