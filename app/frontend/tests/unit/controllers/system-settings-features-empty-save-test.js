import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import { waitUntil } from '@ember/test-helpers';
import $ from 'jquery';
import modal from 'frontend/utils/modal';
import { setupRestoreOnTeardown } from 'frontend/tests/helpers/restore-on-teardown';

// GitHub #1057. Unchecking every feature and saving must persist an empty list.
// jQuery form-encoding drops an empty array, so the key never reaches the server
// and update returns 400 (system_features_controller.rb:42).

module('Unit | Controller | system-settings/features empty save', function(hooks) {
  setupTest(hooks);
  var trackRestore = setupRestoreOnTeardown(hooks);

  async function capturePut(owner, toggles) {
    var controller = owner.lookup('controller:system-settings/features');
    var persistence = owner.lookup('service:persistence');
    var originalOnline = persistence.get('online');
    var originalRealAjax = $.realAjax;
    var originalSuccess = modal.success;
    var captured = null;
    var restore = trackRestore(function() {
      $.realAjax = originalRealAjax;
      modal.success = originalSuccess;
      persistence.set('online', originalOnline);
    });
    persistence.set('online', true);
    modal.success = function() {};
    $.realAjax = function(options) {
      if (options && options.type === 'PUT') { captured = options; }
      return $.Deferred().resolve({ features: [], categories: [] }).promise();
    };
    try {
      controller.set('pendingToggles', toggles);
      controller.send('saveFeatures');
      await waitUntil(function() { return !!captured; }, { timeout: 3000 });
    } finally {
      restore();
    }
    return captured;
  }

  test('saving with every feature unchecked keeps an empty enabled_features list on the wire', async function(assert) {
    var captured = await capturePut(this.owner, { goals: false, lessons: false });
    var body = captured.data;
    // $.param is what jQuery would send for a plain object. An empty array disappears.
    var wire = (typeof body === 'string') ? body : $.param(body);
    assert.true(wire.indexOf('enabled_features') !== -1, 'the empty list is present in the request body');
    assert.strictEqual(captured.contentType, 'application/json');
    assert.deepEqual(JSON.parse(body).enabled_features, []);
    assert.strictEqual(JSON.parse(body).org_id, 'default');
  });

  test('saving a checked feature still sends that feature', async function(assert) {
    var captured = await capturePut(this.owner, { goals: true, lessons: false });
    assert.deepEqual(JSON.parse(captured.data).enabled_features, ['goals']);
  });
});
