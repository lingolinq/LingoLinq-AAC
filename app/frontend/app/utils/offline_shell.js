import { addObserver, removeObserver } from '@ember/object/observers';

// Offline app shell (lib/offline_shell.rb): a service worker served by Rails at /sw.js keeps a copy
// of the app's page and files, so a Home Screen launch with no network still boots the app from the
// device. The page says whether this environment has it on (window.offline_shell_enabled, set per
// request by layouts/application.html.erb): register when true, remove when false, and touch nothing
// when the page did not say (ember serve, tests).
//
// Every function takes the window / navigator it works on, so tests pass fakes. None of them throws
// or blocks boot: each returns a promise of a short status string.
export const WORKER_PATH = '/sw.js';
// Every cache the worker makes starts with this (OfflineShell::CACHE_PREFIX; spec/lib/offline_shell_spec.rb
// checks the two agree).
export const CACHE_PREFIX = 'll-offline-shell-';

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
    // caches. This covers a page that boots before the browser has checked for that update. Unregistering
    // here can stop that removal worker from ever running, so the page deletes the worker's caches too,
    // even when no worker is left (a device that already lost that race still has them).
    if(typeof container.getRegistrations !== 'function') { return Promise.resolve('unsupported'); }
    return Promise.resolve().then(function() {
      return container.getRegistrations();
    }).then(function(registrations) {
      var ours = (registrations || []).filter(is_offline_shell_worker);
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

  // Calls request_persist once, after the first sync that succeeds while signed in. Watches the
  // persistence service's sync_status (set to 'succeeded' at the end of a clean sync). Returns a
  // function that stops watching.
  persist_after_sync: function(persistence, session, nav) {
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
