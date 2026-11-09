import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import RSVP from 'rsvp';
import { set } from '@ember/object';
import persistence from 'frontend/utils/persistence';
import lingoLinqExtras from 'frontend/utils/extras';
import capabilities from 'frontend/utils/capabilities';
import { persistenceTarget } from 'frontend/tests/helpers/persistence-stub';

/* A SAVED PICTURE COUNTS AS SAVED (2026-11-08, PR #1268, issue #1221).
 *
 * In the service file the bare name `persistence` is the service class, not the running service
 * (services/persistence.js:91, :124). store_url_now recorded each saved picture on the class
 * (persistence.url_cache / url_uncache), while the "already saved?" checks read the running service
 * (store_url_quick_check, the reuse check in store_url_now). So nothing saved during a session counted as saved:
 * a picture used on many boards was fetched and written again for each one (one picture 57 times in the emulator
 * trace). The results are now recorded on the running service.
 */
module('Unit | Utility | persistence saved pictures', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    var target = persistenceTarget();
    this.target = target;
    this.prior = {
      find: target.find, ajax: target.ajax, store: target.store, local_system: target.get('local_system'),
      url_cache: target.url_cache, url_uncache: target.url_uncache, ready: lingoLinqExtras.get('ready'),
      window_ready: window.lingoLinqExtras && window.lingoLinqExtras.ready, proxy_key: window.symbol_proxy_key,
      write_file: capabilities.storage.write_file, remove_file: capabilities.storage.remove_file
    };
    this.stashes = this.owner.lookup('service:stashes');
    lingoLinqExtras.set('ready', true);
    if(window.lingoLinqExtras) { set(window.lingoLinqExtras, 'ready', true); } // tracked: plain assignment asserts
    this.stashes.set('auth_settings', {});
    target.set('local_system', { available: true, allowed: true });
    window.symbol_proxy_key = null;
    target.url_cache = {};
    target.url_uncache = {};
    target.find = function() { return RSVP.reject({ error: 'url not in storage' }); };
    target.ajax = function() { return RSVP.resolve({ content_type: 'image/png', data: 'data:image/png;base64,iVBORw0KGgo=' }); };
    target.store = function(store, obj) { return RSVP.resolve(obj); };
    capabilities.storage.remove_file = function() { return RSVP.resolve(); };
    capabilities.storage.write_file = function(type, filename) { return RSVP.resolve('file:///pictures/' + filename); };
  });

  hooks.afterEach(function() {
    var target = this.target;
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
    this.stashes.set('auth_settings', null);
  });

  test('a picture saved as a file counts as saved for the rest of the session', async function(assert) {
    var url = 'https://example.com/images/1/2/1_12-abc.png';
    var res = await persistence.store_url_now(url, 'image');
    assert.ok(res.local_url, 'saved as a file');
    assert.true(!!this.target.store_url_quick_check(url, 'image'), 'the already-saved check sees it');
  });

  test('a picture whose save failed does not count as saved', async function(assert) {
    // The real failure: the file write rejects (store() never rejects, services/persistence.js:770-782).
    var url = 'https://example.com/images/1/3/1_13-def.png';
    var writes = 0;
    capabilities.storage.write_file = function() { writes++; return RSVP.reject({ error: 'write failed' }); };
    var outcome = await persistence.store_url_now(url, 'image').then(function() { return 'resolved'; }, function() { return 'rejected'; });
    assert.strictEqual(writes, 1, 'the file write was attempted');
    assert.strictEqual(outcome, 'rejected', 'the save reports the failure');
    assert.false(!!this.target.store_url_quick_check(url, 'image'), 'not counted as saved');
  });

  /* Unit 3 (#1221): store_url_now looks for a saved copy only for addresses trusted not to change (or in the
   * installed app), and a forced refresh re-downloads anything untrusted (services/persistence.js:1556-1566). The
   * sync skips pictures already known to be saved (store_url_quick_check, :3160, :3191, :3226), but the same picture
   * queued from several boards before its first save lands was downloaded and written again for each copy in a
   * browser. LingoLinq's own uploads get a permanent address (app/models/concerns/uploadable.rb:58-80), yet the
   * trusted list still names CoughDrop-era hosts. An upload's address is now trusted by its shape, on any host.
   * Button-set files on the same host (extras.../) change and still refresh.
   */
  var SHA = new Array(129).join('a');
  var PROXY = /^\/api\/v1\/search\/proxy/;
  async function save_then_force(target, url, type, row) {
    var downloads = 0, writes = 0, direct = 0;
    var write_file = capabilities.storage.write_file, Xhr = window.XMLHttpRequest;
    capabilities.storage.write_file = function() { writes++; return write_file.apply(this, arguments); };
    // The trust must not move these addresses onto the direct-request route (cors_match): no network in tests.
    window.XMLHttpRequest = function() { direct++; throw new Error('no direct request expected'); };
    target.ajax = function(path) {
      if(PROXY.test(path)) { downloads++; }
      return RSVP.resolve({ content_type: type == 'json' ? 'application/json' : (type == 'sound' ? 'audio/mpeg' : 'image/png'), data: 'data:image/png;base64,iVBORw0KGgo=' });
    };
    var first = await persistence.store_url_now(url, type);
    target.find = function(store, key) {
      return (store === 'dataCache' && key === url) ? RSVP.resolve(Object.assign({ url: url, type: type, persisted: true }, row || first)) : RSVP.reject({});
    };
    var second;
    try { second = await persistence.store_url_now(url, type, false, true); } finally { window.XMLHttpRequest = Xhr; }
    return { downloads: downloads, writes: writes, direct: direct, first: first, second: second };
  }

  test('the Sync button reuses a saved uploaded picture instead of downloading it again', async function(assert) {
    var url = 'https://uploads-cdn.example.com/images/1/2/3/1_123-' + SHA + '.png';
    var res = await save_then_force(this.target, url, 'image');
    assert.strictEqual(res.downloads, 1, 'downloaded once, on the first save only');
    assert.strictEqual(res.writes, 1, 'written once, not rewritten');
    assert.strictEqual(res.direct, 0, 'no direct request');
  });

  test('the Sync button reuses a saved uploaded sound, including a transcoded one', async function(assert) {
    var url = 'https://uploads-cdn.example.com/sounds/4/5/1_45-' + SHA + 'v1699999999.mp3';
    var res = await save_then_force(this.target, url, 'sound');
    assert.strictEqual(res.downloads, 1, 'downloaded once');
  });

  test('the Sync button still refreshes a button-set file on the uploads host', async function(assert) {
    var url = 'https://uploads-cdn.example.com/extras-cache06123/button_set_cache/1_8006/' + SHA + '.json';
    var res = await save_then_force(this.target, url, 'json', { content_type: 'application/json', data_uri: 'data:application/json;base64,e30=' });
    assert.strictEqual(res.downloads, 2, 'downloaded again');
  });

  test('the Sync button still refreshes a picture from an outside address', async function(assert) {
    var url = 'https://example.com/pictures/cat.png';
    var res = await save_then_force(this.target, url, 'image');
    assert.strictEqual(res.downloads, 2, 'downloaded again');
  });

  test('the Sync button still refreshes a picture on the uploads host that is not an upload', async function(assert) {
    // Sentence previews are overwritten in place (lib/sentence_pic.rb): the host alone is not trusted.
    var url = 'https://uploads-cdn.example.com/sentences/1_5/0123456789abcdef012345678/preview.png';
    var res = await save_then_force(this.target, url, 'image');
    assert.strictEqual(res.downloads, 2, 'downloaded again');
  });

  test('the Sync button repairs an uploaded picture whose saved copy is not known', async function(assert) {
    var url = 'https://uploads-cdn.example.com/images/7/1_7-' + SHA + '.png';
    var target = this.target;
    var downloads = 0;
    target.ajax = function(path) { if(PROXY.test(path)) { downloads++; } return RSVP.resolve({ content_type: 'image/png', data: 'data:image/png;base64,iVBORw0KGgo=' }); };
    target.find = function(store, key) {
      return (store === 'dataCache' && key === url) ? RSVP.resolve({ url: url, type: 'image', persisted: true, local_url: 'file:///pictures/gone.png', local_filename: 'gone.png' }) : RSVP.reject({});
    };
    await persistence.store_url_now(url, 'image', false, true);
    assert.strictEqual(downloads, 1, 'a row with no known saved copy is downloaded again');
  });

  /* Unit 2 (#1221): with no file storage (iPad Safari and the Home Screen app, or after a quota error) a picture is kept
   * in its database row. The reuse step used to accept a found row only when a FILE copy was known (has_local_copy), so
   * every sync downloaded and rewrote every picture (1,683 rows, 22 MB, on a repeat sync in WebKit). A row that holds
   * the picture itself is now reused: if the row exists, its write landed.
   */
  var PNG = 'data:image/png;base64,iVBORw0KGgo=';
  async function request_with_row(target, url, type, row, opts) {
    var calls = { downloads: 0, writes: 0, direct: 0 };
    var Xhr = window.XMLHttpRequest, installed = capabilities.installed_app;
    window.XMLHttpRequest = function() { calls.direct++; throw new Error('no direct request in tests'); };
    capabilities.installed_app = !!(opts && opts.installed_app);
    target.ajax = function(path) {
      if(PROXY.test(path)) { calls.downloads++; }
      return RSVP.resolve({ content_type: type == 'sound' ? 'audio/mpeg' : (type == 'json' ? 'application/json' : 'image/png'), data: type == 'json' ? 'data:application/json;base64,e30=' : PNG });
    };
    target.store = function(store, obj) { calls.writes++; return RSVP.resolve(obj); };
    target.find = function(store, key) {
      return (store === 'dataCache' && key === url && row) ? RSVP.resolve(Object.assign({ url: url, type: type, persisted: true }, row)) : RSVP.reject({});
    };
    try {
      calls.result = await persistence.store_url_now(url, type, false, !!(opts && opts.force));
    } finally {
      window.XMLHttpRequest = Xhr;
      capabilities.installed_app = installed;
    }
    return calls;
  }

  test('with no file storage, a picture already in the database is reused, not downloaded and written again', async function(assert) {
    this.target.set('local_system', { available: false });
    var res = await request_with_row(this.target, 'https://example.com/pictures/dog.png', 'image', { content_type: 'image/png', data_uri: PNG });
    assert.strictEqual(res.downloads, 0, 'not downloaded');
    assert.strictEqual(res.writes, 0, 'not written again');
    assert.strictEqual(res.result.data_uri, PNG, 'the saved picture is returned');
  });

  test('with no file storage, a sound already in the database is reused', async function(assert) {
    this.target.set('local_system', { available: true, allowed: false }); // after a quota error
    var res = await request_with_row(this.target, 'https://example.com/sounds/bark.mp3', 'sound', { content_type: 'audio/mpeg', data_uri: 'data:audio/mpeg;base64,SUQz' });
    assert.deepEqual([res.downloads, res.writes], [0, 0]);
  });

  test('with no file storage, a row without the picture itself is downloaded again', async function(assert) {
    this.target.set('local_system', { available: false });
    var res = await request_with_row(this.target, 'https://example.com/pictures/cow.png', 'image', { content_type: 'image/png', local_url: 'file:///pictures/cow.png' });
    assert.strictEqual(res.downloads, 1);
  });

  test('with no file storage, a row of the wrong kind is downloaded again', async function(assert) {
    this.target.set('local_system', { available: false });
    var res = await request_with_row(this.target, 'https://example.com/pictures/pig.png', 'image', { content_type: 'text/html', data_uri: 'data:text/html;base64,PGgxPg==' });
    assert.strictEqual(res.downloads, 1);
  });

  test('with no file storage, a protected picture is downloaded again (it can answer with a fallback)', async function(assert) {
    this.target.set('local_system', { available: false });
    var res = await request_with_row(this.target, 'https://app.example.org/api/v1/users/1_1/protected_image/lessonpix/123', 'image', { content_type: 'image/png', data_uri: PNG });
    assert.strictEqual(res.downloads, 1);
  });

  test('with no file storage, the Sync button still refreshes a picture from an outside address', async function(assert) {
    this.target.set('local_system', { available: false });
    var res = await request_with_row(this.target, 'https://example.com/pictures/hen.png', 'image', { content_type: 'image/png', data_uri: PNG }, { force: true });
    assert.strictEqual(res.downloads, 1);
  });

  test('with no file storage, a JSON file is not reused (button sets change)', async function(assert) {
    this.target.set('local_system', { available: false });
    var res = await request_with_row(this.target, 'https://example.com/extras/list.json', 'json', { content_type: 'application/json', data_uri: 'data:application/json;base64,e30=' }, { installed_app: true });
    assert.strictEqual(res.downloads, 1);
  });

  test('in the installed app WITH file storage, a database row is not enough (the file may be missing)', async function(assert) {
    var res = await request_with_row(this.target, 'https://example.com/pictures/cat2.png', 'image', { content_type: 'image/png', data_uri: PNG }, { installed_app: true });
    assert.strictEqual(res.downloads, 1, 'repaired by downloading');
  });

  test('with no file storage, a symbol from a trusted address is reused without any request', async function(assert) {
    this.target.set('local_system', { available: false });
    var res = await request_with_row(this.target, 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/apple.png', 'image', { content_type: 'image/png', data_uri: PNG }, { force: true });
    assert.deepEqual([res.downloads, res.writes, res.direct], [0, 0, 0]);
  });

  test('with no file storage, a picture row holding a sound is downloaded again', async function(assert) {
    this.target.set('local_system', { available: false });
    var res = await request_with_row(this.target, 'https://example.com/pictures/duck.png', 'image', { content_type: 'audio/mpeg', data_uri: 'data:audio/mpeg;base64,SUQz' });
    assert.strictEqual(res.downloads, 1);
  });

  test('with no file storage, an out-of-date row is downloaded again', async function(assert) {
    this.target.set('local_system', { available: false });
    var res = await request_with_row(this.target, 'https://example.com/pictures/goat.png', 'image', { content_type: 'image/png', data_uri: PNG, outdated: true });
    assert.strictEqual(res.downloads, 1);
  });

  test('signed out (no saved sign-in), a picture already in the database is reused', async function(assert) {
    this.stashes.set('auth_settings', null); // the store branch then keeps pictures in the database too
    var res = await request_with_row(this.target, 'https://example.com/pictures/sheep.png', 'image', { content_type: 'image/png', data_uri: PNG });
    assert.strictEqual(res.downloads, 0);
  });
});
