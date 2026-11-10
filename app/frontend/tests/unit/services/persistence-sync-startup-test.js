import { module, test } from 'qunit';
import { settled } from '@ember/test-helpers';
import RSVP from 'rsvp';
import { setupTest } from 'frontend/tests/helpers';
import * as emberDebug from '@ember/debug';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';
import lingoLinqExtras from 'frontend/utils/extras';
import capabilities from 'frontend/utils/capabilities';
import LingoLinq from 'frontend/app';

/*
 * CoughDrop's persistence ran a startup routine on every app start (`setup()`, called from
 * initializers/session.js at 55aaa8aab). It loaded the device's last sync time, and on a device
 * with no saved sync record it set `last_sync_at` to 1, which makes `check_for_needs_sync` take
 * its 48-hour branch and start the first sync. The January 2026 service migration stopped calling
 * it (887351945), so a new device never synced on its own and a returning device never loaded
 * its last sync time. These pin the restored startup, `start_sync_state`, on the live service.
 */
module('Unit | Service | persistence sync startup', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.svc = this.owner.lookup('service:persistence');
    this.savedReady = lingoLinqExtras.get('ready');
    lingoLinqExtras.set('ready', true);
    // The device-ready step is covered by its own tests; keep it out of these.
    stub(lingoLinqExtras.advance, 'watch', function() {});
  });

  hooks.afterEach(async function() {
    await settled();
    this.svc.set('_sync_checks_enabled', false);
    lingoLinqExtras.set('ready', this.savedReady);
    restoreStubs();
  });

  // The restored startup only helps if the live service runs it: the tests below call
  // start_sync_state directly, so this one pins the call from init.
  test('the service runs the sync startup when it is created outside tests', function(assert) {
    var factory = this.owner.factoryFor('service:persistence');
    var calls = 0;
    stub(factory.class.prototype, 'start_sync_state', function() { calls++; });
    stub(emberDebug, 'isTesting', function() { return false; });
    var saved = window.persistence;
    var created = factory.create();
    var calls_at_create = calls;
    created.destroy();
    window.persistence = saved;

    assert.strictEqual(calls_at_create, 1, 'init called start_sync_state once');
  });

  // Every route and component injects this service, so a startup error must not stop it being
  // created: the user would lose the app, not just the sync.
  test('the service is still created when the sync startup throws', function(assert) {
    var factory = this.owner.factoryFor('service:persistence');
    stub(factory.class.prototype, 'start_sync_state', function() { throw new Error('startup failed'); });
    stub(emberDebug, 'isTesting', function() { return false; });
    var saved = window.persistence;
    var created = null;
    var error = null;
    try {
      created = factory.create();
    } catch(e) {
      error = e;
    }
    if(created) { created.destroy(); }
    window.persistence = saved;

    assert.strictEqual(error, null, 'creating the service did not throw');
    assert.ok(created, 'the service exists');
  });

  test('a device with no saved sync record gets the first-sync marker', async function(assert) {
    stub(this.svc, 'find', function() { return RSVP.reject({error: 'not found'}); });
    this.svc.set('last_sync_at', undefined);

    this.svc.start_sync_state();
    await settled();

    assert.strictEqual(this.svc.get('last_sync_at'), 1, 'last_sync_at is 1, so the 48-hour branch starts the first sync');
  });

  test('a device that has synced loads its last sync time', async function(assert) {
    stub(this.svc, 'find', function(store, key) {
      if(store === 'settings' && key === 'lastSync') {
        return RSVP.resolve({last_sync: 12345, stamps: {a: 1}});
      }
      return RSVP.reject({error: 'not found'});
    });
    this.svc.set('last_sync_at', undefined);

    this.svc.start_sync_state();
    await settled();

    assert.strictEqual(this.svc.get('last_sync_at'), 12345, 'the stored last sync time is loaded');
    assert.deepEqual(this.svc.get('sync_stamps'), {a: 1}, 'and its board stamps');
  });

  // CoughDrop detected device file storage and primed the local file caches at startup for every
  // view. Today only Modern view's board route did it, so Basic view saved no picture files.
  test('starting the service prepares local files once the device is ready, with no route entered', async function(assert) {
    var device_ready = null;
    restoreStubs();
    stub(lingoLinqExtras.advance, 'watch', function(type, callback) { if(type === 'device') { device_ready = callback; } });
    stub(this.svc, 'find', function() { return RSVP.reject({error: 'not found'}); });
    var prepared = 0;
    stub(this.svc, 'prepare_local_files', function() { prepared++; return RSVP.resolve(); });

    this.svc.start_sync_state();
    assert.strictEqual(typeof device_ready, 'function', 'a device-ready step is registered');
    device_ready();
    await settled();

    assert.strictEqual(prepared, 1, 'local files are prepared when the device is ready');
  });

  test('prepare_local_files detects storage and primes the file caches once, for concurrent callers', async function(assert) {
    var svc = this.svc;
    var realGet = svc.stashes.get;
    stub(svc.stashes, 'get', function(key) { return key === 'auth_settings' ? {user_name: 'u'} : realGet.apply(this, arguments); });
    stub(capabilities.storage, 'status', function() { return RSVP.resolve({available: true}); });
    var primes = [];
    stub(svc, 'prime_caches', function(check_file_system) { primes.push(check_file_system); svc.primed = true; return RSVP.resolve(); });
    svc.set('local_system', null);
    svc.primed = false;

    var first = svc.prepare_local_files();
    var second = svc.prepare_local_files();
    await first;
    await second;

    assert.true(svc.get('local_system.allowed'), 'device storage is allowed');
    assert.deepEqual(primes, [true], 'the full file listing runs once');
    svc.set('local_system', null);
    svc.primed = false;
  });

  test('prepare_local_files does nothing before sign-in', async function(assert) {
    var svc = this.svc;
    var realGet = svc.stashes.get;
    stub(svc.stashes, 'get', function(key) { return key === 'auth_settings' ? null : realGet.apply(this, arguments); });
    var checked = false;
    stub(capabilities.storage, 'status', function() { checked = true; return RSVP.resolve({available: true}); });
    svc.primed = false;

    await svc.prepare_local_files();

    assert.false(checked, 'storage is not checked for a signed-out app');
  });

  // CoughDrop re-ran the sync check on every app tick (refresh_stamp) and whenever last_sync_at
  // changed. The observer stays off until the startup runs, so direct tests of the method are not
  // disturbed by it.
  test('the periodic sync check runs on every tick once started, and not before', async function(assert) {
    stub(this.svc, 'find', function() { return RSVP.reject({error: 'not found'}); });
    var checks = 0;
    stub(this.svc, 'check_for_needs_sync', function() { checks++; return false; });

    this.svc.set('refresh_stamp', 1);
    assert.strictEqual(checks, 0, 'no check before the startup');

    this.svc.start_sync_state();
    await settled();
    var after_start = checks;
    this.svc.set('refresh_stamp', 2);
    assert.strictEqual(checks, after_start + 1, 'a tick runs the check');
  });

  module('check_for_needs_sync guards', function(hooks) {
    hooks.beforeEach(function() {
      var svc = this.svc;
      var realGet = svc.stashes.get;
      stub(svc.stashes, 'get', function(key) { return key === 'auth_settings' ? {user_name: 'ada'} : realGet.apply(this, arguments); });
      stub(svc.stashes, 'get_object', function(key) { return key === 'auth_settings' ? {user_name: 'ada'} : null; });
      this.requests = [];
      var requests = this.requests;
      stub(svc, 'ajax', function(url) { requests.push(url); return RSVP.reject({error: 'offline'}); });
      stub(svc, 'sync', function() { return RSVP.reject({error: 'no'}); });
      svc.set('auto_sync', true);
      svc.set('online', true);
      svc.set('sync_status', null);
      svc.set('last_sync_stamp_check', null);
      svc.set('auto_sync_backoff_until', null);
      stub(capabilities, 'db_name', 'lingolinqStorage::ada===db');
    });

    test('a forced check does nothing while a sync is running', function(assert) {
      this.svc.set('sync_status', 'syncing');
      assert.false(this.svc.check_for_needs_sync(true), 'no second sync is started');
      assert.strictEqual(this.requests.length, 0, 'no stamp request');
      this.svc.set('sync_status', null);
    });

    test('no automatic check while the open database belongs to someone else', function(assert) {
      stub(capabilities, 'db_name', 'lingolinqStorage::__===db');
      assert.false(this.svc.check_for_needs_sync(true), 'the signed-out database is not synced into');
      assert.strictEqual(this.requests.length, 0, 'no stamp request');
    });

    test('an automatic check waits out the back-off after failed automatic syncs; a forced one does not', function(assert) {
      this.svc.set('auto_sync_backoff_until', (new Date()).getTime() + 60000);
      this.svc.set('last_sync_stamp', 'a');
      stub(emberDebug, 'isTesting', function() { return false; });
      assert.false(this.svc.check_for_needs_sync(), 'the tick check is skipped during the back-off');
      assert.strictEqual(this.requests.length, 0, 'no stamp request during the back-off');
      assert.true(this.svc.check_for_needs_sync(true), 'the forced sign-in check still runs');
      this.svc.set('last_sync_stamp', null);
      this.svc.set('auto_sync_backoff_until', null);
    });

    // A sync that failed because the device went offline is retried when it comes back online
    // (on_connect), so it does not back off; one that failed while online does.
    test('an automatic sync that failed offline does not back off; one that failed online does', function(assert) {
      var svc = this.svc;
      // Coming online also uploads the usage log (stashes drain_on_reconnect), which arms a
      // 15-minute timer; that upload has its own tests.
      stub(svc.stashes, 'push_log', function() {});
      svc._root_sync_reason = 'sync_stamp_changed:a:b';

      svc.set('online', false);
      svc.set('sync_status', 'failed');
      assert.strictEqual(svc.get('auto_sync_backoff_until'), null, 'no back-off after an offline failure');

      svc.set('sync_status', null);
      svc.set('online', true);
      svc.set('sync_status', 'failed');
      assert.true(svc.get('auto_sync_backoff_until') > (new Date()).getTime(), 'an online failure backs off');

      svc.set('sync_status', null);
      svc.set('auto_sync_backoff_until', null);
      svc.set('auto_sync_failures', 0);
      svc._root_sync_reason = null;
    });

    // on_connect forces a check every time the device comes back online. After a failed automatic
    // sync that retried the full sync on each reconnect, so on a flaky network it never backed off.
    test('a reconnect waits out the back-off, and still checks at once outside it', async function(assert) {
      if(LingoLinq.session) { stub(LingoLinq.session, 'restore', function() {}); }
      var svc = this.svc;
      // Coming online also uploads the usage log (stashes drain_on_reconnect), which arms a
      // 15-minute timer; that upload has its own tests.
      stub(svc.stashes, 'push_log', function() {});
      // on_connect reads sync_testing only when online changes (its delayed check does not), and
      // other app code polls while it is on, so it is on for the flip alone.
      var reconnect = async function() {
        svc.set('online', false);
        var saved = Object.getOwnPropertyDescriptor(LingoLinq, 'sync_testing');
        LingoLinq.sync_testing = true;
        svc.set('online', true);
        if(saved) { Object.defineProperty(LingoLinq, 'sync_testing', saved); } else { delete LingoLinq.sync_testing; }
        await settled();
      };

      svc.set('auto_sync_backoff_until', (new Date()).getTime() + 60000);
      await reconnect();
      assert.strictEqual(this.requests.length, 0, 'no stamp request on a reconnect during the back-off');

      svc.set('auto_sync_backoff_until', null);
      await reconnect();
      assert.strictEqual(this.requests.length, 1, 'a reconnect with no back-off checks the stamp at once');
    });
  });

  // At sign-in the installed app reloads. The sign-in call used to clear `just_logged_in` at once and
  // wait 10 s; the reload ended that wait, and the call after the reload found no flag, so the
  // post-login check never ran. CoughDrop cleared the flag only when the check ran.
  test('the post-login flag survives until the post-login check runs, and one check runs for two calls', async function(assert) {
    var svc = this.svc;
    var realGet = svc.stashes.get;
    stub(svc.stashes, 'get', function(key) { return key === 'auth_settings' ? {user_name: 'ada'} : realGet.apply(this, arguments); });
    stub(emberDebug, 'isTesting', function() { return false; });
    svc.post_login_sync_delay = 1;
    svc.stashes.persist_object('just_logged_in', true, false);
    var flags = [];
    stub(svc, 'check_for_needs_sync', function(force) { flags.push([force, svc.stashes.get_object('just_logged_in', false)]); return false; });

    svc.schedulePostLoginSyncIfNeeded();
    svc.schedulePostLoginSyncIfNeeded();
    await settled();

    assert.deepEqual(flags, [[true, true]], 'one forced check ran, with the flag still set when it ran');
    assert.notOk(svc.stashes.get_object('just_logged_in', false), 'the flag is cleared after the check');
    svc.post_login_sync_delay = null;
    svc.stashes.persist_object('just_logged_in', null, false);
  });
});
