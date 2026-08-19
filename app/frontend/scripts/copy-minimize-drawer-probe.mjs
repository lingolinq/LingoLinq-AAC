/**
 * Copy-a-board "minimize to background drawer" — behavioural probe.
 *
 * The feature (539a3d9b3, 2026-08-06) says: clicking OUTSIDE the "Copying Board"
 * modal while a copy is IN FLIGHT minimizes it to a bottom-right drawer instead of
 * dismissing it. Its working log verified only that the bundle CONTAINS
 * `backdropAction` / `backdrop_close` / `copy-progress-drawer` — build-level, never
 * a click. This script answers the runtime question.
 *
 *   A.  copy IN FLIGHT -> backdrop click MUST minimize (modal closes, drawer paints)
 *   A2. the backgrounded copy MUST then report completion into that drawer
 *   B.  hierarchy step -> the SAME click MUST plain-dismiss with no drawer
 *
 * B is the negative control, and it is a real app state rather than a hack: same
 * page, same click, same hit-tested point, only the arming condition differs. If A
 * paints a drawer and B does not, the drawer is caused by the arming condition at
 * copying-board.js:351 and not by the click alone.
 *
 * Rules honoured here (each cost real time in a previous session — see LEARNINGS.md
 * "Click-testing UI fixes"):
 *  - REAL CDP mouse click at a hit-tested point, never el.click(): el.click()
 *    bypasses hit testing and would pass against a scrim-covered build.
 *  - A check that cannot observe its own precondition FAILS rather than passes.
 *    Every phase asserts the state it needs BEFORE acting, AND asserts the drawer
 *    is absent before the click — so a leftover drawer can never be read as a pass.
 *  - The in-flight window is WIDENED by delaying the copy POST, so the click lands
 *    in a deterministic multi-second window instead of racing milliseconds.
 *  - State is read from the DOM, not from a container lookup. `window.LingoLinq`
 *    exposes no usable owner here, and a silently-null accessor previously made
 *    this script report a drawer it could not see the state of.
 *
 * Usage:
 *   nvm use 22 && node scripts/copy-minimize-drawer-probe.mjs \
 *     --user marcus_williams_slp --pass 'demo2025!' [--headed]
 */
/* eslint-env node */
import { cliArgs, launch, login, assertAppReady } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const SMALL_BOARD = OPTS.arg('--board', 'lingolinq/one');
const LINKED_BOARD = OPTS.arg('--linked-board', 'lingolinq/vocal-flair-84');
const COPY_DELAY_MS = parseInt(OPTS.arg('--delay', '6000'), 10);

const results = [];
const pass = (n, d) => { results.push({ n, ok: true }); console.log(`  PASS  ${n}\n        ${d}`); };
const fail = (n, d) => { results.push({ n, ok: false }); console.log(`  FAIL  ${n}\n        ${d}`); };

/* ---------- in-page state, DOM only ---------- */

const STATE_FN = () => {
  const q = (s) => document.querySelector(s);
  const label = q('.md-copying-board-loading__label');
  const txt = label ? (label.textContent || '').trim() : null;
  const drawer = q('.ll-copy-drawer');
  // copy-progress-drawer.hbs renders `ll-copy-drawer--{{status}}`, so the status
  // the service holds is legible straight off the element.
  let drawerStatus = null;
  if (drawer) {
    const m = Array.from(drawer.classList).find((c) => /^ll-copy-drawer--/.test(c) && c !== 'll-copy-drawer--above-toast');
    drawerStatus = m ? m.replace('ll-copy-drawer--', '') : '(no modifier)';
  }
  return {
    modalPresent: !!q('.modal'),
    label: txt,
    // "Copying the board X..." is the in-flight branch; "Loading..." is the
    // hierarchy fetch; the picker step renders the expander instead.
    inFlight: !!(txt && /Copying the board/i.test(txt)),
    hierarchyStep: !!q('.md-modal-expander'),
    drawerVisible: !!(drawer && drawer.getClientRects().length > 0),
    drawerStatus,
    drawerHasDismiss: !!q('.ll-copy-drawer__close'),
    drawerText: drawer ? (drawer.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 130) : null
  };
};

