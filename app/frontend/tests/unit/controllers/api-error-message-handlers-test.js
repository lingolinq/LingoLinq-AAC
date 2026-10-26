import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import { waitUntil } from '@ember/test-helpers';
import EmberObject from '@ember/object';
import $ from 'jquery';
import persistence from 'frontend/utils/persistence';
import { setupRestoreOnTeardown } from 'frontend/tests/helpers/restore-on-teardown';

/* GitHub #1058. persistence.ajax rejects with {fakeXHR, message, result}.
   Report fetch, load-more, and telemetry used to read err.error, which that
   shape does not set. The starter board keeps a translated message. */
module('Unit | Controller | api error message handlers', function(hooks) {
  setupTest(hooks);
  var trackRestore = setupRestoreOnTeardown(hooks);

  async function rejectWith(message, run) {
    var originalOnline = persistence.get('online');
    var originalRealAjax = $.realAjax;
    var restore = trackRestore(function() {
      $.realAjax = originalRealAjax;
      persistence.set('online', originalOnline);
    });
    persistence.set('online', true);
    $.realAjax = function() {
      var body = { error: message };
      var xhr = {
        status: 400,
        readyState: 4,
        statusText: 'error',
        responseJSON: body,
        responseText: JSON.stringify(body),
        getResponseHeader: function() { return null; }
      };
      return $.Deferred().reject(xhr, 'error', 'error').promise();
    };
    try {
      var shown = run();
      await waitUntil(function() { return shown(); }, { timeout: 3000 });
    } finally {
      restore();
    }
  }

  test('an organization report shows the server error', async function(assert) {
    var message = 'report parameter required';
    var controller = this.owner.lookup('controller:organization/reports');
    controller.set('model', EmberObject.create({ id: '1_2' }));
    await rejectWith(message, function() {
      controller.set('current_report', 'logged_2');
      return function() {
        return controller.get('results.error.error') === message;
      };
    });
    assert.strictEqual(controller.get('results.error.error'), message);
    assert.false(controller.get('results.loading'));
  });

  test('loading another report page shows the server error', async function(assert) {
    var message = 'Not authorized';
    var controller = this.owner.lookup('controller:organization/reports');
    controller.set('results', { meta: { next_url: '/api/v1/organizations/1_2/admin_reports?page=2' }, list: [] });
    await rejectWith(message, function() {
      controller.send('load_more');
      return function() {
        return controller.get('results.error.error') === message;
      };
    });
    assert.strictEqual(controller.get('results.error.error'), message);
    assert.false(controller.get('results.loading_more'));
  });

  test('the organization telemetry panel shows the server error', async function(assert) {
    var message = 'Not authorized';
    var controller = this.owner.lookup('controller:organization/telemetry');
    await rejectWith(message, function() {
      controller.set('model', EmberObject.create({ id: '1_2' }));
      return function() {
        return controller.get('telemetry.error') === message;
      };
    });
    assert.strictEqual(controller.get('telemetry.error'), message);
    assert.notOk(controller.get('telemetry.loading'));
  });

  test('building a starter board keeps the translated message', async function(assert) {
    var shown = 'Could not build the starter board. Please try again.';
    var component = this.owner.factoryFor('component:eval-quick-report').create({
      session: EmberObject.create({ recommendation: { starter_board_spec: {} } }),
      user: EmberObject.create({ user_name: 'sam' })
    });
    await rejectWith('board key already in use', function() {
      component.send('buildStarterBoard');
      return function() {
        return component.get('buildError') === shown;
      };
    });
    assert.strictEqual(component.get('buildError'), shown);
    assert.false(component.get('buildingBoard'));
  });
});
