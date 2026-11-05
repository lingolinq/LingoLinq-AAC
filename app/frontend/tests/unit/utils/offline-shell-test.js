import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { settled } from '@ember/test-helpers';
import offline_shell, { CACHE_PREFIX, WORKER_PATH } from 'frontend/utils/offline_shell';
import { start } from 'frontend/instance-initializers/offline-shell';

/*
 * The offline app shell's frontend side (lib/offline_shell.rb has the rest). The page tells the app
 * whether the environment has it on (window.offline_shell_enabled, set by layouts/application); the
 * app registers /sw.js when it is on, removes it when it is off, and does nothing when the page did
 * not say (ember serve, tests). Every case passes its own fake window and navigator, so no browser
 * global is replaced.
 */

function fakeWorker(scriptURL) {
  return { scriptURL: scriptURL };
}

function fakeRegistration(scriptURL, calls) {
  return {
    active: fakeWorker(scriptURL),
    unregister: function() { calls.push('unregister ' + scriptURL); return Promise.resolve(true); }
  };
}

function fakeNavigator(options) {
  var calls = [];
  var opts = options || {};
  var nav = {
    calls: calls,
    serviceWorker: {
      register: function(path, registerOptions) {
        calls.push('register ' + path + ' ' + JSON.stringify(registerOptions));
        return opts.registerFails ? Promise.reject(new Error('blocked')) : Promise.resolve({});
      },
      getRegistrations: function() {
        calls.push('getRegistrations');
        return Promise.resolve((opts.registered || []).map(function(url) { return fakeRegistration(url, calls); }));
      }
    }
  };
  if(opts.noServiceWorker) { delete nav.serviceWorker; }
  if(opts.persist !== undefined) {
    nav.storage = {
      persist: function() {
        calls.push('persist');
        return opts.persist === 'reject' ? Promise.reject(new Error('no')) : Promise.resolve(opts.persist);
      }
    };
  }
  return nav;
}

