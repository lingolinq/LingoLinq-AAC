import { module, test } from 'qunit';
import boardKeyFromInput from 'frontend/utils/board-key-from-input';

module('Unit | Utility | board-key-from-input', function() {
  test('returns a trimmed owner/key unchanged', function(assert) {
    assert.strictEqual(boardKeyFromInput('  lingolinq/vocal-flair-84-questions  '), 'lingolinq/vocal-flair-84-questions');
  });

  test('extracts owner/key from a same-host board URL', function(assert) {
    assert.strictEqual(
      boardKeyFromInput('http://127.0.0.1:8184/lingolinq/vocal-flair-84-questions'),
      'lingolinq/vocal-flair-84-questions'
    );
  });

  test('extracts owner/key from a different-host board URL', function(assert) {
    assert.strictEqual(
      boardKeyFromInput('https://app.lingolinq.com/lingolinq/vocal-flair-84-questions'),
      'lingolinq/vocal-flair-84-questions'
    );
  });

  test('drops query and hash from a pasted URL', function(assert) {
    assert.strictEqual(
      boardKeyFromInput('https://app.lingolinq.com/lingolinq/vocal-flair-84-questions?locale=en#top'),
      'lingolinq/vocal-flair-84-questions'
    );
  });

  test('keeps a bare search term that is not an owner/key', function(assert) {
    assert.strictEqual(boardKeyFromInput('questions'), 'questions');
  });

  test('returns empty string for blank input', function(assert) {
    assert.strictEqual(boardKeyFromInput(''), '');
    assert.strictEqual(boardKeyFromInput(null), '');
  });
});
