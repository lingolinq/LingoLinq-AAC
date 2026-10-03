import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import session from 'frontend/utils/session';

/* Arriving DIRECTLY in Basic (a bookmark, Back, a typed address) on these pages, requested
 * 2026-09-30. The View menu already lands each of these; the routes now do the same:
 *  - caseload?supervisee=<name>: Communicators tab, that communicator's card expanded;
 *  - /<me>/extras: the home page with the Extras drawer open (the URL no longer says extras).
 * (/<me>/logs?nav=home is still open: see docs/task-management/2026-09-30_basic-stranded-pages.md.)
 */
module('Unit | Route | Basic view direct landings', function(hooks) {
  setupTest(hooks);

  var realToken;
  hooks.beforeEach(function() { realToken = session.get('access_token'); });
  hooks.afterEach(function() { session.set('access_token', realToken); });

  function setup(context, style, cold) {
    var calls = [];
    var me = EmberObject.create({ id: '1_3', user_name: 'example', supporter_role: true, known_supervisees: [{ id: '1_7', user_name: 'aiden_parker' }], preferences: { board_view_style: style } });
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend(cold ? {
      effective_view_user: null,
      currentUser: null,
      session_user_promise: Promise.resolve(me)
    } : {
      effective_view_user: me,
      currentUser: me,
      sessionUser: me
    }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({
      currentURL: '/',
      transitionTo: function() { calls.push(Array.prototype.slice.call(arguments)); },
      replaceWith: function() { calls.push(['replaceWith'].concat(Array.prototype.slice.call(arguments))); }
    }));
    context.owner.unregister('service:store');
    context.owner.register('service:store', Service.extend({
      peekRecord: function() { return me; },
      findRecord: function() { return Promise.resolve(me); }
    }));
    session.set('access_token', 'token');
    return { calls: calls, appState: context.owner.lookup('service:app-state'), me: me };
  }

  function transition(queryParams) { return { to: { queryParams: queryParams || {} } }; }
  function run(result) { return Promise.resolve(result).catch(function() {}); }

  test('caseload?supervisee, Basic: Communicators tab with that communicator handed off', async function(assert) {
    var t = setup(this, 'classic');
    await run(this.owner.lookup('route:caseload').afterModel(t.me, transition({ supervisee: 'aiden_parker' })));
    assert.deepEqual(t.calls, [['index']], 'sent home');
    assert.strictEqual(t.appState.get('pending_index_nav'), 'supervisees');
    assert.strictEqual(t.appState.get('pending_open_supervisee'), 'aiden_parker', 'their card to expand');
  });

  test('extras, Basic: the home page with the Extras drawer handed off', async function(assert) {
    var t = setup(this, 'classic');
    await run(this.owner.lookup('route:user/extras').afterModel(t.me, transition()));
    assert.deepEqual(t.calls, [['index']], 'sent home');
    assert.strictEqual(t.appState.get('pending_index_nav'), 'main', 'Actions tab');
    assert.true(t.appState.get('pending_open_extras'), 'drawer open');
  });

  test('extras, Basic, cold load: decided from the account, still sent home', async function(assert) {
    var t = setup(this, 'classic', true);
    await run(this.owner.lookup('route:user/extras').afterModel(t.me, transition()));
    assert.deepEqual(t.calls, [['index']], 'sent home');
  });

  test('extras, Modern: stays', async function(assert) {
    var t = setup(this, 'modern');
    await run(this.owner.lookup('route:user/extras').afterModel(t.me, transition()));
    assert.deepEqual(t.calls, [], 'no redirect');
  });
});
