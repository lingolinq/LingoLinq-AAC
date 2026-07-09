import { module, test } from 'qunit';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';
import persistence from 'frontend/utils/persistence';
import lingoLinqExtras from 'frontend/utils/extras';
import { persistenceTarget } from '../../helpers/persistence-stub';

module('Unit | Utility | persistence json payload cache', function(hooks) {
  setupTest(hooks);

  var originalStoreUrl;
  var originalFindUrl;
  var originalFind;
  var originalAjax;
  var originalDecryptJson;
  var originalStore;
  var originalReady;
  var originalLocalSystem;
  var originalSymbolProxyKey;

  hooks.beforeEach(function() {
    var target = persistenceTarget();
    originalStoreUrl = target.store_url;
    originalFindUrl = target.find_url;
    originalFind = target.find;
    originalAjax = target.ajax;
    originalDecryptJson = target.decrypt_json;
    originalStore = target.store;
    originalReady = lingoLinqExtras.get('ready');
    originalLocalSystem = target.get('local_system');
    originalSymbolProxyKey = window.symbol_proxy_key;
  });

  hooks.afterEach(function() {
    var target = persistenceTarget();
    target.store_url = originalStoreUrl;
    target.find_url = originalFindUrl;
    target.find = originalFind;
    target.ajax = originalAjax;
    target.decrypt_json = originalDecryptJson;
    target.store = originalStore;
    lingoLinqExtras.set('ready', originalReady);
    target.set('local_system', originalLocalSystem);
    window.symbol_proxy_key = originalSymbolProxyKey;
    this.owner.lookup('service:stashes').set('auth_settings', null);
    target.url_cache = {};
    target.url_uncache = {};
  });

  test('store_json returns json_payload without data_uri parsing', async function(assert) {
    var buttons = [{label: 'sí', board_id: 'board-1', depth: 0}];
    persistenceTarget().store_url = function() {
      return RSVP.resolve({
        url: 'http://www.example.com/buttons.json',
        type: 'json',
        json_payload: buttons
      });
    };

    var res = await persistence.store_json('http://www.example.com/buttons.json');
    assert.deepEqual(res, buttons, 'parsed payload is returned directly');
  });

  test('find_json returns cached json_payload directly', async function(assert) {
    var buttons = [{label: 'sí', board_id: 'board-1', depth: 0}];
    persistenceTarget().find_url = function() {
      return RSVP.resolve({json_payload: buttons});
    };

    var res = await persistence.find_json('http://www.example.com/buttons.json');
    assert.deepEqual(res, buttons, 'cached parsed payload is returned directly');
  });

  test('store_url_now resolves decrypted json when cache storage rejects', async function(assert) {
    var buttons = [{label: 'sí', board_id: 'board-1', depth: 0}];
    var target = persistenceTarget();
    var stashes = this.owner.lookup('service:stashes');

    lingoLinqExtras.set('ready', true);
    if (window.lingoLinqExtras) {
      window.lingoLinqExtras.ready = true;
    }
    stashes.set('auth_settings', {});
    target.set('local_system', {
      available: true,
      allowed: true
    });
    window.symbol_proxy_key = null;
    target.url_cache = {};
    target.url_uncache = {};
    target.find = function() {
      return RSVP.reject({error: 'url not in storage'});
    };
    target.ajax = function() {
      return RSVP.resolve({
        content_type: 'application/json',
        data: 'data:application/json;base64,' + btoa('aes256-payload')
      });
    };
    target.decrypt_json = function() {
      return RSVP.resolve(buttons);
    };
    target.store = function() {
      return RSVP.reject({error: 'rejected'});
    };

    var res = await persistence.store_url_now('http://www.example.com/buttons.json', 'json', {iv: 'iv'});
    assert.deepEqual(res.json_payload, buttons, 'parsed payload survives cache rejection');
  });
});
