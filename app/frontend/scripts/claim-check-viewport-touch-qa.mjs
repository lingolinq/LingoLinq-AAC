#!/usr/bin/env node
/**
 * Viewport + touch matrix for the D1 and D10 fixes.
 *
 * The single-viewport pass (claim-check-d1-d2-d10-qa.mjs, 1440x900, mouse) left
 * two gaps called out in its own writeup: nothing below the `@media (max-width:
 * 720px)` breakpoint, and no touch input at all. For an AAC product touch is the
 * primary input, so a fix verified only with a synthetic mouse click is only
 * half verified.
 *
 * Checks per viewport:
 *   D10 — tab renders, is not page-centred, covers no interactive control, is
 *         on-screen, wins the hit-test at its own centre, and still toggles.
 *   D1  — options menu opens, Set as Home + Make a Copy reachable, by TAP where
 *         the context has touch.
 *   A11y — tap-target size against WCAG 2.5.8 (AA, 24x24) and 2.5.5 (AAA, 44x44).
 *
 * Run from app/frontend:
 *   node scripts/claim-check-viewport-touch-qa.mjs
 *   node scripts/claim-check-viewport-touch-qa.mjs --only "iPhone 12"
 */
import { chromium } from 'playwright';

const arg = (n, d) => process.argv.find((a, i) => process.argv[i - 1] === n) || d;
const BASE = arg('--base', 'http://localhost:8184');
const USER = arg('--user', 'example');
const PASS = arg('--pass', 'password');
const ONLY = arg('--only', null);
const BOARD = arg('--board', 'lingolinq/keyboard');

// 720 is the breakpoint in app.scss; straddle it deliberately.
const VIEWPORTS = [
  { name: 'desktop 1920',   width: 1920, height: 1080, touch: false },
  { name: 'desktop 1440',   width: 1440, height: 900,  touch: false },
  { name: 'laptop 1280',    width: 1280, height: 800,  touch: false },
  { name: 'small 1024',     width: 1024, height: 768,  touch: false },
  { name: 'iPad 820 touch', width: 820,  height: 1180, touch: true },
  { name: 'narrow 712 touch', width: 712, height: 1138, touch: true },  // BELOW the 720 breakpoint
  { name: 'iPhone 390 touch', width: 390, height: 844,  touch: true },
];

const rows = [];
function row(vp, area, id, pass, detail) {
  rows.push({ vp: vp.name, area, id, pass, detail });
  const mark = pass === true ? 'PASS' : pass === false ? 'FAIL' : 'N/A ';
  console.log(`  [${mark}] ${area}/${id}: ${detail}`);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('#identification', USER);
  await page.fill('#password', PASS);
  await page.locator('button.login-btn[type="submit"], form button[type="submit"]').first().click();
  await page.waitForTimeout(2500);
  const trust = page.locator('button.login-btn--device').first();
  if (await trust.isVisible({ timeout: 2500 }).catch(() => false)) { await trust.click(); await page.waitForTimeout(1500); }
  await page.waitForTimeout(1500);
}

// Use a real tap where the context supports touch, a click otherwise.
async function activate(page, locator, touch) {
  if (touch) { await locator.tap({ timeout: 6000 }); } else { await locator.click({ timeout: 6000 }); }
}

async function dismissPortraitOverlay(page) {
  const btn = page.locator('button[data-bd-action="dismiss_portrait_overlay"]').first();
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.click().catch(() => {});
    await page.waitForTimeout(1500);
    return true;
  }
  return false;
}

