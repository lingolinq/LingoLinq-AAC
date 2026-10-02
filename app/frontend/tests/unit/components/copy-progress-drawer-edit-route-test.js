import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* A COPY FOR EDITING OPENS IN THE EDITOR OF THE VIEW ON SCREEN (2026-10-01, review Low, verified).
 * The edit destination came from `currentUser`, while the board pages and every create flow decide
 * classic vs modern from `effective_view_user` (utils/view_style.js). They differ while a supporter
 * models for a communicator: copying for a Basic communicator from a Modern account opened the
 * Modern editor over a Basic UI. Both copy flows now use `effective_view_user`.
 */
module('Unit | Component | copy-progress-drawer edit route', function(hooks) {
  setupTest(hooks);

  test('the edit destination follows the view in effect, not the session account', function(assert) {
    var calls = [];
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({
      currentUser: EmberObject.create({ preferences: { board_view_style: 'modern' } }),
      effective_view_user: EmberObject.create({ preferences: { board_view_style: 'classic' } })
    }));
    this.owner.unregister('service:copy-progress');
    this.owner.register('service:copy-progress', Service.extend({ copy: { for_editing: true, key: 'aiden_parker/core' }, dismiss: function() {} }));
    this.owner.unregister('service:router');
    this.owner.register('service:router', Service.extend({ transitionTo: function() { calls.push(Array.prototype.slice.call(arguments)); } }));
    this.owner.factoryFor('component:copy-progress-drawer').create().open_copy();
    assert.deepEqual(calls, [['user.board-alt.index', 'aiden_parker', 'core']]);
  });
});
