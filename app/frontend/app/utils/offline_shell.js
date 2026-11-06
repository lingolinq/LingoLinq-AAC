import { addObserver, removeObserver } from '@ember/object/observers';

// Offline app shell (lib/offline_shell.rb): a service worker served by Rails at /sw.js keeps a copy
// of the app's page and files, so a Home Screen launch with no network still boots the app from the
// device. The page says whether this environment has it on (window.offline_shell_enabled, set per
// request by layouts/application.html.erb): register when true, remove when false, and touch nothing
// when the page did not say (ember serve, tests).
//
// Trusted devices only. On a shared device ("This is a Shared Device" at sign-in) the server ends an
// idle session, but offline nothing can, and the app reads the last user from the device at boot. So
// even when it is on, the worker is kept only while the signed-in user's record says this device is
// trusted (device_trust), and a shared sign-in removes it and its caches: a shared device offline then
// shows the browser's offline page, as it did before the worker.
//
// Every function takes the window / navigator it works on, so tests pass fakes. None of them throws
// or blocks boot: each returns a promise of a short status string.
export const WORKER_PATH = '/sw.js';
// Every cache the worker makes starts with this (OfflineShell::CACHE_PREFIX; spec/lib/offline_shell_spec.rb
// checks the two agree).
export const CACHE_PREFIX = 'll-offline-shell-';

// Every page of the site runs its register or remove steps under this lock (navigator.locks): pages
// share one registration and one set of caches. A browser without it gets no worker.
export const LOCK_NAME = 'll-offline-shell-worker';

function log(message) {
  console.log('[offline-shell] ' + message);
}

function is_offline_shell_worker(registration) {
  var worker = registration && (registration.active || registration.waiting || registration.installing);
  if(!worker || !worker.scriptURL) { return false; }
  try {
    return new URL(worker.scriptURL).pathname === WORKER_PATH;
  } catch(e) {
    return false;
  }
}

function has_site_lock(nav) {
  return !!(nav && nav.locks && typeof nav.locks.request === 'function');
}

// Runs fn under the site-wide lock when the browser has one, otherwise at once (only removals run
// without it: see apply_device_trust).
function exclusive(nav, fn) {
  if(has_site_lock(nav)) {
    return Promise.resolve().then(function() { return nav.locks.request(LOCK_NAME, function() { return fn(); }); });
  }
  return Promise.resolve().then(fn);
}

function read_sign_in(sign_in, which) {
  try {
    return (sign_in && typeof sign_in[which] === 'function') ? (sign_in[which]() || null) : null;
  } catch(e) {
    return null;
  }
}

// This worker's registration, also while its script is still downloading: such a registration has no
// worker yet, so it cannot be recognised by its script, but at the root scope it can only be this one
// (the app registers no other worker).
function is_offline_shell_registration(registration) {
  if(is_offline_shell_worker(registration)) { return true; }
  if(!registration || registration.active || registration.waiting || registration.installing) { return false; }
  try {
    return new URL(registration.scope).pathname === '/';
  } catch(e) {
    return false;
  }
}

// Deletes the caches the worker made. Never rejects: a cache store that fails is logged.
function delete_worker_caches(win) {
  var store = win && win.caches;
  if(!store || typeof store.keys !== 'function') { return Promise.resolve(); }
  return Promise.resolve().then(function() {
    return store.keys();
  }).then(function(names) {
    var ours = (names || []).filter(function(name) { return typeof name === 'string' && name.indexOf(CACHE_PREFIX) === 0; });
    return Promise.all(ours.map(function(name) { return store.delete(name); })).then(function() {
      if(ours.length > 0) { log('caches removed: ' + ours.length); }
    });
  }).then(null, function(err) {
    log('could not remove the worker caches: ' + ((err && err.message) || err));
  });
}

// Unregisters this worker (never any other) and deletes its caches. Unregistering can stop the removal
// worker /sw.js serves when the setting is off from ever running, so the caches go too, even when no
// worker is left (a device that already lost that race still has them).
function remove_worker(win, container) {
  if(typeof container.getRegistrations !== 'function') { return Promise.resolve('unsupported'); }
  return Promise.resolve().then(function() {
    return container.getRegistrations();
  }).then(function(registrations) {
    var ours = (registrations || []).filter(is_offline_shell_registration);
    return Promise.all(ours.map(function(registration) { return registration.unregister(); })).then(function() {
      if(ours.length > 0) { log('worker removed'); }
      return delete_worker_caches(win);
    }).then(function() {
      return ours.length > 0 ? 'unregistered' : 'none';
    });
  }).then(null, function(err) {
    log('could not check for the worker: ' + ((err && err.message) || err));
    return 'failed';
  });
}

