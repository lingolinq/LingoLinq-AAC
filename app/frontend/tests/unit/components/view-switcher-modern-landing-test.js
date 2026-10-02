import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* SWITCHING TO MODERN FROM THE BASIC HOME LANDS ON THE MATCHING MODERN PAGE (2026-10-02,
 * requested). The Basic home publishes where you are (app_state.basic_home_place, written by
 * components/dashboard/classic-view.js); the switcher replaces the address with the Modern page for
 * it (utils/basic_landing.js modern_landing_for), so Back does not return to the Basic address.
 */
module('Unit | Component | view-switcher modern landing', function(hooks) {
  setupTest(hooks);

  function run(context, route, place, pageUser) {
    var calls = [];
    var me = EmberObject.create({ id: '1_3', user_name: 'slp_ana', preferences: { board_view_style: 'classic', device: {} },
      save: function() { return Promise.resolve(); } });
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      current_route: route, effective_view_user: me, currentUser: me, sessionUser: me,
      page_user: pageUser || null, basic_home_place: place, feature_flags: { updates_pill: true }
    }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({
      currentURL: '/slp_ana/home',
      transitionTo: function() { calls.push(['transitionTo'].concat(Array.prototype.slice.call(arguments))); },
      replaceWith: function() { calls.push(['replaceWith'].concat(Array.prototype.slice.call(arguments))); }
    }));
    context.owner.factoryFor('component:view-switcher').create().send('_apply_view', me, 'modern');
    return calls;
  }

  test('Boards tab -> Modern Boards, replacing the address', function(assert) {
    assert.expect(1);
    assert.deepEqual(run(this, 'user.home', { tab: 'boards' }), [['replaceWith', 'user.boards', 'slp_ana', { queryParams: {} }]]);
  });

  test('Communicators with a card open -> Caseload with that row', function(assert) {
    assert.expect(1);
    assert.deepEqual(run(this, 'index', { tab: 'supervisees', supervisee: 'aiden_parker' }), [['replaceWith', 'caseload', { queryParams: { supervisee: 'aiden_parker' } }]]);
  });

  test('Actions tab: stays on the Dashboard', function(assert) {
    assert.expect(1);
    assert.deepEqual(run(this, 'user.home', { tab: 'main' }), []);
  });

  test('not on the Basic home (another page): no landing', function(assert) {
    assert.expect(1);
    assert.deepEqual(run(this, 'user.goals', { tab: 'boards' }), []);
  });
});