const tabGeometry = (page) => page.evaluate(() => {
  const el = document.querySelector('.beta-feedback-drawer-tab');
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  if (cs.display === 'none' || cs.visibility === 'hidden' || !r.width) return { hidden: true, display: cs.display };
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const covered = [];
  document.querySelectorAll('a, button, input, select, textarea, [role="button"]').forEach((o) => {
    if (o === el || el.contains(o)) return;
    const q = o.getBoundingClientRect();
    if (!q.width || !q.height) return;
    /* Only count controls a user can actually reach. The closed beta-feedback
       drawer keeps its own form in the DOM with pointer-events:none inside an
       [inert] + aria-hidden subtree; its file-input reports an on-screen rect
       and would otherwise be flagged as a collision it cannot possibly be. */
    const cs2 = getComputedStyle(o);
    if (cs2.pointerEvents === 'none' || cs2.visibility === 'hidden') return;
    if (o.closest('[inert]') || o.closest('[aria-hidden="true"]')) return;
    const ix = Math.max(0, Math.min(r.right, q.right) - Math.max(r.left, q.left));
    const iy = Math.max(0, Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top));
    if (ix > 0 && iy > 0) covered.push((o.innerText || o.getAttribute('aria-label') || o.className || '').toString().trim().replace(/\s+/g, ' ').slice(0, 28));
  });
  return {
    hidden: false, vw: window.innerWidth, vh: window.innerHeight,
    position: cs.position, top: cs.top, right: cs.right, transform: cs.transform,
    x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
    centre: Math.round(r.x + r.width / 2),
    ownHit: !!(hit && (hit === el || el.contains(hit))),
    covered,
  };
});

