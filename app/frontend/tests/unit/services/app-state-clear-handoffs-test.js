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

  /* FINAL REVIEW (2026-10-13): the trial, picker and tour-offer state added that day is per user too. With the
     in-app logout, the next person on a shared device saw the last user's "Recently tried" chips. */
  test('the trial, picker and tour-offer state is cleared', function(assert) {
    assert.expect(8);
    var appState = this.owner.lookup('service:app-state');
    appState.setProperties({
      board_picker_recent: [{ key: 'aiden_parker/private', name: 'Private' }],
      board_picker_return: { category: 'available_boards', scrollTop: 294 },
      board_picker_category: 'available_boards',
      board_picker_restore: true,
      home_copy_pending: { id: '1_40', key: 'lingolinq/vocal-flair-40' },
      board_alt_tour_pending: 'aiden_parker/vocal-flair-60',
      tour_offer_visible: true,
      tour_offer_user: '1_7'
    });
    try { appState.clear_user_state(); } catch (e) { /* unrelated teardown in a bare test owner */ }
    ['board_picker_recent', 'board_picker_return', 'board_picker_category', 'board_picker_restore', 'home_copy_pending',
      'board_alt_tour_pending', 'tour_offer_visible', 'tour_offer_user'].forEach(function(k) {
      assert.notOk(appState.get(k), k);
    });
  });

  /* SYNC DRAWER (item 8, PR #1268, review of 986559581): the persistence service keeps sync_status after an SPA
     sign-out (session.js calls a persistence.clear_user_state that the service does not define), so a result
     card waiting to be dismissed stayed on the login page, and its Sync Details opened the previous person's log. */
  test('a waiting sync result card is dismissed', function(assert) {
    var appState = this.owner.lookup('service:app-state');
    var persistence = this.owner.lookup('service:persistence');
    var notice = this.owner.lookup('service:sync-notice');
    var saved = { sync_status: persistence.get('sync_status'), root_sync_canceled: persistence.get('root_sync_canceled') };
    persistence.set('root_sync_canceled', false);
    persistence.set('sync_status', 'syncing');
    persistence.set('sync_status', 'failed');
    assert.strictEqual(notice.get('status'), 'done', 'a card was waiting');
    try { appState.clear_user_state(); } catch (e) { /* unrelated teardown in a bare test owner */ }
    assert.strictEqual(notice.get('status'), null, 'the card is gone');
    persistence.set('sync_status', saved.sync_status);
    persistence.set('root_sync_canceled', saved.root_sync_canceled);
  });
});
