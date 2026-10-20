import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { backgroundBoardPrefetchEnabled } from 'frontend/utils/board_prefetch_planner';
import { standInGlobals } from 'frontend/tests/helpers/stand-in-globals';
import RSVP from 'rsvp';
import boardDetailCache from 'frontend/utils/board_detail_cache';

/*
 * The background board prefetch is a fire-and-forget chain that re-reads the app's flags at each
 * step. When its app is torn down mid-chain (tests), it must read the flag as off and stop, not keep
 * running against the destroyed app-state.
 */
module('Unit | Utility | board prefetch after its app is gone', function(hooks) {
  standInGlobals(hooks, {
    appState: () => EmberObject.create({ feature_flags: { background_board_prefetch: true } }),
    persistence: () => ({
      online: true,
      requested: [],
      get(key) { return key === 'online' ? true : null; },
      ajax(url) { this.requested.push(url); return RSVP.reject({ error: 'offline in test' }); }
    })
  });

  test('the flag follows a live app-state and reads off once it is destroyed', function(assert) {
    assert.expect(2);
    assert.true(backgroundBoardPrefetchEnabled(null), 'on while the app-state is live');
    this.standIns.appState.destroy(); // sets isDestroying at once
    assert.false(backgroundBoardPrefetchEnabled(null), 'off once the app-state is destroyed');
  });

  // The chain belongs to the app whose user change started it; once that app is gone it must not
  // keep fetching (in tests it would fetch during whichever test runs next).
  test('a prefetch chain fetches for a live app and stops for a destroyed one', async function(assert) {
    assert.expect(2);
    const requested = this.standIns.persistence.requested;
    const user = (id, key) => EmberObject.create({ id, preferences: { home_board: { key } } });
    const trees = () => requested.filter((url) => /\/tree/.test(url));

    await boardDetailCache._run_prefetch_pipeline(user('dead-app-live', 'live/home'), {}, { app: this.standIns.appState, gapMs: 0 });
    assert.true(trees().some((url) => url.indexOf('/api/v1/boards/live/home/tree') === 0), `a live app's chain fetches its board: ${trees().join(', ')}`);

    requested.length = 0;
    const deadApp = EmberObject.create({});
    deadApp.destroy(); // sets isDestroying at once
    await boardDetailCache._run_prefetch_pipeline(user('dead-app-gone', 'gone/home'), {}, { app: deadApp, gapMs: 0 });
    assert.deepEqual(trees(), [], 'a destroyed app\'s chain fetches nothing');
  });
});
