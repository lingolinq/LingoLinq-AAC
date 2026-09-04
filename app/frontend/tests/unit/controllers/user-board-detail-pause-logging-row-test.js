import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';

/*
 * "Pause Logging" for a COMMUNICATOR-ONLY account.
 *
 * The row lives in the Session submenu, and speak_section_visible_session
 * (controllers/user/board-detail.js:4303) returns false on its FIRST statement
 * for a communicator-only account -- before any per-item consideration. So the
 * per-item guard in board-detail.hbs:1270 is unreachable for a communicator and
 * the row simply is not there, even though the classic speak menu
 * (templates/application.hbs:1239) has always offered it to them: its whole
 * enclosing block stack carries no role gate.
 *
 * The Session gate is deliberate and stays untouched -- :4297-4306 records that
 * a locked communicator must not be able to release their own board lock. This
 * computed drives a SEPARATE top-level row instead, so nothing else in Session
 * becomes reachable.
 *
 * Every case below asserts the property is a real boolean first: `!!undefined`
 * is also false, so a bare assert.false stays green against a computed that was
 * deleted outright.
 */
module('Unit | Controller | user/board-detail pause logging row', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.controller = this.owner.factoryFor('controller:user/board-detail').create();
  });

  hooks.afterEach(function() {
    if(this.controller) {
      this.controller.destroy();
      this.controller = null;
    }
  });

  // A communicator with logging enabled and nothing hidden: the case the row exists for.
  function communicator(controller, app_state_attrs) {
    controller.set('speak_menu_hidden_items', []);
    controller.set('app_state', EmberObject.create(Object.assign({
      modeling: false,
      superProtectedSpeakMode: false,
      currentUser: EmberObject.create({
        supporter_role: false,
        preferences: { logging: true }
      })
    }, app_state_attrs || {})));
  }

  test('a communicator with logging on is offered the row', function(assert) {
    communicator(this.controller);
    assert.strictEqual(typeof this.controller.get('pause_logging_row_visible'), 'boolean',
      'pause_logging_row_visible is a real computed');
    assert.true(this.controller.get('pause_logging_row_visible'),
      'the communicator can reach Pause Logging');
    // The Session section itself must NOT have opened up as a side effect.
    assert.false(!!this.controller.get('speak_section_visible_session'),
      'the Session section stays hidden -- board lock and Modeling are still out of reach');
  });

  test('a supporter is not offered the top-level row', function(assert) {
    communicator(this.controller);
    this.controller.set('app_state.currentUser.supporter_role', true);
    assert.false(this.controller.get('pause_logging_row_visible'),
      'supporters keep the row inside Session, not duplicated at top level');
  });

  test('a supervisor actively modeling is not offered the top-level row', function(assert) {
    communicator(this.controller);
    this.controller.set('app_state.modeling', true);
    assert.false(this.controller.get('pause_logging_row_visible'),
      'modeling restores the full Session section, so the top-level row would duplicate it');
  });

  test('hiding it in the Customize Menu still hides it', function(assert) {
    communicator(this.controller);
    this.controller.set('speak_menu_hidden_items', ['pause_logging']);
    assert.false(this.controller.get('pause_logging_row_visible'),
      'the customize-menu setting is honoured for communicators too');
  });

  test('no row when the account does not log at all', function(assert) {
    communicator(this.controller);
    this.controller.set('app_state.currentUser.preferences', { logging: false });
    assert.false(this.controller.get('pause_logging_row_visible'),
      'nothing to pause when logging is off');
  });

  test('no row in super-protected speak mode', function(assert) {
    communicator(this.controller, { superProtectedSpeakMode: true });
    assert.false(this.controller.get('pause_logging_row_visible'),
      'matches the Session-submenu wrapper at board-detail.hbs:1244');
  });
});
