#!/usr/bin/env node
/**
 * A2c — the four fixes that shipped on cascade reasoning alone.
 *
 * Every High in the 2026-08-24 review was a CORRECT source change defeated by
 * something outside the diff: a later !important, a shared flag, a route hook, a
 * test fixture. Unit tests were green through all of it. So these four are not
 * "nice to verify" -- they are the same shape of change, and reading the CSS or
 * the handler is exactly the evidence that failed last time.
 *
 *   A  beta-feedback tab does NOT cover a communication button in speak mode or
 *      the edit rail (base rule re-centred; corner anchor scoped to --navbar)
 *   B  Preferences Save bar pins at <=1024px, where a later media block used to
 *      cancel it outright
 *   C  Preferences bar is frosted glass, unpins under 560px height, and
 *      dropdown options paint ABOVE it
 *   D  all four Board Actions submenu items are reachable by ArrowDown
 *
 * Assertions are hit-tests and computed styles, never "is the rule present" --
 * a declaration that applies and does nothing is the bug being tested for.
 *
 * Run from app/frontend, against a live dev stack:
 *   node scripts/a2c-click-tests-qa.mjs [--headed] [--board lingolinq/keyboard]
 *
 * Read-only: no boards copied, no preferences saved, no accounts created.
 */
import { chromium } from 'playwright';

const arg = (n, d) => process.argv.find((a, i) => process.argv[i - 1] === n) || d;
const BASE = arg('--base', 'http://localhost:8184');
const USER = arg('--user', 'example');
const PASS = arg('--pass', 'password');
const BOARD = arg('--board', 'lingolinq/keyboard');
const HEADED = process.argv.includes('--headed');
const ONLY = arg('--only', null);

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

async function dismissPortraitOverlay(page) {
  const dis = page.locator('button[data-bd-action="dismiss_portrait_overlay"]').first();
  if (await dis.isVisible({ timeout: 3000 }).catch(() => false)) { await dis.click(); await page.waitForTimeout(1200); }
}

/* Geometric overlap, in the browser. Returns the interactive elements a given
   element actually covers, plus whether it wins its own centre hit-test --
   z-index alone does not tell you whether something is reachable. */
/* Destructured on purpose: page.evaluate passes ONE argument, so a
   `(sel, targetSel)` signature silently binds the whole array to `sel` and
   leaves `targetSel` undefined — which is how the first run of this harness
   threw "Cannot read properties of undefined" and skipped group A entirely. */
const OVERLAP_FN = ([sel, targetSel]) => {
  const el = document.querySelector(sel);
  if (!el) return { missing: true };
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return { zero: true };
  const covered = [];
  document.querySelectorAll(targetSel).forEach((o) => {
    if (o === el || el.contains(o) || o.contains(el)) return;
    const cs = getComputedStyle(o);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') return;
    if (o.closest('[inert]') || o.closest('[aria-hidden="true"]')) return;
    const q = o.getBoundingClientRect();
    if (!q.width || !q.height) return;
    const ix = Math.max(0, Math.min(r.right, q.right) - Math.max(r.left, q.left));
    const iy = Math.max(0, Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top));
    if (ix > 4 && iy > 4) {
      covered.push({
        label: (o.innerText || o.getAttribute('aria-label') || o.className || '').toString().trim().replace(/\s+/g, ' ').slice(0, 30),
        area: Math.round(ix * iy)
      });
    }
  });
  return {
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    centre: Math.round(r.left + r.width / 2),
    viewportCentre: Math.round(window.innerWidth / 2),
    covered
  };
};

/* ---------------------------------------------------------------- A ------- */
/* The tab hangs UP from the bottom edge in speak/edit mode. Corner-anchoring it
   there (which the base rule briefly did) parks an opaque z-index:1078 pill over
   the bottom-RIGHT communication cell. On an AAC app that is a product defect,
   not a cosmetic one. Bottom-CENTRE is where it has always sat. */
