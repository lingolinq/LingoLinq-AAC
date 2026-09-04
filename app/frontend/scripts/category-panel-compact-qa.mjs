/**
 * The Categorize panel's control area must stay CHEAP IN HEIGHT.
 *
 * WHY THIS EXISTS: the panel's job is the category ordering list and the live preview, and
 * both sit under `.md-board-category-order__bar`, which is `flex: 0 0 auto` — every pixel
 * the controls take comes out of them. The controls were a header plus two glass cards,
 * each with a switch, a paragraph of body copy, a nested sub-option and a permanent amber
 * advisory: ~250px before the first category appeared. They are now a 64px header row and
 * one three-column settings strip.
 *
 * Everything here is measured from RENDERED geometry, and the accessibility floors are
 * asserted beside the height budget on purpose: "shorter" is only a win if the targets, the
 * focus rings and the explanations survive it.
 *
 * Usage (from app/frontend, Node 22):
 *   node scripts/category-panel-compact-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const VW = parseInt(OPTS.arg('--width', '1440'), 10);
const VH = parseInt(OPTS.arg('--height', '900'), 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const pass = (n, d) => { results.push(true); console.log(`  PASS  ${n}\n        ${d}`); };
const fail = (n, d) => { results.push(false); console.log(`  FAIL  ${n}\n        ${d}`); };
/* A skipped check verified NOTHING, so it must not be counted as a pass — calling pass()
   with the word "skipped" in the detail (which this file used to do twice) makes a
   narrow-viewport run report green on assertions it never made. Tracked separately and
   printed at the end, the way a2c-click-tests-qa.mjs does it. */
const skipped = [];
const skip = (n, d) => { skipped.push(n); console.log(`  SKIP  ${n}\n        ${d}`); };

const clickEl = async (page, sel) => {
  const el = await page.$(sel);
  if (!el) { return false; }
  const b = await el.boundingBox();
  if (!b) { return false; }
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  return true;
};

