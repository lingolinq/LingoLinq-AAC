import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import { run, later } from '@ember/runloop';
import RSVP from 'rsvp';
import boardDetailCache from 'frontend/utils/board_detail_cache';
import { stubPersistenceAjax } from '../../helpers/persistence-stub';

function waitForOverlayHidden(appState, timeoutMs) {
  timeoutMs = timeoutMs || 5000;
  return new RSVP.Promise(function(resolve, reject) {
    var start = Date.now();
    function tick() {
      if (appState.get('loading_overlay_message') === null) {
        resolve();
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        reject(new Error('loading overlay did not hide within ' + timeoutMs + 'ms'));
        return;
      }
      later(tick, 10);
    }
    run(tick);
  });
}

module('Unit | loading overlay and board cache', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this._restorePersistenceAjax = stubPersistenceAjax(function() {
      return RSVP.reject({ error: 'offline in test' });
    });
  });

  hooks.afterEach(function() {
    if(this._restorePersistenceAjax) {
      this._restorePersistenceAjax();
    }
  });

  test('show and hide loading overlay do not read or write boardDetailCache', async function(assert) {
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
      appState.show_loading_overlay('Loading board...', { min_ms: 0 });
      appState.hide_loading_overlay();
    });
    await waitForOverlayHidden(appState);

    boardDetailCache.get = origGet;
    boardDetailCache.set = origSet;
    assert.equal(getCalls, 0, 'overlay show/hide does not call cache get');
    assert.equal(setCalls, 0, 'overlay show/hide does not call cache set');
    assert.ok(boardDetailCache.get('user/board-a'), 'cache entry survives overlay lifecycle');
  });

  test('show_loading_overlay accepts shorter min_ms for cache-hit navigation', async function(assert) {
    var appState = this.owner.lookup('service:app-state');
    run(function() {
      appState.show_loading_overlay('Loading board...', { min_ms: 0 });
    });
    assert.equal(appState._loading_overlay_min_ms, 0, 'stores per-show minimum until hide completes');
    run(function() {
      appState.hide_loading_overlay();
    });
    await waitForOverlayHidden(appState);
    assert.strictEqual(appState._loading_overlay_min_ms, null, 'clears per-show minimum after hide');
    assert.strictEqual(appState.get('loading_overlay_message'), null, 'clears overlay message');
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
