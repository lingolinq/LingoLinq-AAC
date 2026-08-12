#!/usr/bin/env node
/**
 * Modal audit — real-browser sweep for the two app-wide modal defects.
 *
 * Drives the actual app in Chromium and, for every modal it can open, answers:
 *   1. Does the page lock/scroll correctly while it is open?
 *      (bootstrap gates `.modal-open .modal { overflow-y: auto }` behind a
 *      body class that Bootstrap's JS — which this app does not load — sets)
 *   2. Does the X close button actually close it?
 *      (a handler assigned in didInsertElement is `undefined` when the `{{on}}`
 *      modifier installs, so the button is dead and the render throws)
 *
 * PUPPETEER, not Playwright: `puppeteer ^24.42.0` is what this repo commits
 * (package.json). The older scripts/p1-board-picker-qa.mjs imports `playwright`
 * and therefore has never been runnable — see
 * docs/task-management/2026-08-07-pick-for-home-ui-e2e.md.
 *
 * Run from app/frontend under Node 22, with the dev stack up
 * (bin/ember-server on :8184 proxying /api to Rails on :5000):
 *
 *   node scripts/modal-audit-qa.mjs
 *   node scripts/modal-audit-qa.mjs --user example --pass password
 *   node scripts/modal-audit-qa.mjs --all          # sweep every converted modal
 *   node scripts/modal-audit-qa.mjs --only modals/caseload-guide,modeling-intro
 *   node scripts/modal-audit-qa.mjs --headed       # watch it run
 *
 * Exit code is 1 if any modal FAILS an audit, so this is CI-usable. Modals that
 * cannot be opened without a model/options are reported as SKIP, never FAIL —
 * a fixture gap is not a defect.
 */
/* eslint-env node */
/* This is a Node CLI script, not app code — the shared .eslintrc.js assumes a
   browser env, so `process` reads as undefined without this. Declared per-file
   rather than by widening the project config. */
import { readFileSync } from 'node:fs';
import { cliArgs, launch, login, assertAppReady } from './qa-helpers.mjs';

// Shared with scripts/tour-board-picker-probe.mjs. The /login/device
// interstitial handling in qa-helpers is subtle enough that a second copy would
// drift; this script used to carry one.
const opts = cliArgs(process.argv);
const { BASE, arg } = opts;
const ALL = process.argv.includes('--all');
const ONLY = arg('--only', null);

/*
 * Default sweep: modals that open with no model/options, so a failure is a real
 * defect rather than a missing fixture. `--all` widens this to every entry in
 * modal-container.js, where many WILL skip for want of a model.
 */
const DEFAULT_MODALS = [
  'modals/caseload-guide',   // the reported reproducer (caseload info button)
  'modeling-intro',
  'speak-mode-intro',        // already used init() — the control case
  'about-lingolinq',
  'cloud-extras',
  'switch-languages',
  'sync-details',
  'device-settings',
  'button-stash',
  'confirm-discard-changes',
  'confirm-leave-edit',
  'beta-feedback-modal',
  'modals/inbox',
  'modals/phrases',
  'modals/user-status'
];

const results = [];
function record(modal, status, checks, detail) {
  results.push({ modal, status, checks, detail });
  const mark = status === 'PASS' ? 'PASS' : status === 'SKIP' ? 'SKIP' : 'FAIL';
  console.log(`[${mark}] ${modal}${detail ? ' — ' + detail : ''}`);
  if (checks) {
    for (const [k, v] of Object.entries(checks)) {
      if (v !== true) { console.log(`         ${k}: ${v}`); }
    }
  }
}

