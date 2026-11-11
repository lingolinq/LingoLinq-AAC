import { module, test } from 'qunit';
import { sync_progress_line } from 'frontend/utils/sync_progress';

/* THE SYNC'S PROGRESS LINE SAYS WHAT HAS HAPPENED, NOT A TOTAL IT CANNOT KNOW (item 8, PR #1268).
 * "12 / 40 boards" used a total that grows as linked boards are found and can shrink, so it was wrong most of the
 * time; Modern view showed nothing at all. The line now reads "Saved so far: 12 boards", with the number that had
 * a problem when there is one.
 */
module('Unit | Utility | sync progress line', function() {
  test('before anything is counted it says the sync is starting', function(assert) {
    assert.strictEqual(sync_progress_line(null), 'initializing...');
    assert.strictEqual(sync_progress_line({ root_user: '1_1' }), 'initializing...');
  });

  test('counts the boards saved so far, with no total', function(assert) {
    assert.strictEqual(sync_progress_line({ visited: 12, to_visit: 28, total: 40, errored: 0 }), 'Saved so far: 12 boards');
    assert.strictEqual(sync_progress_line({ visited: 1, total: 9, errored: 0 }), 'Saved so far: 1 board');
    assert.strictEqual(sync_progress_line({ visited: 0, total: 9 }), 'Saved so far: 0 boards');
  });

  test('a board that ended with an error is not counted as saved, and is reported', function(assert) {
    assert.strictEqual(sync_progress_line({ visited: 12, errored: 2 }), 'Saved so far: 10 boards 2 with a problem.');
    assert.strictEqual(sync_progress_line({ visited: 1, errored: 1 }), 'Saved so far: 0 boards 1 with a problem.');
  });
});
