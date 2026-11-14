import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';

/* "SESSION TIMEOUT" ONLY ON YOUR OWN PREFERENCES (Traci, 2026-11-13).
 *
 * "Keep me logged in on this private device" sets whether a device is trusted. Only the person may change that: the
 * server drops it from a supervisor's or an operator's save (app/models/user.rb process_params), so the control is
 * shown only when the page is the signed-in person's own preferences, compared by backend id (the session user can be
 * the record keyed 'self', utils/backend_user_id.js). */
module('Unit | Controller | user/preferences Session Timeout', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.appState = this.owner.lookup('service:app-state');
    this.prior = this.appState.get('sessionUser');
    this.appState.set('sessionUser', EmberObject.create({ id: 'self', global_id: '1_3', user_name: 'example' }));
    this.controller = this.owner.lookup('controller:user/preferences');
  });
  hooks.afterEach(function() {
    this.appState.set('sessionUser', this.prior);
  });

  test('shown in Advanced on your own preferences, including under your real id', function(assert) {
    this.controller.set('advanced', true);
    this.controller.set('model', EmberObject.create({ id: '1_3', user_name: 'example' }));
    assert.true(this.controller.get('show_session_timeout'));
  });

  test("not shown on someone else's preferences", function(assert) {
    this.controller.set('advanced', true);
    this.controller.set('model', EmberObject.create({ id: '1_8', user_name: 'sam' }));
    assert.false(this.controller.get('show_session_timeout'));
  });

  test('not shown outside Advanced', function(assert) {
    this.controller.set('advanced', false);
    this.controller.set('model', EmberObject.create({ id: '1_3', user_name: 'example' }));
    assert.false(this.controller.get('show_session_timeout'));
  });
});