const state = (page) => page.evaluate(STATE_FN);

async function waitFor(page, pred, timeout, what) {
  const t0 = Date.now();
  for (;;) {
    const s = await state(page);
    if (pred(s)) { return s; }
    if (Date.now() - t0 > timeout) {
      throw new Error(`timed out after ${timeout}ms waiting for ${what} — last state ${JSON.stringify(s)}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}

/**
 * Clear the drawer the way a user would. While a copy is still running the drawer
 * deliberately offers no dismiss control, so wait for it to settle first.
 */
async function clearDrawer(page, budgetMs) {
  let s = await state(page);
  if (!s.drawerVisible) { return true; }
  if (s.drawerStatus === 'copying') {
    s = await waitFor(page, (x) => !x.drawerVisible || x.drawerStatus !== 'copying', budgetMs, 'the drawer to settle')
      .catch(() => null);
    if (!s) { return false; }
  }
  for (let i = 0; i < 3; i++) {
    const btn = await page.$('.ll-copy-drawer__close');
    if (!btn) { break; }
    await btn.click().catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    if (!(await state(page)).drawerVisible) { return true; }
  }
  return !(await state(page)).drawerVisible;
}

async function closeAnyModal(page) {
  await page.evaluate(() => { try { if (window.modal && window.modal.close) { window.modal.close(); } } catch (e) { /* none open */ } });
  await new Promise((r) => setTimeout(r, 400));
}

/**
 * Open the copying-board modal.
 *  'keep_links' -> skips the hierarchy load and starts copying immediately
 *  'nothing'    -> loads the hierarchy first (the board-picker step)
 */
const openCopyModal = (page, key, action) => page.evaluate(async (boardKey, act) => {
  try {
    const board = await window.LingoLinq.store.findRecord('board', boardKey);
    const me = window.LingoLinq.store.peekRecord('user', 'self');
    window.modal.open('copying-board', { board, action: act, user: me });
    return { ok: true };
  } catch (e) { return { ok: false, error: e && e.message }; }
}, key, action);

/** A REAL mouse click on the backdrop, refusing to click a point that is not it. */
async function backdropClick(page) {
  const pt = await page.evaluate(() => {
    const modal = document.querySelector('.modal');
    const dialog = document.querySelector('.modal-dialog');
    if (!modal || !dialog) { return null; }
    const mr = modal.getBoundingClientRect();
    const dr = dialog.getBoundingClientRect();
    const x = Math.round(Math.max(mr.left + 6, (mr.left + dr.left) / 2));
    const y = Math.round(dr.top + Math.min(dr.height / 2, 200));
    const el = document.elementFromPoint(x, y);
    return { x, y, hitClass: el ? String(el.className || el.tagName) : null,
      hitIsBackdrop: !!(el && el.classList && el.classList.contains('modal')) };
  });
  if (!pt) { throw new Error('no .modal / .modal-dialog on screen — nothing to click'); }
  if (!pt.hitIsBackdrop) {
    throw new Error(`hit test failed: (${pt.x},${pt.y}) resolves to "${pt.hitClass}", not the .modal backdrop`);
  }
  await page.mouse.click(pt.x, pt.y);
  await new Promise((r) => setTimeout(r, 900));
  return pt;
}

/** Refuse to run a phase while a drawer is already on screen. */
async function assertNoDrawer(page, phase) {
  const s = await state(page);
  if (s.drawerVisible) {
    throw new Error(`${phase}: a drawer was ALREADY visible before the click (status=${s.drawerStatus}) — ` +
      'this phase would report a stale drawer as its own result');
  }
}

/* ---------- main ---------- */

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));

  try {
    console.log(`\nBASE ${OPTS.BASE}  USER ${OPTS.USER}`);
    await login(page, OPTS);
    await assertAppReady(page);
    console.log('logged in, app booted\n');

    await page.setRequestInterception(true);
    let held = 0;
    page.on('request', (req) => {
      if (req.method() === 'POST' && /\/api\/v\d+\/boards(\?|$)/.test(req.url())) {
        held++;
        setTimeout(() => { try { req.continue(); } catch (e) { /* handled */ } }, COPY_DELAY_MS);
        return;
      }
      try { req.continue(); } catch (e) { /* handled */ }
    });

    /* ===== A. in-flight copy -> must MINIMIZE ===== */
    console.log('A. backdrop click while a copy is IN FLIGHT');
    await assertNoDrawer(page, 'A');
    if (!(await openCopyModal(page, SMALL_BOARD, 'keep_links')).ok) { throw new Error('could not open the copy modal'); }
    const sA = await waitFor(page, (s) => s.inFlight, 25000, 'the in-flight copy state');
    console.log(`   precondition: label="${sA.label}", no drawer on screen`);

    const ptA = await backdropClick(page);
    const afterA = await state(page);
    const minimized = afterA.drawerVisible && !afterA.modalPresent;

    if (minimized) {
      pass('A. in-flight backdrop click minimizes to the drawer',
        `real click at (${ptA.x},${ptA.y}) on .modal; modal closed and .ll-copy-drawer appeared with ` +
        `status="${afterA.drawerStatus}" — "${afterA.drawerText}"`);
    } else {
      fail('A. in-flight backdrop click minimizes to the drawer',
        `after the click: modalPresent=${afterA.modalPresent}, drawerVisible=${afterA.drawerVisible}`);
    }

    /* ===== A2. the backgrounded copy must report completion ===== */
    if (minimized) {
      const done = await waitFor(page, (s) => s.drawerVisible && s.drawerStatus !== 'copying',
        COPY_DELAY_MS + 45000, 'the backgrounded copy to settle in the drawer').catch((e) => ({ err: e.message }));
      if (done && !done.err && done.drawerStatus === 'done') {
        pass('A2. the backgrounded copy reports completion into the drawer',
          `status went copying -> done without reopening the modal; drawer now reads "${done.drawerText}" ` +
          `(dismiss control present: ${done.drawerHasDismiss})`);
      } else {
        fail('A2. the backgrounded copy reports completion into the drawer',
          done && done.err ? done.err : `expected status "done", got "${done && done.drawerStatus}"`);
      }
    }

    if (!(await clearDrawer(page, 60000))) { throw new Error('could not clear the drawer before phase B'); }
    await closeAnyModal(page);

    /* ===== B. hierarchy step -> must PLAIN-DISMISS (negative control) ===== */
    console.log('\nB. the same backdrop click at the board-picker step (negative control)');
    await assertNoDrawer(page, 'B');
    if (!(await openCopyModal(page, LINKED_BOARD, 'nothing')).ok) { throw new Error('could not open the copy modal for B'); }
    const sB = await waitFor(page, (s) => s.hierarchyStep || s.inFlight, 60000, 'the hierarchy step');

    if (sB.inFlight) {
      fail('B. hierarchy-step backdrop click plain-dismisses',
        `${LINKED_BOARD} went straight to copying, so the control could not run — ` +
        'pass --linked-board with a board that has linked boards');
    } else {
      console.log('   precondition: board-picker step on screen, no drawer');
      const ptB = await backdropClick(page);
      const afterB = await state(page);
      if (!afterB.modalPresent && !afterB.drawerVisible) {
        pass('B. hierarchy-step backdrop click plain-dismisses (control bites)',
          `identical click at (${ptB.x},${ptB.y}) on .modal closed the modal and produced NO drawer — ` +
          'so A\'s drawer comes from the arming condition at copying-board.js:351, not from the click alone');
      } else {
        fail('B. hierarchy-step backdrop click plain-dismisses (control bites)',
          `modalPresent=${afterB.modalPresent}, drawerVisible=${afterB.drawerVisible} — expected a plain dismiss`);
      }
    }

    await clearDrawer(page, 30000);
    await closeAnyModal(page);

    /* ===== C. the X button must DISMISS, not relocate the user ===== */
    /* The X calls the component's own `close` action. Before the fix that used the
       modal SERVICE close, which leaves utils/modal._component_based_template set,
       so modal.is_open('copying-board') still reported true and the settled copy
       took the FOREGROUND branch -- measured: /caseload -> /<user>/board-detail/one_4.
       After the fix `close` uses utils/modal.close, which clears both, so the settle
       handler takes the else-branch and the user stays put. */
    console.log('\nC. dismissing an in-flight copy with the X button');
    await assertNoDrawer(page, 'C');
    await page.goto(OPTS.BASE + '/caseload', { waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1200));
    const urlBeforeX = page.url();
    if (!(await openCopyModal(page, SMALL_BOARD, 'keep_links')).ok) { throw new Error('could not open the copy modal for C'); }
    await waitFor(page, (s) => s.inFlight, 25000, 'the in-flight copy state (C)');

    const xBtn = await page.$('.la-modal-close');
    if (!xBtn) {
      fail('C. X dismisses an in-flight copy without relocating the user', 'no .la-modal-close on the modal');
    } else {
      await xBtn.click();
      await new Promise((r) => setTimeout(r, 900));
      const afterX = await state(page);
      await new Promise((r) => setTimeout(r, COPY_DELAY_MS + 9000));
      const urlAfterX = page.url();
      if (!afterX.drawerVisible && urlAfterX === urlBeforeX) {
        pass('C. X dismisses an in-flight copy without relocating the user',
          `X closed the modal with no drawer (correct -- X is not the minimize gesture), and when the ` +
          `copy settled the app STAYED on ${urlAfterX}. Before the fix this navigated away.`);
      } else if (afterX.drawerVisible) {
        fail('C. X dismisses an in-flight copy without relocating the user',
          `X produced a drawer (status=${afterX.drawerStatus}) — X must dismiss, not minimize`);
      } else {
        fail('C. X dismisses an in-flight copy without relocating the user',
          `the app navigated ${urlBeforeX} -> ${urlAfterX} after dismissing — the stale-flag foreground branch is still live`);
      }
    }
    await clearDrawer(page, 30000);
    await closeAnyModal(page);

    /* ===== D. Escape must behave like the X (regression guard) ===== */
    /* Escape reaches modal-dialog's own close path, which uses @action. That arg was
       undefined until this change (onClose was assigned in didInsertElement, after the
       first render), so Escape only worked via modal-dialog's utils/modal.close
       fallback. Now that @action resolves, Escape routes through the component's
       close() -- which is exactly why close() had to be fixed in the same change. */
    console.log('\nD. dismissing an in-flight copy with the Escape key');
    await assertNoDrawer(page, 'D');
    await page.goto(OPTS.BASE + '/caseload', { waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1200));
    const urlBeforeEsc = page.url();
    if (!(await openCopyModal(page, SMALL_BOARD, 'keep_links')).ok) { throw new Error('could not open the copy modal for D'); }
    await waitFor(page, (s) => s.inFlight, 25000, 'the in-flight copy state (D)');
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 900));
    const afterEsc = await state(page);
    await new Promise((r) => setTimeout(r, COPY_DELAY_MS + 9000));
    const urlAfterEsc = page.url();
    if (!afterEsc.modalPresent && !afterEsc.drawerVisible && urlAfterEsc === urlBeforeEsc) {
      pass('D. Escape dismisses without relocating the user',
        `Escape closed the modal, no drawer, and the settled copy left the app on ${urlAfterEsc} — ` +
        'the close() fix covers the newly-live @action path as well as the X');
    } else {
      fail('D. Escape dismisses without relocating the user',
        `modalPresent=${afterEsc.modalPresent}, drawerVisible=${afterEsc.drawerVisible}, ` +
        `url ${urlBeforeEsc} -> ${urlAfterEsc}`);
    }

    await clearDrawer(page, 30000);
    await closeAnyModal(page);
    console.log(`\n(held ${held} copy POST(s) for ${COPY_DELAY_MS}ms each to widen the in-flight window)`);
  } catch (e) {
    fail('run', e.message);
  } finally {
    const bad = results.filter((r) => !r.ok);
    console.log('\n' + '='.repeat(72));
    console.log(`${results.length - bad.length} passed, ${bad.length} failed`);
    console.log('='.repeat(72) + '\n');
    await browser.close();
    process.exit(bad.length ? 1 : 0);
  }
})();
