import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import { run } from '@ember/runloop';
import boardDetailCache from 'frontend/utils/board_detail_cache';

module('Unit | loading overlay and board cache', function(hooks) {
  setupTest(hooks);

  test('show and hide loading overlay do not read or write boardDetailCache', function(assert) {
    boardDetailCache.clear();
    boardDetailCache.set({ key: 'user/board-a', id: '1_1', buttons: [] });
    var getCalls = 0;
    var setCalls = 0;
    var origGet = boardDetailCache.get;
    var origSet = boardDetailCache.set;
    boardDetailCache.get = function() {
      getCalls++;
      return origGet.apply(this, arguments);
    };
    boardDetailCache.set = function() {
      setCalls++;
      return origSet.apply(this, arguments);
    };

    var appState = this.owner.lookup('service:app-state');
    run(function() {
      appState.show_loading_overlay('Loading board...');
      appState.hide_loading_overlay();
    });

    boardDetailCache.get = origGet;
    boardDetailCache.set = origSet;
    assert.equal(getCalls, 0, 'overlay show/hide does not call cache get');
    assert.equal(setCalls, 0, 'overlay show/hide does not call cache set');
    assert.ok(boardDetailCache.get('user/board-a'), 'cache entry survives overlay lifecycle');
  });

  test('show_loading_overlay accepts shorter min_ms for cache-hit navigation', function(assert) {
    var appState = this.owner.lookup('service:app-state');
    run(function() {
      appState.show_loading_overlay('Loading board...', { min_ms: 0 });
      appState.hide_loading_overlay();
    });
    assert.equal(appState._loading_overlay_min_ms, 0, 'stores per-show minimum until hide completes');
    run(function() {
      assert.strictEqual(appState._loading_overlay_min_ms, null, 'clears per-show minimum after hide');
      assert.strictEqual(appState.get('loading_overlay_message'), null, 'clears overlay message');
    });
  });

  test('clear_user_state wipes boardDetailCache', function(assert) {
    boardDetailCache.clear();
    boardDetailCache.set({ key: 'user/board-a', id: '1_1', buttons: [] });
    assert.ok(boardDetailCache.get('user/board-a'), 'precondition: cache populated');

    var appState = this.owner.lookup('service:app-state');
    run(function() {
      appState.clear_user_state();
    });

    assert.notOk(boardDetailCache.get('user/board-a'), 'clear_user_state empties boardDetailCache');
  });
});
