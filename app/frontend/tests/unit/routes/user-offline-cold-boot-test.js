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
 *
 * Only where the offline shell is on (the page's window.offline_shell_enabled, so the kill switch turns
 * this off too, and the native apps, which never set it, are unchanged), and only when that record
 * says this device is trusted (preferences.device.long_token === true): a shared device's record is
 * the last person's, and offline the server cannot end their session.
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
    // The offline shell's setting, on unless a case says otherwise (2026-11-05: the branch is now gated).
    route.offline_shell_on = function() { return opts.shellOn !== false; };
    return { route: route, calls: calls };
  }

  // The signed-in user's record as the device holds it; trusted unless a case says otherwise
  // (2026-11-05: the branch now needs a trusted device).
  function selfUser(device) {
    return EmberObject.create({ id: '1_5', user_name: 'tester', subroute_name: 'old',
      preferences: { device: device === undefined ? { long_token: true } : device } });
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

  test('offline on a shared device, the device record is not used: the server is asked', async function(assert) {
    assert.expect(8);
    var cases = [['shared', { long_token: false }], ['no choice recorded', {}], ['not a real boolean', { long_token: 'true' }], ['no device entry', null]];
    for(var i = 0; i < cases.length; i++) {
      var r = routeWith(this, { online: false, session_user_promise: Promise.resolve(selfUser(cases[i][1])) });
      await assert.rejects(r.route.model({ user_id: 'tester' }), cases[i][0]);
      assert.deepEqual(r.calls, ['queryRecord tester'], cases[i][0] + ': asked the server, which fails offline');
    }
  });

  test('offline on a shared device, its own local read is not used either', async function(assert) {
    var r = routeWith(this, { online: false, session_user_promise: null, findRecord: function() { return Promise.resolve(selfUser({ long_token: false })); } });
    await assert.rejects(r.route.model({ user_id: 'tester' }));
    assert.deepEqual(r.calls, ['findRecord user self', 'queryRecord tester']);
  });

  // routes/user.js checks the record it got back as well as the session: a device read can return a
  // different account (a renamed user, or another account's record left on the device).
  test('offline, a device record for another account is not used', async function(assert) {
    var other = EmberObject.create({ id: '1_9', user_name: 'other', preferences: { device: { long_token: true } } });
    var r = routeWith(this, { online: false, session_user_promise: Promise.resolve(other) });
    await assert.rejects(r.route.model({ user_id: 'tester' }));
    assert.deepEqual(r.calls, ['queryRecord tester'], 'asked the server for the page instead');
  });

  test('with the offline shell off, an offline cold boot asks the server at once, as before', async function(assert) {
    var r = routeWith(this, { online: false, shellOn: false, session_user_promise: Promise.resolve(selfUser()) });
    var promise = r.route.model({ user_id: 'tester' });
    assert.deepEqual(r.calls, ['queryRecord tester'], 'asked before anything was awaited');
    await assert.rejects(promise);
  });

  // The page sets window.offline_shell_enabled (layouts/application.html.erb); the test page does not.
  test('the setting comes from the page, and is off when the page does not set it', function(assert) {
    var route = this.owner.lookup('route:user');
    assert.strictEqual(window.offline_shell_enabled, undefined, 'the test page sets no flag');
    assert.false(route.offline_shell_on(), 'off');
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