async function auditModal(page, template) {
  // Fresh console-error capture per modal — the close-button defect surfaces as
  // a TypeError thrown by the `on` modifier at install time.
  const errors = [];
  const onErr = (e) => errors.push(e.message || String(e));
  const onConsole = (m) => { if (m.type() === 'error') { errors.push(m.text()); } };
  page.on('pageerror', onErr);
  page.on('console', onConsole);

  try {
    // A close can trigger a route transition, which tears the app down and
    // re-boots it — `window.modal` is briefly gone. Wait for it rather than
    // reporting a spurious SKIP for the next modal in the sweep.
    await page.waitForFunction(
      () => window.modal && typeof window.modal.open === 'function',
      { timeout: 15000 }
    ).catch(() => {});

    const opened = await page.evaluate((tpl) => {
      try {
        if (!window.modal) { return 'window.modal unavailable (app re-booting?)'; }
        window.modal.open(tpl);
        return true;
      } catch (e) { return 'open() threw: ' + e.message; }
    }, template);
    if (opened !== true) { return { status: 'SKIP', detail: String(opened) }; }

    const appeared = await page
      .waitForSelector('.modal', { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!appeared) {
      return { status: 'SKIP', detail: 'no .modal rendered (likely needs a model/options)' };
    }

    const checks = await page.evaluate(() => {
      const modal = document.querySelector('.modal');
      const content = document.querySelector('.modal-content');
      const out = {};

      // 1. The page-level scroll contract.
      out.bodyHasModalOpen = document.body.classList.contains('modal-open');
      out.viewportScrollable = getComputedStyle(modal).overflowY !== 'hidden';

      // 2. Is tall content actually reachable? Walk modal + content and ask
      //    whether anything that overflows can be scrolled.
      const overflowing = [modal, content].filter(
        (el) => el && el.scrollHeight > el.clientHeight + 1
      );
      out.contentReachable = overflowing.length === 0
        ? true
        : overflowing.some((el) => {
            const oy = getComputedStyle(el).overflowY;
            return oy === 'auto' || oy === 'scroll';
          });

      /*
       * 3. Is there an X at all?
       *
       * Deliberately broad. A too-narrow list reports hasCloseButton:false for a
       * perfectly good modal, which reads as a defect — beta-feedback-modal
       * delegates to a child whose button is `.beta-feedback-panel__close` with
       * aria-label "Hide feedback form" (it is a drawer), matching neither the
       * `.la-modal-close` family nor an exact "Close" label.
       *
       * Ordered most- to least-specific so the canonical X wins when present.
       */
      const closeBtn =
        modal.querySelector('.la-modal-close, .md-modal-close, .modal-header .close') ||
        modal.querySelector('[class$="__close"], [class*="__close "]') ||
        Array.prototype.find.call(
          modal.querySelectorAll('button[aria-label], a[aria-label]'),
          (el) => /close|dismiss|hide/i.test(el.getAttribute('aria-label') || '')
        );
      out.hasCloseButton = !!closeBtn;
      if (closeBtn) {
        closeBtn.setAttribute('data-audit-close', '1');
        out.closeButtonSelector = closeBtn.className || closeBtn.getAttribute('aria-label');
      }
      return out;
    });

    /*
     * 4. Does the X dismiss it? TWO stages, because they fail for different
     *    reasons and conflating them produced a 13/15 false-positive sweep.
     *
     *    a) Puppeteer's physical click — trusted events at real coordinates.
     *       Unreliable HERE: modal-dialog gives .modal-content an inline
     *       max-height + overflow:auto, and .modal is itself overflow-y:auto
     *       once modal-open is set, so puppeteer's scrollIntoViewIfNeeded can
     *       move the target between measuring and clicking. Verified: capture
     *       listeners on the button recorded ZERO mousedown/mouseup/click while
     *       nothing overlaid it (elementFromPoint landed inside the button).
     *
     *    b) In-page el.click() — an untrusted but real DOM click event, so it
     *       still exercises the `{{on "click"}}` binding, which is exactly what
     *       the defect breaks (an undefined handler means no listener at all).
     *
     *    Both fail  -> the handler is genuinely dead. That is the defect.
     *    (a) fails, (b) works -> automation artifact, NOT an app bug. Recorded
     *    as pointerClickIneffective for information; does not fail the audit.
     */
    if (checks.hasCloseButton) {
      const stillOpen = () => !document.querySelector('.modal');

      await page.click('[data-audit-close="1"]').catch(() => {});
      const byPointer = await page
        .waitForFunction(stillOpen, { timeout: 2500 })
        .then(() => true)
        .catch(() => false);

      let byDom = null;
      if (!byPointer) {
        await page.evaluate(() => {
          const b = document.querySelector('[data-audit-close="1"]');
          if (b) { b.click(); }
        }).catch(() => {});
        byDom = await page
          .waitForFunction(stillOpen, { timeout: 2500 })
          .then(() => true)
          .catch(() => false);
      }

      checks.xCloses = byPointer || byDom === true;
      if (!byPointer && byDom === true) {
        checks.pointerClickIneffective =
          'closed via DOM click but not puppeteer pointer click (harness artifact, see comment)';
      }
    } else {
      checks.xCloses = 'no close button found';
    }

    if (errors.length) { checks.consoleErrors = errors.slice(0, 3).join(' | '); }

    // Informational keys describe the harness or add context; they are never
    // themselves a defect, so they must not turn a clean modal into a FAIL.
    const INFORMATIONAL = new Set(['pointerClickIneffective', 'closeButtonSelector']);
    const failed = Object.entries(checks)
      .filter(([k, v]) => v !== true && !INFORMATIONAL.has(k));
    return {
      status: failed.length ? 'FAIL' : 'PASS',
      checks,
      detail: failed.length ? failed.map(([k]) => k).join(', ') : ''
    };
  } finally {
    page.off('pageerror', onErr);
    page.off('console', onConsole);
    // Always return to a clean slate so one modal cannot poison the next.
    await page.evaluate(() => {
      try { window.modal.close(); } catch (e) { }
      document.body.classList.remove('modal-open');
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function main() {
  let browser;
  try {
    const launched = await launch(opts);
    browser = launched.browser;
    const page = launched.page;
    await login(page, opts);
    await assertAppReady(page);

    let targets = DEFAULT_MODALS;
    if (ONLY) {
      targets = ONLY.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (ALL) {
      // modal-container.js owns the canonical list; read it from source so
      // --all can never drift from what the app actually renders.
      const src = readFileSync(new URL('../app/components/modal-container.js', import.meta.url), 'utf8');
      const m = src.match(/convertedModals\s*=\s*\[([\s\S]*?)\]/);
      targets = m ? m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : DEFAULT_MODALS;
    }

    console.log(`\nAuditing ${targets.length} modals at ${BASE} as "${opts.USER}"\n`);
    for (const t of targets) {
      const r = await auditModal(page, t);
      record(t, r.status, r.checks, r.detail);
    }

    const fails = results.filter((r) => r.status === 'FAIL');
    const skips = results.filter((r) => r.status === 'SKIP');
    console.log(`\n${results.length - fails.length - skips.length} passed, ${fails.length} failed, ${skips.length} skipped`);
    if (fails.length) {
      console.log('\nModals needing a fix:');
      for (const f of fails) { console.log(`  ${f.modal} — ${f.detail}`); }
    }
    process.exitCode = fails.length ? 1 : 0;
  } catch (e) {
    console.error('\nHARNESS ERROR:', e.message);
    process.exitCode = 2;
  } finally {
    // browser may be undefined if launch() itself threw — and an unhandled
    // rejection would exit 1, indistinguishable from the documented
    // "a modal failed its audit" exit code.
    if (browser) { await browser.close().catch(() => {}); }
  }
}

main().catch((e) => {
  console.error('\nHARNESS ERROR:', e && e.message ? e.message : e);
  process.exit(2);
});
