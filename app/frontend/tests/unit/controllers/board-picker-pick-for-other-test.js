import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import modal from 'frontend/utils/modal';

/* The board picker's "use the recommended board" for a communicator (2026-09-30, approved by
 * Traci: "match batch 2"). After the board is assigned, Modern opens the communicator's boards
 * list, as before. Basic opens the communicator's new home board instead, the same place the
 * overlay's "Pick this Board" goes (utils/board_picker_landing.js#after_pick_for_other); Basic has
 * no boards list for another user.
 */
module('Unit | Controller | board-picker pick for a communicator', function(hooks) {
  setupTest(hooks);

  var realSuccess;
  hooks.beforeEach(function() {
    realSuccess = modal.success;
    modal.success = function() {};
  });
  hooks.afterEach(function() {
    modal.success = realSuccess;
  });

  function setup(context, style) {
    var calls = [];
    var me = EmberObject.create({ id: '1_3', user_name: 'example', preferences: { board_view_style: style } });
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: me,
      effective_view_user: me,
      return_to_index: function() { calls.push(['return_to_index']); }
    }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({
      transitionTo: function() { calls.push(Array.prototype.slice.call(arguments)); }
    }));
    context.owner.unregister('service:persistence');
    context.owner.register('service:persistence', Service.extend({ online: false }));
    var controller = context.owner.lookup('controller:board-picker');
    var communicator = EmberObject.create({ id: '1_7', user_name: 'aiden_parker' });
    controller.set('setup_user', communicator);
    return { calls: calls, controller: controller, communicator: communicator };
  }

  test('Basic: opens the communicator\'s new home board', function(assert) {
    var t = setup(this, 'classic');
    t.controller._afterHomeBoardAssigned(t.communicator, EmberObject.create({ key: 'aiden_parker/vocal-flair-84' }));
    assert.deepEqual(t.calls, [['board', 'aiden_parker/vocal-flair-84']]);
  });

  test('Modern: opens the communicator\'s boards list, as before', function(assert) {
    var t = setup(this, 'modern');
    t.controller._afterHomeBoardAssigned(t.communicator, EmberObject.create({ key: 'aiden_parker/vocal-flair-84' }));
    assert.deepEqual(t.calls, [['user.boards', 'aiden_parker']]);
  });

  test('Basic, no board handed back: the boards list (which Basic routes to their account page)', function(assert) {
    var t = setup(this, 'classic');
    t.controller._afterHomeBoardAssigned(t.communicator, null);
    assert.deepEqual(t.calls, [['user.boards', 'aiden_parker']]);
  });
});
