#!/usr/bin/env node
/**
 * Browser verification for the three claim-check fixes that shipped with only
 * source-level confidence (see docs/task-management/HANDOFF-2026-08-23-claim-check-branch.md,
 * Part 3): D1 (7692d3c08), D2 (231bdcaeb), D10 (868193344).
 *
 * PLAYWRIGHT, not puppeteer: this follows scripts/p1-board-picker-qa.mjs, which
 * is the script that already drives this app's login + board-pick flow.
 *
 * Run from app/frontend:
 *   node scripts/claim-check-d1-d2-d10-qa.mjs                 # D10 + D1 (read-only)
 *   node scripts/claim-check-d1-d2-d10-qa.mjs --d2            # adds D2 (MUTATES home board)
 *   node scripts/claim-check-d1-d2-d10-qa.mjs --only d10
 *
 * D2 drives the real copy pipeline, which is Progress.schedule'd -- a RESQUE
 * WORKER must be running or the completion callback never fires.
 */
import { chromium } from 'playwright';

const arg = (name, dflt) => process.argv.find((a, i) => process.argv[i - 1] === name) || dflt;
const BASE = arg('--base', 'http://localhost:8184');
const USER = arg('--user', 'example');
const PASS = arg('--pass', 'password');
const ONLY = arg('--only', null);
const RUN_D2 = process.argv.includes('--d2');
const HEADED = process.argv.includes('--headed');

/* --d2 rewrites a real user's home board. Loopback only, for the same reason as
   scripts/n1-under13-signup-qa.mjs; --i-know-this-writes overrides. */
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i;
if (RUN_D2 && !LOOPBACK.test(BASE) && !process.argv.includes('--i-know-this-writes')) {
  console.error(`Refusing to run --d2 against a non-loopback host: ${BASE}\n` +
    "It overwrites the target account's home board. Re-run with --i-know-this-writes to override.");
  process.exit(2);
}
// A board the session user does NOT own -- that is the journey D1 is about.
const FOREIGN_BOARD = arg('--board', 'lingolinq/keyboard');

const results = [];
function record(id, pass, detail) {
  results.push({ id, pass, detail });
  console.log(`[${pass === true ? 'PASS' : pass === false ? 'FAIL' : 'INCONCLUSIVE'}] ${id}: ${detail}`);
}
// Exact match: 'd10'.startsWith('d1') would otherwise make --only d10 run D1 too.
const wants = (id) => !ONLY || ONLY.toLowerCase() === id;

async function dismissDevicePrompt(page) {
  for (let i = 0; i < 3; i++) {
    const trust = page.locator('button.login-btn--device').first();
    const trustAlt = page.getByRole('button', { name: /Trust this Device|Keep me logged in/i });
    if (await trust.isVisible({ timeout: 2000 }).catch(() => false)) {
      await trust.click(); await page.waitForTimeout(800); return;
    }
    if (await trustAlt.isVisible({ timeout: 500 }).catch(() => false)) {
      await trustAlt.click(); await page.waitForTimeout(800); return;
    }
  }
}

/* board-detail gates itself behind a full-viewport "Larger screen recommended"
   overlay (z-index 450) and sets .md-board-detail-header to display:none while
   it is up. Measuring header buttons without clearing this reports every one of
   them as 0x0 — which is a property of the overlay, not of the buttons. */
async function dismissPortraitOverlay(page) {
  const btn = page.locator('button[data-bd-action="dismiss_portrait_overlay"]').first();
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(1500);
    return true;
  }
  return false;
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('#identification', USER);
  await page.fill('#password', PASS);
  await page.locator('button.login-btn[type="submit"], form button[type="submit"]').first().click();
  await page.waitForTimeout(2500);
  await dismissDevicePrompt(page);
  await page.waitForTimeout(2000);
  if (page.url().includes('/login')) {
    const err = await page.locator('.alert-danger, .text-danger, .login-error').first().textContent().catch(() => '');
    throw new Error(`Login failed for ${USER}: ${err}`);
  }
}

/* ---------------------------------------------------------------- D10 ---- */
/* The tab was `position: fixed; left: 50%; translateX(-50%)` -- a fixed tap
   target in the middle of the top edge of every page. Assert it is now anchored
   to the right corner, and that the --navbar variant is STILL centred (it is
   positioned inside the navbar, so centring is correct there). */