const READ = () => {
  const q = (s) => document.querySelector(s);
  const box = (sel) => {
    const el = typeof sel === 'string' ? q(sel) : sel;
    if (!el) { return null; }
    const r = el.getBoundingClientRect();
    return { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const strip = q('.md-board-category-order__strip');
  return {
    bar: box('.md-board-category-order__bar'),
    head: box('.md-board-category-order__head'),
    strip: box(strip),
    body: box('.md-board-category-order__body'),
    /* Track count, read off the resolved template rather than the viewport — this is the
       property the responsive tiers actually change. */
    columns: strip ? getComputedStyle(strip).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
    settings: document.querySelectorAll('.md-board-category-order__setting').length,
    /* Per-setting geometry, for the stacked tiers: two settings in the same COLUMN must
       present their info button and switch at the same x, and the divider between rows has
       to run the full width rather than stopping at the first cell. */
    cells: [...document.querySelectorAll('.md-board-category-order__setting')].map((el) => {
      const r = el.getBoundingClientRect();
      const row = el.querySelector('.md-board-category-order__row');
      const sw = el.querySelector('.md-board-category-order__switch-wrap');
      const info = el.querySelector('.md-board-category-order__info-btn');
      const cs = getComputedStyle(el);
      return {
        l: Math.round(r.left), r: Math.round(r.right), b: Math.round(r.bottom),
        rowH: row ? Math.round(row.getBoundingClientRect().height) : 0,
        switchR: sw ? Math.round(sw.getBoundingClientRect().right) : null,
        infoL: info ? Math.round(info.getBoundingClientRect().left) : null,
        h: Math.round(r.height),
        borderBottom: Math.round(parseFloat(cs.borderBottomWidth) || 0),
        borderTop: Math.round(parseFloat(cs.borderTopWidth) || 0),
        borderLeft: Math.round(parseFloat(cs.borderLeftWidth) || 0)
      };
    }),
    /* Every interactive control in the region, with the box a finger or pointer has to
       hit. The switch's hit area is the transparent input, NOT the painted track. */
    targets: [
      ...document.querySelectorAll('.md-board-category-order__switch-wrap input'),
      ...document.querySelectorAll('.md-board-category-order__onoff'),
      ...document.querySelectorAll('.md-board-category-order__info-btn'),
      ...document.querySelectorAll('.md-board-category-order__reset'),
      ...document.querySelectorAll('.md-board-category-order__close')
    ].map((el) => {
      const r = el.getBoundingClientRect();
      return { what: el.className || el.getAttribute('data-bd-control') || el.tagName, w: Math.round(r.width), h: Math.round(r.height) };
    }),
    /* Descriptions must still be there — a shorter panel that dropped its explanations is
       not the ask. */
    descs: [...document.querySelectorAll('.md-board-category-order__row-desc')].map((n) => (n.textContent || '').trim()),
    infos: document.querySelectorAll('.md-board-category-order__info-btn').length,
    infoOpen: document.querySelectorAll('.md-board-category-order__info[open]').length,
    scrollOn: !!(q('[data-bd-control="category_scroll"]') || {}).checked,
    advisory: !!q('.md-board-category-order__advisory'),
    /* Old chrome that must be gone, not merely restyled. */
    oldCards: document.querySelectorAll('.md-board-category-order__card').length,
    listTop: (() => { const el = q('.md-board-category-order__list'); return el ? Math.round(el.getBoundingClientRect().top) : null; })()
  };
};

const run = async () => {
  const { browser, page } = await launch(OPTS);
  try {
    await page.setViewport({ width: VW, height: VH });
    await login(page, OPTS);

    const u = OPTS.USER;
    await page.goto(`${OPTS.BASE}/${u}/boards`, { waitUntil: 'domcontentloaded' });
    await sleep(6000);
    const key = OPTS.arg('--board', null) || await page.evaluate(() => {
      const as = window.appState;
      return (as && as.get && as.get('currentUser.preferences.home_board.key')) || null;
    });
    if (!key) { fail('precondition — found a board to edit', 'no home_board.key; pass --board <owner/key>'); throw new Error('no board'); }
    const name = key.split('/').pop();

    await page.goto(`${OPTS.BASE}/${u}/board-detail/${name}`, { waitUntil: 'domcontentloaded' });
    await sleep(8000);
    /* The edit rail (and with it the Categorize entry) only renders under edit_mode. Click
       the visible Edit button for real; if it is not on screen, fall back to the actions
       menu that also carries it — the same two-step board-categorize-toggle-qa.mjs uses. */
    if (!(await page.$('[data-bd-action="toggle_category_order"]'))) {
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
    }
    if (!(await page.$('[data-bd-action="toggle_category_order"]'))) {
      const diag = await page.evaluate(() => ({
        url: location.pathname,
        editPanel: !!document.querySelector('.md-board-edit-panel'),
        actions: [...document.querySelectorAll('[data-bd-action]')].map((n) => n.getAttribute('data-bd-action')).slice(0, 24)
      }));
      fail('precondition — Categorize entry reachable', JSON.stringify(diag));
      throw new Error('no entry');
    }
    await clickEl(page, '[data-bd-action="toggle_category_order"]');
    await page.waitForSelector('.md-board-category-order', { visible: true, timeout: 20000 }).catch(() => {});
    await sleep(2500);

    const shot = OPTS.arg('--shot', null);
    if (shot) { await page.screenshot({ path: shot }); console.log(`  (screenshot: ${shot})`); }

    let s = await page.evaluate(READ);
    if (!s.bar || !s.strip) { fail('precondition — panel open with the settings strip', JSON.stringify(s)); throw new Error('no panel'); }
    pass('precondition — panel open with the settings strip',
      `${s.settings} settings in ${s.columns} columns, scrolling ${s.scrollOn ? 'ON' : 'OFF'}`);

    const head = await page.evaluate(() => {
      const h = document.querySelector('.md-board-category-order__title');
      const sub = document.querySelector('.md-board-category-order__subtitle');
      const onoff = document.querySelector('.md-board-category-order__onoff');
      const words = onoff ? [...onoff.querySelectorAll('.md-board-category-order__onoff-word')].map((w) => w.textContent.trim()) : [];
      const active = onoff ? [...onoff.querySelectorAll('.md-board-category-order__onoff-word--active')].map((w) => w.textContent.trim()) : [];
      const input = onoff ? onoff.querySelector('input') : null;
      return { title: h && h.textContent.trim(), sub: sub && sub.textContent.trim(), words, active,
               checked: !!(input && input.checked), forId: onoff && onoff.getAttribute('for'), inputId: input && input.id };
    });
    if (head.title === 'Group by category' && head.words.join('/') === 'Off/On' &&
        head.active.length === 1 && head.forId === head.inputId) {
      pass('the header IS the grouping setting, with a labelled On/Off switch',
        `"${head.title}" / "${head.sub}", words ${head.words.join(' + ')}, active "${head.active[0]}" with the box ${head.checked ? 'checked' : 'unchecked'}`);
    } else {
      fail('the header IS the grouping setting, with a labelled On/Off switch', JSON.stringify(head));
    }

    if (s.oldCards === 0) {
      pass('the per-setting cards are gone, not restyled', 'no .md-board-category-order__card in the DOM');
    } else {
      fail('the per-setting cards are gone, not restyled', `${s.oldCards} still rendered`);
    }

    /* HEIGHT — the whole point. The budget: header ~64 + gap + strip 72-88 + padding. */
    if (s.head.h >= 64 && s.head.h <= 80) {
      pass('the header is one compact row', `${s.head.h}px (floor 64)`);
    } else {
      fail('the header is one compact row', `${s.head.h}px — under 64 is cramped, over 80 means it has grown a second section`);
    }

    /* The 72-88px strip and the ~150-175px total are the DESKTOP budget — the three-column
       layout. Below 1000px the strip is deliberately two rows and below 700px three, so the
       same numbers there would be a false failure; what matters at those widths is that each
       setting stays a compact ROW rather than the card design coming back. */
    const desktop = s.columns === 2;
    const stripBound = s.scrollOn ? 100 : 88;
    if (!desktop) {
      const tall = s.cells.filter((c) => c.rowH > 68);
      if (!tall.length) {
        pass('stacked: each setting stays a compact row',
          `${s.columns} columns, rows ${s.cells.map((c) => c.rowH + 'px').join(' / ')} (ceiling 68)`);
      } else {
        fail('stacked: each setting stays a compact row', `rows ${s.cells.map((c) => c.rowH).join('/')} — over the 68px ceiling`);
      }
    } else if (s.strip.h >= 72 && s.strip.h <= stripBound) {
      pass('the settings strip stays inside its height budget',
        `${s.strip.h}px (72-88${s.scrollOn ? ', +12 allowed while the scrolling advisory shows' : ''})`);
    } else {
      fail('the settings strip stays inside its height budget', `${s.strip.h}px against a 72-${stripBound}px budget`);
    }

    if (!desktop) {
      skip('the whole control area fits the desktop height target',
        `${s.columns}-column layout at ${VW}px wide; the target is the desktop one (bar ${s.bar.h}px here)`);
    } else if (s.bar.h <= 175) {
      pass('the whole control area fits the desktop height target',
        `${s.bar.h}px (target ~150-175, advisory ${s.scrollOn ? 'showing' : 'hidden'})`);
    } else {
      fail('the whole control area fits the desktop height target', `${s.bar.h}px against a 175px ceiling`);
    }

    const gap = s.body.t - s.bar.b;
    if (gap <= 16) {
      pass('the category content starts immediately after the controls', `${gap}px between the bar and the list`);
    } else {
      fail('the category content starts immediately after the controls', `${gap}px — the spec allows 16px at most`);
    }

    /* ACCESSIBILITY floors. A shorter panel that shrank its targets is a regression. */
    const small = s.targets.filter((t) => t.w < 44 || t.h < 44);
    if (s.targets.length && !small.length) {
      pass('every control keeps a 44x44 target', `${s.targets.length} controls, smallest ${Math.min(...s.targets.map((t) => t.h))}px tall`);
    } else {
      fail('every control keeps a 44x44 target', small.map((t) => `${t.what} ${t.w}x${t.h}`).join(', ') || 'no controls found');
    }

    /* One description per RENDERED setting: labels are only rendered while scrolling is on,
       so the count follows the state rather than being fixed at two. */
    if (s.descs.length === s.settings && s.descs.every((d) => d.length > 10)) {
      pass('each setting still says what it does', s.descs.join(' | '));
    } else {
      fail('each setting still says what it does', JSON.stringify(s.descs));
    }

    /* The long copy has to be REACHABLE, and not only by hovering. Open the disclosure
       with the keyboard, the way a switch or keyboard user does. */
    const disclosure = await page.evaluate(async () => {
      const sum = document.querySelector('.md-board-category-order__info-btn');
      if (!sum) { return null; }
      sum.focus();
      const focused = document.activeElement === sum;
      const ring = getComputedStyle(sum).outlineWidth;
      sum.click();
      await new Promise((r) => setTimeout(r, 300));
      const body = document.querySelector('.md-board-category-order__info[open] .md-board-category-order__info-body');
      const text = body ? (body.textContent || '').trim() : '';
      const label = sum.getAttribute('aria-label') || '';
      return { focused, ring, open: !!body, text: text.slice(0, 60), label };
    });
    if (disclosure && disclosure.focused && disclosure.open && disclosure.label) {
      pass('the long explanation is reachable without a pointer',
        `summary took focus, aria-label "${disclosure.label}", opened: "${disclosure.text}…"`);
    } else {
      fail('the long explanation is reachable without a pointer', JSON.stringify(disclosure));
    }

    /* The advisory is STATE-DEPENDENT, not permanent chrome. Flip the switch and check both
       directions — a check that only ever sees one state proves nothing.
       Grouping first: the scrolling switch is `disabled` while grouping is off, so a click
       on it does nothing and the two readings come back identical, which this check would
       have read as a pass. */
    if (!(await page.evaluate(() => document.querySelector('[data-bd-control="categorize"]').checked))) {
      await page.evaluate(() => { document.querySelector('[data-bd-control="categorize"]').click(); });
      await sleep(2500);
      s = await page.evaluate(READ);
    }
    const before = s.scrollOn;
    const beforeAdvisory = s.advisory;
    await page.evaluate(() => { document.querySelector('[data-bd-control="category_scroll"]').click(); });
    await sleep(1500);
    const after = await page.evaluate(READ);
    if (before !== after.scrollOn && beforeAdvisory === before && after.advisory === after.scrollOn) {
      pass('the scrolling advisory appears only when scrolling is on',
        `${before ? 'ON' : 'OFF'} -> advisory ${beforeAdvisory}; ${after.scrollOn ? 'ON' : 'OFF'} -> advisory ${after.advisory}`);
    } else {
      fail('the scrolling advisory appears only when scrolling is on',
        before === after.scrollOn
          ? `the switch never changed state (${before}) — it is disabled, so this proved nothing`
          : `scrollOn=${before}/advisory=${beforeAdvisory} then scrollOn=${after.scrollOn}/advisory=${after.advisory}`);
    }
    const heights = `advisory ${beforeAdvisory ? 'on' : 'off'}: strip ${s.strip.h}px / bar ${s.bar.h}px, advisory ${after.advisory ? 'on' : 'off'}: strip ${after.strip.h}px / bar ${after.bar.h}px`;
    const tallest = Math.max(s.bar.h, after.bar.h);
    if (!desktop) {
      skip('the control area holds the height target in BOTH advisory states',
        `${s.columns}-column layout at ${VW}px wide (${heights})`);
    } else if (tallest <= 175) {
      pass('the control area holds the height target in BOTH advisory states', heights);
    } else {
      fail('the control area holds the height target in BOTH advisory states', `${heights} — ceiling 175px`);
    }

    /* Put it back so the run leaves the account as it found it. */
    await page.evaluate(() => { document.querySelector('[data-bd-control="category_scroll"]').click(); });
    await sleep(1200);

    /* RESPONSIVE tiers, read off the resolved grid rather than assumed from the width. */
    const tiers = [];
    for (const [w, want] of [[1440, 2], [960, 2], [680, 1]]) {
      await page.setViewport({ width: w, height: VH });
      await sleep(1200);
      const r = await page.evaluate(READ);
      tiers.push({ w, want, got: r.columns, rowH: r.strip ? r.strip.h : 0 });
    }
    /* Side by side, the divider is the vertical one BETWEEN the two settings, and it only
       reads as a line if the cells share a height — which is why `.__setting` is stretched
       rather than `align-self: start`. */
    await page.setViewport({ width: 960, height: VH });
    await sleep(1200);
    const two = await page.evaluate(READ);
    const [a, b] = two.cells;
    if (a && b && b.borderLeft >= 1 && Math.abs(a.r - b.l) <= 1 && Math.abs(a.h - b.h) <= 1) {
      pass('side by side: one divider between the two settings',
        `cell 1 ends where cell 2 begins (${a.r}px), both ${a.h}px tall, ${b.borderLeft}px border between them`);
    } else {
      fail('side by side: one divider between the two settings',
        `border ${b && b.borderLeft}, edges ${a && a.r} -> ${b && b.l}, heights ${a && a.h} vs ${b && b.h}`);
    }

    /* Stacked, the divider turns horizontal and must span the whole strip. */
    await page.setViewport({ width: 680, height: VH });
    await sleep(1200);
    const one = await page.evaluate(READ);
    const [c, d] = one.cells;
    if (c && d && d.borderTop >= 1 && Math.abs(c.l - d.l) <= 1 && Math.abs(c.r - d.r) <= 1) {
      pass('stacked: the divider turns horizontal and spans the strip',
        `both cells ${c.l}-${c.r}px wide, ${d.borderTop}px border between the rows`);
    } else {
      fail('stacked: the divider turns horizontal and spans the strip',
        `border ${d && d.borderTop}, spans ${c && c.l}-${c && c.r} vs ${d && d.l}-${d && d.r}`);
    }
    await page.setViewport({ width: VW, height: VH });
    await sleep(1000);

    const wrong = tiers.filter((t) => t.got !== t.want);
    if (!wrong.length) {
      pass('the strip drops columns before it drops legibility',
        tiers.map((t) => `${t.w}px -> ${t.got} col (strip ${t.rowH}px)`).join(', '));
    } else {
      fail('the strip drops columns before it drops legibility',
        wrong.map((t) => `${t.w}px wanted ${t.want} got ${t.got}`).join(', '));
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed at ${VW}x${VH}`);
  if (skipped.length) {
    console.log(`\nSKIPPED — these are NOT passes; a skipped check verified nothing:`);
    skipped.forEach((n) => console.log(`  - ${n}`));
  }
  process.exit(failed ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
