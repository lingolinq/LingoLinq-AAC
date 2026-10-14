import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';

/* MODELING EDITS IN THE COMMUNICATOR'S VIEW (requested 2026-10-01: "if a user is modeling for a
 * communicator, the view is for the effective_view_user (the user they are modeling for), not the
 * slp's view"). The board edit destination is view-aware (utils/board_view.js board_edit_route).
 * The copy flows already pass `effective_view_user`; setup's close_board_layout and the app menu's
 * copy_and_edit_board passed `currentUser`, so a Modern SLP modeling for a Basic communicator was
 * sent to the Modern editor while the screen showed Basic.
 */
module('Unit | Controller | board edit route while modeling', function(hooks) {
  setupTest(hooks);

  var slp = EmberObject.create({ id: '1_3', user_name: 'slp_ana', preferences: { board_view_style: 'modern' } });
  var communicator = EmberObject.create({ id: '1_7', user_name: 'aiden_parker', preferences: { board_view_style: 'classic' } });

  function stub(context, appStateProps) {
    var calls = [];
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend(Object.assign({
      currentUser: slp, effective_view_user: communicator
    }, appStateProps || {})));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({
      transitionTo: function() { calls.push(Array.prototype.slice.call(arguments)); return RSVP.resolve(); }
    }));
    return calls;
  }

  test('setup: closing the board layout opens the board in the communicator\'s view', function(assert) {
    var calls = stub(this, { board_layout_mode: 'aiden_parker/core' });
    this.owner.lookup('controller:setup').send('close_board_layout');
    assert.deepEqual(calls, [['user.board-alt.index', 'aiden_parker', 'core']]);
  });

  test('app menu: copy and edit lands in the communicator\'s view', async function(assert) {
    var calls = stub(this, {
      check_for_needing_purchase: function() { return RSVP.resolve(); },
      jump_to_board: function() { }
    });
    var controller = this.owner.lookup('controller:application');
    controller.set('stashes', EmberObject.create({ persist: function() { } }));
    controller.copy_board = function() { return RSVP.resolve(EmberObject.create({ id: '3_3', key: 'aiden_parker/core' })); };
    controller.send('copy_and_edit_board', EmberObject.create({ id: '2_2', key: 'example/core' }));
    await new Promise(function(resolve) { setTimeout(resolve, 50); });
    assert.deepEqual(calls, [['user.board-alt.index', 'aiden_parker', 'core']]);
  });
});
