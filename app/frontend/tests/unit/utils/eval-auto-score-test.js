import { module, test } from 'qunit';
import auto_score from 'frontend/utils/eval_auto_score';

module('Unit | Utility | eval_auto_score', function() {
  test('isObservationKind covers attention, joint_attention, and the choice_probe family', function(assert) {
    ['attention', 'joint_attention', 'preferred_object', 'preferred_activity', 'reject', 'request_more']
      .forEach(function(k) {
        assert.true(auto_score.isObservationKind(k), `${k} is observation`);
      });
    ['choice', 'match', 'cause_effect', 'access_snapshot'].forEach(function(k) {
      assert.false(auto_score.isObservationKind(k), `${k} is NOT observation`);
    });
  });

  test('isAutoScorable: true for choice/match/etc, false for observation kinds and items with observe:true', function(assert) {
    assert.true(auto_score.isAutoScorable({ kind: 'choice' }));
    assert.true(auto_score.isAutoScorable({ kind: 'match' }));
    assert.true(auto_score.isAutoScorable({ kind: 'cause_effect' }));
    assert.true(auto_score.isAutoScorable({ kind: 'access_snapshot' }));
    assert.false(auto_score.isAutoScorable({ kind: 'attention' }));
    assert.false(auto_score.isAutoScorable({ kind: 'preferred_object' }));
    assert.false(auto_score.isAutoScorable({ kind: 'choice', observe: true }));
    assert.false(auto_score.isAutoScorable(null));
    assert.false(auto_score.isAutoScorable({}));
  });

  test('judge: choice/match returns correct when picked.is_target', function(assert) {
    const item = { kind: 'choice', options: [{ label: 'A', is_target: true }, { label: 'B', is_target: false }] };
    assert.strictEqual(auto_score.judge(item, { picked: item.options[0] }), 'correct');
    assert.strictEqual(auto_score.judge(item, { picked: item.options[1] }), 'incorrect');
    assert.strictEqual(auto_score.judge(item, { picked: null }), 'no_response');
  });

  test('judge: cause_effect treats any tap as correct, no input as no_response', function(assert) {
    const item = { kind: 'cause_effect' };
    assert.strictEqual(auto_score.judge(item, { picked: { label: 'go' } }), 'correct');
    assert.strictEqual(auto_score.judge(item, { picked_index: 0 }), 'correct');
    assert.strictEqual(auto_score.judge(item, {}), 'no_response');
  });

  test('judge: access_snapshot compares picked_index to item.target', function(assert) {
    const item = { kind: 'access_snapshot', grid: [3, 3], target: 4 };
    assert.strictEqual(auto_score.judge(item, { picked_index: 4 }), 'correct');
    assert.strictEqual(auto_score.judge(item, { picked_index: 0 }), 'incorrect');
    assert.strictEqual(auto_score.judge(item, {}), 'no_response');
  });

  test('judge: syntax/sequencing requires the right ordered labels', function(assert) {
    const item = {
      kind: 'syntax',
      options: [
        { label: 'More',  sequence: 1 },
        { label: 'Drink', sequence: 2 },
        { label: 'Big',   distractor: true }
      ]
    };
    assert.strictEqual(auto_score.judge(item, { sequence: ['More', 'Drink'] }), 'correct');
    assert.strictEqual(auto_score.judge(item, { sequence: ['Drink', 'More'] }), 'incorrect');
    assert.strictEqual(auto_score.judge(item, { sequence: ['More'] }), 'incorrect');
    assert.strictEqual(auto_score.judge(item, { sequence: ['More', 'Drink', 'Big'] }), 'incorrect');
  });

  test('judge: returns null for non-auto-scorable items so the runner can fall back to manual scoring', function(assert) {
    assert.strictEqual(auto_score.judge({ kind: 'attention' }, { picked: null }), null);
    assert.strictEqual(auto_score.judge({ kind: 'choice', observe: true }, { picked: null }), null);
  });

  test('buildEvent: produces the same shape eval_recommend consumes', function(assert) {
    const item = { id: 'pe_lib_01', kind: 'library_compare', word: 'eat', library: 'a' };
    const event = auto_score.buildEvent(
      'library_compare',
      item,
      { picked: { label: 'eat', is_target: true }, latency_ms: 1200, access_method: 'touch' },
      'correct'
    );
    assert.deepEqual(event, {
      subtest: 'library_compare',
      item_id: 'pe_lib_01',
      response: 'correct',
      latency_ms: 1200,
      access_method: 'touch',
      library: 'a'
    });
  });

  test('buildEvent: includes grid + hit_pos + target_pos for access items', function(assert) {
    const item = { id: 'pe_access_03', kind: 'access_snapshot', grid: [3, 3], target: 7 };
    const event = auto_score.buildEvent(
      'access_snapshot',
      item,
      { picked_index: 7, hit_pos: [7, 0], target_pos: [7, 0], latency_ms: 980, access_method: 'touch' },
      'correct'
    );
    assert.strictEqual(event.subtest, 'access_snapshot');
    assert.strictEqual(event.response, 'correct');
    assert.deepEqual(event.grid, [3, 3]);
    assert.deepEqual(event.hit_pos, [7, 0]);
    assert.deepEqual(event.target_pos, [7, 0]);
    assert.strictEqual(event.access_method, 'touch');
  });
});
