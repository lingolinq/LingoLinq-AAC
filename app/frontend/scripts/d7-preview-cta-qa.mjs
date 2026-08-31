#!/usr/bin/env node
/**
 * D7 — the board-preview modal's primary CTA fell below the fold at short
 * viewport heights. The modal always scrolled (that was mis-reported as
 * "unreachable"), so this is about the action row now being PINNED.
 *
 * Asserts the thing that matters: with the modal body scrolled to the TOP, is
 * the primary button inside the viewport and does it win its own hit-test.
 * Run from app/frontend: node scripts/d7-preview-cta-qa.mjs
 */
import { chromium } from 'playwright';

const arg = (n, d) => process.argv.find((a, i) => process.argv[i - 1] === n) || d;
const BASE = arg('--base', 'http://localhost:8184');
const USER = arg('--user', 'example');
const PASS = arg('--pass', 'password');

// The reported symptom was at ~620px of usable height; bracket it.
const SIZES = [[1280, 620], [1280, 700], [1024, 640], [1440, 900]];

const results = [];
function record(id, pass, detail) {
  results.push({ id, pass, detail });
  console.log(`  [${pass === true ? 'PASS' : pass === false ? 'FAIL' : 'INFO'}] ${id}: ${detail}`);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('#identification', USER);
  await page.fill('#password', PASS);
  await page.locator('button.login-btn[type="submit"], form button[type="submit"]').first().click();
  await page.waitForTimeout(2500);
  const t = page.locator('button.login-btn--device').first();
  if (await t.isVisible({ timeout: 2500 }).catch(() => false)) { await t.click(); await page.waitForTimeout(1500); }
  await page.waitForTimeout(1200);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [w, h] of SIZES) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      console.log(`\n### ${w}x${h}`);
      await login(page);
      await page.goto(`${BASE}/board-picker`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(3500);

      const card = page.locator('.board-icon, .md-board-icon, [class*="board-icon"]').first();
      if (!(await card.isVisible({ timeout: 8000 }).catch(() => false))) {
        record('preview-opens', null, 'no board cards on /board-picker');
        await ctx.close(); continue;
      }
      await card.click();
      await page.waitForTimeout(4000);

      const cta = page.getByRole('button', { name: /Pick this Board|Try This Board|Choose This Board/i }).first();
      if (!(await cta.isVisible({ timeout: 8000 }).catch(() => false))) {
        record('preview-opens', false, 'preview modal did not present a primary CTA');
        await ctx.close(); continue;
      }
      record('preview-opens', true, 'preview modal open with a primary CTA');

      // Force the body to the very top — the reported state.
      await page.evaluate(() => {
        const b = document.querySelector('.md-board-details-modal__body');
        if (b) b.scrollTop = 0;
      });
      await page.waitForTimeout(700);

      const geo = await page.evaluate(() => {
        const row = document.querySelector('.md-board-preview__actions');
        const body = document.querySelector('.md-board-details-modal__body');
        if (!row || !body) return null;
        const cs = getComputedStyle(row);
        const r = row.getBoundingClientRect();
        const b = body.getBoundingClientRect();
        const btn = row.querySelector('.md-board-preview__action--primary') || row.querySelector('button');
        const q = btn ? btn.getBoundingClientRect() : null;
        const hit = q ? document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2) : null;
        return {
          position: cs.position, bottom: cs.bottom,
          rowBottom: Math.round(r.bottom), bodyBottom: Math.round(b.bottom),
          scrollable: body.scrollHeight > body.clientHeight + 1,
          overflowY: getComputedStyle(body).overflowY,
          btn: q ? { y: Math.round(q.y), h: Math.round(q.height), inViewport: q.bottom <= window.innerHeight && q.top >= 0 } : null,
          btnOwnsHit: !!(btn && hit && (hit === btn || btn.contains(hit))),
        };
      });
      if (!geo) { record('geometry', false, 'could not measure the action row'); await ctx.close(); continue; }

      record('actions-sticky', geo.position === 'sticky', `position:${geo.position} bottom:${geo.bottom}`);
      record('cta-in-viewport-at-scrolltop', !!(geo.btn && geo.btn.inViewport),
        geo.btn ? `primary button at y=${geo.btn.y} h=${geo.btn.h} in a ${h}px viewport, body scrolled to top` : 'no button measured');
      record('cta-clickable', geo.btnOwnsHit, `hit-test at the button centre lands on it = ${geo.btnOwnsHit}`);
      record('row-pinned-to-body-bottom', Math.abs(geo.rowBottom - geo.bodyBottom) <= 2,
        `row bottom ${geo.rowBottom} vs body bottom ${geo.bodyBottom} (scrollable=${geo.scrollable})`);

      await ctx.close();
    }
  } catch (e) {
    record('harness', false, `threw: ${e.message.slice(0, 150)}`);
  } finally {
    console.log('\n===== SUMMARY =====');
    const f = results.filter((r) => r.pass === false);
    console.log(`${results.filter((r) => r.pass === true).length} passed, ${f.length} failed`);
    if (f.length) { console.log('\nFAILURES:'); f.forEach((x) => console.log(`  ${x.id}: ${x.detail}`)); }
    await browser.close();
    process.exit(f.length ? 1 : 0);
  }
})();
