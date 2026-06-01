import { module, test } from 'qunit';
import RSVP from 'rsvp';
import persistence from 'frontend/utils/persistence';
import lingoLinqExtras from 'frontend/utils/extras';
import stashes from 'frontend/utils/_stashes';

module('Unit | Utility | persistence json payload cache', function(hooks) {
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
    originalStoreUrl = persistence.store_url;
    originalFindUrl = persistence.find_url;
    originalFind = persistence.find;
    originalAjax = persistence.ajax;
    originalDecryptJson = persistence.decrypt_json;
    originalStore = persistence.store;
    originalReady = lingoLinqExtras.get('ready');
    originalLocalSystem = persistence.get('local_system');
    originalSymbolProxyKey = window.symbol_proxy_key;
  });

  hooks.afterEach(function() {
    persistence.store_url = originalStoreUrl;
    persistence.find_url = originalFindUrl;
    persistence.find = originalFind;
    persistence.ajax = originalAjax;
    persistence.decrypt_json = originalDecryptJson;
    persistence.store = originalStore;
    lingoLinqExtras.set('ready', originalReady);
    persistence.set('local_system', originalLocalSystem);
    window.symbol_proxy_key = originalSymbolProxyKey;
    stashes.set('auth_settings', null);
    persistence.url_cache = {};
    persistence.url_uncache = {};
  });

  test('store_json returns json_payload without data_uri parsing', function(assert) {
    var done = assert.async();
    var buttons = [{label: 'sí', board_id: 'board-1', depth: 0}];
    persistence.store_url = function() {
      return RSVP.resolve({
        url: 'http://www.example.com/buttons.json',
        type: 'json',
        json_payload: buttons
      });
    };

    persistence.store_json('http://www.example.com/buttons.json').then(function(res) {
      assert.deepEqual(res, buttons, 'parsed payload is returned directly');
      done();
    }, function(err) {
      assert.ok(false, 'store_json rejected: ' + ((err && err.error) || err));
      done();
    });
  });

  test('find_json returns cached json_payload directly', function(assert) {
    var done = assert.async();
    var buttons = [{label: 'sí', board_id: 'board-1', depth: 0}];
    persistence.find_url = function() {
      return RSVP.resolve({json_payload: buttons});
    };

    persistence.find_json('http://www.example.com/buttons.json').then(function(res) {
      assert.deepEqual(res, buttons, 'cached parsed payload is returned directly');
      done();
    }, function(err) {
      assert.ok(false, 'find_json rejected: ' + ((err && err.error) || err));
      done();
    });
  });

  test('store_url_now resolves decrypted json when cache storage rejects', function(assert) {
    var done = assert.async();
    var buttons = [{label: 'sí', board_id: 'board-1', depth: 0}];

    lingoLinqExtras.set('ready', true);
    stashes.set('auth_settings', {});
    persistence.set('local_system', {
      available: true,
      allowed: true
    });
    window.symbol_proxy_key = null;
    persistence.url_cache = {};
    persistence.url_uncache = {};
    persistence.find = function() {
      return RSVP.reject({error: 'url not in storage'});
    };
    persistence.ajax = function() {
      return RSVP.resolve({
        content_type: 'application/json',
        data: 'data:application/json;base64,' + btoa('aes256-payload')
      });
    };
    persistence.decrypt_json = function() {
      return RSVP.resolve(buttons);
    };
    persistence.store = function() {
      return RSVP.reject({error: 'rejected'});
    };

    persistence.store_url_now('http://www.example.com/buttons.json', 'json', {iv: 'iv'}).then(function(res) {
      assert.deepEqual(res.json_payload, buttons, 'parsed payload survives cache rejection');
      done();
    }, function(err) {
      assert.ok(false, 'store_url_now rejected: ' + ((err && err.error) || err));
      done();
    });
  });
});
