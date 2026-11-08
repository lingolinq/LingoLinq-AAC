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

// The site-wide lock (navigator.locks): one holder at a time, in order of request.
function fakeLocks() {
  var tail = Promise.resolve();
  return {
    request: function(name, fn) {
      var run = tail.then(function() { return fn(); });
      tail = run.then(null, function() {});
      return run;
    }
  };
}

// This page's sign-in and the site's current one (the stored auth settings, which every page shares):
// the same unless a case says otherwise.
function signedIn(token, current) {
  return {
    page: function() { return token; },
    current: function() { return current === undefined ? token : current; }
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
  // Browsers with the site-wide lock; a case without it says so (2026-11-05, review round 4).
  if(!opts.noLocks) { nav.locks = fakeLocks(); }
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

// A session user record as the app holds it (models/user.js): `preferences.device` is this device's
// entry, and `long_token` is the "Trust this Device" choice (components/login-form.js login_followup).
function deviceUser(longToken) {
  var device = longToken === undefined ? {} : { long_token: longToken };
  return EmberObject.create({ id: '1_5', user_name: 'tester', preferences: { device: device } });
}

function trustedUser() { return deviceUser(true); }
function sharedUser() { return deviceUser(false); }

function cacheStore(names, calls) {
  return {
    keys: function() { calls.push('caches.keys'); return Promise.resolve(names.slice()); },
    delete: function(name) { calls.push('caches.delete ' + name); return Promise.resolve(true); }
  };
}

// Lets the promise chains in sync_registration / sync_for_device run to the end.
async function drain() {
  await settled();
  for(var i = 0; i < 10; i++) { await Promise.resolve(); }
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

  /* TRUSTED DEVICES ONLY. On a shared device ("This is a Shared Device" at sign-in) the server ends an
   * idle session, but offline it cannot, and the app reads the last user from the device at boot. So
   * the worker is kept only while the signed-in user's record says this device is trusted
   * (preferences.device.long_token === true, json_api/user.rb); a shared sign-in removes it and its
   * caches, so a shared device offline shows the browser's offline page, as before the worker. */
  module('device_trust', function() {
    test('trusted only when the device record says long_token is true', function(assert) {
      assert.strictEqual(offline_shell.device_trust(trustedUser()), 'trusted');
      assert.strictEqual(offline_shell.device_trust(sharedUser()), 'shared');
      assert.strictEqual(offline_shell.device_trust(deviceUser(undefined)), 'shared', 'no choice recorded');
      assert.strictEqual(offline_shell.device_trust(deviceUser('true')), 'shared', 'only a real boolean counts');
      assert.strictEqual(offline_shell.device_trust(EmberObject.create({ id: '1_5' })), 'shared', 'no preferences');
      assert.strictEqual(offline_shell.device_trust(null), null, 'no session user yet');
      assert.strictEqual(offline_shell.device_trust({}), null, 'not a record');
    });
  });

  module('sync_for_device', function() {
    test('on, a trusted device registers the worker', async function(assert) {
      var nav = fakeNavigator();
      assert.strictEqual(await offline_shell.sync_for_device({ offline_shell_enabled: true }, nav, 'trusted'), 'registered');
      assert.deepEqual(nav.calls, ['register /sw.js {"scope":"/"}']);
    });

    test('on, a shared device removes the worker and its caches and never registers', async function(assert) {
      var nav = fakeNavigator({ registered: ['https://app.example/sw.js', 'https://app.example/other-worker.js'] });
      var win = { offline_shell_enabled: true, caches: cacheStore(['ll-offline-shell-0a1b', 'other-cache'], nav.calls) };
      assert.strictEqual(await offline_shell.sync_for_device(win, nav, 'shared'), 'unregistered');
      assert.deepEqual(nav.calls, ['getRegistrations', 'unregister https://app.example/sw.js', 'caches.keys', 'caches.delete ll-offline-shell-0a1b']);
    });

    // Review round 2: a registration whose script is still downloading has no worker yet, so it cannot be
    // recognised by its script. At the root scope it can only be this one (the app registers no other).
    test('on, a shared device also removes a root registration whose script is still downloading', async function(assert) {
      var calls = [];
      var pending = { scope: 'https://app.example/', unregister: function() { calls.push('unregister pending /'); return Promise.resolve(true); } };
      var other = { scope: 'https://app.example/other/', unregister: function() { calls.push('unregister pending /other/'); return Promise.resolve(true); } };
      var nav = { serviceWorker: { getRegistrations: function() { calls.push('getRegistrations'); return Promise.resolve([pending, other]); } } };
      var win = { offline_shell_enabled: true, caches: cacheStore([], calls) };
      assert.strictEqual(await offline_shell.sync_for_device(win, nav, 'shared'), 'unregistered');
      assert.deepEqual(calls, ['getRegistrations', 'unregister pending /', 'caches.keys'], 'only the root one');
    });

    test('on, a shared device with no worker still deletes what one left behind', async function(assert) {
      var nav = fakeNavigator({ registered: [] });
      var win = { offline_shell_enabled: true, caches: cacheStore(['ll-offline-shell-0a1b'], nav.calls) };
      assert.strictEqual(await offline_shell.sync_for_device(win, nav, 'shared'), 'none');
      assert.deepEqual(nav.calls, ['getRegistrations', 'caches.keys', 'caches.delete ll-offline-shell-0a1b']);
    });

    test('on, before the session user is known, touches nothing', async function(assert) {
      var nav = fakeNavigator({ registered: ['https://app.example/sw.js'] });
      var win = { offline_shell_enabled: true, caches: cacheStore(['ll-offline-shell-0a1b'], nav.calls) };
      assert.strictEqual(await offline_shell.sync_for_device(win, nav, null), 'waiting');
      assert.deepEqual(nav.calls, []);
    });

    test('off removes the worker whatever the device', async function(assert) {
      var nav = fakeNavigator({ registered: ['https://app.example/sw.js'] });
      assert.strictEqual(await offline_shell.sync_for_device({ offline_shell_enabled: false }, nav, 'trusted'), 'unregistered');
      assert.false(nav.calls.some(function(c) { return c.indexOf('register ') === 0; }), 'never registers when off');
    });

    test('touches nothing when the page did not say', async function(assert) {
      var nav = fakeNavigator({ registered: ['https://app.example/sw.js'] });
      assert.strictEqual(await offline_shell.sync_for_device({}, nav, 'shared'), 'not_configured');
      assert.deepEqual(nav.calls, []);
    });
  });

  module('follow_device_trust', function() {
    function setup(sessionUser, registered) {
      var nav = fakeNavigator({ registered: registered || [] });
      var win = { offline_shell_enabled: true, caches: cacheStore(['ll-offline-shell-0a1b'], nav.calls) };
      var appState = EmberObject.create({ sessionUser: sessionUser });
      var stop = offline_shell.follow_device_trust(appState, win, nav, signedIn('token-1'));
      return { nav: nav, appState: appState, stop: stop };
    }

    test('registers once the session user turns out to be on a trusted device', async function(assert) {
      assert.expect(2);
      var t = setup(null);
      try {
        await drain();
        assert.deepEqual(t.nav.calls, [], 'not before the user is known');
        t.appState.set('sessionUser', trustedUser());
        await drain();
        assert.deepEqual(t.nav.calls, ['register /sw.js {"scope":"/"}']);
      } finally {
        t.stop();
        t.appState.destroy();
      }
    });

    test('a shared sign-in removes the worker and its caches', async function(assert) {
      assert.expect(1);
      var t = setup(null, ['https://app.example/sw.js']);
      try {
        t.appState.set('sessionUser', sharedUser());
        await drain();
        assert.deepEqual(t.nav.calls, ['getRegistrations', 'unregister https://app.example/sw.js', 'caches.keys', 'caches.delete ll-offline-shell-0a1b']);
      } finally {
        t.stop();
        t.appState.destroy();
      }
    });

    test('choosing "Trust this Device" after signing in registers it', async function(assert) {
      assert.expect(2);
      var user = deviceUser(undefined);
      var t = setup(user);
      try {
        await drain();
        assert.false(t.nav.calls.some(function(c) { return c.indexOf('register ') === 0; }), 'not before the choice');
        user.set('preferences.device.long_token', true);
        await drain();
        assert.strictEqual(t.nav.calls[t.nav.calls.length - 1], 'register /sw.js {"scope":"/"}');
      } finally {
        t.stop();
        t.appState.destroy();
      }
    });

    test('acts only when the answer changes', async function(assert) {
      assert.expect(1);
      var t = setup(trustedUser());
      try {
        await drain();
        t.appState.set('sessionUser', trustedUser());
        await drain();
        assert.deepEqual(t.nav.calls, ['register /sw.js {"scope":"/"}'], 'one registration');
      } finally {
        t.stop();
        t.appState.destroy();
      }
    });

    test('signing out leaves the worker of a trusted device in place', async function(assert) {
      assert.expect(1);
      var t = setup(trustedUser(), ['https://app.example/sw.js']);
      try {
        await drain();
        t.appState.set('sessionUser', null);
        await drain();
        assert.deepEqual(t.nav.calls, ['register /sw.js {"scope":"/"}']);
      } finally {
        t.stop();
        t.appState.destroy();
      }
    });

    // Review round 2 (2026-11-05): a registration still under way when the device turns out to be
    // shared must not survive the removal. Register and remove run one after another, so the removal
    // sees what the registration created.
    test('a shared sign-in while a registration is still under way removes it once it lands', async function(assert) {
      assert.expect(2);
      var calls = [];
      var registered = [];
      var finishRegister;
      var nav = {
        locks: fakeLocks(),
        serviceWorker: {
          register: function(path) {
            calls.push('register ' + path);
            return new Promise(function(resolve) {
              finishRegister = function() { registered.push(path); resolve({}); };
            });
          },
          getRegistrations: function() {
            calls.push('getRegistrations');
            return Promise.resolve(registered.map(function(path) { return fakeRegistration('https://app.example' + path, calls); }));
          }
        }
      };
      var win = { offline_shell_enabled: true, caches: cacheStore([], calls) };
      var appState = EmberObject.create({ sessionUser: trustedUser() });
      var stopWatching = offline_shell.follow_device_trust(appState, win, nav, signedIn('token-1'));
      try {
        await drain();
        appState.set('sessionUser', sharedUser());
        await drain();
        assert.deepEqual(calls, ['register /sw.js'], 'the removal waits for the registration');
        finishRegister();
        await drain();
        assert.deepEqual(calls, ['register /sw.js', 'getRegistrations', 'unregister https://app.example/sw.js', 'caches.keys']);
      } finally {
        stopWatching();
        appState.destroy();
      }
    });

    /* Review round 3 (2026-11-05): pages share one registration and one set of caches, so ordering
     * within one page is not enough. Each register or remove runs under a lock shared by every page
     * of the site (navigator.locks), and every page records its latest trust decision where the others
     * can read it, so an older "trusted" step that runs after a shared sign-in elsewhere does not
     * register. */
    module('across pages', function() {
      function sharedSite() {
        var calls = [];
        var tail = Promise.resolve();
        var registered = [];
        var finishRegister = null;
        return {
          calls: calls,
          locks: {
            request: function(name, fn) {
              calls.push('lock ' + name);
              var run = tail.then(function() { return fn(); });
              tail = run.then(null, function() {});
              return run;
            }
          },
          registered: registered,
          // The current sign-in, as every page reads it from the stored auth settings.
          current: 'token-1',
          hold: function() {
            var release;
            var gate = new Promise(function(resolve) { release = resolve; });
            this.locks.request('test', function() { return gate; });
            calls.length = 0;
            return release;
          },
          land: function() { if(finishRegister) { finishRegister(); } },
          nav: function(deferRegister) {
            return {
              locks: this.locks,
              serviceWorker: {
                register: function(path) {
                  calls.push('register ' + path);
                  if(!deferRegister) { registered.push(path); return Promise.resolve({}); }
                  return new Promise(function(resolve) {
                    finishRegister = function() { registered.push(path); resolve({}); };
                  });
                },
                getRegistrations: function() {
                  calls.push('getRegistrations');
                  return Promise.resolve(registered.map(function(path) {
                    return { active: { scriptURL: 'https://app.example' + path }, unregister: function() {
                      calls.push('unregister ' + path);
                      registered.splice(registered.indexOf(path), 1);
                      return Promise.resolve(true);
                    } };
                  }));
                }
              }
            };
          }
        };
      }

      // A page signed in with `token` (the current sign-in unless a case says otherwise).
      function page(site, user, deferRegister, token) {
        var appState = EmberObject.create({ sessionUser: user });
        var win = { offline_shell_enabled: true, caches: cacheStore([], site.calls) };
        var own = { token: token || 'token-1' };
        var signIn = { page: function() { return own.token; }, current: function() { return site.current; } };
        var stopWatching = offline_shell.follow_device_trust(appState, win, site.nav(deferRegister), signIn);
        return { appState: appState, stopWatching: stopWatching, own: own };
      }

      test('a removal on one page waits for a registration still under way on another', async function(assert) {
        assert.expect(2);
        var site = sharedSite();
        var trustedPage = page(site, trustedUser(), true);
        var sharedPage;
        try {
          await drain();
          sharedPage = page(site, sharedUser());
          await drain();
          assert.strictEqual(site.calls.indexOf('getRegistrations'), -1, 'the removal has not run yet');
          site.land();
          await drain();
          assert.deepEqual(site.registered, [], 'removed once the registration landed');
        } finally {
          trustedPage.stopWatching();
          trustedPage.appState.destroy();
          if(sharedPage) { sharedPage.stopWatching(); sharedPage.appState.destroy(); }
        }
      });

      test('an older page\'s trusted step that runs after a shared sign-in elsewhere does not register', async function(assert) {
        assert.expect(2);
        var site = sharedSite();
        var release = site.hold();
        var olderPage = page(site, trustedUser(), false, 'token-A');
        site.current = 'token-B';
        var sharedPage = page(site, sharedUser(), false, 'token-B');
        try {
          await drain();
          release();
          await drain();
          assert.false(site.calls.some(function(c) { return c.indexOf('register ') === 0; }), 'never registered');
          assert.deepEqual(site.registered, []);
        } finally {
          olderPage.stopWatching();
          olderPage.appState.destroy();
          sharedPage.stopWatching();
          sharedPage.appState.destroy();
        }
      });

      /* Review round 4 (2026-11-05): a page belongs to one sign-in. Every page reads the current one from
       * the stored auth settings, so a page from an earlier sign-in (its user record can arrive after a
       * newer sign-in elsewhere) never registers, and a page acts again on each new sign-in even when
       * the answer is the same. */
      test('a page from an earlier sign-in that loads its user after a newer sign-in does not register', async function(assert) {
        assert.expect(1);
        var site = sharedSite();
        site.current = 'token-B';
        var olderPage = page(site, trustedUser(), false, 'token-A');
        try {
          await drain();
          assert.false(site.calls.some(function(c) { return c.indexOf('register ') === 0; }), 'never registered');
        } finally {
          olderPage.stopWatching();
          olderPage.appState.destroy();
        }
      });

      test('a second shared sign-in on the same page removes a worker another page registered meanwhile', async function(assert) {
        assert.expect(2);
        var site = sharedSite();
        site.current = 'token-A';
        var sharedPage = page(site, sharedUser(), false, 'token-A');
        try {
          await drain();
          sharedPage.appState.set('sessionUser', null);
          site.registered.push('/sw.js');
          site.calls.length = 0;
          sharedPage.own.token = 'token-B';
          site.current = 'token-B';
          sharedPage.appState.set('sessionUser', sharedUser());
          await drain();
          assert.notStrictEqual(site.calls.indexOf('unregister /sw.js'), -1, 'removed again');
          assert.deepEqual(site.registered, []);
        } finally {
          sharedPage.stopWatching();
          sharedPage.appState.destroy();
        }
      });

      test('without the site-wide lock, a trusted device gets no worker and loses one it has', async function(assert) {
        assert.expect(2);
        var nav = fakeNavigator({ noLocks: true, registered: ['https://app.example/sw.js'] });
        var win = { offline_shell_enabled: true, caches: cacheStore(['ll-offline-shell-0a1b'], nav.calls) };
        var appState = EmberObject.create({ sessionUser: trustedUser() });
        var stopWatching = offline_shell.follow_device_trust(appState, win, nav, signedIn('token-1'));
        try {
          await drain();
          assert.false(nav.calls.some(function(c) { return c.indexOf('register ') === 0; }), 'never registered');
          assert.deepEqual(nav.calls, ['getRegistrations', 'unregister https://app.example/sw.js', 'caches.keys', 'caches.delete ll-offline-shell-0a1b']);
        } finally {
          stopWatching();
          appState.destroy();
        }
      });

      test('when the current sign-in cannot be read, a trusted page does not register', async function(assert) {
        assert.expect(1);
        var nav = fakeNavigator();
        var appState = EmberObject.create({ sessionUser: trustedUser() });
        var stopWatching = offline_shell.follow_device_trust(appState, { offline_shell_enabled: true }, nav, signedIn('token-1', null));
        try {
          await drain();
          assert.deepEqual(nav.calls, []);
        } finally {
          stopWatching();
          appState.destroy();
        }
      });

      test('a later trusted sign-in registers again', async function(assert) {
        assert.expect(1);
        var site = sharedSite();
        var sharedPage = page(site, sharedUser());
        var trustedPage;
        try {
          await drain();
          trustedPage = page(site, trustedUser());
          await drain();
          assert.deepEqual(site.registered, ['/sw.js']);
        } finally {
          sharedPage.stopWatching();
          sharedPage.appState.destroy();
          if(trustedPage) { trustedPage.stopWatching(); trustedPage.appState.destroy(); }
        }
      });
    });

    test('stop() stops watching', async function(assert) {
      var t = setup(null);
      t.stop();
      t.appState.set('sessionUser', trustedUser());
      await drain();
      assert.deepEqual(t.nav.calls, []);
      t.appState.destroy();
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
    // Rewritten 2026-11-05 (approved): the request is now for trusted devices only, so the case
    // supplies a trusted session user; what it checks is unchanged.
    test('asks once, after a successful sync while signed in on a trusted device', async function(assert) {
      assert.expect(4);
      var nav = fakeNavigator({ persist: true });
      var persistence = EmberObject.create({ sync_status: null });
      var session = EmberObject.create({ isAuthenticated: false });
      var appState = EmberObject.create({ sessionUser: trustedUser() });
      var stopWatching = offline_shell.persist_after_sync(persistence, session, nav, appState);
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
        appState.destroy();
      }
    });

    // A shared device's data is meant to go when the browser needs the room, and Firefox asks the
    // person before granting it.
    test('never asks on a shared device, or before the session user is known', async function(assert) {
      assert.expect(4);
      var cases = [['shared', sharedUser()], ['no choice recorded', deviceUser(undefined)], ['not a real boolean', deviceUser('true')], ['not known yet', null]];
      for(var i = 0; i < cases.length; i++) {
        var nav = fakeNavigator({ persist: true });
        var persistence = EmberObject.create({ sync_status: null });
        var session = EmberObject.create({ isAuthenticated: true });
        var appState = EmberObject.create({ sessionUser: cases[i][1] });
        var stopWatching = offline_shell.persist_after_sync(persistence, session, nav, appState);
        persistence.set('sync_status', 'succeeded');
        await settled();
        assert.deepEqual(nav.calls, [], cases[i][0]);
        stopWatching();
        persistence.destroy();
        session.destroy();
        appState.destroy();
      }
    });

    test('asks after a later sync once the device has been trusted', async function(assert) {
      assert.expect(2);
      var nav = fakeNavigator({ persist: true });
      var persistence = EmberObject.create({ sync_status: null });
      var session = EmberObject.create({ isAuthenticated: true });
      var user = sharedUser();
      var appState = EmberObject.create({ sessionUser: user });
      var stopWatching = offline_shell.persist_after_sync(persistence, session, nav, appState);
      try {
        persistence.set('sync_status', 'succeeded');
        await settled();
        assert.deepEqual(nav.calls, [], 'not while shared');
        user.set('preferences.device.long_token', true);
        persistence.set('sync_status', 'syncing');
        await settled();
        persistence.set('sync_status', 'succeeded');
        await settled();
        assert.deepEqual(nav.calls, ['persist']);
      } finally {
        stopWatching();
        persistence.destroy();
        session.destroy();
        appState.destroy();
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
    // The stored auth settings every page reads (services/stashes.js).
    function fakeStashes(token) {
      return { get_object: function(key) { return key === 'auth_settings' ? { access_token: token } : null; } };
    }

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

    // Rewritten 2026-11-05 (approved): the worker now registers only for a trusted device's session
    // user, so the case supplies one; what it checks is unchanged.
    test('registers and watches for a sync when on, on a trusted device', async function(assert) {
      assert.expect(2);
      var nav = fakeNavigator({ persist: true });
      var persistence = EmberObject.create({ sync_status: null });
      var session = EmberObject.create({ isAuthenticated: true, access_token: 'token-1' });
      var appState = EmberObject.create({ sessionUser: trustedUser() });
      var owner = fakeOwner({ 'service:persistence': persistence, 'service:session': session, 'service:app-state': appState, 'service:stashes': fakeStashes('token-1') });
      var stopWatching = start(owner, { offline_shell_enabled: true, navigator: nav, document: { readyState: 'complete' } });
      try {
        await drain();
        assert.deepEqual(nav.calls, ['register /sw.js {"scope":"/"}']);
        persistence.set('sync_status', 'succeeded');
        await settled();
        assert.deepEqual(nav.calls, ['register /sw.js {"scope":"/"}', 'persist']);
      } finally {
        if(stopWatching) { stopWatching(); }
        persistence.destroy();
        session.destroy();
        appState.destroy();
      }
    });

    test('on, a shared device removes the worker and its caches and never asks for storage', async function(assert) {
      assert.expect(1);
      var nav = fakeNavigator({ persist: true, registered: ['https://app.example/sw.js'] });
      var persistence = EmberObject.create({ sync_status: null });
      var session = EmberObject.create({ isAuthenticated: true });
      var appState = EmberObject.create({ sessionUser: sharedUser() });
      var owner = fakeOwner({ 'service:persistence': persistence, 'service:session': session, 'service:app-state': appState });
      var win = { offline_shell_enabled: true, navigator: nav, document: { readyState: 'complete' }, caches: cacheStore(['ll-offline-shell-0a1b'], nav.calls) };
      var stopWatching = start(owner, win);
      try {
        await drain();
        persistence.set('sync_status', 'succeeded');
        await drain();
        assert.deepEqual(nav.calls, ['getRegistrations', 'unregister https://app.example/sw.js', 'caches.keys', 'caches.delete ll-offline-shell-0a1b']);
      } finally {
        if(stopWatching) { stopWatching(); }
        persistence.destroy();
        session.destroy();
        appState.destroy();
      }
    });

    test('on, before the session user is known, touches nothing', async function(assert) {
      var nav = fakeNavigator({ persist: true, registered: ['https://app.example/sw.js'] });
      var appState = EmberObject.create({ sessionUser: null });
      var stopWatching = start(fakeOwner({ 'service:app-state': appState }), { offline_shell_enabled: true, navigator: nav, document: { readyState: 'complete' } });
      await drain();
      assert.deepEqual(nav.calls, []);
      if(stopWatching) { stopWatching(); }
      appState.destroy();
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

    // Added 2026-11-07: when the setting is flipped, a page that boots with it off must not remove the
    // worker or its caches in the middle of another page's install, which holds the site-wide lock.
    test('when off, removes the worker only once another page\'s step has released the lock', async function(assert) {
      var nav = fakeNavigator({ registered: ['https://app.example/sw.js'] });
      var release;
      nav.locks.request('ll-offline-shell-worker', function() { return new Promise(function(resolve) { release = resolve; }); });
      start(fakeOwner({}), { offline_shell_enabled: false, navigator: nav, document: { readyState: 'complete' } });
      await drain();
      assert.deepEqual(nav.calls, [], 'nothing removed while another page holds the lock');
      release();
      await drain();
      assert.deepEqual(nav.calls, ['getRegistrations', 'unregister https://app.example/sw.js']);
    });

    // Rewritten 2026-11-05 (approved): supplies a trusted session user (see above); what it checks is
    // unchanged.
    test('waits for the page to finish loading before registering', async function(assert) {
      var nav = fakeNavigator();
      var listeners = {};
      var win = {
        offline_shell_enabled: true,
        navigator: nav,
        document: { readyState: 'interactive' },
        addEventListener: function(name, fn, options) { listeners[name] = { fn: fn, options: options }; }
      };
      var appState = EmberObject.create({ sessionUser: trustedUser() });
      var session = EmberObject.create({ access_token: 'token-1' });
      var stopWatching = start(fakeOwner({ 'service:app-state': appState, 'service:session': session, 'service:stashes': fakeStashes('token-1') }), win);
      await drain();
      assert.deepEqual(nav.calls, [], 'not before load');
      assert.true(!!listeners.load, 'a load listener');
      assert.true(listeners.load.options.once, 'that runs once');
      listeners.load.fn();
      await drain();
      assert.deepEqual(nav.calls, ['register /sw.js {"scope":"/"}']);
      if(stopWatching) { stopWatching(); }
      appState.destroy();
      session.destroy();
    });
  });

  module('first_sync_when_installed', function() {
    function setup(props) {
      var syncs = [];
      var persistence = EmberObject.extend({
        local_db_is_current_user: function() { return this.get('db_ok'); },
        sync: function(user, force, ignore, reason) { syncs.push(reason); return Promise.resolve(); }
      }).create(Object.assign({online: true, syncing: false, last_sync_at: 1, db_ok: true}, props.persistence));
      var user = EmberObject.create({preferences: {device: {long_token: props.trust === undefined ? true : props.trust}}});
      var appState = EmberObject.create({sessionUser: user});
      var win = {navigator: {standalone: props.installed !== false}};
      return {syncs: syncs, persistence: persistence, appState: appState, win: win};
    }

    test('a trusted Home Screen install that has never synced starts one sync', function(assert) {
      var s = setup({});
      var end = offline_shell.first_sync_when_installed(s.persistence, s.appState, s.win);
      s.persistence.set('last_sync_at', 1);
      s.persistence.set('online', false);
      s.persistence.set('online', true);
      end();
      assert.deepEqual(s.syncs, ['first_home_screen_sync'], 'once');
    });

    test('it waits for the device to know it has never synced, and for a connection', function(assert) {
      var s = setup({persistence: {last_sync_at: undefined, online: false}});
      var end = offline_shell.first_sync_when_installed(s.persistence, s.appState, s.win);
      assert.deepEqual(s.syncs, []);
      s.persistence.set('last_sync_at', 1);
      assert.deepEqual(s.syncs, [], 'still offline');
      s.persistence.set('online', true);
      assert.deepEqual(s.syncs, ['first_home_screen_sync']);
      end();
    });

    test('never in a browser tab, on a shared device, after a sync, or on another user\'s database', function(assert) {
      assert.expect(6);
      [
        {installed: false}, {trust: false}, {trust: null},
        {persistence: {last_sync_at: 1234}}, {persistence: {syncing: true}}, {persistence: {db_ok: false}}
      ].forEach(function(props) {
        var s = setup(props);
        var end = offline_shell.first_sync_when_installed(s.persistence, s.appState, s.win);
        end();
        assert.deepEqual(s.syncs, [], JSON.stringify(props));
      });
    });

    test('installed reads iOS standalone and the display mode', function(assert) {
      assert.true(offline_shell.installed({navigator: {standalone: true}}));
      assert.true(offline_shell.installed({navigator: {}, matchMedia: function() { return {matches: true}; }}));
      assert.false(offline_shell.installed({navigator: {}, matchMedia: function() { return {matches: false}; }}));
      assert.false(offline_shell.installed(null));
    });
  });
});
