import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import RSVP from 'rsvp';
import { settled } from '@ember/test-helpers';
import { setupTest } from '../../helpers';
import modalUtil from 'frontend/utils/modal';

/* BOARD ACTIONS: CONFIRMING SOMEONE ELSE'S VIEW CHANGE STILL APPLIES IT (2026-10-01).
 * Changing the view of a communicator being modelled for asks first
 * (utils/view_style.js#confirm_view_style_change). That confirmation is itself a modal, and opening
 * it REPLACES the open Board Actions modal (services/modal.js), which destroys this component. The
 * confirm callback then called `_this.send(...)` on the destroyed component. The confirmation used
 * to open invisibly (adversarial review H1), so this path never ran; it is fixed alongside it.
 */
module('Unit | Component | board-actions view style confirm', function(hooks) {
  setupTest(hooks);

  var realOpen;
  hooks.beforeEach(function() { realOpen = modalUtil.open; });
  hooks.afterEach(function() { modalUtil.open = realOpen; });

  test('confirmed after the component is gone: the communicator\'s view still changes', async function(assert) {
    var transitions = [];
    var communicator = EmberObject.create({ id: '1_7', user_name: 'aiden_parker',
      preferences: { board_view_style: 'modern', device: {} }, save: function() { return RSVP.resolve(); } });
    var me = EmberObject.create({ id: '1_3', user_name: 'example', preferences: { board_view_style: 'modern' } });
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({ effective_view_user: communicator, currentUser: me, themeMode: 'default' }));
    this.owner.unregister('service:router');
    this.owner.register('service:router', Service.extend({ transitionTo: function() { transitions.push(Array.prototype.slice.call(arguments)); return RSVP.resolve(); } }));
    this.owner.unregister('service:modal');
    this.owner.register('service:modal', Service.extend({ close: function() {} }));

    var answer;
    modalUtil.open = function() { return new RSVP.Promise(function(resolve) { answer = resolve; }); };

    var component = this.owner.factoryFor('component:board-actions').create({ model: { board: EmberObject.create({ key: 'aiden_parker/core' }) } });
    component.send('set_view_style', 'classic');
    assert.ok(answer, 'the confirmation was asked');
    component.destroy();
    await settled();
    answer('change_view');
    await settled();
    assert.strictEqual(communicator.get('preferences.board_view_style'), 'classic', 'the view changed');
  });
});
