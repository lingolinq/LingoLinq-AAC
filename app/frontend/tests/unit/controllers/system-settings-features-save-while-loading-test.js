import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import { waitUntil } from '@ember/test-helpers';
import $ from 'jquery';
import modal from 'frontend/utils/modal';
import { setupRestoreOnTeardown } from 'frontend/tests/helpers/restore-on-teardown';

// Save builds enabled_features from pendingToggles. loadFeatures clears that
// map and sets loading before the GET returns, so a Save in that window used
// to store an empty list. The GET below is left pending so loading stays true.

module('Unit | Controller | system-settings/features save while loading', function(hooks) {
  setupTest(hooks);
  var trackRestore = setupRestoreOnTeardown(hooks);

  function stubAjax(persistence, puts) {
    var originalOnline = persistence.get('online');
    var originalRealAjax = $.realAjax;
    var originalSuccess = modal.success;
    var restore = trackRestore(function() {
      $.realAjax = originalRealAjax;
      modal.success = originalSuccess;
      persistence.set('online', originalOnline);
    });
    persistence.set('online', true);
    modal.success = function() {};
    $.realAjax = function(options) {
      if (options && options.type === 'PUT') {
        puts.count++;
        return $.Deferred().resolve({ features: [], categories: [] }).promise();
      }
      return $.Deferred().promise();
    };
    return restore;
  }

  test('a Save while features are loading sends no PUT', async function(assert) {
    var controller = this.owner.lookup('controller:system-settings/features');
    var puts = { count: 0 };
    var restore = stubAjax(this.owner.lookup('service:persistence'), puts);
    try {
      controller.set('loading', true);
      controller.set('pendingToggles', {});
      controller.send('saveFeatures');
    } finally {
      restore();
    }
    assert.strictEqual(puts.count, 0, 'no PUT while loading');
  });

  test('a second Save during the reload after a successful save sends no PUT', async function(assert) {
    var controller = this.owner.lookup('controller:system-settings/features');
    var puts = { count: 0 };
    var restore = stubAjax(this.owner.lookup('service:persistence'), puts);
    try {
      controller.set('loading', false);
      controller.set('pendingToggles', { goals: true });
      controller.send('saveFeatures');
      await waitUntil(function() {
        return controller.get('loading') === true && puts.count === 1;
      }, { timeout: 3000 });
      controller.send('saveFeatures');
    } finally {
      restore();
    }
    assert.strictEqual(puts.count, 1, 'the reload Save sends no second PUT');
  });
});
