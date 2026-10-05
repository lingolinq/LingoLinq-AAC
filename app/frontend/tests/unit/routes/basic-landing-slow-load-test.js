import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import session from 'frontend/utils/session';

/* THE BASIC LANDINGS ON A SLOW COLD LOAD (2026-10-02, adversarial review, requested: "fix 3").
 * routes/user/logs.js waits briefly (utils/session_user_wait.js, 1.2s) for the signed-in user before
 * deciding whether a Basic viewer's own `?type=note&nav=home` becomes the plain Logs page. When that
 * wait ran out, nothing redirected, and the `type=note` load marked the newest message read. And
 * neither that route nor routes/user/boards.js checked, after the wait, whether the user had already
 * gone elsewhere, so a late redirect could override a newer navigation.
 */
module('Unit | Route | Basic landings on a slow load', function(hooks) {
  setupTest(hooks);
  var realName;
  hooks.beforeEach(function() { realName = session.get('user_name'); });
  hooks.afterEach(function() { session.set('user_name', realName); });

  function setup(context, delayMs) {
    var calls = [];
    var me = EmberObject.create({ id: '1_3', user_name: 'example', preferences: { board_view_style: 'classic' } });
    session.set('user_name', 'example');
    var arrives = new Promise(function(resolve) { setTimeout(function() { resolve(me); }, delayMs); });
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      effective_view_user: null, currentUser: null, session_user_promise: arrives
    }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({
      transitionTo: function() { calls.push(['transitionTo'].concat(Array.prototype.slice.call(arguments))); },
      replaceWith: function() { calls.push(['replaceWith'].concat(Array.prototype.slice.call(arguments))); }
    }));
    var transition = { to: { queryParams: { type: 'note', nav: 'home' } }, urlMethod: null, isAborted: false,
      abort: function() { calls.push(['abort']); } };
    return { calls: calls, transition: transition, page: EmberObject.create({ id: '1_3', user_name: 'example' }) };
  }
  function run(result) { return Promise.resolve(result).catch(function() {}); }

  test('Logs: the signed-in user arriving after 1.5s still sends a Basic viewer to the plain page', async function(assert) {
    assert.expect(1);
    var t = setup(this, 1500);
    await run(this.owner.lookup('route:user/logs').afterModel(t.page, t.transition));
    assert.deepEqual(t.calls.map(function(c) { return c[0]; }), ['abort', 'replaceWith'], 'own log: waited for the user it was already fetching');
  });

  test('Logs: a navigation made during the wait is left alone', async function(assert) {
    assert.expect(1);
    var t = setup(this, 300);
    var p = run(this.owner.lookup('route:user/logs').afterModel(t.page, t.transition));
    t.transition.isAborted = true;
    await p;
    assert.deepEqual(t.calls, [], 'no late redirect over the newer navigation');
  });

  test('My Boards: a navigation made during the wait is left alone', async function(assert) {
    assert.expect(1);
    var t = setup(this, 300);
    var p = run(this.owner.lookup('route:user/boards').afterModel(t.page, t.transition));
    t.transition.isAborted = true;
    await p;
    assert.deepEqual(t.calls, [], 'no late redirect over the newer navigation');
  });
});
