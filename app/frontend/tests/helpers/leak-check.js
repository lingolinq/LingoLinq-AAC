/*
 * Leak check: catches a test that leaves something behind for later tests, or that runs against
 * something an earlier test left behind. A leaked value makes later results depend on test ORDER:
 * the "passes alone, fails in the suite" (or the reverse) class of flake. Three checks, run by
 * global QUnit hooks after each test's own cleanup and its owner's teardown:
 *
 *  1. Destroyed services in use. Each app instance writes its services into globals
 *     (window.appState, LingoLinq.appState, window.persistence, window.stashes, LingoLinq.store) and
 *     into fields of the shared util singletons below; tearing the instance down leaves them pointing
 *     at DESTROYED services until the next instance boots. After each test, every such destroyed
 *     value is swapped for a pass-through proxy that behaves the same but records each access. Any
 *     access fails the test that made it (or, between tests, the next test): that test was reading
 *     a dead app's state instead of its own.
 *  2. Stubs left on singletons. A function on a util singleton that differs after the test from
 *     before it, unless it is the inherited method itself (restoreStubs puts originals back as own
 *     properties).
 *  3. DOM left under <body>, outside the testing containers.
 *
 * Mode, from the `leakcheck` query param (`ember test --query leakcheck=report`): `fail` (default)
 * fails the test; `report` only logs `[LEAK-CHECK]` lines, for surveying; `off` disables it.
 */
import * as QUnit from 'qunit';
// `obf` FIRST: app/utils has an import cycle (eval -> app_state -> ... -> demo_board_loader -> obf -> eval)
// and obf calls `evaluation.register` while loading. The app always loads obf first; importing eval
// first here reversed that and obf threw at load, so no test ever started.
import obf from 'frontend/utils/obf';
import actionLock from 'frontend/utils/action-lock';
import ai_word_predictor from 'frontend/utils/ai_word_predictor';
import capabilities from 'frontend/utils/capabilities';
import dbman from 'frontend/utils/dbman';
import editManager from 'frontend/utils/edit_manager';
import evaluation from 'frontend/utils/eval';
import eval_recommend from 'frontend/utils/eval_recommend';
import frame_listener from 'frontend/utils/frame_listener';
import geo from 'frontend/utils/geo';
import Utils from 'frontend/utils/misc';
import modal from 'frontend/utils/modal';
import modal_paging from 'frontend/utils/modal_paging';
import emergency from 'frontend/utils/obf-emergency';
import persistence from 'frontend/utils/persistence';
import profiles from 'frontend/utils/profiles';
import progress_tracker from 'frontend/utils/progress_tracker';
import buttonTracker from 'frontend/utils/raw_events';
import scanner from 'frontend/utils/scanner';
import session_history from 'frontend/utils/session_history';
import speecher from 'frontend/utils/speecher';
import stashes from 'frontend/utils/_stashes';
import sync from 'frontend/utils/sync';
import templateHelpers from 'frontend/utils/template_helpers';
import voices from 'frontend/utils/tts_voices';
import utterance from 'frontend/utils/utterance';
import word_suggestions from 'frontend/utils/word_suggestions';
import i18n from 'frontend/utils/i18n';
import LingoLinq from 'frontend/app';

export const SINGLETONS = { actionLock, ai_word_predictor, capabilities, dbman, editManager, evaluation,
  eval_recommend, frame_listener, geo, Utils, modal, modal_paging, emergency, obf, persistence, profiles,
  progress_tracker, buttonTracker, scanner, session_history, speecher, stashes, sync, templateHelpers,
  voices, utterance, word_suggestions };

const GLOBALS = [
  ['window.appState', () => window.appState, (v) => { window.appState = v; }],
  ['LingoLinq.appState', () => window.LingoLinq && window.LingoLinq.appState, (v) => { window.LingoLinq.appState = v; }],
  ['window.persistence', () => window.persistence, (v) => { window.persistence = v; }],
  ['window.stashes', () => window.stashes, (v) => { window.stashes = v; }],
  ['LingoLinq.store', () => window.LingoLinq && window.LingoLinq.store, (v) => { window.LingoLinq.store = v; }]
];
const KEEP_BODY_IDS = { 'ember-testing-container': true, qunit: true, 'qunit-fixture': true,
  // The scanner's two axis guides: created once per page and cached in scanner.axes (scanner.js scan_axes).
  scanner_axis_horizontal: true, scanner_axis_vertical: true };