async function checkA(page) {
  console.log('\n=== A. beta-feedback tab does not cover a communication button ===');

  /* NOT board-detail SPEAK mode (`user.board-detail.index`). The tab is
     deliberately suppressed there by `hide_beta_feedback_temporarily`
     (controllers/application.js, TEMPORARY 2026-07-27) — the first version of
     this check pointed at exactly that route and skipped twice, which looked
     like a clean result and verified nothing. Edit mode is where the --speak
     variant actually renders on board-detail, and it is the surface the H7
     analysis named: the foot of the right edit rail. If the temporary
     suppression is ever removed, add the index route back here. */
  const [owner, ...rest] = BOARD.split('/');
  const key = rest.join('/');
  for (const [label, url] of [
    ['board-detail edit', `${BASE}/${owner}/board-detail/${key}/edit`],
    ['classic board', `${BASE}/${BOARD}`],
  ]) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3500);
    await dismissPortraitOverlay(page);

    const speakTab = await page.evaluate(OVERLAP_FN,
      ['.beta-feedback-drawer-tab--speak', 'button, a, [role="button"], .button, .btn']);

    if (speakTab.missing) {
      const route = await page.evaluate(() => location.pathname);
      record(`A-${label}-tab-present`, null,
        `no --speak tab rendered (landed on ${route}) — NOT a pass; check hide_beta_feedback_temporarily and showBetaFeedbackDrawer before reading this as safe`);
      continue;
    }
    if (speakTab.zero) { record(`A-${label}-tab-present`, null, 'tab has zero size (hidden); nothing to cover'); continue; }

    record(`A-${label}-not-corner-anchored`,
      Math.abs(speakTab.centre - speakTab.viewportCentre) < 60,
      `tab centre ${speakTab.centre} vs viewport centre ${speakTab.viewportCentre} — corner-anchored would be far right`);

    record(`A-${label}-covers-nothing`,
      speakTab.covered.length === 0,
      speakTab.covered.length
        ? `COVERS ${JSON.stringify(speakTab.covered.slice(0, 4))}`
        : `covers no interactive element at ${JSON.stringify(speakTab.rect)}`);
  }
}

/* ---------------------------------------------------------------- B ------- */
/* The headline regression: `@media (max-width: 1024px)` re-declared
   `overflow-x: hidden !important` on the whole ancestor chain, ~17,000 lines
   below the base rule at equal specificity, so the shell became a non-scrolling
   scrollport again and every sticky inside it went inert. Assert the COMPUTED
   overflow and that the bar is actually on screen -- "position: sticky is set"
   was true the entire time it was broken. */
