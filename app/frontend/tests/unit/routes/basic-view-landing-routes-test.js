import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* The caseload and the boards library are Modern pages. A Basic user who arrived on either
 * (the navbar's "My Boards", the org page's "Go to My Caseload", a bookmark, Back) got the Modern
 * page with neither view's navigation. Each route now sends a Basic viewer to the Basic home page
 * with the matching tab, through the same map and handoff the View menu uses
 * (utils/basic_landing.js). Only the viewer's OWN boards library moves: the Basic Boards tab lists
 * the viewer's boards, not a supervisee's.
 */
module('Unit | Route | Basic view landings for Modern-only pages', function(hooks) {
  setupTest(hooks);

  function setup(context, style, cold) {
    var transitions = [];
    var calls = [];
    var viewer = EmberObject.create({ id: '1_3', user_name: 'example', preferences: { board_view_style: style } });
    context.owner.unregister('service:app-state');
    // COLD: a first page load, where the route runs before `currentUser` is assigned and the
    // session user's record is still in flight (utils/session_user_wait.js).
    context.owner.register('service:app-state', Service.extend(cold ? {
      effective_view_user: null,
      currentUser: null,
      // Fetched as findRecord('user', 'self'), so on a cold load its id is still 'self', not the
      // numeric id the page's user record carries (seen in the browser, 2026-09-30).
      session_user_promise: Promise.resolve(EmberObject.create({ id: 'self', user_name: 'example', preferences: { board_view_style: style } }))
    } : {
      effective_view_user: viewer,
      currentUser: viewer,
      sessionUser: viewer
    }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({
      currentURL: '/',
      // `calls` keeps every argument, for landings that name a model (a user page).
      transitionTo: function(route) { transitions.push(route); calls.push(Array.prototype.slice.call(arguments)); }
    }));
    return { transitions: transitions, calls: calls, appState: context.owner.lookup('service:app-state'), viewer: viewer };
  }

  function supporter(style) {
    return EmberObject.create({ id: '1_3', user_name: 'example', supporter_role: true, known_supervisees: [{ id: '1_7' }], preferences: { board_view_style: style } });
  }

  function run(result) { return Promise.resolve(result).catch(function() {}); }

  test('caseload, Basic: the home page with the Communicators tab', function(assert) {
    var t = setup(this, 'classic');
    var route = this.owner.lookup('route:caseload');
    var result = route.afterModel(supporter('classic'));
    if(result && result.catch) { result.catch(function() {}); }
    assert.deepEqual(t.transitions, ['index'], 'sent home');
    assert.strictEqual(t.appState.get('pending_index_nav'), 'supervisees', 'with Communicators handed off');
  });

  test('caseload, Basic, cold load (no currentUser yet): decided from the route model, the viewer', async function(assert) {
    var t = setup(this, 'classic', true);
    var route = this.owner.lookup('route:caseload');
    await run(route.afterModel(supporter('classic')));
    assert.deepEqual(t.transitions, ['index'], 'sent home');
    assert.strictEqual(t.appState.get('pending_index_nav'), 'supervisees', 'with Communicators handed off');
  });

  test('caseload, Modern: stays', function(assert) {
    var t = setup(this, 'modern');
    var route = this.owner.lookup('route:caseload');
    route.afterModel(supporter());
    assert.deepEqual(t.transitions, [], 'no redirect');
    assert.notOk(t.appState.get('pending_index_nav'), 'nothing handed off');
  });

  test("user.boards, Basic, the viewer's own library: the home page with the Boards tab", async function(assert) {
    var t = setup(this, 'classic');
    var route = this.owner.lookup('route:user/boards');
    await run(route.afterModel(EmberObject.create({ id: '1_3', user_name: 'example' })));
    assert.deepEqual(t.transitions, ['index'], 'sent home');
    assert.strictEqual(t.appState.get('pending_index_nav'), 'boards', 'with Boards handed off');
  });

  test("user.boards, Basic, cold load (no currentUser yet): waits for the session user, then the Boards tab", async function(assert) {
    var t = setup(this, 'classic', true);
    var route = this.owner.lookup('route:user/boards');
    await run(route.afterModel(EmberObject.create({ id: '1_3', user_name: 'example' })));
    assert.deepEqual(t.transitions, ['index'], 'sent home');
    assert.strictEqual(t.appState.get('pending_index_nav'), 'boards', 'with Boards handed off');
  });

  /* CHANGED 2026-09-30, approved by Traci: this case used to assert that a supervisee's library
     STAYS in Basic, which left a Basic supervisor on Modern's page with no navigation. The new
     specification ("route the SLP to the communicator's account page") sends them to that
     communicator's account page, which lists the same boards (<BoardsBrowser>,
     templates/user/index.hbs) under the Basic account rail (templates/user.hbs). */
  test("user.boards, Basic, a supervisee's library: that communicator's account page", async function(assert) {
    var t = setup(this, 'classic');
    var route = this.owner.lookup('route:user/boards');
    await run(route.afterModel(EmberObject.create({ id: '1_7', user_name: 'aiden_parker' })));
    assert.deepEqual(t.calls, [['user.index', 'aiden_parker']], 'their account page, not the viewer\'s home');
    assert.notOk(t.appState.get('pending_index_nav'), 'nothing handed off');
  });

  test("user.boards, Basic, cold load, a supervisee's library: waits for the session user, then their account page", async function(assert) {
    var t = setup(this, 'classic', true);
    var route = this.owner.lookup('route:user/boards');
    await run(route.afterModel(EmberObject.create({ id: '1_7', user_name: 'aiden_parker' })));
    assert.deepEqual(t.calls, [['user.index', 'aiden_parker']], 'their account page');
  });

  test("user.boards, Modern, a supervisee's library: stays", async function(assert) {
    var t = setup(this, 'modern');
    var route = this.owner.lookup('route:user/boards');
    await run(route.afterModel(EmberObject.create({ id: '1_7', user_name: 'aiden_parker' })));
    assert.deepEqual(t.transitions, [], 'no redirect');
  });

  test('user.boards, Modern: stays', async function(assert) {
    var t = setup(this, 'modern');
    var route = this.owner.lookup('route:user/boards');
    await run(route.afterModel(EmberObject.create({ id: '1_3', user_name: 'example' })));
    assert.deepEqual(t.transitions, [], 'no redirect');
  });
});