var offline_shell = {
  // 'on', 'off', or null when the page did not say.
  setting: function(win) {
    if(!win) { return null; }
    if(win.offline_shell_enabled === true) { return 'on'; }
    if(win.offline_shell_enabled === false) { return 'off'; }
    return null;
  },

  sync_registration: function(win, nav) {
    var setting = offline_shell.setting(win);
    if(!setting) { return Promise.resolve('not_configured'); }
    var container = nav && nav.serviceWorker;
    if(!container) { return Promise.resolve('unsupported'); }
    if(setting === 'on') {
      if(typeof container.register !== 'function') { return Promise.resolve('unsupported'); }
      return Promise.resolve().then(function() {
        return container.register(WORKER_PATH, {scope: '/'});
      }).then(function() {
        return 'registered';
      }, function(err) {
        log('worker not registered: ' + ((err && err.message) || err));
        return 'failed';
      });
    }
    // Off: the server's /sw.js already hands installed copies a worker that removes itself and its
    // caches. This covers a page that boots before the browser has checked for that update.
    return remove_worker(win, container);
  },

  // 'trusted' when the session user's record says this device is trusted ("Trust this Device":
  // preferences.device.long_token, the device's own setting, json_api/user.rb), 'shared' for any other
  // record (shared, or no choice recorded), null when there is no session user record yet.
  device_trust: function(user) {
    if(!user || typeof user.get !== 'function') { return null; }
    return user.get('preferences.device.long_token') === true ? 'trusted' : 'shared';
  },

  // sync_registration for this device: when it is on, register only on a trusted device, remove the
  // worker and its caches on a shared one, and touch nothing until the session user is known.
  sync_for_device: function(win, nav, trust) {
    if(offline_shell.setting(win) !== 'on' || trust === 'trusted') {
      return offline_shell.sync_registration(win, nav);
    }
    if(trust !== 'shared') { return Promise.resolve('waiting'); }
    var container = nav && nav.serviceWorker;
    if(!container) { return Promise.resolve('unsupported'); }
    return remove_worker(win, container);
  },

  // One step for this page's trust answer, under the site-wide lock. A removal always runs. A
  // registration runs only when the browser has the lock (without it, another page's removal could
  // finish before this registration lands, so any worker is removed instead), and only when this page's
  // sign-in is still the current one (`sign_in.page()` against `sign_in.current()`, the stored auth
  // settings every page shares): a page from an earlier sign-in, whose user record can arrive after a
  // newer sign-in elsewhere, must not register for it.
  apply_device_trust: function(win, nav, trust, sign_in) {
    if(offline_shell.setting(win) !== 'on' || trust !== 'trusted') {
      return exclusive(nav, function() { return offline_shell.sync_for_device(win, nav, trust); });
    }
    if(!has_site_lock(nav)) {
      return offline_shell.sync_for_device(win, nav, 'shared').then(function() { return 'unsupported'; });
    }
    var token = read_sign_in(sign_in, 'page');
    return exclusive(nav, function() {
      if(!token || read_sign_in(sign_in, 'current') !== token) { return 'superseded'; }
      return offline_shell.sync_for_device(win, nav, 'trusted');
    });
  },

  // Runs apply_device_trust now and each time this page's answer changes: a sign-in, the "Trust this
  // Device" choice, a shared sign-in after a trusted one, and each new sign-in even with the same answer
  // (another page may have registered meanwhile). Signing out changes nothing: a trusted device keeps its
  // worker. One step at a time, in order. `sign_in` tells this page's sign-in from the current one (see
  // apply_device_trust). Returns a function that stops watching.
  follow_device_trust: function(appState, win, nav, sign_in) {
    var done = false;
    var last;
    var queue = Promise.resolve();
    var key = 'sessionUser.preferences.device.long_token';
    var check = function() {
      if(done || appState.isDestroyed || appState.isDestroying) { return; }
      var trust = offline_shell.device_trust(appState.get('sessionUser'));
      if(trust === null) { return; }
      var answer = trust + ' ' + (read_sign_in(sign_in, 'page') || '');
      if(answer === last) { return; }
      last = answer;
      queue = queue.then(function() {
        return offline_shell.apply_device_trust(win, nav, trust, sign_in);
      }).then(null, function() {});
    };
    addObserver(appState, key, check);
    check();
    return function() {
      if(done) { return; }
      done = true;
      if(!appState.isDestroyed && !appState.isDestroying) {
        removeObserver(appState, key, check);
      }
    };
  },

  // A browser device does not sync until someone starts one (models/user.js auto_sync), so a Home Screen
  // install on a trusted device would have no boards offline. Starts that one first sync; after it the
  // usual rule applies (ever_synced). Installed apps only: a browser tab could pull every board. A
  // failed attempt tries again on the next launch.
  first_sync_when_installed: function(persistence, appState, win) {
    var started = false;
    var check = function() {
      if(started || persistence.isDestroyed || appState.isDestroyed) { return; }
      if(!offline_shell.installed(win) || offline_shell.device_trust(appState.get('sessionUser')) !== 'trusted') { return; }
      if(persistence.get('last_sync_at') !== 1 || !persistence.get('online') || persistence.get('syncing')) { return; }
      if(!persistence.local_db_is_current_user()) { return; }
      started = true;
      persistence.sync('self', null, null, 'first_home_screen_sync').then(null, function() { });
    };
    addObserver(persistence, 'last_sync_at', check);
    addObserver(persistence, 'online', check);
    addObserver(appState, 'sessionUser', check);
    check();
    return function() {
      if(!persistence.isDestroyed && !persistence.isDestroying) {
        removeObserver(persistence, 'last_sync_at', check);
        removeObserver(persistence, 'online', check);
      }
      if(!appState.isDestroyed && !appState.isDestroying) { removeObserver(appState, 'sessionUser', check); }
    };
  },

  // Opened from a Home Screen or as an installed app, not a browser tab.
  installed: function(win) {
    if(!win) { return false; }
    if(win.navigator && win.navigator.standalone === true) { return true; }
    return !!(typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches);
  },

  // Asks the browser to keep this site's storage (the synced boards and the worker's copy of the
  // app) instead of clearing it under storage pressure. The answer is logged; nothing waits on it.
  request_persist: function(nav) {
    var storage = nav && nav.storage;
    if(!storage || typeof storage.persist !== 'function') { return Promise.resolve('unsupported'); }
    return Promise.resolve().then(function() {
      return storage.persist();
    }).then(function(granted) {
      log('persistent storage ' + (granted ? 'granted' : 'not granted'));
      return granted ? 'granted' : 'not_granted';
    }, function(err) {
      log('persistent storage request failed: ' + ((err && err.message) || err));
      return 'failed';
    });
  },

  // Calls request_persist once, after the first sync that succeeds while signed in on a trusted device
  // (device_trust). A shared device's data should go when the browser needs the room, and Firefox asks
  // the person before granting it. Watches the persistence service's sync_status (set to 'succeeded' at
  // the end of a clean sync). Returns a function that stops watching.
  persist_after_sync: function(persistence, session, nav, appState) {
    var done = false;
    var stop = function() {
      if(done) { return; }
      done = true;
      if(!persistence.isDestroyed && !persistence.isDestroying) {
        removeObserver(persistence, 'sync_status', check);
      }
    };
    var check = function() {
      if(done) { return; }
      if(persistence.isDestroyed || persistence.isDestroying) { return; }
      if(persistence.get('sync_status') !== 'succeeded') { return; }
      if(!session || session.isDestroyed || session.isDestroying || !session.get('isAuthenticated')) { return; }
      if(!appState || appState.isDestroyed || appState.isDestroying) { return; }
      if(offline_shell.device_trust(appState.get('sessionUser')) !== 'trusted') { return; }
      stop();
      offline_shell.request_persist(nav);
    };
    addObserver(persistence, 'sync_status', check);
    return stop;
  },

  // Runs fn once the page has finished loading, so the worker's first download does not compete with
  // the app's own boot.
  when_loaded: function(win, fn) {
    if(!win.document || win.document.readyState === 'complete' || typeof win.addEventListener !== 'function') {
      fn();
    } else {
      win.addEventListener('load', function() { fn(); }, {once: true});
    }
  }
};

export default offline_shell;
