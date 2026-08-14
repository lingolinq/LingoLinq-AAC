import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { boardAttributionOwner } from 'frontend/utils/board_attribution';

function makeBoard(attrs) {
  return EmberObject.create(attrs || {});
}

module('Unit | Utility | board attribution', function() {
  test('maps lingolinq publisher boards to OpenAAC', function(assert) {
    var board = makeBoard({ key: 'lingolinq/quick-core-60', user_name: 'lingolinq' });
    assert.strictEqual(boardAttributionOwner(board), 'OpenAAC');
  });

  test('prefers user_name for owned copies of library boards', function(assert) {
    var board = makeBoard({ key: 'tracitest/quick-core-60', user_name: 'tracitest' });
    assert.strictEqual(boardAttributionOwner(board), 'tracitest');
  });

  test('falls back to key owner slug when user_name is missing', function(assert) {
    var board = makeBoard({ key: 'otheruser/custom-board' });
    assert.strictEqual(boardAttributionOwner(board), 'otheruser');
  });

  test('returns empty string for missing board', function(assert) {
    assert.strictEqual(boardAttributionOwner(null), '');
  });
});
