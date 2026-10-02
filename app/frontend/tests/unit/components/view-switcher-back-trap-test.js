import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* SWITCHING TO BASIC REPLACES THE MODERN ADDRESS (2026-10-01). Basic has no Caseload, Boards or
 * Extras page, so the switcher sends the viewer to the Basic landing. With `transitionTo` the Modern
 * address stayed in history: Back re-entered it and its route redirected forward again, a Back
 * trap. `replaceWith` drops it. The route-side redirect (utils/basic_landing.js
 * send_basic_viewer_to_landing) is NOT changed: Ember forces a push for a replace issued while
 * another transition is aborting (ember-source router `_updateURL`, `replaceAndNotAborting`).
 */
module('Unit | Component | view-switcher back trap', function(hooks) {
  setupTest(hooks);

  test('switching to Basic on Caseload replaces the Modern address instead of pushing', function(assert) {
    var calls = [];
    var me = EmberObject.create({ id: '1_3', user_name: 'slp_ana', preferences: { board_view_style: 'modern', device: {} },
      save: function() { return Promise.resolve(); } });
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({
      current_route: 'caseload', effective_view_user: me, currentUser: me, sessionUser: me
    }));
    this.owner.unregister('service:router');
    this.owner.register('service:router', Service.extend({
      currentURL: '/caseload',
      transitionTo: function() { calls.push(['transitionTo'].concat(Array.prototype.slice.call(arguments))); },
      replaceWith: function() { calls.push(['replaceWith'].concat(Array.prototype.slice.call(arguments))); }
    }));
    this.owner.factoryFor('component:view-switcher').create().send('_apply_view', me, 'classic');
    assert.strictEqual(calls.length, 1, 'one navigation');
    assert.strictEqual(calls[0][0], 'replaceWith', 'the Modern address is replaced, so Back does not re-enter it');
  });
});