// Functions the APP itself (re)assigns on these singletons, not test stubs: each app boot redefines
// capabilities.fake_battery (app/utils/capabilities.js battery setup); content-grabbers assigns
// capabilities.data_uri_to_blob when it first loads (app/services/content-grabbers.js); editManager
// setup assigns its Button class (app/utils/edit_manager.js `setup`).
const APP_OWNED_FUNCTIONS = { 'capabilities.fake_battery': true, 'capabilities.data_uri_to_blob': true, 'editManager.Button': true };
const TARGET = Symbol('leak-check target');

// Anything but an exact `report` or `off` means `fail`, so a typo cannot quietly disable the check.
function mode() {
  let value = null;
  try { value = new URLSearchParams(window.location.search).get('leakcheck'); } catch (e) { /* default */ }
  return (value === 'report' || value === 'off') ? value : 'fail';
}
const MODE = mode();
// Survey only: `--query leakfields=1` logs singleton DATA fields a test changed and left changed.
// Never fails a test: much of that is legitimate app state, so it is not enforced until a survey
// separates test leaks from app state.
const FIELD_SURVEY = (() => { try { return new URLSearchParams(window.location.search).get('leakfields') === '1'; } catch (e) { return false; } })();

let findings = [];
let pendingForNextTest = [];
let internal = 0;

