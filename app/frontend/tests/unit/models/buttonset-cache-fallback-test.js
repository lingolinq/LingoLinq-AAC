import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import RSVP from 'rsvp';

module('Unit | Model | buttonset cache fallback', function(hooks) {
  setupTest(hooks);

  test('load_buttons uses remote_json when cache save fails after local miss', async function(assert) {
    var store = this.owner.lookup('service:store');
    var buttons = [{label: 'hola', depth: 0, board_id: 'board-1'}];
    var bs = store.createRecord('buttonset', {
      id: 'board-1',
      root_url: 'http://www.example.com/buttons.json',
      full_set_revision: 'abc',
      buttons_loaded: false
    });
    var originalFindJson = bs.persistence.find_json;
    var originalStoreJson = bs.persistence.store_json;
    var originalAjax = bs.persistence.ajax;
    var originalRemoteJson = bs.persistence.remote_json;
    var remoteCalls = 0;

    bs.persistence.find_json = function() {
      return RSVP.reject({error: 'url not in storage'});
    };
    bs.persistence.store_json = function() {
      return RSVP.reject({error: 'saving to data cache failed'});
    };
    bs.persistence.ajax = function() {
      return RSVP.reject({error: 'generate unavailable'});
    };
    bs.persistence.remote_json = function(url) {
      remoteCalls++;
      assert.strictEqual(url, 'http://www.example.com/buttons.json', 'uses current root_url');
      return RSVP.resolve(buttons);
    };

    try {
      var result = await bs.load_buttons();
      assert.strictEqual(result, bs, 'load resolves with buttonset');
      assert.strictEqual(remoteCalls, 1, 'remote_json fallback is used once');
      assert.deepEqual(bs.get('buttons'), buttons, 'remote buttons are processed');
      assert.strictEqual(bs.get('buttons_loaded'), true, 'buttonset is marked loaded');
    } finally {
      bs.persistence.find_json = originalFindJson;
      bs.persistence.store_json = originalStoreJson;
      bs.persistence.ajax = originalAjax;
      bs.persistence.remote_json = originalRemoteJson;
    }
  });
});
