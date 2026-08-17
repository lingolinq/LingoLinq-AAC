import { module, test } from 'qunit';
import RSVP from 'rsvp';
import {
  pos_for_label,
  cached_pos_for_label,
  words_needing_lookup,
  resolve_labels_pos,
  reset_pos_cache
} from 'frontend/utils/parts_of_speech';

// Regression lock for the SHARED label -> part-of-speech resolver. The live board
// (board-detail#resolve_unknown_buttons) and the board-preview canvas both colour
// uncoloured buttons from this one implementation — if they diverge, the preview
// shows a different board than the one the user lands on, which is the bug this
// module was extracted to fix.

function fakeAjax(dictionary, calls) {
  return function(url, opts) {
    var words = (opts.data.words || '').split(',');
    calls.push(words);
    var results = {};
    words.forEach(function(w) {
      if (dictionary[w]) { results[w] = { types: dictionary[w], word: w }; }
    });
    return RSVP.resolve({ results: results });
  };
}

module('Unit | Utility | parts_of_speech resolver', function(hooks) {
  hooks.beforeEach(function() {
    reset_pos_cache();
  });

  hooks.afterEach(function() {
    reset_pos_cache();
  });

  test('pos_for_label picks the AAC type for a single word', function(assert) {
    assert.strictEqual(pos_for_label('go', { go: ['noun', 'verb'] }), 'verb');
    assert.strictEqual(pos_for_label('I', { I: ['noun', 'pronoun'] }), 'pronoun');
    // Letters are dictionary nouns — this is why keyboard boards come up peach.
    assert.strictEqual(pos_for_label('w', { w: ['noun'] }), 'noun');
  });

  test('pos_for_label lets a leading verb characterize a phrase', function(assert) {
    var dict = { want: ['verb'], the: ['article'], ball: ['noun'] };
    assert.strictEqual(pos_for_label('want the ball', dict), 'verb');
  });

  test('pos_for_label falls to the last non-weak word in a phrase', function(assert) {
    var dict = { in: ['preposition'], the: ['article'], box: ['noun'] };
    assert.strictEqual(pos_for_label('in the box', dict), 'noun');
  });

  test('pos_for_label returns null for an empty label', function(assert) {
    assert.strictEqual(pos_for_label('', {}), null);
    assert.strictEqual(pos_for_label(null, {}), null);
  });

  test('resolve_labels_pos fetches, maps, and caches', function(assert) {
    assert.expect(4);
    var calls = [];
    var ajax = fakeAjax({ cat: ['noun'], run: ['verb'] }, calls);
    return resolve_labels_pos(['cat', 'run'], ajax, RSVP).then(function(res) {
      assert.strictEqual(res.cat, 'noun');
      assert.strictEqual(res.run, 'verb');
      assert.strictEqual(calls.length, 1, 'one batched request');
      assert.strictEqual(cached_pos_for_label('cat'), 'noun', 'served from cache afterwards');
    });
  });

  test('a second board asks only for the words it adds', function(assert) {
    assert.expect(4);
    var calls = [];
    var ajax = fakeAjax({ cat: ['noun'], run: ['verb'], blue: ['adjective'] }, calls);
    return resolve_labels_pos(['cat', 'run'], ajax, RSVP).then(function() {
      return resolve_labels_pos(['cat', 'blue'], ajax, RSVP).then(function(res) {
        assert.strictEqual(res.cat, 'noun');
        assert.strictEqual(res.blue, 'adjective');
        assert.strictEqual(calls.length, 2);
        assert.deepEqual(calls[1], ['blue'], 'only the unseen word is re-requested');
      });
    });
  });

  test('an unknown word is cached as a miss and never re-requested', function(assert) {
    assert.expect(3);
    var calls = [];
    var ajax = fakeAjax({}, calls);
    return resolve_labels_pos(['zzzz'], ajax, RSVP).then(function(res) {
      assert.strictEqual(res.zzzz, undefined, 'no type, so no entry');
      assert.strictEqual(words_needing_lookup(['zzzz']).length, 0, 'the miss is cached');
      return resolve_labels_pos(['zzzz'], ajax, RSVP).then(function() {
        assert.strictEqual(calls.length, 1, 'no second request');
      });
    });
  });

  test('a failed request resolves with what is known instead of rejecting', function(assert) {
    assert.expect(1);
    var ajax = function() { return RSVP.reject({ error: 'boom' }); };
    return resolve_labels_pos(['cat'], ajax, RSVP).then(function(res) {
      assert.deepEqual(res, {}, 'partial answer, no rejection');
    }, function() {
      assert.ok(false, 'should not reject');
    });
  });

  test('resolve_labels_pos with no ajax resolves from cache alone', function(assert) {
    assert.expect(2);
    var calls = [];
    var ajax = fakeAjax({ cat: ['noun'] }, calls);
    return resolve_labels_pos(['cat'], ajax, RSVP).then(function() {
      return resolve_labels_pos(['cat'], null, RSVP).then(function(res) {
        assert.strictEqual(res.cat, 'noun');
        assert.strictEqual(calls.length, 1);
      });
    });
  });

  test('cached_pos_for_label is null until every word of a label is known', function(assert) {
    assert.expect(3);
    var calls = [];
    var ajax = fakeAjax({ big: ['adjective'] }, calls);
    assert.strictEqual(cached_pos_for_label('big dog'), null);
    return resolve_labels_pos(['big'], ajax, RSVP).then(function() {
      assert.strictEqual(cached_pos_for_label('big dog'), null, 'dog still unknown');
      assert.strictEqual(cached_pos_for_label('big'), 'adjective');
    });
  });
});
