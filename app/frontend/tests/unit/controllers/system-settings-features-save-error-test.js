import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import { settled, waitUntil, getSettledState } from '@ember/test-helpers';
import { _backburner } from '@ember/runloop';
import { getPendingWaiterState } from '@ember/test-waiters';
import $ from 'jquery';
import modal from 'frontend/utils/modal';

// Follow-up to #1054. A rejected save or reset on the Features settings page must show
// the server's error text, not the generic "Could not save settings."

/* ==== TEMPORARY DIAGNOSTIC FOR #1073. DO NOT MERGE. ====
 * In CI this test's `await settled()` sometimes never resolves and the test times out at
 * 15s. Locally it resolves in ~2s even in CI's exact test order. This records what
 * settled() is still waiting on after 10s, then fails the test on purpose with that dump
 * instead of hanging (so the 15s timeout and its stub leak do not occur).
 *
 * In-flight jQuery requests are tracked from module load, before any test runs, because
 * settled() only reports a count of them. */
var DIAG_INFLIGHT = [];
$(document).on('ajaxSend', function(event, xhr, opts) {
  DIAG_INFLIGHT.push({ xhr: xhr, url: opts && opts.url, type: opts && opts.type, started: Date.now() });
});
$(document).on('ajaxComplete', function(event, xhr) {
  DIAG_INFLIGHT = DIAG_INFLIGHT.filter(function(r) { return r.xhr !== xhr; });
});

function diagSnapshot(label, t0) {
  var state = getSettledState();
  var debug = (state.debugInfo && state.debugInfo._debugInfo) || {};
  var raw = _backburner._timers || [];
  var timers = [];
  for (var i = 0; i < raw.length; i += 6) {
    var method = raw[i + 3];
    var src = typeof method === 'function' ? method.toString() : String(method);
    var dbg = (debug.timers || [])[i / 6] || {};
    timers.push({
      due_in_ms: Math.round(raw[i] - Date.now()),
      fn: src.replace(/\s+/g, ' ').slice(0, 400),
      created_at: (dbg.stack || '').split('\n').slice(1, 9).map(function(l) { return l.trim(); })
    });
  }
  var waiters = getPendingWaiterState();
  return {
    label: label,
    elapsed_ms: Date.now() - t0,
    hasPendingTimers: state.hasPendingTimers,
    hasRunLoop: state.hasRunLoop,
    hasPendingWaiters: state.hasPendingWaiters,
    hasPendingRequests: state.hasPendingRequests,
    pendingRequestCount: state.pendingRequestCount,
    isRenderPending: state.isRenderPending,
    hasPendingTransitions: state.hasPendingTransitions,
    settled_debug: debug.counters || null,
    autorun: debug.autorun ? String(debug.autorun.stack || debug.autorun).slice(0, 600) : null,
    timers: timers,
    inflight_requests: DIAG_INFLIGHT.map(function(r) {
      return { url: r.url, type: r.type, age_ms: Date.now() - r.started };
    }),
    test_waiters: waiters && waiters.waiters ? waiters.waiters : waiters
  };
}

async function settledOrDiagnose(t0) {
  var timedOut = false;
  var timer;
  var watchdog = new Promise(function(resolve) {
    timer = setTimeout(function() { timedOut = true; resolve(); }, 10000);
  });
  await Promise.race([settled(), watchdog]);
  clearTimeout(timer);
  if (timedOut) {
    var dump = diagSnapshot('settled() still pending after 10s', t0);
    // eslint-disable-next-line no-console
    console.error('DIAG-1073 ' + JSON.stringify(dump));
    return JSON.stringify(dump);
  }
  return null;
}
/* ==== END TEMPORARY DIAGNOSTIC ==== */

module('Unit | Controller | system-settings/features save errors', function(hooks) {
  setupTest(hooks);

  // getOrgId() is 'default' here, where a non-site-admin is refused by the site-admin
  // guard (app/controllers/concerns/api/system_settings_access.rb:25). Fail at the
  // transport, so the app's own $.ajax wrapper (utils/extras.js) builds the rejection.
  // The wrapper parses responseText, so the fake jqXHR must carry it.
  async function runRejected(owner, status, message, trigger) {
    var t0 = Date.now();
    var controller = owner.lookup('controller:system-settings/features');
    var persistence = owner.lookup('service:persistence');
    var originalOnline = persistence.get('online');
    var originalRealAjax = $.realAjax;
    var originalError = modal.error;
    var originalConfirm = window.confirm;
    var shown = [];
    var diag = null;
    persistence.set('online', true);
    $.realAjax = function() {
      var body = { error: message, status: status };
      var xhr = { status: status, readyState: 4, statusText: 'error', responseJSON: body, responseText: JSON.stringify(body), getResponseHeader: function() { return null; } };
      return $.Deferred().reject(xhr, 'error', 'error').promise();
    };
    modal.error = function(text) { shown.push(text); };
    window.confirm = function() { return true; };
    try {
      trigger(controller);
      await waitUntil(function() { return shown.length > 0; }, { timeout: 3000 });
      diag = await settledOrDiagnose(t0);
    } finally {
      $.realAjax = originalRealAjax;
      modal.error = originalError;
      window.confirm = originalConfirm;
      persistence.set('online', originalOnline);
    }
    return { controller: controller, shown: shown, diag: diag };
  }

  test('a rejected save shows the server error, not the generic message', async function(assert) {
    var message = 'Site admin required';
    var res = await runRejected(this.owner, 403, message, function(controller) {
      controller.set('pendingToggles', { goals: true });
      controller.send('saveFeatures');
    });
    assert.strictEqual(res.diag, null, 'DIAG-1073 ' + res.diag);
    assert.deepEqual(res.shown, [message], 'the admin sees why the save was refused');
    assert.false(res.controller.get('saving'), 'the Save button is re-enabled');
  });

  test('a rejected reset shows the server error, not the generic message', async function(assert) {
    var message = 'Site admin required';
    var res = await runRejected(this.owner, 403, message, function(controller) {
      controller.send('resetFeatures');
    });
    assert.strictEqual(res.diag, null, 'DIAG-1073 ' + res.diag);
    assert.deepEqual(res.shown, [message], 'the admin sees why the reset was refused');
    assert.false(res.controller.get('saving'), 'the Reset button is re-enabled');
  });
});
