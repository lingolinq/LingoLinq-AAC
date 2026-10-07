import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { backgroundBoardPrefetchEnabled } from 'frontend/utils/board_prefetch_planner';
import { standInGlobals } from 'frontend/tests/helpers/stand-in-globals';

/*
 * The background board prefetch is a fire-and-forget chain that re-reads the app's flags at each
 * step. When its app is torn down mid-chain (tests), it must read the flag as off and stop, not keep
 * running against the destroyed app-state.
 */
module('Unit | Utility | board prefetch after its app is gone', function(hooks) {
  standInGlobals(hooks, {
    appState: () => EmberObject.create({ feature_flags: { background_board_prefetch: true } })
  });

  test('the flag follows a live app-state and reads off once it is destroyed', function(assert) {
    assert.expect(2);
    assert.true(backgroundBoardPrefetchEnabled(null), 'on while the app-state is live');
    this.standIns.appState.destroy(); // sets isDestroying at once
    assert.false(backgroundBoardPrefetchEnabled(null), 'off once the app-state is destroyed');
  });
});