async function checkD10(page) {
  /* Navigate explicitly rather than measuring whatever the post-login landing is:
     `/` can come up with a welcome modal open, which sits over the tab and makes
     the hit-test fail for reasons that have nothing to do with the anchor. */
  await page.goto(`${BASE}/${USER}/home`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const probe = await page.evaluate(() => {
    const out = { vw: window.innerWidth, fixed: null, navbar: null, all: [] };
    document.querySelectorAll('.beta-feedback-drawer-tab').forEach((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const info = {
        cls: el.className,
        position: cs.position, left: cs.left, right: cs.right, transform: cs.transform,
        rect: { x: Math.round(r.x), width: Math.round(r.width), centre: Math.round(r.x + r.width / 2) },
        visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0,
      };
      out.all.push(info);
      if (el.classList.contains('beta-feedback-drawer-tab--navbar')) out.navbar = info;
      else if (cs.position === 'fixed') out.fixed = info;
    });
    return out;
  });

  if (!probe.all.length) {
    record('D10', null, 'No .beta-feedback-drawer-tab rendered on this page — cannot verify the anchor here.');
    return probe;
  }

  /* Assert USER-FACING properties, not declarations. Deliberately position-
     agnostic: the correct fix ends up `position: absolute` inside the navbar, so
     a check keyed on `fixed` would report the fixed version as inconclusive. */
  const geo = await page.evaluate(() => {
    const el = document.querySelector('.beta-feedback-drawer-tab');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // What actually receives a click at the tab's centre?
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    // Interactive controls the tab now covers.
    const covered = [];
    document.querySelectorAll('a, button, input, select, textarea, [role="button"]').forEach((o) => {
      if (o === el || el.contains(o)) return;
      const q = o.getBoundingClientRect();
      if (!q.width || !q.height) return;
      /* Only count controls a user can actually reach. The closed beta-feedback
         drawer keeps its own form in the DOM with pointer-events:none inside an
         [inert] + aria-hidden subtree; its file-input reports an on-screen rect
         and would otherwise read as a collision it cannot possibly be. */
      const cs2 = getComputedStyle(o);
      if (cs2.pointerEvents === 'none' || cs2.visibility === 'hidden') return;
      if (o.closest('[inert]') || o.closest('[aria-hidden="true"]')) return;
      const ix = Math.max(0, Math.min(r.right, q.right) - Math.max(r.left, q.left));
      const iy = Math.max(0, Math.min(r.bottom, q.bottom) - Math.max(q.top, r.top));
      if (ix > 0 && iy > 0) covered.push((o.innerText || o.getAttribute('aria-label') || o.className || '').toString().trim().replace(/\s+/g, ' ').slice(0, 30));
    });
    return {
      vw: window.innerWidth, vh: window.innerHeight,
      position: cs.position, left: cs.left, right: cs.right, top: cs.top, transform: cs.transform,
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      centre: Math.round(r.x + r.width / 2),
      ownHit: !!(hit && (hit === el || el.contains(hit))),
      covered,
    };
  });

  const offCentre = Math.abs(geo.centre - geo.vw / 2);
  record('D10-not-page-centred', offCentre > 100,
    `box centre ${geo.centre}px of ${geo.vw}px → ${offCentre}px off page-centre (position:${geo.position} right=${geo.right} transform=${geo.transform})${offCentre <= 100 ? ' — STILL CENTRED, the defect D10 reported' : ''}`);

  /* Regression guard. Corner-anchoring is only an improvement if the corner is
     free: an earlier attempt put the tab at top:0 right:16, where it covered
     Settings / Support / the online-status control. Moving a z-index 1078 tap
     target onto three other controls trades one mis-tap risk for another. */
  record('D10-covers-no-controls', geo.covered.length === 0,
    geo.covered.length ? `tab overlaps interactive controls: ${JSON.stringify(geo.covered)}` : 'no interactive control sits underneath the tab');

  // On-screen and actually hittable — top:100% under position:fixed put it at y=vh.
  record('D10-onscreen-and-clickable', geo.y >= 0 && geo.y + geo.h <= geo.vh && geo.ownHit,
    `box at (${geo.x}, ${geo.y}) ${geo.w}x${geo.h} in a ${geo.vw}x${geo.vh} viewport; hit-test at centre lands on the tab=${geo.ownHit}`);

  /* Moving it must not break it. The tab is the drawer's toggle, so click it and
     confirm the drawer actually opens and aria-expanded flips. */
  const tab = page.locator('.beta-feedback-drawer-tab').first();
  const before = await page.evaluate(() => ({
    expanded: document.querySelector('.beta-feedback-drawer-tab')?.getAttribute('aria-expanded'),
    hidden: !!document.querySelector('.beta-feedback-drawer--hidden'),
  }));
  await tab.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => ({
    expanded: document.querySelector('.beta-feedback-drawer-tab')?.getAttribute('aria-expanded'),
    hidden: !!document.querySelector('.beta-feedback-drawer--hidden'),
  }));
  record('D10-tab-still-toggles', after.expanded === 'true' && before.hidden && !after.hidden,
    `aria-expanded ${before.expanded} -> ${after.expanded}; drawer hidden ${before.hidden} -> ${after.hidden}`);
  await tab.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1000);

  return probe;
}

