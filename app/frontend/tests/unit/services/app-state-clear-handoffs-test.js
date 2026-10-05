import { module, test } from 'qunit';
import { setupTest } from '../../helpers';

/* SIGNING OUT CLEARS THE BASIC HANDOFFS (2026-10-01; adversarial review M5).
 * `clear_user_state` resets per-user app state on logout. With the in-app logout
 * (`auth_spa_transition`), the Basic Try marker (`basic_try_home`, which names the communicator a
 * board was tried for) and the home-page handoffs survived, so the next person on a shared device
 * could see "Set as Home Board for <them>", and a leftover `pending_index_nav` made their sign-in
 * count as not a login.
 */
module('Unit | Service | app-state clear_user_state handoffs', function(hooks) {
  setupTest(hooks);

  test('the Try marker and the three handoffs are cleared', function(assert) {
    var appState = this.owner.lookup('service:app-state');
    appState.setProperties({
      basic_try_home: { key: 'x/y', user_id: '1_7', user_name: 'aiden_parker' },
      pending_index_nav: 'supervisees',
      pending_open_extras: true,
      pending_open_supervisee: 'aiden_parker'
    });
    try { appState.clear_user_state(); } catch (e) { /* unrelated teardown in a bare test owner */ }
    assert.notOk(appState.get('basic_try_home'), 'Try marker');
    assert.notOk(appState.get('pending_index_nav'), 'tab handoff');
    assert.notOk(appState.get('pending_open_extras'), 'Extras handoff');
    assert.notOk(appState.get('pending_open_supervisee'), 'communicator handoff');
  });
});
