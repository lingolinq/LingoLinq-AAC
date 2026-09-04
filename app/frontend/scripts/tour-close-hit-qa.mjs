/**
 * Guided tour on board-detail speak: why won't the X close the modal when DevTools is open?
 *
 * DevTools opening RESIZES the viewport, and `guided-tour#_onTourResize` early-returns for
 * any step whose id is not `home_tour_card_*` — this tour's steps are `board_detail_speak_*`.
 * So nothing re-lays-out on resize. The question is whether Shepherd's modal OVERLAY ends up
 * covering the X.
 *
 * Answers it by hit-testing: `document.elementFromPoint` at the X's centre tells us which
 * element would actually receive the click, before and after a resize. "It doesn't click" and
 * "something is on top of it" are otherwise indistinguishable.
 *
 * Usage:
 *   node scripts/tour-close-hit-qa.mjs --user <u> --pass <p> --board <slug>
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const BOARD = OPTS.arg('--board', null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HITTEST = () => {
  const x = document.querySelector('.shepherd-cancel-icon');
  if (!x) { return { no_x: true, shepherd: !!document.querySelector('.shepherd-element') }; }
  const r = x.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2);
  const cy = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint(cx, cy);
  const ov = document.querySelector('.shepherd-modal-overlay-container');
  const ovr = ov ? ov.getBoundingClientRect() : null;
  const describe = (el) => {
    if (!el) { return '(nothing)'; }
    return el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  };
  return {
    viewport: window.innerWidth + 'x' + window.innerHeight,
    x_at: cx + ',' + cy,
    hit: describe(hit),
    /* Does the click actually reach the X, or something layered over it? */
    reaches_x: !!(hit && (hit === x || x.contains(hit) || hit.closest('.shepherd-cancel-icon'))),
    overlay: ov ? Math.round(ovr.width) + 'x' + Math.round(ovr.height) + ' @' + Math.round(ovr.left) + ',' + Math.round(ovr.top) : '(none)',
    overlay_pe: ov ? getComputedStyle(ov).pointerEvents : '-'
  };
};

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  try {
    await login(page, OPTS);
    await page.setViewport({ width: 1600, height: 900 });
    await page.goto(`${OPTS.BASE}/${OPTS.USER}/board-detail/${BOARD}`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('.md-board-detail-grid', { timeout: 30000 });
    await sleep(3500);

    const started = await page.evaluate(() => {
      const t = [...document.querySelectorAll('button, a')]
        .find((b) => /take a tour/i.test((b.textContent || '') + (b.getAttribute('aria-label') || '')));
      if (t) { t.click(); return 'trigger'; }
      return null;
    });
    if (!started) {
      /* The trigger lives in the Board Actions menu on this page — open it first. */
      await page.evaluate(() => {
        const m = document.querySelector('[data-bd-action="toggle_options_menu"], .md-board-detail-actions-menu-trigger, [aria-label*="menu" i]');
        if (m) { m.click(); }
      });
      await sleep(1200);
      await page.evaluate(() => {
        const t = [...document.querySelectorAll('button, a')]
          .find((b) => /take a tour/i.test((b.textContent || '') + (b.getAttribute('aria-label') || '')));
        if (t) { t.click(); }
      });
    }
    await sleep(4000);

    let s = await page.evaluate(HITTEST);
    console.log('1. tour open, viewport as-loaded');
    console.log('   ' + JSON.stringify(s));

    /* Simulate DevTools opening: the viewport shrinks, nothing else changes. */
    await page.setViewport({ width: 1100, height: 700 });
    await sleep(2000);
    s = await page.evaluate(HITTEST);
    console.log('2. after shrinking the viewport (what opening DevTools does)');
    console.log('   ' + JSON.stringify(s));

    /* HEIGHT SWEEP. The X sat at y=146 in a 900px-tall viewport and y=47 at 700px — it is
       tracking the top of a dialog that is taller than the space it has. DevTools docked to
       the BOTTOM (the default) takes height, so the interesting axis is vertical, not the
       square resize tested above. Walk the height down and find where the X leaves reach. */
    console.log('2a. height sweep');
    for (const h of [800, 700, 640, 600, 560, 520, 480, 440, 400]) {
      await page.setViewport({ width: 1100, height: h });
      await sleep(700);
      const f = await page.evaluate(HITTEST);
      const y = parseInt((f.x_at || '0,0').split(',')[1], 10);
      console.log(`    ${String(h).padStart(4)}px tall -> X at y=${String(y).padStart(5)}  reaches_x=${f.reaches_x}  hit=${f.hit}${f.reaches_x ? '' : '   <-- UNCLICKABLE'}`);
    }
    await page.setViewport({ width: 1100, height: 700 });
    await sleep(800);

    /* THE DEVICE QUESTION. DevTools' device toolbar also turns on TOUCH EMULATION, and this
       app installs a global AAC input layer (raw_events.js: buttonTracker touch/pointer
       handlers for dwell, scanning and eye-gaze) that can preventDefault a tap. A real phone
       or tablet emits the same touch events, so if the X fails under emulation it fails on
       hardware — which is the part that matters. */
    const cdp = await page.target().createCDPSession();
    await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
    await sleep(1200);
    s = await page.evaluate(HITTEST);
    console.log('2b. with TOUCH EMULATION on (what the device toolbar adds)');
    console.log('   ' + JSON.stringify(s));
    const tapped = await page.evaluate(async () => {
      const x = document.querySelector('.shepherd-cancel-icon');
      if (!x) { return 'no X'; }
      const r = x.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy };
      const t = new Touch({ identifier: 1, target: x, clientX: cx, clientY: cy });
      x.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t], targetTouches: [t], changedTouches: [t] }));
      x.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [t] }));
      x.dispatchEvent(new MouseEvent('mousedown', opts));
      x.dispatchEvent(new MouseEvent('mouseup', opts));
      /* Deliberately NOT dispatching `click` — an earlier run closed the tour here and left
         the attached-step test below with nothing to measure. touchstart/touchend/mouseup
         landing on the X is what proves the AAC input layer is not swallowing the tap. */
      return 'touch reached the X (close withheld)';
    });
    await sleep(1500);
    const goneTouch = await page.evaluate(() => !document.querySelector('.shepherd-element'));
    console.log(`2c. ${tapped} the X as a TOUCH -> tour closed? ${goneTouch}`);
    if (goneTouch) { console.log('   (reopening for the plain-click check below)'); }

    /* ATTACHED-STEP DRIFT — the real device question. `_onTourResize` early-returns unless a
       step id starts with `home_tour_card_`; these are `board_detail_speak_tour_*`. So on an
       orientation change or a keyboard opening, does the spotlight still line up with the
       element it is describing? */
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.shepherd-button')]
        .find((x) => /start the tour/i.test(x.textContent || ''));
      if (b) { b.click(); }
    });
    await sleep(2500);
    const drift = async (label) => page.evaluate((lbl) => {
      const el = document.querySelector('.shepherd-element');
      const tgt = document.querySelector('.shepherd-target, .shepherd-enabled');
      if (!el) { return { lbl, none: true }; }
      const p = el.getBoundingClientRect();
      const t = tgt ? tgt.getBoundingClientRect() : null;
      return {
        lbl,
        step: el.getAttribute('data-shepherd-step-id') || '(?)',
        popover: Math.round(p.left) + ',' + Math.round(p.top),
        target: t ? Math.round(t.left) + ',' + Math.round(t.top) + ' ' + Math.round(t.width) + 'x' + Math.round(t.height) : '(none)',
        onscreen: p.top >= 0 && p.left >= 0 && p.right <= window.innerWidth && p.bottom <= window.innerHeight
      };
    }, label);
    console.log('2d. attached step, before/after an orientation-style resize');
    console.log('    ' + JSON.stringify(await drift('landscape 1100x700')));
    await page.setViewport({ width: 700, height: 1100 });
    await sleep(2000);
    console.log('    ' + JSON.stringify(await drift('portrait  700x1100')));
    await page.setViewport({ width: 1100, height: 700 });
    await sleep(1500);

    const closed = await page.evaluate(() => {
      const x = document.querySelector('.shepherd-cancel-icon');
      if (!x) { return 'no X'; }
      x.click();
      return 'clicked';
    });
    await sleep(1500);
    const gone = await page.evaluate(() => !document.querySelector('.shepherd-element'));
    console.log(`3. ${closed} the X -> tour closed? ${gone}`);
  } finally { await browser.close(); }
})();
