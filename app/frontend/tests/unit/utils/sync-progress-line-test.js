import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import { sync_progress_line } from 'frontend/utils/sync_progress';

/* THE SYNC'S PROGRESS LINE SAYS WHAT HAS HAPPENED, NOT A TOTAL IT CANNOT KNOW (item 8, PR #1268).
 * "12 / 40 boards" used a total that grows as linked boards are found and can shrink, so it was wrong most of the
 * time; Modern view showed nothing at all. The line now reads "Saved so far: 12 boards", with the number that had
 * a problem when there is one.
 */
module('Unit | Utility | sync progress line', function(hooks) {
  setupTest(hooks);

  test('before anything is counted it says the sync is starting', function(assert) {
    assert.strictEqual(sync_progress_line(null), 'initializing...');
    assert.strictEqual(sync_progress_line({ root_user: '1_1' }), 'initializing...');
  });

  test('counts the boards saved so far, with no total', function(assert) {
    assert.strictEqual(sync_progress_line({ visited: 12, to_visit: 28, total: 40, errored: 0 }), 'Saved so far: 12 boards.');
    assert.strictEqual(sync_progress_line({ visited: 1, total: 9, errored: 0 }), 'Saved so far: 1 board.');
    assert.strictEqual(sync_progress_line({ visited: 0, total: 9 }), 'Saved so far: 0 boards.');
  });

  test('problems are reported beside the count, not subtracted from it', function(assert) {
    // The problem count also holds boards the sync could not fetch at all, which were never visited, so
    // subtracting it would undercount: 3 saved plus 5 unreachable links must not read "0 boards".
    assert.strictEqual(sync_progress_line({ visited: 12, errored: 2 }), 'Saved so far: 12 boards. 2 with a problem.');
    assert.strictEqual(sync_progress_line({ visited: 3, errored: 5 }), 'Saved so far: 3 boards. 5 with a problem.');
  });

  test('through the service\'s own tally', function(assert) {
    assert.expect(1);
    var persistence = this.owner.lookup('service:persistence');
    var prior = persistence.get('sync_progress');
    try {
      persistence.set('sync_progress', { root_user: '1_1', progress_for: {
        '1_1': { visited: 3, to_visit: 2, board_errors: [{}, {}, {}, {}, {}] },
        '1_2': { visited: 4, to_visit: 0, board_errors: [] }
      } });
      persistence.update_sync_progress();
      assert.strictEqual(sync_progress_line(persistence.get('sync_progress')), 'Saved so far: 7 boards. 5 with a problem.');
    } finally {
      persistence.set('sync_progress', prior);
    }
  });
});
