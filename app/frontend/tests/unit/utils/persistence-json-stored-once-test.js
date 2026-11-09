import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import RSVP from 'rsvp';
import { set } from '@ember/object';
import persistence from 'frontend/utils/persistence';
import lingoLinqExtras from 'frontend/utils/extras';
import { persistenceTarget } from 'frontend/tests/helpers/persistence-stub';

/* A DECRYPTED BUTTON LIST IS SAVED ONCE (2026-11-08, PR #1268, issue #1221).
 *
 * Button-set files are encrypted. After decrypting one, store_url_now kept the parsed list (json_payload) and
 * also re-encoded the same list as a base64 data URI, then saved both in one dataCache row: the emulator trace
 * found a 4.2 MB row holding a 1.73 MB list twice. Every reader returns json_payload first (find_url,
 * find_json, store_json), and a row with json_payload and no data_uri was already a state the code produced
 * when re-encoding failed. So only the parsed list is saved. A JSON file that is not encrypted has no
 * json_payload and keeps its data URI.
 */
module('Unit | Utility | persistence json stored once', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    var target = persistenceTarget();
    this.target = target;
    this.prior = {
      find: target.find, ajax: target.ajax, decrypt_json: target.decrypt_json, store: target.store,
      local_system: target.get('local_system'), url_cache: target.url_cache, url_uncache: target.url_uncache,
      primed: target.primed, ready: lingoLinqExtras.get('ready'),
      window_ready: window.lingoLinqExtras && window.lingoLinqExtras.ready, proxy_key: window.symbol_proxy_key
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
    var saved = this.saved = [];
    target.store = function(store, obj) {
      saved.push({ store: store, obj: Object.assign({}, obj) });
      return RSVP.resolve(obj);
    };
  });

  hooks.afterEach(function() {
    var target = this.target;
    target.find = this.prior.find;
    target.ajax = this.prior.ajax;
    target.decrypt_json = this.prior.decrypt_json;
    target.store = this.prior.store;
    target.set('local_system', this.prior.local_system);
    target.url_cache = this.prior.url_cache;
    target.url_uncache = this.prior.url_uncache;
    target.primed = this.prior.primed;
    lingoLinqExtras.set('ready', this.prior.ready);
    if(window.lingoLinqExtras) { set(window.lingoLinqExtras, 'ready', this.prior.window_ready); }
    window.symbol_proxy_key = this.prior.proxy_key;
    this.stashes.set('auth_settings', null);
  });

  test('an encrypted button list is saved as the parsed list only', async function(assert) {
    var buttons = [{ label: 'sí', board_id: '1_1', depth: 0 }];
    this.target.ajax = function() {
      return RSVP.resolve({ content_type: 'application/json', data: 'data:application/json;base64,' + btoa('aes256-payload') });
    };
    this.target.decrypt_json = function() { return RSVP.resolve(buttons); };

    var res = await persistence.store_url_now('https://example.com/extras/buttons.json', 'json', { iv: 'iv' });
    assert.deepEqual(res.json_payload, buttons, 'the caller gets the parsed list');
    var rows = this.saved.filter((s) => s.store === 'dataCache');
    assert.strictEqual(rows.length, 1, 'saved once');
    assert.deepEqual(rows[0].obj.json_payload, buttons, 'the parsed list is saved');
    assert.notOk(rows[0].obj.data_uri, 'no second, encoded copy is saved');
  });

  test('a JSON file that is not encrypted keeps its data URI', async function(assert) {
    var data_uri = 'data:application/json;base64,' + btoa(JSON.stringify({ hello: 'hola' }));
    this.target.ajax = function() { return RSVP.resolve({ content_type: 'application/json', data: data_uri }); };

    await persistence.store_url_now('https://example.com/locales/es.json', 'json');
    var rows = this.saved.filter((s) => s.store === 'dataCache');
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].obj.data_uri, data_uri, 'its only copy is kept');
    assert.notOk(rows[0].obj.json_payload);
  });

  test('a list saved as the parsed list only is read back offline', async function(assert) {
    var buttons = [{ label: 'help', board_id: '1_7', depth: 0 }];
    var url = 'https://example.com/extras/saved.json';
    this.target.primed = true;
    this.target.url_uncache = {};
    this.target.url_uncache[url] = true; // what prime_caches records for a dataCache row with no file
    this.target.find = function(store, key) {
      return (store === 'dataCache' && key === url) ? RSVP.resolve({ url: url, type: 'json', content_type: 'text/json', json_payload: buttons }) : RSVP.reject({});
    };
    var res = await persistence.find_json(url);
    assert.deepEqual(res, buttons);
  });
});
