#!/usr/bin/env node
/**
 * Switch-scanning behaviour check, written for PR #1118 (the `live_service` guards in
 * the scanner restart/reset path); follow-up and run notes in issue #1137. Steps:
 *
 *   scanning on (row mode, 1000 ms, auto-start on, auto-home off), Speak Mode:
 *   A select a speak button with the switch: the highlight clears and scanning resumes
 *   B select three in a row: compare the rhythm
 *   C select a folder button: scanning resumes on the new board
 *   D "wait for input" step scanning, switch pressed within 1 s after a folder
 *     selection: nothing from the previous board may be spoken
 *   E repeat on the classic view and in axes mode
 *
 * Run the same script against a develop build and a PR build and compare the
 * printed summaries (`--json` prints machine-readable results).
 * The switch is the keyboard (select = Space, the app default).
 * Preferences are set IN MEMORY only (never saved), as external-keyboard-qa.mjs does.
 * Board fixture: example/one (row 1 Happy[folder -> example/two] Sad Glad Bad, row 2 Mad Rad).
 *
 *   node scripts/switch-scanning-qa.mjs --base http://localhost:8184 [--headed] [--only modern] [--json]
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const ONLY = OPTS.arg('--only', null);
const JSON_OUT = process.argv.includes('--json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROW = { scanning: true, scanning_mode: 'row', scanning_interval: 1000, scanning_wait_for_input: false,
  scanning_auto_select: false, scanning_prompt: false };
const BOARD_ONE = ['Happy', 'Sad', 'Glad', 'Bad', 'Mad', 'Rad'];

/* In-page instrumentation: a 25 ms sampler of the scanner, the switch presses, and speech. */
function instrument() {
  const label = (el) => {
    if (!el) { return null; }
    if (el.classList && el.classList.contains('button')) { return (el.innerText || '').trim().split('\n').pop(); }
    return el.id ? '#' + el.id : (String(el.className || '').split(' ')[0] || el.tagName);
  };
  window.__qa = { samples: [], keys: [], spoken: [] };
  clearInterval(window.__qaTimer);
  window.__qaTimer = setInterval(() => {
    const s = window.scanner, a = window.appState;
    const dom = s && s.current_element && s.current_element.dom;
    const box = document.getElementById('highlight_box');
    const r = box && box.getBoundingClientRect();
    let said = '';
    try { said = (a.get('button_list') || []).map((b) => b.label).join('|'); } catch (e) { said = '?'; }
    let board = null;
    try { board = a.get('currentBoardState.key'); } catch (e) { board = null; }
    window.__qa.samples.push({
      t: Math.round(performance.now()), scanning: !!(s && s.scanning), armed: !!(s && s.interval),
      cur: dom ? label(dom[0]) : null, n: dom ? dom.length : 0,
      box: r && r.width > 0 ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}x${Math.round(r.height)}` : null,
      board, said,
      pref: (function() { try { return !!a.get('currentUser.preferences.device.scanning'); } catch (e) { return '?'; } })(),
      speak: (function() { try { return !!a.get('speak_mode'); } catch (e) { return '?'; } })(),
      modal: !!(window.modal && window.modal.is_open && window.modal.is_open()),
      axes: s && s.axes ? `${s.axes.x || '-'}/${s.axes.y || '-'}` : null
    });
  }, 25);
  if (!window.__qaKeyHook) {
    window.__qaKeyHook = true;
    if (window.speechSynthesis) {
      const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
      window.speechSynthesis.speak = (u) => { window.__qa.spoken.push({ t: Math.round(performance.now()), text: u && u.text }); return orig(u); };
    }
  }
}

async function setup(page, route, prefs) {
  await page.goto(`${OPTS.BASE}/${OPTS.USER}/${route}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('.button[data-id]').length > 0, { timeout: 30000 });
  await sleep(2500);
  await page.evaluate((prefs) => {
    const a = window.appState, u = a.get('currentUser');
    const p = Object.assign({}, u.get('preferences'));
    p.device = Object.assign({}, p.device, prefs);
    p.auto_home_return = !!prefs.auto_home_return;
    u.set('preferences', p);
    if (!a.get('speak_mode')) { a.toggle_speak_mode(); }
  }, prefs);
  await sleep(2500);
  await page.evaluate(() => {
    try { window.appState.activate_button({vocalization: ':clear'}, {vocalization: ':clear', label: 'clear', prevent_return: true, type: 'speak'}); } catch (e) { /* nothing to clear */ }
    window.appState.check_scanning();
  });
  await sleep(1500);
  await page.evaluate(instrument);
}

/* Wait until the scanner highlights `cur` (a button label, '#speak', or a row by its first
   label with n > 1), then press the switch. Returns the in-page time of the press. */
async function selectWhen(page, cur, { row = false, timeout = 15000 } = {}) {
  await page.waitForFunction((cur, row) => {
    const s = window.scanner, dom = s && s.current_element && s.current_element.dom;
    if (!dom || !dom[0]) { return false; }
    const el = dom[0];
    const l = el.classList && el.classList.contains('button') ? (el.innerText || '').trim().split('\n').pop() : '#' + el.id;
    return l === cur && (row ? dom.length > 1 : dom.length === 1);
  }, { timeout, polling: 10 }, cur, row);
  return press(page);
}
/* The press time is read from the page clock just before the key goes in (a keydown
   listener is not reliable: the app's own switch handler can stop the event first). */
const press = async (page) => { const t = await page.evaluate(() => Math.round(performance.now())); await page.keyboard.press('Space'); return t; };
const dump = (page) => page.evaluate(() => { const d = window.__qa; window.__qa = { samples: [], keys: [], spoken: [] }; return d; });

/* What happened after a press at time t0: words added, when the highlight left the
   selected element, when scanning was running again, and the next advance times. */
function after(d, t0, untilT) {
  const s = d.samples.filter((x) => x.t >= t0 && (!untilT || x.t < untilT));
  const before = d.samples.filter((x) => x.t < t0).pop() || {};
  const first = s[0] || {};
  const left = s.find((x) => x.box !== before.box);
  const resumed = s.find((x) => x.armed && x.cur && (x.cur !== before.cur || x.board !== before.board || x.n !== before.n));
  const steps = [];
  let prev = resumed;
  for (const x of s) {
    if (prev && x.t > prev.t && (x.cur !== prev.cur || x.n !== prev.n)) { steps.push({ dt: x.t - t0, cur: x.n > 1 ? `row(${x.cur})` : x.cur }); prev = x; }
  }
  const saidBefore = before.said || '';
  const trace = [];
  if (process.argv.includes('--trace')) {
    let k0 = '';
    for (const x of d.samples.filter((y) => y.t >= t0 - 200)) { const k = JSON.stringify({ ...x, t: 0 }); if (k !== k0) { trace.push(`${x.t - t0} ${k}`); k0 = k; } }
  }
  const last = s[s.length - 1] || first;
  return {
    added: (last.said || '').slice(saidBefore.length).replace(/^\|/, ''),
    highlightLeftMs: left ? left.t - t0 : null,
    resumedMs: resumed ? resumed.t - t0 : null,
    resumedOn: resumed ? (resumed.n > 1 ? `row(${resumed.cur})` : resumed.cur) : null,
    board: last.board,
    nextSteps: steps.slice(0, 4),
    stoppedAtEnd: !(last.scanning && last.armed),
    ...(trace.length ? { trace } : {}),
    spoken: d.spoken.filter((x) => x.t >= t0 && (!untilT || x.t < untilT)).map((x) => x.text)
  };
}

const SCENARIOS = {
  /* A: one speak button (row 2 -> Mad). */
  async speak_one(page, route) {
    await setup(page, route, ROW);
    await selectWhen(page, 'Mad', { row: true });
    const t = await selectWhen(page, 'Mad');
    await sleep(4500);
    return { sel: after(await dump(page), t) };
  },
  /* B: three in a row (Mad, Rad, Mad), each selected as soon as the scanner reaches it. */
  async three_in_a_row(page, route) {
    await setup(page, route, ROW);
    const ts = [];
    for (const w of ['Mad', 'Rad', 'Mad']) {
      await selectWhen(page, 'Mad', { row: true });
      ts.push(await selectWhen(page, w));
    }
    await sleep(4000);
    const d = await dump(page);
    return { sels: ts.map((t, i) => after(d, t, ts[i + 1])), gapsMs: ts.slice(1).map((t, i) => t - ts[i]) };
  },
  /* C: folder (row 1 -> Happy -> example/two). */
  async folder(page, route) {
    await setup(page, route, ROW);
    await selectWhen(page, 'Happy', { row: true });
    const t = await selectWhen(page, 'Happy');
    await sleep(6000);
    return { sel: after(await dump(page), t) };
  },
  /* D: step scanning; folder, then the switch again at 300 ms and 800 ms. */
  async step_folder_quick_press(page, route) {
    await setup(page, route, Object.assign({}, ROW, { scanning_wait_for_input: true }));
    const presses = [];
    presses.push(await press(page)); // wakes the scanner (pick() -> next())
    await selectWhen(page, 'Happy', { row: true, timeout: 20000 });
    const t = await selectWhen(page, 'Happy');
    await sleep(300); presses.push(await press(page));
    await sleep(500); presses.push(await press(page));
    await sleep(5000);
    const d = await dump(page);
    const sel = after(d, t);
    const words = sel.added.split('|').filter(Boolean);
    return { sel, quickPressesMs: presses.slice(1).map((p) => p - t), previousBoardSpoken: words.filter((w) => BOARD_ONE.includes(w)),
      spokenFromPreviousBoard: sel.spoken.filter((x) => BOARD_ONE.includes(x)) };
  },
  /* F: auto-home on; speak button, then the switch again at ~300 ms and ~600 ms, while the
     auto-home jump is in flight. Any extra example/one word means a press landed on the old board. */
  async autohome_quick_press(page, route) {
    await setup(page, route, Object.assign({}, ROW, { auto_home_return: true }));
    await selectWhen(page, 'Mad', { row: true });
    const t = await selectWhen(page, 'Mad');
    const presses = [];
    await sleep(300); presses.push(await press(page));
    await sleep(300); presses.push(await press(page));
    await sleep(4000);
    const sel = after(await dump(page), t);
    const words = sel.added.split('|').filter(Boolean);
    return { sel, quickPressesMs: presses.map((p) => p - t), wordsAdded: words, previousBoardExtra: words.slice(1).filter((w) => BOARD_ONE.includes(w)) };
  },
  /* E (axes): lock the vertical line inside Mad, then the horizontal line inside Mad
     (the second press selects under the crosshair), then watch the sweep restart. */
  async axes(page, route) {
    await setup(page, route, Object.assign({}, ROW, { scanning_mode: 'axes', scanning_sweep_speed: 200 }));
    const inside = (axis) => page.waitForFunction((axis) => {
      const el = Array.from(document.querySelectorAll('.button[data-id]')).find((b) => (b.innerText || '').trim().split('\n').pop() === 'Mad');
      const line = window.scanner.axes && window.scanner.axes[axis];
      if (!el || !line) { return false; }
      const r = el.getBoundingClientRect(), l = line.getBoundingClientRect();
      const c = axis === 'vertical' ? l.left + l.width / 2 : l.top + l.height / 2;
      return axis === 'vertical' ? c > r.left + 20 && c < r.right - 20 : c > r.top + 20 && c < r.bottom - 20;
    }, { polling: 10, timeout: 30000 }, axis);
    const where = (label) => async (e) => {
      const st = await page.evaluate(() => { const s = window.scanner, ax = s.axes || {}; const r = (l) => l && l.getBoundingClientRect(); const v = r(ax.vertical), h = r(ax.horizontal);
        return { x: ax.x, y: ax.y, v: v && Math.round(v.left), h: h && Math.round(h.top), scanning: s.scanning, mode: s.options && s.options.scan_mode }; });
      throw new Error(`${label}: ${e.message.split('\n')[0]} state=${JSON.stringify(st)}`);
    };
    await inside('vertical').catch(where('vertical'));
    await press(page);
    await inside('horizontal').catch(where('horizontal'));
    const t = await press(page);
    await sleep(4000);
    const d = await dump(page);
    return { sel: after(d, t), axesAfter: d.samples.filter((x) => x.t > t).map((x) => x.axes).filter((v, i, arr) => v !== arr[i - 1]) };
  }
};

const VIEWS = { modern: 'board-detail/one', classic: 'board/one' };

const { browser, page } = await launch(OPTS);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
const results = {};
try {
  await login(page, OPTS);
  for (const [view, route] of Object.entries(VIEWS)) {
    for (const [name, fn] of Object.entries(SCENARIOS)) {
      const id = `${view}/${name}`;
      if (ONLY && !id.includes(ONLY)) { continue; }
      try { results[id] = await fn(page, route); } catch (e) { results[id] = { error: e.message.split('\n')[0] }; }
      if (!JSON_OUT) { console.log(id, JSON.stringify(results[id])); }
    }
  }
} finally {
  await browser.close();
}
if (JSON_OUT) { console.log(JSON.stringify({ base: OPTS.BASE, results, errors }, null, 1)); }
else if (errors.length) { console.log('pageerrors:', errors); }