module('Unit | Utility | offline_shell', function() {
  module('setting', function() {
    test('reads the flag the page set', function(assert) {
      assert.strictEqual(offline_shell.setting({ offline_shell_enabled: true }), 'on');
      assert.strictEqual(offline_shell.setting({ offline_shell_enabled: false }), 'off');
      assert.strictEqual(offline_shell.setting({}), null, 'not set by the page');
      assert.strictEqual(offline_shell.setting({ offline_shell_enabled: 'true' }), null, 'only a real boolean counts');
      assert.strictEqual(offline_shell.setting(null), null);
    });
  });

  module('sync_registration', function() {
    test('registers the worker at the root scope when the setting is on', async function(assert) {
      var nav = fakeNavigator();
      var result = await offline_shell.sync_registration({ offline_shell_enabled: true }, nav);
      assert.strictEqual(result, 'registered');
      assert.deepEqual(nav.calls, ['register /sw.js {"scope":"/"}']);
      assert.strictEqual(WORKER_PATH, '/sw.js');
    });

    test('a refused registration is reported, not thrown', async function(assert) {
      var nav = fakeNavigator({ registerFails: true });
      var result = await offline_shell.sync_registration({ offline_shell_enabled: true }, nav);
      assert.strictEqual(result, 'failed');
    });

    test('does nothing in a browser without service workers', async function(assert) {
      var nav = fakeNavigator({ noServiceWorker: true });
      assert.strictEqual(await offline_shell.sync_registration({ offline_shell_enabled: true }, nav), 'unsupported');
      assert.strictEqual(await offline_shell.sync_registration({ offline_shell_enabled: false }, nav), 'unsupported');
      assert.deepEqual(nav.calls, []);
    });

    test('touches nothing when the page did not say', async function(assert) {
      var nav = fakeNavigator({ registered: ['https://app.example/sw.js'] });
      var result = await offline_shell.sync_registration({}, nav);
      assert.strictEqual(result, 'not_configured');
      assert.deepEqual(nav.calls, [], 'neither registers nor removes');
    });

    test('removes only this worker when the setting is off', async function(assert) {
      var nav = fakeNavigator({ registered: ['https://app.example/sw.js', 'https://app.example/other-worker.js'] });
      var result = await offline_shell.sync_registration({ offline_shell_enabled: false }, nav);
      assert.strictEqual(result, 'unregistered');
      assert.deepEqual(nav.calls, ['getRegistrations', 'unregister https://app.example/sw.js']);
    });

    test('reports when there was nothing to remove', async function(assert) {
      var nav = fakeNavigator({ registered: [] });
      assert.strictEqual(await offline_shell.sync_registration({ offline_shell_enabled: false }, nav), 'none');
      assert.false(nav.calls.some(function(c) { return c.indexOf('register ') === 0; }), 'never registers when off');
    });
  });

  /* THE KILL SWITCH'S CACHES. Off, the page unregisters the worker as soon as it loads, which can be
   * before the browser fetches the removal worker from /sw.js (views/offline_shell/kill_switch.js.erb,
   * the code that deletes the caches); the removal worker then never runs and the worker's copy of the
   * app stays on the device. So the page deletes those caches itself, after unregistering, whether or
   * not a worker was still there (a device that already lost the race keeps the cache otherwise). */
  module('sync_registration: the worker\'s caches', function() {
    function fakeCaches(names, calls, options) {
      var opts = options || {};
      return {
        keys: function() {
          calls.push('caches.keys');
          return opts.keysFail ? Promise.reject(new Error('storage unavailable')) : Promise.resolve(names.slice());
        },
        delete: function(name) { calls.push('caches.delete ' + name); return Promise.resolve(true); }
      };
    }

    test('the cache prefix is the one the worker names its caches with', function(assert) {
      assert.strictEqual(CACHE_PREFIX, 'll-offline-shell-');
    });

    test('off, deletes this worker\'s caches after unregistering it, and keeps every other cache', async function(assert) {
      var nav = fakeNavigator({ registered: ['https://app.example/sw.js'] });
      var win = { offline_shell_enabled: false, caches: fakeCaches(['ll-offline-shell-0a1b', 'other-cache', 'll-offline-shell-9f8e'], nav.calls) };
      var result = await offline_shell.sync_registration(win, nav);
      assert.strictEqual(result, 'unregistered');
      assert.deepEqual(nav.calls, [
        'getRegistrations', 'unregister https://app.example/sw.js',
        'caches.keys', 'caches.delete ll-offline-shell-0a1b', 'caches.delete ll-offline-shell-9f8e'
      ]);
    });

    test('off with no worker left, still deletes the caches a removed worker left behind', async function(assert) {
      var nav = fakeNavigator({ registered: [] });
      var win = { offline_shell_enabled: false, caches: fakeCaches(['ll-offline-shell-0a1b'], nav.calls) };
      var result = await offline_shell.sync_registration(win, nav);
      assert.strictEqual(result, 'none');
      assert.deepEqual(nav.calls, ['getRegistrations', 'caches.keys', 'caches.delete ll-offline-shell-0a1b']);
    });

    test('off, a cache store that fails does not change the result or throw', async function(assert) {
      var nav = fakeNavigator({ registered: ['https://app.example/sw.js'] });
      var win = { offline_shell_enabled: false, caches: fakeCaches([], nav.calls, { keysFail: true }) };
      var result = await offline_shell.sync_registration(win, nav);
      assert.strictEqual(result, 'unregistered');
      assert.deepEqual(nav.calls, ['getRegistrations', 'unregister https://app.example/sw.js', 'caches.keys']);
    });

    test('on, or when the page did not say, no cache is touched', async function(assert) {
      var onNav = fakeNavigator();
      await offline_shell.sync_registration({ offline_shell_enabled: true, caches: fakeCaches(['ll-offline-shell-0a1b'], onNav.calls) }, onNav);
      assert.deepEqual(onNav.calls, ['register /sw.js {"scope":"/"}']);
      var unsetNav = fakeNavigator({ registered: ['https://app.example/sw.js'] });
      await offline_shell.sync_registration({ caches: fakeCaches(['ll-offline-shell-0a1b'], unsetNav.calls) }, unsetNav);
      assert.deepEqual(unsetNav.calls, []);
    });
  });

  module('request_persist', function() {
    test('reports what the browser answered and never throws', async function(assert) {
      assert.strictEqual(await offline_shell.request_persist(fakeNavigator({ persist: true })), 'granted');
      assert.strictEqual(await offline_shell.request_persist(fakeNavigator({ persist: false })), 'not_granted');
      assert.strictEqual(await offline_shell.request_persist(fakeNavigator({ persist: 'reject' })), 'failed');
      assert.strictEqual(await offline_shell.request_persist(fakeNavigator()), 'unsupported');
    });
  });

  module('persist_after_sync', function() {
    test('asks once, after a successful sync while signed in', async function(assert) {
      assert.expect(4);
      var nav = fakeNavigator({ persist: true });
      var persistence = EmberObject.create({ sync_status: null });
      var session = EmberObject.create({ isAuthenticated: false });
      var stopWatching = offline_shell.persist_after_sync(persistence, session, nav);
      try {
        persistence.set('sync_status', 'syncing');
        await settled();
        persistence.set('sync_status', 'succeeded');
        await settled();
        assert.deepEqual(nav.calls, [], 'not while signed out');

        session.set('isAuthenticated', true);
        persistence.set('sync_status', 'syncing');
        await settled();
        persistence.set('sync_status', 'finished');
        await settled();
        assert.deepEqual(nav.calls, [], 'not after a sync that finished with errors');

        persistence.set('sync_status', 'succeeded');
        await settled();
        assert.deepEqual(nav.calls, ['persist'], 'once the signed-in sync succeeds');

        persistence.set('sync_status', 'syncing');
        await settled();
        persistence.set('sync_status', 'succeeded');
        await settled();
        assert.deepEqual(nav.calls, ['persist'], 'only once per app session');
      } finally {
        stopWatching();
        persistence.destroy();
        session.destroy();
      }
    });

    test('stops watching a destroyed service', async function(assert) {
      var nav = fakeNavigator({ persist: true });
      var persistence = EmberObject.create({ sync_status: null });
      var session = EmberObject.create({ isAuthenticated: true });
      var stopWatching = offline_shell.persist_after_sync(persistence, session, nav);
      stopWatching();
      persistence.set('sync_status', 'succeeded');
      await settled();
      assert.deepEqual(nav.calls, [], 'stop() removes the observer');
      persistence.destroy();
      session.destroy();
    });
  });

  module('instance initializer start', function() {
    function fakeOwner(services) {
      var looked = [];
      return {
        looked: looked,
        lookup: function(name) { looked.push(name); return services[name]; }
      };
    }

    test('does nothing when the page did not say', async function(assert) {
      var nav = fakeNavigator();
      var owner = fakeOwner({});
      start(owner, { navigator: nav, document: { readyState: 'complete' } });
      await settled();
      assert.deepEqual(nav.calls, []);
      assert.deepEqual(owner.looked, [], 'no services looked up');
    });

    test('registers and watches for a sync when on', async function(assert) {
      assert.expect(2);
      var nav = fakeNavigator({ persist: true });
      var persistence = EmberObject.create({ sync_status: null });
      var session = EmberObject.create({ isAuthenticated: true });
      var owner = fakeOwner({ 'service:persistence': persistence, 'service:session': session });
      var stopWatching = start(owner, { offline_shell_enabled: true, navigator: nav, document: { readyState: 'complete' } });
      try {
        await settled();
        await Promise.resolve();
        assert.deepEqual(nav.calls, ['register /sw.js {"scope":"/"}']);
        persistence.set('sync_status', 'succeeded');
        await settled();
        assert.deepEqual(nav.calls, ['register /sw.js {"scope":"/"}', 'persist']);
      } finally {
        if(stopWatching) { stopWatching(); }
        persistence.destroy();
        session.destroy();
      }
    });

    test('removes the worker when off, and asks for no storage', async function(assert) {
      var nav = fakeNavigator({ persist: true, registered: ['https://app.example/sw.js'] });
      var owner = fakeOwner({});
      var stopWatching = start(owner, { offline_shell_enabled: false, navigator: nav, document: { readyState: 'complete' } });
      await settled();
      await Promise.resolve();
      await Promise.resolve();
      assert.deepEqual(nav.calls, ['getRegistrations', 'unregister https://app.example/sw.js']);
      assert.deepEqual(owner.looked, [], 'no sync watcher when off');
      assert.strictEqual(stopWatching, null);
    });

    test('waits for the page to finish loading before registering', async function(assert) {
      var nav = fakeNavigator();
      var listeners = {};
      var win = {
        offline_shell_enabled: true,
        navigator: nav,
        document: { readyState: 'interactive' },
        addEventListener: function(name, fn, options) { listeners[name] = { fn: fn, options: options }; }
      };
      var stopWatching = start(fakeOwner({}), win);
      await settled();
      assert.deepEqual(nav.calls, [], 'not before load');
      assert.true(!!listeners.load, 'a load listener');
      assert.true(listeners.load.options.once, 'that runs once');
      listeners.load.fn();
      await settled();
      await Promise.resolve();
      assert.deepEqual(nav.calls, ['register /sw.js {"scope":"/"}']);
      if(stopWatching) { stopWatching(); }
    });
  });
});
