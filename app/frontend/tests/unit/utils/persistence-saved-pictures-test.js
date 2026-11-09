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
});
