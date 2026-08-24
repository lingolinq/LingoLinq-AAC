#!/usr/bin/env node
/**
 * Regression pass for moving the `.md-shell` sticky fix from
 * `#content:has(.md-preferences) .md-shell--user` to `.md-shell` globally.
 *
 * `overflow-x: hidden` made the shell a scroll container on Y (spec: hidden on
 * one axis computes the other to auto), so `position: sticky` bound to a
 * scrollport that never scrolls and every sticky element on a shell page was
 * inert. `clip` removes the scrollport without losing horizontal containment.
 *
 * The risk of going global is the mirror image of the bug: elements that were
 * INERT now actually stick, and could cover content on pages nobody checked.
 * So this asserts three things per page — the shell is no longer a scrollport,
 * no horizontal overflow appeared, and every sticky element is enumerated with
 * whether it now pins and what it overlaps.
 *
 * Run from app/frontend:  node scripts/md-shell-sticky-qa.mjs
 */
import { chromium } from 'playwright';

const arg = (n, d) => process.argv.find((a, i) => process.argv[i - 1] === n) || d;
const BASE = arg('--base', 'http://localhost:8184');
const USER = arg('--user', 'example');
const PASS = arg('--pass', 'password');

const PAGES = [
  ['/example/preferences', 'preferences (the originally-fixed page)'],
  ['/example/home', 'home dashboard'],
  ['/example/badges', 'badges'],
  ['/example/goals', 'goals'],
  ['/example/subscription', 'subscription'],
  ['/example/boards', 'my boards'],
  ['/example/stats', 'stats'],
];

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
  const trust = page.locator('button.login-btn--device').first();
  if (await trust.isVisible({ timeout: 2500 }).catch(() => false)) { await trust.click(); await page.waitForTimeout(1500); }
  await page.waitForTimeout(1500);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await login(page);

    for (const [path, label] of PAGES) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(2600);
      console.log(`\n### ${path} — ${label}`);

      const shell = await page.evaluate(() => {
        const el = document.querySelector('[class*="md-shell"]');
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
          cls: el.className.toString().trim().slice(0, 60),
          overflowX: cs.overflowX, overflowY: cs.overflowY,
          scrollH: el.scrollHeight, clientH: el.clientHeight,
        };
      });
      if (!shell) { record('shell-present', null, 'no .md-shell on this page — skipped'); continue; }

      // The whole bug: overflow-y computing to auto turns the shell into a scrollport.
      record('shell-not-a-scrollport', shell.overflowY === 'visible',
        `${shell.cls} → overflow-x:${shell.overflowX} overflow-y:${shell.overflowY}`);

      // Containment must survive the hidden→clip swap.
      const overflowed = await page.evaluate(() => ({
        docScrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      }));
      record('no-horizontal-overflow', overflowed.docScrollW <= overflowed.innerW + 1,
        `document scrollWidth ${overflowed.docScrollW} vs viewport ${overflowed.innerW}`);

      // Enumerate sticky descendants and report which now actually pin.
      const stickies = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('[class*="md-shell"] *').forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.position !== 'sticky') return;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return;
          out.push({
            cls: (el.className || '').toString().trim().slice(0, 46),
            top: cs.top, y: Math.round(r.y), h: Math.round(r.height),
          });
        });
        return out;
      });
      record('sticky-inventory', null,
        stickies.length ? stickies.map((s) => `${s.cls}@y=${s.y}`).join(' | ') : 'no sticky descendants');

      // Scroll to the bottom and see which of them actually pinned, and whether
      // anything now covers an interactive control.
      if (stickies.length) {
        await page.evaluate(() => {
          const sc = document.querySelector('#content') || document.scrollingElement;
          sc.scrollTop = sc.scrollHeight;
        });
        await page.waitForTimeout(900);
        const after = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll('[class*="md-shell"] *').forEach((el) => {
            const cs = getComputedStyle(el);
            if (cs.position !== 'sticky') return;
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return;
            // is it on screen (i.e. actually pinned) and what does it cover?
            const onScreen = r.bottom > 0 && r.top < window.innerHeight;
            const covered = [];
            if (onScreen) {
              document.querySelectorAll('a,button,input,select,textarea,[role="button"]').forEach((o) => {
                if (o === el || el.contains(o)) return;
                const cs2 = getComputedStyle(o);
                if (cs2.pointerEvents === 'none' || cs2.visibility === 'hidden') return;
                if (o.closest('[inert]') || o.closest('[aria-hidden="true"]')) return;
                const q = o.getBoundingClientRect();
                if (!q.width || !q.height) return;
                const ix = Math.max(0, Math.min(r.right, q.right) - Math.max(r.left, q.left));
                const iy = Math.max(0, Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top));
                if (ix > 4 && iy > 4) covered.push((o.innerText || o.getAttribute('aria-label') || o.className || '').toString().trim().replace(/\s+/g, ' ').slice(0, 22));
              });
            }
            out.push({ cls: (el.className || '').toString().trim().slice(0, 40), onScreen, y: Math.round(r.y), covered: [...new Set(covered)].slice(0, 4) });
          });
          return out;
        });
        after.forEach((s) => {
          record(`sticky-pins:${s.cls.split(' ')[0]}`, s.covered.length === 0,
            s.covered.length ? `pinned at y=${s.y} and COVERS ${JSON.stringify(s.covered)}` : `${s.onScreen ? `pinned at y=${s.y}` : 'off-screen'}, covers nothing`);
        });
      }
    }
  } catch (e) {
    record('harness', false, `threw: ${e.message.slice(0, 150)}`);
  } finally {
    console.log('\n===== SUMMARY =====');
    const f = results.filter((r) => r.pass === false);
    console.log(`${results.filter((r) => r.pass === true).length} passed, ${f.length} failed, ${results.filter((r) => r.pass === null).length} info`);
    if (f.length) { console.log('\nFAILURES:'); f.forEach((x) => console.log(`  ${x.id}: ${x.detail}`)); }
    await browser.close();
    process.exit(f.length ? 1 : 0);
  }
})();
