/*
 * SUITE DIAGNOSTICS (2026-10-05, branch traci/test/ci-test-stalls). TEMPORARY: measurement for
 * two CI problems, to be removed or reduced once the causes are fixed.
 *
 *   1. Jasmine-style tests slow down steadily over a CI run: median 66ms near the start, 1.9s
 *      near the end (CI build-and-test log, PR #1108), so something accumulates per test.
 *   2. "modal scanning - should not resume scanning when a different modal is opened" fails in
 *      CI full runs (develop #1105/#1106/#1107 merges, PR #1108) and never locally: the
 *      `runLater` in modal.close (app/utils/modal.js) does not fire within 5.5s.
 *
 * Logs one `[DIAG]` line every DIAG_EVERY tests with: heap, DOM nodes, pending + overdue Ember
 * run-loop timers, pending setTimeouts, window/document listeners, and app instances built but
 * never destroyed. At the end, the top sources of still-pending setTimeouts and run-loop timers
 * and of added-but-not-removed listeners. Read-only instrumentation: it changes no test result.
 */
import * as QUnit from 'qunit';
import { _backburner } from '@ember/runloop';

const DIAG_EVERY = 100;
const TIMERS_OFFSET = 6; // backburner timer record: [executeAt, id, target, method, args, stack]

const pendingTimeouts = new Map(); // id -> source
const listenerNet = new Map(); // "window:type" / "document:type" -> net count
const listenerSource = new Map(); // "window:type @ source" -> net count
const liveInstances = [];
let testIndex = 0;

// First stack frame outside this file, the harness and vendor code: where the work came from.
function source() {
  const stack = (new Error().stack || '').split('\n').slice(2);
  const frame = stack.find((f) => !/suite-diagnostics|vendor\.js|jasmine\.js|qunit|EventTarget\.(add|remove)EventListener|window\.setTimeout|installSuiteDiagnostics/.test(f)) || stack[0] || '';
  return frame.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+\/assets\//, '').slice(0, 140);
}

export function installSuiteDiagnostics(app) {
  if (typeof window === 'undefined' || window.__llSuiteDiag) { return; }
  window.__llSuiteDiag = true;
  window.LL_TEST_DIAG = true; // read by app/utils/modal.js close() diagnostics

  const realSetTimeout = window.setTimeout;
  const realClearTimeout = window.clearTimeout;
  window.setTimeout = function(fn, ms, ...rest) {
    const src = source();
    let id;
    const wrapped = typeof fn === 'function' ? function() { pendingTimeouts.delete(id); return fn.apply(this, arguments); } : fn;
    id = realSetTimeout.call(window, wrapped, ms, ...rest);
    pendingTimeouts.set(id, src);
    return id;
  };
  window.clearTimeout = function(id) {
    pendingTimeouts.delete(id);
    return realClearTimeout.call(window, id);
  };

  const realAdd = EventTarget.prototype.addEventListener;
  const realRemove = EventTarget.prototype.removeEventListener;
  const which = (t) => (t === window ? 'window' : (t === document ? 'document' : null));
  EventTarget.prototype.addEventListener = function(type) {
    const w = which(this);
    if (w) {
      const k = w + ':' + type;
      listenerNet.set(k, (listenerNet.get(k) || 0) + 1);
      const ks = k + ' @ ' + source();
      listenerSource.set(ks, (listenerSource.get(ks) || 0) + 1);
    }
    return realAdd.apply(this, arguments);
  };
  EventTarget.prototype.removeEventListener = function(type) {
    const w = which(this);
    if (w) { const k = w + ':' + type; listenerNet.set(k, (listenerNet.get(k) || 0) - 1); }
    return realRemove.apply(this, arguments);
  };

  if (app && typeof app.buildInstance === 'function') {
    const realBuild = app.buildInstance;
    app.buildInstance = function() {
      const inst = realBuild.apply(this, arguments);
      liveInstances.push(new WeakRef(inst));
      return inst;
    };
  }

  const timers = () => (_backburner && _backburner._timers) || [];
  const snapshot = () => {
    const t = timers();
    const now = Date.now();
    let overdue = 0;
    for (let i = 0; i < t.length; i += TIMERS_OFFSET) { if (t[i] <= now - 50) { overdue++; } }
    const alive = liveInstances.filter((r) => { const o = r.deref(); return o && !o.isDestroyed && !o.isDestroying; }).length;
    let listeners = 0;
    listenerNet.forEach((n) => { listeners += Math.max(0, n); });
    return {
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
      dom: document.getElementsByTagName('*').length,
      qunitDom: (document.getElementById('qunit') || document.createElement('i')).getElementsByTagName('*').length,
      runloopTimers: t.length / TIMERS_OFFSET,
      runloopOverdue: overdue,
      timeouts: pendingTimeouts.size,
      listeners,
      liveAppInstances: alive,
      // jQuery's own handler lists on document: @ember/test-helpers adds ajaxSend/ajaxComplete per
      // test and removes them with .off() in cleanup. Counted here to check that, not assume it.
      jqAjaxSend: (window.jQuery && window.jQuery._data && ((window.jQuery._data(document, 'events') || {}).ajaxSend || []).length) || 0
    };
  };
  window.__llSuiteSnapshot = snapshot;

  QUnit.on('testEnd', function(testEnd) {
    testIndex++;
    if (testIndex % DIAG_EVERY === 0 || testEnd.status === 'failed') {
      console.log('[DIAG] #' + testIndex + ' ' + testEnd.runtime + 'ms ' + JSON.stringify(snapshot()) + ' :: ' + testEnd.fullName.join(' > ').slice(0, 110));
      // Where the growth is: what piles up under <body>, and who adds the listeners.
      const kids = new Map();
      Array.from(document.body.children).forEach((el) => {
        const k = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
        kids.set(k, (kids.get(k) || 0) + 1);
      });
      const top = (map, n) => Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, n);
      console.log('[DIAG] body children: ' + JSON.stringify(top(kids, 6)));
      console.log('[DIAG] listener sources: ' + JSON.stringify(top(listenerSource, 6)));
    }
  });

  QUnit.on('runEnd', function() {
    const top = (map, n) => Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, n);
    const timeoutBySource = new Map();
    pendingTimeouts.forEach((src) => timeoutBySource.set(src, (timeoutBySource.get(src) || 0) + 1));
    const t = timers();
    const runloopBySource = new Map();
    for (let i = 0; i < t.length; i += TIMERS_OFFSET) {
      const method = t[i + 3];
      const name = (method && (method.name || String(method).slice(0, 80))) || '?';
      runloopBySource.set(name, (runloopBySource.get(name) || 0) + 1);
    }
    console.log('[DIAG] END ' + JSON.stringify(snapshot()));
    console.log('[DIAG] pending setTimeouts by source: ' + JSON.stringify(top(timeoutBySource, 15)));
    console.log('[DIAG] pending run-loop timers by method: ' + JSON.stringify(top(runloopBySource, 15)));
    console.log('[DIAG] listeners net by type: ' + JSON.stringify(top(listenerNet, 15)));
    console.log('[DIAG] listeners added by source: ' + JSON.stringify(top(listenerSource, 20)));
  });
}
