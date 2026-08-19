/**
 * Categorize panel: the switch is prominent, and turning it OFF actually turns
 * categorizing off in the panel.
 *
 * Before this change the checkbox saved the preference but nothing else in the
 * panel responded: `@forceGrouping={{true}}` was hard-coded on the preview grid, so
 * `BoardDetailGrid#groupingEnabled` short-circuited before consulting the
 * preference and the preview stayed grouped; the category order list and the
 * "Reset order" button stayed on screen with nothing to act on.
 *
 * Asserts, on the real board-detail edit page:
 *   1. the switch renders as a switch (track + knob + an On/Off word) and is a
 *      substantially bigger hit target than the 18px checkbox it replaced
 *   2. ON  -> order list present, Reset present, preview grid grouped
 *   3. OFF -> order list gone, Reset gone, preview grid NOT grouped
 *   4. back ON -> all three return (so the off state is a toggle, not a one-way door)
 *   5. the underlying <input type="checkbox"> is still focusable (the switch is
 *      painted, not replaced)
 *
 * Grouping is read off `.md-board-detail-grid--grouped`, which
 * board-detail-grid.hbs puts on the grid root from `groupingEnabled` — the same
 * flag that decides whether panels render, so it cannot drift from what is drawn.
 *
 * Usage:
 *   node scripts/board-categorize-toggle-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const results = [];
const pass = (n, d) => { results.push({ n, ok: true }); console.log(`  PASS  ${n}\n        ${d}`); };
const fail = (n, d) => { results.push({ n, ok: false }); console.log(`  FAIL  ${n}\n        ${d}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PANEL = () => {
  const q = (s) => document.querySelector(s);
  const vis = (el) => !!(el && el.getClientRects().length > 0);
  const toggle = q('.md-board-category-order__toggle');
  const grid = q('.md-board-category-order__preview .md-board-detail-grid');
  const box = toggle ? toggle.getBoundingClientRect() : null;
  return {
    panel: vis(q('.md-board-category-order')),
    toggle: vis(toggle),
    toggleW: box ? Math.round(box.width) : 0,
    toggleH: box ? Math.round(box.height) : 0,
    track: vis(q('.md-board-category-order__toggle-track')),
    knob: !!q('.md-board-category-order__toggle-knob'),
    stateWord: ((q('.md-board-category-order__toggle-state') || {}).textContent || '').trim() || null,
    input: !!q('.md-board-category-order__toggle input[type="checkbox"]'),
    checked: !!(q('.md-board-category-order__toggle input[type="checkbox"]') || {}).checked,
    list: vis(q('.md-board-category-order__list')),
    listItems: document.querySelectorAll('.md-board-category-order__item').length,
    reset: vis(q('.md-board-category-order__reset')),
    close: vis(q('.md-board-category-order__close')),
    picker: vis(q('.md-board-category-order__picker')),
    previewBtns: document.querySelectorAll('.md-board-category-order__preview .md-board-detail-symbol-card').length,
    previewGrid: !!grid,
    grouped: !!(grid && grid.classList.contains('md-board-detail-grid--grouped'))
  };
};

// Real CDP click at the element's centre.
const clickEl = async (page, sel) => {
  const h = await page.$(sel);
  if (!h) { return false; }
  const b = await h.boundingBox();
  if (!b) { return false; }
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  return true;
};

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
  const u = OPTS.USER;
  try {
    console.log(`\nBASE ${OPTS.BASE}  USER ${OPTS.USER}`);
    await login(page, OPTS);

    /* Find a board this user can edit. Board TILES are `div[role=button]`, not
       anchors (board-icon.hbs:35), so there is no href to scrape — read the key off
       the app state instead. `window.appState` is the app-state service
       (services/app-state.js:72); the home board is one this user owns. */
    await page.goto(`${OPTS.BASE}/${u}/boards`, { waitUntil: 'domcontentloaded' });
    await sleep(6000);
    const key = OPTS.arg('--board', null) || await page.evaluate(() => {
      const as = window.appState;
      if (!as || !as.get) { return null; }
      return as.get('currentUser.preferences.home_board.key') || null;
    });
    if (!key) { fail('precondition — found a board to edit', 'no home_board.key on appState; pass --board <owner/key>'); throw new Error('no board'); }
    const name = key.split('/').pop();
    console.log(`   board: ${key}  ->  /${u}/board-detail/${name}`);

    await page.goto(`${OPTS.BASE}/${u}/board-detail/${name}`, { waitUntil: 'domcontentloaded' });
    await sleep(8000);

    /* The edit rail (and with it the Categorize entry) only renders under
       edit_mode. `enter_edit_mode` is the page's own action for that
       (board-detail.hbs:941, :1640, :1900); the visible one is the
       `.md-board-detail-edit-btn` in the toolbar. Click it for real, and only if
       it is not on screen fall back to the actions menu that also carries it. */
    let entry = await page.$('[data-bd-action="toggle_category_order"]');
    if (!entry) {
      const clickedEdit = await clickEl(page, '[data-bd-action="enter_edit_mode"]');
      if (!clickedEdit) {
        await page.evaluate(() => {
          const m = document.querySelector('[data-bd-action="toggle_options_menu"]');
          if (m) { m.click(); }
        });
        await sleep(1500);
        await clickEl(page, '[data-bd-action="enter_edit_mode"]');
      }
      await sleep(5000);
      entry = await page.$('[data-bd-action="toggle_category_order"]');
    }
    if (!entry) {
      const diag = await page.evaluate(() => ({
        url: location.pathname,
        editPanel: !!document.querySelector('.md-board-edit-panel'),
        editMode: !!(window.appState && window.appState.get && window.appState.get('edit_mode')),
        actions: [...document.querySelectorAll('[data-bd-action]')].map((n) => n.getAttribute('data-bd-action')).slice(0, 24)
      }));
      fail('precondition — Categorize entry reachable in the edit rail', JSON.stringify(diag));
      throw new Error('no categorize entry');
    }
    pass('precondition — Categorize entry reachable in the edit rail', 'data-bd-action="toggle_category_order" present');

    await clickEl(page, '[data-bd-action="toggle_category_order"]');
    await page.waitForSelector('.md-board-category-order', { visible: true, timeout: 20000 }).catch(() => {});
    await sleep(2000);

    let s = await page.evaluate(PANEL);
    if (!s.panel) { fail('precondition — Categorize panel opened', JSON.stringify(s)); throw new Error('panel'); }

    /* 1. Prominence. The old control was a bare 18px checkbox + text label; the
       switch is a padded pill carrying a track, knob and a state word. Assert the
       parts AND the size, since "looks bigger" is the actual complaint. */
    if (s.track && s.knob && s.stateWord && s.toggleH >= 34 && s.toggleW >= 150) {
      pass('1. the switch reads as a switch, not a stray checkbox',
        `track+knob present, state word "${s.stateWord}", hit target ${s.toggleW}x${s.toggleH}px`);
    } else {
      fail('1. the switch reads as a switch, not a stray checkbox', JSON.stringify(s));
    }

    if (s.input) {
      const focused = await page.evaluate(() => {
        const i = document.querySelector('.md-board-category-order__toggle input[type="checkbox"]');
        i.focus();
        return document.activeElement === i;
      });
      if (focused) { pass('5. the real checkbox is still focusable', 'input[type=checkbox] took focus — painted, not replaced'); }
      else { fail('5. the real checkbox is still focusable', 'input did not take focus'); }
    } else {
      fail('5. the real checkbox is still focusable', 'no input[type=checkbox] inside the toggle');
    }

    /* Normalise to ON first — the preference persists between runs. */
    if (!s.checked) { await clickEl(page, '.md-board-category-order__toggle-track'); await sleep(2500); s = await page.evaluate(PANEL); }

    if (s.checked && s.list && s.reset && s.grouped) {
      pass('2. ON — order list, Reset and a GROUPED preview',
        `${s.listItems} categories listed, Reset visible, preview grid carries --grouped`);
    } else {
      fail('2. ON — order list, Reset and a GROUPED preview', JSON.stringify(s));
    }

    /* 3. OFF */
    await clickEl(page, '.md-board-category-order__toggle-track');
    await sleep(3000);
    const off = await page.evaluate(PANEL);
    const offOk = !off.checked && !off.list && !off.reset && off.previewGrid && !off.grouped;
    if (offOk) {
      pass('3. OFF — list and Reset gone, preview back to the original board',
        `checked=false, list=${off.list}, reset=${off.reset}, preview grid present but --grouped=${off.grouped}, state word "${off.stateWord}"`);
    } else {
      fail('3. OFF — list and Reset gone, preview back to the original board', JSON.stringify(off));
    }

    /* 4. Back ON */
    await clickEl(page, '.md-board-category-order__toggle-track');
    await sleep(3000);
    const back = await page.evaluate(PANEL);
    if (back.checked && back.list && back.reset && back.grouped) {
      pass('4. back ON — everything returns', `${back.listItems} categories, Reset visible, preview grouped again`);
    } else {
      fail('4. back ON — everything returns', JSON.stringify(back));
    }
    /* --- The move-to-category picker must follow the switch too --- */

    /* 6. CONTROL, ON: a real click on a preview button opens the picker. Without
       this, check 8's "no picker" would also pass if the click simply missed. */
    const btn = await page.$('.md-board-category-order__preview .md-board-detail-symbol-card');
    if (!btn) {
      fail('6. ON — tapping a preview button opens the move picker', 'no button rendered in the preview');
    } else {
      const bb = await btn.boundingBox();
      if (bb) { await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
      await sleep(1800);
      const on = await page.evaluate(PANEL);
      if (on.picker) { pass('6. ON — tapping a preview button opens the move picker', `picker visible (${on.previewBtns} buttons in the preview)`); }
      else { fail('6. ON — tapping a preview button opens the move picker', JSON.stringify(on)); }

      /* 7. Switching OFF while the picker is open must close it — otherwise a
         dialog about categories floats over a preview that no longer has any.
         Driven from the KEYBOARD, not the mouse: the picker is modal and lays a
         `.md-board-category-order__picker-backdrop` over the panel, so a pointer
         click aimed at the switch lands on the backdrop and merely cancels the move
         (correct behaviour — and it silently made an earlier version of this check
         pass for the wrong reason). Space on the focused checkbox is the path a
         keyboard user actually has, and it exercises the same `toggle_categorize`. */
      await page.evaluate(() => {
        document.querySelector('.md-board-category-order__toggle input[type="checkbox"]').focus();
      });
      await page.keyboard.press('Space');
      await sleep(2500);
      const closed = await page.evaluate(PANEL);
      if (!closed.checked && !closed.picker) { pass('7. switching OFF closes an open move picker', 'picker dismissed with the switch'); }
      else { fail('7. switching OFF closes an open move picker', JSON.stringify(closed)); }

      /* 8. OFF: the same real click must NOT open it. */
      const btn2 = await page.$('.md-board-category-order__preview .md-board-detail-symbol-card');
      if (!btn2) {
        fail('8. OFF — tapping a preview button does NOT open the move picker', 'no button in the ungrouped preview to click');
      } else {
        const b2 = await btn2.boundingBox();
        if (b2) { await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2); }
        await sleep(2000);
        const off2 = await page.evaluate(PANEL);
        if (!off2.picker) { pass('8. OFF — tapping a preview button does NOT open the move picker', `clicked a button among ${off2.previewBtns}; no picker appeared`); }
        else { fail('8. OFF — tapping a preview button does NOT open the move picker', JSON.stringify(off2)); }
      }
    }
  } catch (e) {
    if (!/no board|no categorize entry|panel/.test(e.message)) {
      console.log('\nERROR ' + e.message);
      results.push({ n: 'probe completed', ok: false });
    }
  } finally {
    await browser.close();
  }
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} checks passed`);
  process.exit(bad ? 1 : 0);
})();