function testName() {
  const t = QUnit.config.current;
  return t ? `${t.module.name}: ${t.testName}` : null;
}
function where() {
  return (new Error().stack || '').split('\n').slice(3, 16).map((l) => l.trim())
    .filter((l) => /frontend\.js|tests\.js/.test(l) && !/leak-check|leakCheck/.test(l))
    .slice(0, 3).join(' < ').replace(/https?:\/\/[^/]+\/assets\//g, '').replace(/:\d+:\d+/g, '');
}
function record(message) {
  const entry = { message, test: testName() };
  if (MODE === 'report') { console.log(`[LEAK-CHECK] ${message} | test: ${entry.test || '(between tests)'}`); }
  if (entry.test) { findings.push(message); } else { pendingForNextTest.push(message); }
}

function isDestroyed(v) { return !!(v && typeof v === 'object' && (v.isDestroyed || v.isDestroying)); }

// The real object behind a leak-check proxy (or the value itself): for harness code that must touch
// a destroyed service on purpose without it counting as a leak.
export function unwrapLeakProxy(v) { return (v && v[TARGET]) || v; }

const proxies = new WeakSet();
// Destroyed-ness is re-checked at each access, not only when wrapping: some slots hold a FORWARDING
// util (utils/app_state, utils/persistence) that reports the destroyed-ness of whichever service the
// globals point at right now, so it can be "destroyed" when wrapped and live again once a new app
// boots. Only an access that really lands on a destroyed object is a leak.
function stillDestroyed(t) {
  internal++;
  try { return isDestroyed(t); } finally { internal--; }
}
function watch(label, target) {
  const proxy = new Proxy(target, {
    get(t, prop) {
      if (prop === TARGET) { return t; }
      const value = Reflect.get(t, prop, t);
      if (!internal && typeof prop === 'string' && prop !== 'isDestroyed' && prop !== 'isDestroying' && stillDestroyed(t)) {
        record(`read ${label}.${prop} on a destroyed service @ ${where()}`);
      }
      return typeof value === 'function' ? function() { return value.apply(t, arguments); } : value;
    },
    set(t, prop, value) {
      if (!internal && stillDestroyed(t)) { record(`write ${label}.${String(prop)} on a destroyed service @ ${where()}`); }
      return Reflect.set(t, prop, value, t);
    }
  });
  proxies.add(proxy);
  return proxy;
}

function ownDataFields(obj) {
  let names = [];
  try { names = Object.getOwnPropertyNames(obj); } catch (e) { return []; }
  return names.map((k) => [k, Object.getOwnPropertyDescriptor(obj, k)]).filter((p) => p[1] && 'value' in p[1] && p[1].writable);
}

function watchDestroyed() {
  internal++;
  try {
    GLOBALS.forEach(([label, read, write]) => {
      let v;
      try { v = read(); } catch (e) { return; }
      if (isDestroyed(v) && !proxies.has(v)) { try { write(watch(label, v)); } catch (e) { /* not writable */ } }
    });
    Object.keys(SINGLETONS).forEach((name) => {
      const s = SINGLETONS[name];
      if (!s) { return; }
      const holders = [[name, s]];
      if (s._services && typeof s._services === 'object') { holders.push([`${name}._services`, s._services]); }
      holders.forEach(([label, holder]) => {
        ownDataFields(holder).forEach(([k, d]) => {
          if (isDestroyed(d.value) && !proxies.has(d.value)) { holder[k] = watch(`${label}.${k}`, d.value); }
        });
      });
    });
  } finally { internal--; }
}

function functionsOf(obj) {
  const out = new Map();
  ownDataFields(obj).forEach(([k, d]) => { if (typeof d.value === 'function') { out.set(k, d.value); } });
  return out;
}
// The value `k` would have if obj had no own property: looked up the WHOLE prototype chain
// (window.addEventListener lives on EventTarget.prototype, two levels up).
function inherited(obj, k) {
  for (let proto = Object.getPrototypeOf(obj); proto; proto = Object.getPrototypeOf(proto)) {
    const d = Object.getOwnPropertyDescriptor(proto, k);
    if (d) { return 'value' in d ? d.value : undefined; }
  }
  return undefined;
}

let before = null;
let bodyBefore = null;
let fieldsBefore = null;
function fieldKind(v) {
  if (v === null || v === undefined || typeof v !== 'object') { return JSON.stringify(v === undefined ? '(undefined)' : v).slice(0, 40); }
  if (isDestroyed(v)) { return 'destroyed object'; }
  return Array.isArray(v) ? `array(${v.length})` : 'object';
}
function snapshotFields() {
  const snap = {};
  internal++;
  try {
    Object.keys(SINGLETONS).forEach((name) => {
      const obj = SINGLETONS[name];
      if (!obj) { return; }
      const fields = new Map();
      ownDataFields(obj).forEach(([k, d]) => { if (typeof d.value !== 'function') { fields.set(k, d.value); } });
      snap[name] = fields;
    });
  } finally { internal--; }
  return snap;
}
function surveyFields() {
  if (!FIELD_SURVEY || !fieldsBefore) { return; }
  const now = snapshotFields();
  const t = QUnit.config.current;
  Object.keys(now).forEach((name) => {
    now[name].forEach((v, k) => {
      const was = fieldsBefore[name] && fieldsBefore[name].get(k);
      const had = fieldsBefore[name] && fieldsBefore[name].has(k);
      if (had && was === v) { return; }
      console.log(`[LEAK-FIELD] ${name}.${k}: ${had ? fieldKind(was) : '(absent)'} -> ${fieldKind(v)} | test: ${t ? `${t.module.name}: ${t.testName}` : '?'}`);
    });
  });
}
// Objects whose functions tests stub besides the util singletons: the global object, the app
// namespace and its model statics (resolved per test: they are defined after this module loads).
function functionHolders() {
  const holders = Object.assign({}, SINGLETONS, { i18n, window, LingoLinq });
  ['Buttonset', 'Board', 'User', 'Image', 'Sound', 'Video', 'Utterance'].forEach((k) => {
    if (LingoLinq && LingoLinq[k]) { holders[`LingoLinq.${k}`] = LingoLinq[k]; }
  });
  return holders;
}
function snapshotFunctions() {
  const snap = {};
  const holders = functionHolders();
  internal++;
  try { Object.keys(holders).forEach((name) => { if (holders[name]) { snap[name] = { obj: holders[name], fns: functionsOf(holders[name]) }; } }); } finally { internal--; }
  return snap;
}
function checkFunctions() {
  if (!before) { return; }
  internal++;
  try {
    Object.keys(before).forEach((name) => {
      const obj = before[name].obj;
      // On the extra holders (window, LingoLinq and its model classes, i18n) the app ADDS functions
      // as modules load (each model class registers itself once); only a function that existed
      // before the test and was replaced counts there. On the util singletons both count.
      const onlyReplaced = !Object.prototype.hasOwnProperty.call(SINGLETONS, name);
      functionsOf(obj).forEach((fn, k) => {
        if (onlyReplaced && !before[name].fns.has(k)) { return; }
        if (fn === before[name].fns.get(k) || fn === inherited(obj, k) || APP_OWNED_FUNCTIONS[`${name}.${k}`]) { return; }
        record(`${name}.${k} was replaced and not restored (a stub left on a shared singleton)`);
      });
    });
  } finally { internal--; }
}
function describeNode(n) {
  const cls = typeof n.className === 'string' && n.className.trim() ? `.${n.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
  return `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${cls}`;
}
function checkBody() {
  if (!bodyBefore) { return; }
  Array.prototype.forEach.call(document.body.children, (n) => {
    if (!bodyBefore.has(n) && !KEEP_BODY_IDS[n.id] && !/^(qunit|testem)/.test(n.id || '')) {
      record(`<${describeNode(n)}> was left under <body>`);
    }
  });
}

function flush(assert) {
  const list = findings;
  findings = [];
  // QUnit counts a failure in a `todo` test as expected (it stays "todo"), which would swallow the
  // finding; charge it to the next real test instead.
  const current = QUnit.config.current;
  if (current && current.todo) {
    pendingForNextTest = pendingForNextTest.concat(list.map((m) => `${m} (from todo test "${current.testName}")`));
    return;
  }
  if (MODE !== 'fail' || !list.length || !assert) { return; }
  const unique = Array.from(new Set(list));
  assert.pushResult({ result: false, actual: unique.length, expected: 0,
    message: `leak check: ${unique.slice(0, 8).join(' | ')}${unique.length > 8 ? ` | ...and ${unique.length - 8} more` : ''}` });
}

// Test-only access, for tests/unit/helpers/leak-check-test.js. `take` removes and returns only the
// findings matching `pattern`, so a self-test cannot swallow a real finding from the same test;
// `isolated` runs a self-test step against its own snapshots and puts the check's own back after.
export const leakCheckTesting = {
  watchDestroyed,
  take(pattern) {
    const mine = (m) => pattern.test(m);
    const list = findings.concat(pendingForNextTest).filter(mine);
    findings = findings.filter((m) => !mine(m));
    pendingForNextTest = pendingForNextTest.filter((m) => !mine(m));
    return list;
  },
  isolated(callback) {
    const saved = { before, bodyBefore };
    try { return callback(); } finally { before = saved.before; bodyBefore = saved.bodyBefore; }
  },
  snapshotFunctions() { before = snapshotFunctions(); },
  checkFunctions,
  snapshotBody() { bodyBefore = new Set(Array.prototype.slice.call(document.body.children)); },
  checkBody
};

if (MODE !== 'off') {
  QUnit.hooks.beforeEach(function(assert) {
    if (pendingForNextTest.length) { findings = findings.concat(pendingForNextTest.map((m) => `${m} (between tests, charged to the next test)`)); pendingForNextTest = []; }
    flush(assert);
    before = snapshotFunctions();
    bodyBefore = new Set(Array.prototype.slice.call(document.body.children));
    if (FIELD_SURVEY) { fieldsBefore = snapshotFields(); }
  });
  // Global afterEach hooks run after every module hook, including ember-qunit's owner teardown
  // (qunit.js runTest: hooks('afterEach').reverse(), globals registered first).
  QUnit.hooks.afterEach(function(assert) {
    checkFunctions();
    checkBody();
    surveyFields();
    flush(assert);
    watchDestroyed();
  });
  // A finding after the last test has no test left to fail; at least say so.
  QUnit.done(function() {
    if (pendingForNextTest.length) { console.error(`[LEAK-CHECK] after the last test: ${pendingForNextTest.join(' | ')}`); }
  });
}