async function checkB(page) {
  console.log('\n=== B. Preferences Save bar pins at every viewport ===');
  const VIEWPORTS = [
    ['desktop', 1280, 800],
    ['zoom-125pct', 1024, 640],
    ['tablet-landscape', 1024, 768],
    ['tablet-portrait', 768, 1024],
    ['phone', 390, 844],
  ];

  for (const [name, w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/${USER}/preferences`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const shell = await page.evaluate(() => {
      const el = document.querySelector('[class*="md-shell"]');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { overflowX: cs.overflowX, overflowY: cs.overflowY };
    });
    if (!shell) { record(`B-${name}`, null, 'no .md-shell on this page; skipped'); continue; }

    // The whole bug in one assertion: overflow-y computing to auto means the
    // shell captured sticky. `clip` keeps overflow-y visible.
    record(`B-${name}-shell-not-a-scrollport`, shell.overflowY === 'visible',
      `overflow-x:${shell.overflowX} overflow-y:${shell.overflowY}`);

    // Scroll to the bottom, then check the bar is still within the viewport.
    await page.evaluate(() => {
      const sc = document.querySelector('#content') || document.scrollingElement;
      sc.scrollTop = 0;
    });
    await page.waitForTimeout(500);
    const pinned = await page.evaluate(() => {
      const bar = document.querySelector('.md-preferences__actions');
      if (!bar) return { missing: true };
      const cs = getComputedStyle(bar);
      const r = bar.getBoundingClientRect();
      return {
        position: cs.position,
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        vh: window.innerHeight,
        onScreen: r.top < window.innerHeight && r.bottom > 0
      };
    });
    if (pinned.missing) { record(`B-${name}-bar`, null, 'no .md-preferences__actions; skipped'); continue; }

    if (pinned.position === 'static') {
      // Expected below the 560px-height unpin threshold (checked in C).
      record(`B-${name}-bar-unpinned`, null,
        `position:static at ${w}x${h} — the deliberate short-viewport unpin`);
    } else {
      record(`B-${name}-bar-pinned-unscrolled`, pinned.onScreen,
        `position:${pinned.position}, bar at y=${pinned.top}..${pinned.bottom} in a ${pinned.vh}px viewport`);
    }
  }
}

/* ---------------------------------------------------------------- C ------- */
/* Three visual changes with no screenshots: frosted glass instead of a flat
   #eef1f6 band over a fixed gradient mesh, the max-height:560px unpin, and
   dropdown options no longer painting behind the bar (they were position:static,
   which cannot take a z-index). */
async function checkC(page) {
  console.log('\n=== C. Preferences bar: frosted, unpins, dropdowns above ===');

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}/${USER}/preferences`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const bar = await page.evaluate(() => {
    const el = document.querySelector('.md-preferences__actions');
    if (!el) return { missing: true };
    const cs = getComputedStyle(el);
    return {
      background: cs.backgroundColor,
      backdrop: cs.backdropFilter || cs.webkitBackdropFilter || 'none',
      zIndex: cs.zIndex
    };
  });
  if (bar.missing) {
    record('C-bar', null, 'no .md-preferences__actions on this page; skipped');
  } else {
    const translucent = /rgba\([^)]*,\s*0?\.\d+\)/.test(bar.background);
    record('C-frosted', translucent && bar.backdrop !== 'none',
      `background ${bar.background}, backdrop-filter ${bar.backdrop} — flat #eef1f6 over the fixed mesh was the defect`);
  }

  // The unpin. 520px is below the 560px threshold; 800px is above it.
  for (const [h, expect] of [[520, 'static'], [800, 'sticky']]) {
    await page.setViewportSize({ width: 1280, height: h });
    await page.waitForTimeout(1200);
    const pos = await page.evaluate(() => {
      const el = document.querySelector('.md-preferences__actions');
      return el ? getComputedStyle(el).position : null;
    });
    if (pos === null) { record(`C-unpin-${h}`, null, 'bar not present; skipped'); continue; }
    record(`C-unpin-${h}px`, pos === expect,
      `viewport height ${h} → position:${pos} (expected ${expect})`);
  }

  // Dropdown stacking. Open a select and check its list wins against the bar.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(1200);
  const dd = page.locator('.md-preferences .bound-select__toggle, .md-preferences .modern-select__toggle').first();
  if (await dd.isVisible({ timeout: 4000 }).catch(() => false)) {
    await dd.click();
    await page.waitForTimeout(900);
    const stack = await page.evaluate(() => {
      const list = document.querySelector('.md-preferences .bound-select__list, .md-preferences .modern-select__list');
      const bar = document.querySelector('.md-preferences__actions');
      if (!list || !bar) return null;
      const lcs = getComputedStyle(list), bcs = getComputedStyle(bar);
      return {
        listPosition: lcs.position,
        listZ: lcs.zIndex,
        barZ: bcs.zIndex
      };
    });
    if (!stack) {
      record('C-dropdown-above-bar', null, 'could not resolve both the list and the bar; skipped');
    } else {
      const canStack = stack.listPosition !== 'static' && Number(stack.listZ) > Number(stack.barZ);
      record('C-dropdown-above-bar', canStack,
        `list position:${stack.listPosition} z:${stack.listZ} vs bar z:${stack.barZ} — a static list cannot take a z-index at all`);
    }
    await page.keyboard.press('Escape').catch(() => {});
  } else {
    record('C-dropdown-above-bar', null, 'no preferences dropdown found on this page; skipped');
  }
}

/* ---------------------------------------------------------------- D ------- */
/* The per-item keydown listeners snapshotted the VISIBLE items at menu-open
   time and called stopPropagation, so the container handler (which re-queries
   live) never ran and the four submenu items -- which only exist once expanded
   -- were skipped entirely by ArrowDown. Drive real keys, not the handler. */
async function checkD(page) {
  console.log('\n=== D. Board Actions submenu reachable by ArrowDown ===');
  await page.setViewportSize({ width: 1440, height: 900 });
  const [owner, ...rest] = BOARD.split('/');
  await page.goto(`${BASE}/${owner}/board-detail/${rest.join('/')}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3500);
  await dismissPortraitOverlay(page);

  await page.locator('button[data-bd-action="toggle_options_menu"]').first().click();
  await page.waitForTimeout(1400);

  const toggle = page.locator('.md-board-detail-actions-menu button[data-bd-action="toggle_board_submenu"]').first();
  if (!(await toggle.isVisible({ timeout: 4000 }).catch(() => false))) {
    record('D-submenu-present', false, 'toggle_board_submenu not offered — cannot test keyboard reach');
    return;
  }
  record('D-submenu-present', true, '"Board Actions" toggle is in the view-mode options menu');

  // aria-controls completes the disclosure; aria-expanded alone says a control
  // expands something without saying what.
  const aria = await page.evaluate(() => {
    const t = document.querySelector('.md-board-detail-actions-menu button[data-bd-action="toggle_board_submenu"]');
    const id = t && t.getAttribute('aria-controls');
    return { controls: id, targetExists: !!(id && document.getElementById(id)) };
  });

  await toggle.click();
  await page.waitForTimeout(1000);

  const ariaAfter = await page.evaluate(() => {
    const t = document.querySelector('.md-board-detail-actions-menu button[data-bd-action="toggle_board_submenu"]');
    const id = t && t.getAttribute('aria-controls');
    return { expanded: t && t.getAttribute('aria-expanded'), targetExists: !!(id && document.getElementById(id)) };
  });
  record('D-aria-controls', !!aria.controls && ariaAfter.targetExists,
    `aria-controls="${aria.controls}" resolves to a real element once expanded: ${ariaAfter.targetExists}`);
  record('D-aria-expanded', ariaAfter.expanded === 'true', `aria-expanded=${ariaAfter.expanded} after opening`);

  // Focus the toggle, then walk ArrowDown and collect what actually receives focus.
  await toggle.focus();
  const seen = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(140);
    const act = await page.evaluate(() => {
      const a = document.activeElement;
      return a ? (a.getAttribute('data-bd-action') || (a.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 24)) : null;
    });
    if (act) { seen.push(act); }
  }
  console.log(`     arrow walk reached: ${JSON.stringify(seen)}`);

  for (const a of ['board_details', 'toggle_favorite', 'add_to_sidebar', 'other_board_actions']) {
    record(`D-${a}-reachable-by-arrow`, seen.includes(a),
      seen.includes(a) ? 'ArrowDown lands on it' : 'ArrowDown never focuses it — the snapshot bug is back');
  }
}

/* ------------------------------------------------------------------------- */
(async () => {
  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log(`  [js error] ${String(e).slice(0, 140)}`));

  const checks = { A: checkA, B: checkB, C: checkC, D: checkD };
  try {
    await login(page);
    for (const [key, fn] of Object.entries(checks)) {
      if (ONLY && ONLY.toUpperCase() !== key) { continue; }
      try {
        await fn(page);
      } catch (e) {
        record(`${key}-harness`, false, `threw: ${e.message.slice(0, 140)}`);
      }
    }
  } catch (e) {
    record('harness', false, `threw: ${e.message.slice(0, 150)}`);
  } finally {
    console.log('\n===== SUMMARY =====');
    const pass = results.filter((r) => r.pass === true);
    const fail = results.filter((r) => r.pass === false);
    const info = results.filter((r) => r.pass === null);
    results.forEach((r) => console.log(`${r.pass === true ? 'PASS' : r.pass === false ? 'FAIL' : 'SKIP'}  ${r.id}`));
    console.log(`\n${pass.length} passed, ${fail.length} failed, ${info.length} skipped/inconclusive`);
    if (fail.length) {
      console.log('\nFAILURES:');
      fail.forEach((f) => console.log(`  ${f.id}: ${f.detail}`));
    }
    if (info.length) {
      console.log('\nSKIPPED — these are NOT passes; a skipped check verified nothing:');
      info.forEach((f) => console.log(`  ${f.id}: ${f.detail}`));
    }
    await browser.close();
    process.exit(fail.length ? 1 : 0);
  }
})();
