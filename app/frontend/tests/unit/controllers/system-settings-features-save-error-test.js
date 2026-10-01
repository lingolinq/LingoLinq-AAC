import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import { waitUntil } from '@ember/test-helpers';
import $ from 'jquery';
import modal from 'frontend/utils/modal';
import { setupRestoreOnTeardown } from 'frontend/tests/helpers/restore-on-teardown';

// Follow-up to #1054. A rejected save or reset on the Features settings page must show
// the server's error text, not the generic "Could not save settings."

module('Unit | Controller | system-settings/features save errors', function(hooks) {
  setupTest(hooks);
  // The stubs below replace page-global state; see the helper for why finally alone leaked
  // modal.error into "modal flash - should properly render error flash".
  var trackRestore = setupRestoreOnTeardown(hooks);

  // getOrgId() is 'default' here, where a non-site-admin is refused by the site-admin
  // guard (app/controllers/concerns/api/system_settings_access.rb:25). Fail at the
  // transport, so the app's own $.ajax wrapper (utils/extras.js) builds the rejection.
  // The wrapper parses responseText, so the fake jqXHR must carry it.
  async function runRejected(owner, status, message, trigger) {
    var controller = owner.lookup('controller:system-settings/features');
    var persistence = owner.lookup('service:persistence');
    var originalOnline = persistence.get('online');
    var originalRealAjax = $.realAjax;
    var originalError = modal.error;
    var originalConfirm = window.confirm;
    var shown = [];
    var restore = trackRestore(function() {
      $.realAjax = originalRealAjax;
      modal.error = originalError;
      window.confirm = originalConfirm;
      persistence.set('online', originalOnline);
    });
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
      // No settled() after this. It waits for every pending runloop timer, and the
      // persistence.set('online', true) above can start a 15-minute one: if the app read
      // offline when the test began, that is a reconnect, so stashes' drain_on_reconnect
      // calls push_log(), which re-arms its periodic flush (app/services/stashes.js). This
      // timed out at 15s in CI (#1073). It is not needed: the controller sets saving to
      // false and calls modal.error in the same rejection callback
      // (app/controllers/system-settings/features.js:196-198 and 213-215), so both values
      // are final once the message has been shown.
      await waitUntil(function() { return shown.length > 0; }, { timeout: 3000 });
    } finally {
      restore();
    }
    return { controller: controller, shown: shown };
  }

  test('a rejected save shows the server error, not the generic message', async function(assert) {
    var message = 'Site admin required';
    var res = await runRejected(this.owner, 403, message, function(controller) {
      controller.set('pendingToggles', { goals: true });
      controller.send('saveFeatures');
    });
    assert.deepEqual(res.shown, [message], 'the admin sees why the save was refused');
    assert.false(res.controller.get('saving'), 'the Save button is re-enabled');
  });

  test('a rejected reset shows the server error, not the generic message', async function(assert) {
    var message = 'Site admin required';
    var res = await runRejected(this.owner, 403, message, function(controller) {
      controller.send('resetFeatures');
    });
    assert.deepEqual(res.shown, [message], 'the admin sees why the reset was refused');
    assert.false(res.controller.get('saving'), 'the Reset button is re-enabled');
  });
});
