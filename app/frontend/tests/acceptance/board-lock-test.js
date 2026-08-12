// Regression test for the board lock ("Stay on this Board").
//
// The lock is a supervisor SAFETY feature: it exists so a communicator stays on
// the board their therapist put them on. It is enforced in board-detail's own
// navigation actions, and it had silently drifted to covering only 2 of that
// page's ~12 exits — `go_back` checked it on the hierarchical-parent fallback
// but NOT on the ordinary in-session Back (which transitions and returns before
// the check), and `go_home` never checked it at all. The toggle looked engaged
// and the warning text worked, so the gap was invisible.
//
// These tests pin the ordering. They drive the real controller actions through
// a real route transition, so a future exit added without consulting
// `board_lock_blocks_exit()` fails here.
import { setupApplicationTest } from 'ember-qunit';
import { setupMirage } from 'ember-cli-mirage/test-support';
import { visit, currentURL, settled } from '@ember/test-helpers';
import * as QUnit from 'qunit';

function makeBoard(server, key, name) {
  server.create('board', {
    key: key,
    name: name,
    user_name: key.split('/')[0],
    buttons: [],
    grid: { rows: 1, columns: 1, order: [[null]] },
    permissions: { view: true, edit: true }
  });
}

QUnit.module('Acceptance | board lock', function(hooks) {
  setupApplicationTest(hooks);
  setupMirage(hooks);

  hooks.beforeEach(function() {
    this.server.create('user', { user_name: 'tester' });
    makeBoard(this.server, 'tester/alpha', 'Alpha');
    makeBoard(this.server, 'tester/beta', 'Beta');
  });

  hooks.afterEach(function() {
    // The lock is a PERSISTED stash — leaking it would lock every later test out
    // of navigation, which is exactly how it traps a real user.
    var stashes = this.owner.lookup('service:stashes');
    if (stashes) { stashes.persist('sticky_board', false); }
  });

  QUnit.test('Back is blocked while locked — including the in-session history path', async function(assert) {
    // 120s: this test boots board-detail TWICE (alpha, then beta after the
    // unlocked Back), and a single boot costs ~30s in the test harness. See the
    // working log — the per-visit cost is a known follow-up, not a hang.
    assert.timeout(120000);
    await visit('/tester/board-detail/alpha');

    var controller = this.owner.lookup('controller:user/board-detail');
    var appState = this.owner.lookup('service:app-state');
    var stashes = this.owner.lookup('service:stashes');

    // Give Back somewhere to go. This is the branch that used to transition and
    // return BEFORE the lock was consulted — the lock's open front door.
    appState.set('board_detail_nav_history', [{ user_name: 'tester', boardname: 'beta' }]);

    stashes.persist('sticky_board', true);
    controller.send('go_back');
    await settled();
    assert.strictEqual(currentURL(), '/tester/board-detail/alpha',
      'locked: Back does not leave the board even with in-session history');

    stashes.persist('sticky_board', false);
    controller.send('go_back');
    await settled();
    assert.strictEqual(currentURL(), '/tester/board-detail/beta',
      'unlocked: Back navigates normally');
  });

  QUnit.test('Home is blocked while locked', async function(assert) {
    assert.timeout(60000);
    await visit('/tester/board-detail/alpha');

    var controller = this.owner.lookup('controller:user/board-detail');
    var stashes = this.owner.lookup('service:stashes');

    stashes.persist('sticky_board', true);
    controller.send('go_home');
    await settled();
    assert.strictEqual(currentURL(), '/tester/board-detail/alpha',
      'locked: Home does not leave the board');
  });

  QUnit.test('the guard is one shared decision, and editing is the deliberate escape',
    async function(assert) {
      assert.timeout(60000);
      await visit('/tester/board-detail/alpha');

      var controller = this.owner.lookup('controller:user/board-detail');
      var stashes = this.owner.lookup('service:stashes');

      assert.strictEqual(typeof controller.board_lock_blocks_exit, 'function',
        'every exit routes through one guard rather than an inline copy');

      stashes.persist('sticky_board', false);
      assert.false(controller.board_lock_blocks_exit(), 'unlocked: exits allowed');

      stashes.persist('sticky_board', true);
      assert.true(controller.board_lock_blocks_exit(), 'locked: exits blocked');

      // Edit mode is how a supervisor gets out; if this ever returns true the
      // lock has become a trap with no escape.
      controller.set('edit_mode', true);
      assert.false(controller.board_lock_blocks_exit(),
        'locked but editing: exits allowed — editing is the deliberate escape');
      controller.set('edit_mode', false);
    });
});
