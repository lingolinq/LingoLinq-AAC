import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

/* ONLY THE LATEST TAP OPENS A BOARD (review of #1268, 2026-11-13).
 *
 * Offline, jump_to_board first checks that the board is on the device (utils/board_device_copy.js#board_saved_here,
 * a database read of up to DEVICE_READ_WAIT_MS), and only the latest tap may go ahead once it answers. Online it jumps
 * at once. The online branch did not count as the latest tap, so an offline tap whose check was still running when the
 * connection came back, followed by a second tap, opened the first board after the second one.
 *
 * app-state gets a stand-in persistence: toggling the real service's `online` runs app-wide observers (board
 * prefetch, image retries) whose work outlives the test. */
module('Unit | Service | app-state jump_to_board: only the latest tap', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.svc = this.owner.lookup('service:app-state');
    this.prior = { sessionUser: this.svc.get('sessionUser') };
    this.jumps = [];
    var jumps = this.jumps;
    stub(this.svc, '_jump_to_board', function(state) { jumps.push(state.key); });
    this.svc.set('sessionUser', EmberObject.create({ user_name: 'me', preferences: {} }));
  });
  hooks.afterEach(function() {
    this.svc.set('sessionUser', this.prior.sessionUser);
    restoreStubs();
  });

  function standIn(svc, find) {
    var persistence = EmberObject.create({ online: false, find: find });
    stub(svc, 'persistence', persistence);
    return persistence;
  }

  test('an offline tap whose check answers after the connection returned and a second tap does not open its board', async function(assert) {
    var read = RSVP.defer();
    var persistence = standIn(this.svc, function() { return read.promise; });
    var first = this.svc.jump_to_board({ id: '1_1', key: 'me/one' });
    persistence.set('online', true);
    this.svc.jump_to_board({ id: '1_2', key: 'me/two' });
    read.resolve({ id: '1_1', key: 'me/one', buttons: [] });
    await first;
    assert.deepEqual(this.jumps, ['me/two'], 'only the latest tap opened a board');
  });

  test('offline, a saved board still opens', async function(assert) {
    standIn(this.svc, function() { return RSVP.resolve({ id: '1_1', key: 'me/one', buttons: [] }); });
    await this.svc.jump_to_board({ id: '1_1', key: 'me/one' });
    assert.deepEqual(this.jumps, ['me/one']);
  });
});
