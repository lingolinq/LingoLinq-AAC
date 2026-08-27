/**
 * Boards page: the board-count pills are hidden in SIDE-BY-SIDE only.
 *
 * "N in folders  ·  N in this section" (+ the home-board (i) affordance) restate
 * what the side-by-side layout already shows — the folders column is on screen
 * beside the grid — and cost a header row in a narrower column. They stay in
 * TOP-DOWN, which is the negative control here: same page, same element, only the
 * layout attribute differs, so a pass cannot come from the element simply being
 * absent for this account.
 *
 * Drives the REAL radio buttons in <BoardsLayoutToggle> rather than writing
 * `data-boards-layout` directly, so the component's own persistence path runs.
 *
 * Usage:
 *   nvm use 22 && node scripts/boards-summary-stats-layout-qa.mjs \
 *     --user marcus_williams_slp --pass 'demo2025!' [--headed]
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const results = [];
const pass = (n, d) => { results.push({ n, ok: true }); console.log(`  PASS  ${n}\n        ${d}`); };
const fail = (n, d) => { results.push({ n, ok: false }); console.log(`  FAIL  ${n}\n        ${d}`); };

const SNAP = () => {
  const el = document.querySelector('.ub-boards-page__boards-summary-stats');
  const cs = el ? getComputedStyle(el) : null;
  return {
    layout: document.body.getAttribute('data-boards-layout'),
    present: !!el,
    display: cs ? cs.display : null,
    visible: !!(el && el.getClientRects().length > 0),
    text: el ? (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) : null,
    // the leading hairline is a ::before on the same element — it must go too
    dividerPainted: !!(el && cs && cs.display !== 'none')
  };
};

async function chooseLayout(page, which) {
  const idx = which === 'side-by-side' ? 0 : 1;
  const btns = await page.$$('.ub-boards-page__layout-toggle-btn');
  if (btns.length < 2) { throw new Error(`layout toggle not on the page (found ${btns.length} buttons)`); }
  await btns[idx].click();
  await new Promise((r) => setTimeout(r, 900));
}

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
  try {
    console.log(`\nBASE ${OPTS.BASE}  USER ${OPTS.USER}`);
    await login(page, OPTS);
    await page.goto(`${OPTS.BASE}/${OPTS.USER}/boards`, { waitUntil: 'networkidle2' });
    // wait for the counts to exist at all (they render only once my_boards is done)
    await page.waitForFunction(
      () => !!document.querySelector('.ub-boards-page__boards-summary-stats'),
      { timeout: 45000 }
    ).catch(() => {});

    // ---- precondition: TOP-DOWN shows them, or nothing below means anything ----
    await chooseLayout(page, 'top-down');
    const top = await page.evaluate(SNAP);
    if (!top.present || !top.visible) {
      fail('0. precondition — counts exist for this account in TOP-DOWN',
        `present=${top.present} visible=${top.visible} display=${top.display}. ` +
        'Without this the side-by-side check would pass vacuously.');
    } else {
      pass('0. precondition — counts exist for this account in TOP-DOWN',
        `layout="${top.layout}", visible, display=${top.display}, text "${top.text}"`);

      // ---- the change under test ----
      await chooseLayout(page, 'side-by-side');
      const side = await page.evaluate(SNAP);
      if (side.layout === 'side-by-side' && side.present && !side.visible && side.display === 'none') {
        pass('1. SIDE-BY-SIDE hides the count pills',
          `layout="${side.layout}", element still in the DOM but display:none — the pills, the ` +
          `"·" separator and the ::before divider all go with the wrapper`);
      } else {
        fail('1. SIDE-BY-SIDE hides the count pills',
          `layout="${side.layout}" present=${side.present} visible=${side.visible} display=${side.display}`);
      }

      // ---- negative control: switching back restores them ----
      await chooseLayout(page, 'top-down');
      const back = await page.evaluate(SNAP);
      if (back.visible && back.display !== 'none') {
        pass('2. TOP-DOWN still shows them (control bites)',
          `back to layout="${back.layout}", display=${back.display}, text "${back.text}" — ` +
          'the hide is scoped to the layout, not applied globally');
      } else {
        fail('2. TOP-DOWN still shows them (control bites)',
          `display=${back.display} visible=${back.visible} — the rule leaked into top-down`);
      }
    }
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
