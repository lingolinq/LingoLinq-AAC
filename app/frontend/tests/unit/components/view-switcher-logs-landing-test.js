import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* Switching to Basic on Modern's Updates page (requested 2026-09-30): stay on the Logs page and
 * drop the Updates marker and the messages filter, so it becomes Basic's own Logs page. A query
 * param change on the current route, replacing the history entry; not the home page's Updates tab.
 */
module('Unit | Component | view-switcher logs landing', function(hooks) {
  setupTest(hooks);

  test('switching to Basic on Updates keeps the Logs page and drops nav and type', function(assert) {
    var calls = [];
    var user = EmberObject.create({ id: '1_3', user_name: 'example', preferences: { board_view_style: 'modern', device: {} },
      save: function() { return Promise.resolve(); } });
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({
      current_route: 'user.logs', effective_view_user: user, currentUser: user, sessionUser: user
    }));
    this.owner.unregister('service:router');
    this.owner.register('service:router', Service.extend({
      currentURL: '/example/logs?type=note&nav=home',
      transitionTo: function() { calls.push(['transitionTo'].concat(Array.prototype.slice.call(arguments))); },
      replaceWith: function() { calls.push(['replaceWith'].concat(Array.prototype.slice.call(arguments))); }
    }));
    var component = this.owner.factoryFor('component:view-switcher').create();
    component.send('_apply_view', user, 'classic');
    assert.deepEqual(calls, [['replaceWith', { queryParams: { nav: null, type: null } }]]);
    assert.notOk(this.owner.lookup('service:app-state').get('pending_index_nav'), 'no home-page tab handed off');
  });

  test('switching to Basic on a single update keeps that page and drops nav', function(assert) {
    var calls = [];
    var user = EmberObject.create({ id: '1_3', user_name: 'example', preferences: { board_view_style: 'modern', device: {} },
      save: function() { return Promise.resolve(); } });
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({
      current_route: 'user.log', effective_view_user: user, currentUser: user, sessionUser: user
    }));
    this.owner.unregister('service:router');
    this.owner.register('service:router', Service.extend({
      currentURL: '/example/logs/1_2?nav=home',
      transitionTo: function() { calls.push(['transitionTo'].concat(Array.prototype.slice.call(arguments))); },
      replaceWith: function() { calls.push(['replaceWith'].concat(Array.prototype.slice.call(arguments))); }
    }));
    this.owner.factoryFor('component:view-switcher').create().send('_apply_view', user, 'classic');
    assert.deepEqual(calls, [['replaceWith', { queryParams: { nav: null } }]]);
    assert.notOk(this.owner.lookup('service:app-state').get('pending_index_nav'), 'no home-page tab handed off');
  });
});
