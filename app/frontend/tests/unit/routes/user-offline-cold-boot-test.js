import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { settled } from '@ember/test-helpers';
import { setupTest } from '../../helpers';

/* THE `:user_id` ROUTE ON A COLD OFFLINE LAUNCH.
 *
 * The route answers the signed-in user's own pages from `appState.currentUser` (routes/user.js), but
 * on a cold boot that is still null: it is set from setupController, which Ember runs after every
 * model hook (utils/session_user_wait.js explains the ordering). The route then fell through to
 * `store.queryRecord`, which goes to the network only (adapters/user.js -> adapters/application.js
 * `$.ajax`), so a Home Screen launch with no network reached the error page instead of the board.
 *
 * Offline, for the signed-in user's own page only (checked against the session before waiting), the
 * route now uses the user record read from the device: the read already in flight
 * (`appState.session_user_promise`), or its own local read when none is. Online, signed out, and for
 * anyone else's page, it asks the server at once, exactly as before.
 */
module('Unit | routes/user offline cold boot', function(hooks) {
  setupTest(hooks);

  function routeWith(context, opts) {
    var route = context.owner.lookup('route:user');
    var calls = [];
    var signedIn = opts.signedIn !== false;
    route.persistence = EmberObject.create({ online: opts.online });
    route.session = EmberObject.create({
      isAuthenticated: signedIn,
      access_token: signedIn ? 'token' : null,
      user_name: signedIn ? 'tester' : null,
      user_id: signedIn ? '1_5' : null
    });
    route.appState = EmberObject.create({
      currentUser: null,
      session_user_promise: opts.session_user_promise
    });
    route.store = {
      queryRecord: function(type, query) {
        calls.push('queryRecord ' + query.path);
        return opts.queryRecord ? opts.queryRecord() : Promise.reject({ offline: true });
      },
      findRecord: function(type, id) {
        calls.push('findRecord ' + type + ' ' + id);
        return opts.findRecord ? opts.findRecord() : Promise.reject({ offline: true });
      }
    };
    if(opts.waitMs) { route.offline_session_wait_ms = opts.waitMs; }
    return { route: route, calls: calls };
  }

  function selfUser() {
    return EmberObject.create({ id: '1_5', user_name: 'tester', subroute_name: 'old' });
  }

  // A rejected promise the route will read; the no-op handler only keeps the browser from reporting
  // it as unhandled in a run where nothing reads it.
  function rejected() {
    var p = Promise.reject({ offline: true });
    p.catch(function() {});
    return p;
  }

  test('offline, the signed-in user\'s own page uses the record read from the device', async function(assert) {
    var user = selfUser();
    var r = routeWith(this, { online: false, session_user_promise: Promise.resolve(user) });
    var model = await r.route.model({ user_id: 'tester' });
    assert.strictEqual(model, user, 'the session user record');
    assert.strictEqual(model.get('subroute_name'), '', 'prepared like the loaded-user path');
    assert.deepEqual(r.calls, [], 'no network-only lookup');
  });

  test('offline, the same holds for a page addressed by the user\'s id', async function(assert) {
    var user = selfUser();
    var r = routeWith(this, { online: false, session_user_promise: Promise.resolve(user) });
    var model = await r.route.model({ user_id: '1_5' });
    assert.strictEqual(model, user);
    assert.deepEqual(r.calls, []);
  });

  test('offline, with no read in flight, it reads the signed-in user from the device itself', async function(assert) {
    var user = selfUser();
    var r = routeWith(this, { online: false, session_user_promise: null, findRecord: function() { return Promise.resolve(user); } });
    var model = await r.route.model({ user_id: 'tester' });
    assert.strictEqual(model, user);
    assert.deepEqual(r.calls, ['findRecord user self']);
  });

  test('offline, someone else\'s page asks the server at once, without waiting', async function(assert) {
    var other = EmberObject.create({ id: '1_9', user_name: 'other' });
    var r = routeWith(this, {
      online: false,
      session_user_promise: new Promise(function() {}),
      queryRecord: function() { return Promise.resolve(other); }
    });
    var promise = r.route.model({ user_id: 'other' });
    assert.deepEqual(r.calls, ['queryRecord other'], 'asked before anything was awaited');
    assert.strictEqual(await promise, other);
  });

  test('offline and signed out, nothing from the device is offered', async function(assert) {
    var r = routeWith(this, { online: false, signedIn: false, session_user_promise: Promise.resolve(selfUser()) });
    var promise = r.route.model({ user_id: 'tester' });
    assert.deepEqual(r.calls, ['queryRecord tester'], 'asked before anything was awaited');
    await assert.rejects(promise);
  });

  test('offline, with no record on the device, it falls back to the server as before', async function(assert) {
    var r = routeWith(this, { online: false, session_user_promise: rejected() });
    await assert.rejects(r.route.model({ user_id: 'tester' }));
    assert.deepEqual(r.calls, ['queryRecord tester']);
  });

  test('offline, with no read in flight and no local copy, it falls back to the server', async function(assert) {
    var r = routeWith(this, { online: false, session_user_promise: null });
    await assert.rejects(r.route.model({ user_id: 'tester' }));
    assert.deepEqual(r.calls, ['findRecord user self', 'queryRecord tester']);
  });

  test('offline, a device read still pending at the time limit falls back to the server', async function(assert) {
    var r = routeWith(this, { online: false, session_user_promise: new Promise(function() {}), waitMs: 30 });
    await assert.rejects(r.route.model({ user_id: 'tester' }));
    assert.deepEqual(r.calls, ['queryRecord tester']);
    await settled();
  });

  test('waits up to ten seconds by default: offline, the fallback can only fail', function(assert) {
    var route = this.owner.lookup('route:user');
    assert.strictEqual(route.offline_session_wait_ms, 10000);
  });

  test('online, a cold boot asks the server at once, exactly as before', async function(assert) {
    var fetched = EmberObject.create({ id: '1_5', user_name: 'tester', really_fresh: true });
    var r = routeWith(this, {
      online: true,
      session_user_promise: Promise.resolve(selfUser()),
      queryRecord: function() { return Promise.resolve(fetched); }
    });
    var promise = r.route.model({ user_id: 'tester' });
    assert.deepEqual(r.calls, ['queryRecord tester'], 'asked before anything was awaited');
    assert.strictEqual(await promise, fetched, 'the server answer, not the device record');
  });
});