async function checkD10(page, vp) {
  await page.goto(`${BASE}/${USER}/home`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const g = await tabGeometry(page);
  if (!g) { row(vp, 'D10', 'renders', null, 'no .beta-feedback-drawer-tab in the DOM at this size'); return; }
  if (g.hidden) { row(vp, 'D10', 'renders', null, `tab present but not displayed (display:${g.display})`); return; }

  const offCentre = Math.abs(g.centre - g.vw / 2);
  row(vp, 'D10', 'not-page-centred', offCentre > 60,
    `centre ${g.centre} of ${g.vw} → ${offCentre}px off (pos:${g.position} top:${g.top} right:${g.right})`);
  row(vp, 'D10', 'covers-no-controls', g.covered.length === 0,
    g.covered.length ? `overlaps ${JSON.stringify(g.covered)}` : 'nothing underneath');
  row(vp, 'D10', 'onscreen', g.y >= 0 && g.y + g.h <= g.vh && g.x >= 0 && g.x + g.w <= g.vw,
    `box (${g.x},${g.y}) ${g.w}x${g.h} in ${g.vw}x${g.vh}`);
  row(vp, 'D10', 'wins-hit-test', g.ownHit, `elementFromPoint at centre lands on the tab = ${g.ownHit}`);

  // WCAG 2.5.8 (AA) 24x24; 2.5.5 (AAA) 44x44.
  row(vp, 'D10', 'tap-target-AA-24', g.w >= 24 && g.h >= 24, `${g.w}x${g.h} (AA needs 24x24; AAA 44x44 → ${g.h >= 44 ? 'meets AAA' : 'below AAA on height'})`);

  // Toggle by the context's real input method.
  const tab = page.locator('.beta-feedback-drawer-tab').first();
  const before = await page.evaluate(() => ({ e: document.querySelector('.beta-feedback-drawer-tab')?.getAttribute('aria-expanded'), h: !!document.querySelector('.beta-feedback-drawer--hidden') }));
  let tapErr = null;
  await activate(page, tab, vp.touch).catch((e) => { tapErr = e.message.slice(0, 60); });
  await page.waitForTimeout(1600);
  const after = await page.evaluate(() => ({ e: document.querySelector('.beta-feedback-drawer-tab')?.getAttribute('aria-expanded'), h: !!document.querySelector('.beta-feedback-drawer--hidden') }));
  row(vp, 'D10', vp.touch ? 'toggles-by-TAP' : 'toggles-by-click', !tapErr && after.e === 'true' && before.h && !after.h,
    tapErr ? `input failed: ${tapErr}` : `aria-expanded ${before.e}→${after.e}, hidden ${before.h}→${after.h}`);
  await activate(page, tab, vp.touch).catch(() => {});
  await page.waitForTimeout(900);
}

async function checkD1(page, vp) {
  const [owner, ...rest] = BOARD.split('/');
  await page.goto(`${BASE}/${owner}/board-detail/${rest.join('/')}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3500);
  await dismissPortraitOverlay(page);

  const toggle = page.locator('button[data-bd-action="toggle_options_menu"]').first();
  if (!(await toggle.isVisible().catch(() => false))) {
    row(vp, 'D1', 'options-menu', null, 'options toggle not visible at this size — board-detail may not be usable here');
    return;
  }
  const tg = await toggle.boundingBox();
  row(vp, 'D1', 'menu-tap-target-AA-24', !!tg && tg.width >= 24 && tg.height >= 24,
    tg ? `options toggle ${Math.round(tg.width)}x${Math.round(tg.height)}` : 'no box');

  let err = null;
  await activate(page, toggle, vp.touch).catch((e) => { err = e.message.slice(0, 60); });
  await page.waitForTimeout(1600);
  if (err) { row(vp, 'D1', 'open-menu', false, `could not ${vp.touch ? 'tap' : 'click'} the options toggle: ${err}`); return; }

  const inMenu = (a) => page.locator(`.md-board-detail-actions-menu button[data-bd-action="${a}"]`).first();

  const sh = inMenu('set_as_home');
  const shVis = await sh.isVisible().catch(() => false);
  const shBox = shVis ? await sh.boundingBox() : null;
  row(vp, 'D1', 'set-as-home-reachable', shVis,
    shVis ? `visible, ${Math.round(shBox.width)}x${Math.round(shBox.height)}, label "${(await sh.innerText()).trim().replace(/\s+/g, ' ')}"` : 'not reachable from the options menu');

  const sp = inMenu('toggle_share_print_submenu');
  if (await sp.isVisible().catch(() => false)) {
    await activate(page, sp, vp.touch).catch(() => {});
    await page.waitForTimeout(1200);
  }
  const cp = inMenu('make_a_copy');
  const cpVis = await cp.isVisible().catch(() => false);
  row(vp, 'D1', 'make-a-copy-reachable', cpVis,
    cpVis ? `visible, label "${(await cp.innerText()).trim().replace(/\s+/g, ' ')}"` : 'not reachable under Share & Print');

  // Does a real tap actually fire it?
  if (shVis) {
    const before = await page.evaluate(() => document.querySelectorAll('.modal, .modal-dialog, .modal-backdrop').length);
    let e2 = null;
    await activate(page, sh, vp.touch).catch((e) => { e2 = e.message.slice(0, 50); });
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => document.querySelectorAll('.modal, .modal-dialog, .modal-backdrop').length);
    row(vp, 'D1', vp.touch ? 'set-as-home-fires-by-TAP' : 'set-as-home-fires-by-click', !e2 && after > before,
      e2 ? `input failed: ${e2}` : `modals ${before}→${after}`);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(900);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const vp of VIEWPORTS) {
    if (ONLY && !vp.name.toLowerCase().includes(ONLY.toLowerCase())) continue;
    console.log(`\n=== ${vp.name}  (${vp.width}x${vp.height}, touch=${vp.touch}) ===`);
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.touch,
      isMobile: false, // isMobile changes UA/scroll semantics; touch alone is the variable under test
    });
    const page = await ctx.newPage();
    try {
      await login(page);
      await checkD10(page, vp);
      await checkD1(page, vp);
    } catch (e) {
      row(vp, 'harness', 'error', false, e.message.slice(0, 120));
    } finally {
      await ctx.close();
    }
  }
  await browser.close();

  console.log('\n\n================ MATRIX ================');
  const ids = [...new Set(rows.map((r) => `${r.area}/${r.id}`))];
  const vps = [...new Set(rows.map((r) => r.vp))];
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('check', 34) + vps.map((v) => pad(v.split(' ')[1] || v, 9)).join(''));
  for (const id of ids) {
    const line = vps.map((v) => {
      const r = rows.find((x) => `${x.area}/${x.id}` === id && x.vp === v);
      return pad(!r ? '-' : r.pass === true ? 'PASS' : r.pass === false ? 'FAIL' : 'n/a', 9);
    }).join('');
    console.log(pad(id, 34) + line);
  }
  const fails = rows.filter((r) => r.pass === false);
  console.log(`\n${rows.filter((r) => r.pass === true).length} passed, ${fails.length} failed, ${rows.filter((r) => r.pass === null).length} n/a`);
  if (fails.length) {
    console.log('\nFAILURES:');
    fails.forEach((f) => console.log(`  ${f.vp} — ${f.area}/${f.id}: ${f.detail}`));
  }
  process.exit(fails.length ? 1 : 0);
})();