/* ----------------------------------------------------------------- D1 ---- */
/* Set as Home / Make a Copy rendered only inside the edit panel. Assert both
   render in VIEW mode on a board the user does not own, and -- the part unit
   tests cannot cover -- that clicking actually fires something. A ctrlAction
   naming a non-existent action passes both linters and silently does nothing;
   that exact bug (copy_board vs make_a_copy) was caught during the fix. */
async function checkD1(page) {
  const [owner, ...rest] = FOREIGN_BOARD.split('/');
  const url = `${BASE}/${owner}/board-detail/${rest.join('/')}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);
  await dismissPortraitOverlay(page);

  const state = await page.evaluate(() => ({
    url: location.pathname,
    editPanel: !!document.querySelector('.md-board-detail-edit-panel, [class*="edit-panel"]'),
    setHome: !!document.querySelector('button[data-bd-action="set_as_home"]'),
    copy: !!document.querySelector('button[data-bd-action="make_a_copy"]'),
    editBtn: !!document.querySelector('button[data-bd-action="enter_edit_mode"]'),
  }));

  // In view mode the "Edit Board" button is present; that is the marker that we
  // are NOT already in edit mode (where the panel would supply these anyway).
  record('D1-view-mode', state.editBtn && !state.url.includes('/edit'),
    `on ${state.url}, enter_edit_mode button present=${state.editBtn} (confirms view mode, so the buttons are not coming from the edit panel)`);

  /* Drive the real view-mode path: the options menu. Reachability is the whole
     finding, so this walks the clicks a user makes rather than querying the DOM
     for a node that may be rendered-but-hidden. */
  const optionsToggle = page.locator('button[data-bd-action="toggle_options_menu"]').first();
  if (!(await optionsToggle.isVisible().catch(() => false))) {
    record('D1', false, 'options menu toggle itself is not visible in view mode');
    return;
  }
  await optionsToggle.click();
  await page.waitForTimeout(1500);

  const inMenu = (action) => page.locator(`.md-board-detail-actions-menu button[data-bd-action="${action}"]`).first();

  // Set as Home should be top level — one click from the menu, not buried.
  const setHomeBtn = inMenu('set_as_home');
  const setHomeVis = await setHomeBtn.isVisible().catch(() => false);
  record('D1-set-as-home-reachable', setHomeVis,
    setHomeVis ? `top level in the options menu, label "${(await setHomeBtn.innerText()).trim().replace(/\s+/g, ' ')}"`
      : 'set_as_home NOT reachable from the view-mode options menu');

  // Make a Copy lives under Share & Print, so expand that first.
  const sharePrint = inMenu('toggle_share_print_submenu');
  if (await sharePrint.isVisible().catch(() => false)) {
    await sharePrint.click();
    await page.waitForTimeout(1200);
  }
  const copyBtn = inMenu('make_a_copy');
  const copyVis = await copyBtn.isVisible().catch(() => false);
  const copyLabel = copyVis ? (await copyBtn.innerText()).trim().replace(/\s+/g, ' ') : null;
  record('D1-make-a-copy-reachable', copyVis,
    copyVis ? `reachable via Share & Print, label "${copyLabel}"` : 'make_a_copy NOT reachable from the view-mode options menu');

  /* The label is the finding, not a nicety: under a "Share & Print" heading a bare
     "Copy" reads as copy-to-clipboard, which is why two reviews reported the
     action as absent when it was present. */
  record('D1-make-a-copy-label', copyVis && /make a copy/i.test(copyLabel || ''),
    copyVis ? `label reads "${copyLabel}" (must say "Make a Copy", not a bare "Copy")` : 'not evaluated — button unreachable');

  // Nothing should be left behind in the collapsed header.
  const strayInHeader = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('[data-bd-action="set_as_home"], [data-bd-action="make_a_copy"]').forEach((el) => {
      let p = el, hidden = null;
      while (p && p !== document.documentElement) {
        if (getComputedStyle(p).display === 'none') { hidden = (p.className || p.tagName).toString().trim().slice(0, 50); break; }
        p = p.parentElement;
      }
      if (hidden) out.push({ action: el.getAttribute('data-bd-action'), hiddenBy: hidden });
    });
    return out;
  });
  record('D1-no-dead-copies-left', strayInHeader.length === 0,
    strayInHeader.length ? `still rendering inside a hidden container: ${JSON.stringify(strayInHeader)}` : 'no set_as_home/make_a_copy left inside a display:none container');

  // Wiring: clicking must actually fire. A ctrlAction naming a non-existent
  // action passes both linters and silently does nothing.
  if (setHomeVis) {
    const before = await page.evaluate(() => document.querySelectorAll('.modal, .modal-dialog, .modal-backdrop').length);
    await setHomeBtn.click();
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => ({
      modals: document.querySelectorAll('.modal, .modal-dialog, .modal-backdrop').length,
      text: (document.querySelector('.modal-dialog, .modal')?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160),
    }));
    record('D1-set-as-home-wired', after.modals > before,
      after.modals > before ? `click opened: "${after.text}"` : `click changed nothing (modals ${before} -> ${after.modals}) — silent dead action`);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(1200);
  }

  /* Same wiring check for Copy. The set_as_home modal above leaves the menu in an
     indeterminate state, so reload and re-walk the path rather than trying to
     reopen it — a flaky harness would report a real bug as inconclusive. */
  if (copyVis) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3500);
    await dismissPortraitOverlay(page);
    await optionsToggle.click();
    await page.waitForTimeout(1200);
    const sp = inMenu('toggle_share_print_submenu');
    if (await sp.isVisible().catch(() => false)) { await sp.click(); await page.waitForTimeout(1000); }
    const copyAgain = inMenu('make_a_copy');
    if (await copyAgain.isVisible().catch(() => false)) {
      const before = await page.evaluate(() => document.querySelectorAll('.modal, .modal-dialog, .modal-backdrop').length);
      await copyAgain.click();
      await page.waitForTimeout(2500);
      const after = await page.evaluate(() => ({
        modals: document.querySelectorAll('.modal, .modal-dialog, .modal-backdrop').length,
        text: (document.querySelector('.modal-dialog, .modal')?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160),
      }));
      record('D1-make-a-copy-wired', after.modals > before,
        after.modals > before ? `click opened a modal: "${after.text}"` : `click changed nothing (modals ${before} -> ${after.modals}) — silent dead action`);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(1200);
    } else {
      record('D1-make-a-copy-wired', null, 'could not re-open the menu to test the click');
    }
  }
}

/* ----------------------------------------------------------------- D2 ---- */
/* Two additions: an explainer under "Setting up your board..." while copying,
   and a success flash on the SELF-pick path (which used to transition silently).
   Entry is /board-picker -- the standalone home-board picker. With no
   setup_user it resolves for_self=true, which is precisely the self-pick branch
   whose silent transition D2 added a confirmation to. */
async function checkD2(page) {
  await page.goto(`${BASE}/board-picker`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);

  // Open a board's preview from the picker.
  const card = page.locator('.board-icon, .md-board-icon, [class*="board-icon"]').first();
  if (!(await card.isVisible({ timeout: 8000 }).catch(() => false))) {
    record('D2', null, 'No board cards rendered on /board-picker; flow not driven.');
    return;
  }
  await card.click();
  await page.waitForTimeout(4000);

  const confirm = page.getByRole('button', { name: /Pick this Board/i }).first();
  if (await confirm.isVisible({ timeout: 8000 }).catch(() => false)) {
    await confirm.click();
  } else {
    const seen = await page.locator('.modal-dialog, .modal').first().innerText().catch(() => '(no modal)');
    record('D2', null, `Preview opened but no "Pick this Board" CTA (not in pick_for_home_mode). Modal said: "${seen.replace(/\s+/g, ' ').slice(0, 160)}"`);
    return;
  }

  // Poll hard for the copying overlay -- it is transient.
  let sawSubtext = null, sawSpinnerText = false;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const snap = await page.evaluate(() => {
      const sub = document.querySelector('.md-board-details-modal__overlay-subtext');
      const main = document.querySelector('.md-board-details-modal__overlay-text');
      return {
        sub: sub ? sub.innerText.trim().replace(/\s+/g, ' ') : null,
        main: main ? main.innerText.trim().replace(/\s+/g, ' ') : null,
      };
    }).catch(() => ({ sub: null, main: null }));
    if (snap.main) sawSpinnerText = true;
    if (snap.sub) { sawSubtext = snap.sub; break; }
    if (/home board/i.test(await page.locator('body').innerText().catch(() => ''))) break;
    await page.waitForTimeout(400);
  }

  record('D2-copy-explainer', sawSubtext ? true : (sawSpinnerText ? false : null),
    sawSubtext ? `explainer rendered under the spinner: "${sawSubtext}"`
      : sawSpinnerText ? 'spinner label appeared but the __overlay-subtext explainer never rendered'
        : 'never observed the copying overlay — the copy may have been instant or the flow diverged');

  /* Wait for the completion confirmation. modal.success routes simple flashes
     through the modern .ll-toast component (utils/modal.js:44), NOT the legacy
     .flash-message outlet — so poll both. It is meant to survive the route
     change and land on the new board. */
  let flash = null, anyToast = null, arrived = null;
  const flashDeadline = Date.now() + 150000;
  while (Date.now() < flashDeadline) {
    const snap = await page.evaluate(() => {
      const grab = (s) => [...document.querySelectorAll(s)].map((el) => (el.innerText || '').trim().replace(/\s+/g, ' ')).filter(Boolean);
      return {
        toasts: grab('.ll-toast__message, .ll-toast'),
        legacy: grab('.flash-message, .alert-success'),
        url: location.pathname,
      };
    }).catch(() => ({ toasts: [], legacy: [], url: '' }));
    const all = [...snap.toasts, ...snap.legacy];
    if (all.length && !anyToast) anyToast = all.join(' | ').slice(0, 200);
    const hit = all.find((t) => /home board/i.test(t));
    if (hit) { flash = hit.slice(0, 200); }
    // board-detail is where the pick hands off to; that marks the copy done.
    if (/board-detail/.test(snap.url)) arrived = snap.url;
    if (flash) break;
    await page.waitForTimeout(400);
  }

  record('D2-copy-completed', !!arrived,
    arrived ? `pick completed and handed off to ${arrived}` : 'never transitioned to board-detail — the copy did not complete, so the flash assertion below is not conclusive');

  record('D2-completion-flash', !!flash,
    flash ? `confirmation shown: "${flash}"`
      : `no "…now your home board…" confirmation within 150s. Other toasts seen: ${anyToast || '(none at all)'}`);
}

/* ---------------------------------------------------------------------- */
(async () => {
  const browser = await chromium.launch({ headless: !HEADED });
  // 1440x900: board-detail nags about screen size below this, and the nag hides
  // the header entirely. Still a realistic laptop size.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log(`  [console error] ${String(e).slice(0, 160)}`));
  try {
    await login(page);
    console.log(`Logged in as ${USER}; at ${page.url()}\n`);

    if (wants('d10')) await checkD10(page);
    if (wants('d1')) await checkD1(page);
    if (wants('d2') && RUN_D2) await checkD2(page);
  } catch (e) {
    record('harness', false, `threw: ${e.message}`);
  } finally {
    console.log('\n===== SUMMARY =====');
    for (const r of results) {
      console.log(`${r.pass === true ? 'PASS        ' : r.pass === false ? 'FAIL        ' : 'INCONCLUSIVE'} ${r.id}`);
    }
    const failed = results.filter((r) => r.pass === false).length;
    const incon = results.filter((r) => r.pass === null).length;
    console.log(`\n${results.filter((r) => r.pass === true).length} passed, ${failed} failed, ${incon} inconclusive`);
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
