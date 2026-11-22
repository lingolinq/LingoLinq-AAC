import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import RSVP from 'rsvp';
import $ from 'jquery';
import { set } from '@ember/object';
import persistence from 'frontend/utils/persistence';
import lingoLinqExtras from 'frontend/utils/extras';
import capabilities from 'frontend/utils/capabilities';
import { persistenceTarget } from 'frontend/tests/helpers/persistence-stub';
import { begin, finish, reset_for_tests } from 'frontend/utils/sync_counters';

/* THE TWO PLACES THE SYNC COUNTERS LISTEN (item 0.1, review round 1: the sync test harness stubs persistence.ajax and
 * store_url_now, so a deleted hook would pass there). Every jQuery request goes through `$.realAjax` in
 * utils/extras.js; every picture and sound download through the XHR in store_url_now (services/persistence.js), with
 * the picture proxy as its fallback. Driven here at `$.realAjax` and at `XMLHttpRequest`. */
module('Unit | Utility | sync counters wiring', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    reset_for_tests();
    var target = persistenceTarget();
    this.target = target;
    this.prior = {
      real: $.realAjax, Xhr: window.XMLHttpRequest, progress: target.get('sync_progress'),
      find: target.find, ajax: target.ajax, store: target.store, local_system: target.get('local_system'),
      url_cache: target.url_cache, url_uncache: target.url_uncache, ready: lingoLinqExtras.get('ready'),
      window_ready: window.lingoLinqExtras && window.lingoLinqExtras.ready, proxy_key: window.symbol_proxy_key,
      write_file: capabilities.storage.write_file, remove_file: capabilities.storage.remove_file
    };
    this.stashes = this.owner.lookup('service:stashes'); this.prior.auth_settings = this.stashes.get('auth_settings');
    lingoLinqExtras.set('ready', true);
    if(window.lingoLinqExtras) { set(window.lingoLinqExtras, 'ready', true); }
    this.stashes.set('auth_settings', {});
    target.set('local_system', { available: true, allowed: true });
    window.symbol_proxy_key = null;
    target.url_cache = {};
    target.url_uncache = {};
    target.find = function() { return RSVP.reject({ error: 'url not in storage' }); };
    target.store = function(store, obj) { return RSVP.resolve(obj); };
    capabilities.storage.remove_file = function() { return RSVP.resolve(); };
    capabilities.storage.write_file = function(type, filename) { return RSVP.resolve('file:///pictures/' + filename); };
    // The running sync the counters belong to (utils/sync_counters.js token reads sync_progress.sync_id).
    target.set('sync_progress', { sync_id: 'wired', root_user: '1_1' });
    begin('wired', 1000);
  });

  hooks.afterEach(function() {
    var target = this.target;
    $.realAjax = this.prior.real;
    window.XMLHttpRequest = this.prior.Xhr;
    target.set('sync_progress', this.prior.progress);
    target.find = this.prior.find;
    target.ajax = this.prior.ajax;
    target.store = this.prior.store;
    target.set('local_system', this.prior.local_system);
    target.url_cache = this.prior.url_cache;
    target.url_uncache = this.prior.url_uncache;
    capabilities.storage.write_file = this.prior.write_file;
    capabilities.storage.remove_file = this.prior.remove_file;
    lingoLinqExtras.set('ready', this.prior.ready);
    if(window.lingoLinqExtras) { set(window.lingoLinqExtras, 'ready', this.prior.window_ready); }
    window.symbol_proxy_key = this.prior.proxy_key;
    this.stashes.set('auth_settings', this.prior.auth_settings);
    reset_for_tests();
  });

  function answer(ok, value, xhr) {
    var d = $.Deferred();
    if(ok) { d.resolve(value, 'success', xhr); } else { d.reject(xhr, 'error'); }
    return d.promise();
  }

  test('a request through $.ajax is counted, with what came back', async function(assert) {
    $.realAjax = function() { return answer(true, { user: { id: '1_1' } }, { status: 200, responseText: '{"user":{"id":"1_1"}}' }); };
    await $.ajax('/api/v1/users/self', { type: 'GET' }).then(null, function() { });
    var out = finish('wired', { now: 2000 });
    assert.strictEqual(out.requests, 1);
    assert.strictEqual(out.received_chars, 21);
  });

  test('a failed request through $.ajax is counted by kind', async function(assert) {
    $.realAjax = function() { return answer(false, null, { status: 503, responseText: '' }); };
    await $.ajax('/api/v1/users/self', { type: 'GET' }).then(null, function() { });
    var out = finish('wired', { now: 2000 });
    assert.strictEqual(out.requests, 1);
    assert.strictEqual(out.failures.server, 1);
  });

  test('nothing is counted when no sync is running', async function(assert) {
    this.target.set('sync_progress', null);
    $.realAjax = function() { return answer(true, {}, { status: 200, responseText: '{}' }); };
    await $.ajax('/api/v1/users/self', { type: 'GET' }).then(null, function() { });
    this.target.set('sync_progress', { sync_id: 'wired' });
    assert.strictEqual(finish('wired', { now: 2000 }).requests, 0);
  });

  // A stand-in for the browser's XHR: answers on send with a picture, or fails.
  function fake_xhr(outcome, made) {
    return function() {
      var listeners = {};
      var xhr = {
        status: 0, response: null, timeout: 0, responseType: '',
        addEventListener: function(name, fn) { listeners[name] = fn; },
        open: function(method, url) { xhr.url_opened = url; },
        getResponseHeader: function(name) { return name === 'Content-Type' ? 'image/png' : null; },
        send: function() {
          made.push(xhr);
          setTimeout(function() {
            if(outcome === 'ok') {
              xhr.status = 200;
              xhr.response = new Blob([new Uint8Array(16)], { type: 'image/png' });
              listeners.load({});
            } else {
              listeners.error({});
            }
          }, 0);
        }
      };
      return xhr;
    };
  }
  var PICTURE = 'https://d18vdu4p71yql0.cloudfront.net/e2e-wiring/pic.png'; // a host store_url_now asks directly (cors_match)

  test('a picture downloaded directly is counted as a request and as a saved picture with its bytes', async function(assert) {
    var made = [];
    window.XMLHttpRequest = fake_xhr('ok', made);
    this.target.ajax = function() { throw new Error('no proxy expected'); };
    await persistence.store_url_now(PICTURE, 'image');
    assert.strictEqual(made.length, 1, 'the direct request was made');
    var out = finish('wired', { now: 2000 });
    assert.strictEqual(out.requests, 1);
    assert.deepEqual(out.pictures, { saved: 1, bytes: 16 });
    assert.strictEqual(out.open_at_end, 0);
  });

  test('a picture saved through the proxy after the direct request failed counts once, with the decoded size', async function(assert) {
    var made = [];
    window.XMLHttpRequest = fake_xhr('fail', made);
    this.target.ajax = function() { return RSVP.resolve({ content_type: 'image/png', data: 'data:image/png;base64,iVBORw0KGgo=' }); };
    await persistence.store_url_now(PICTURE + '?b', 'image');
    var out = finish('wired', { now: 2000 });
    assert.strictEqual(out.failures.offline, 1, 'the failed direct request');
    assert.deepEqual(out.pictures, { saved: 1, bytes: 8 }, 'one picture, not two');
  });

  test('a picture whose device write failed is not counted as saved', async function(assert) {
    var made = [];
    window.XMLHttpRequest = fake_xhr('ok', made);
    capabilities.storage.write_file = function() { return RSVP.reject({ error: 'write failed' }); };
    await persistence.store_url_now(PICTURE + '?c', 'image').then(null, function() { });
    var out = finish('wired', { now: 2000 });
    assert.strictEqual(out.requests, 1);
    assert.deepEqual(out.pictures, { saved: 0, bytes: 0 });
  });
});
