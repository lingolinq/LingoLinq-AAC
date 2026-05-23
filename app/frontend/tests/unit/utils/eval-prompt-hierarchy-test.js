import { module, test } from 'qunit';
import prompt_hierarchy from 'frontend/utils/eval_prompt_hierarchy';

module('Unit | Utility | eval_prompt_hierarchy', function() {
  test('PROMPT_LEVELS has 6 entries ordered independent → full_prompt', function(assert) {
    assert.strictEqual(prompt_hierarchy.PROMPT_LEVELS.length, 6);
    const ids = prompt_hierarchy.PROMPT_LEVELS.map(function(l) { return l.id; });
    assert.deepEqual(ids, ['independent', 'expectant_pause', 'verbal_model', 'gestural_cue', 'partial_highlight', 'full_prompt']);
  });

  test('levelScore maps id to its 1-6 index', function(assert) {
    assert.strictEqual(prompt_hierarchy.levelScore('independent'), 1);
    assert.strictEqual(prompt_hierarchy.levelScore('full_prompt'), 6);
    assert.strictEqual(prompt_hierarchy.levelScore('nonsense'), null);
  });

  test('initialItemState seeds at level 0 with empty history', function(assert) {
    const s = prompt_hierarchy.initialItemState('da_01');
    assert.strictEqual(s.level_index, 0);
    assert.deepEqual(s.attempts, []);
    assert.strictEqual(s.score, null);
    assert.false(s.resolved);
  });

  test('advanceItem on success locks in the current level as the score', function(assert) {
    const s0 = prompt_hierarchy.initialItemState('da_01');
    const s1 = prompt_hierarchy.advanceItem(s0, { succeeded: true });
    assert.true(s1.resolved);
    assert.strictEqual(s1.score, 1, 'scored at the independent level');
    assert.strictEqual(s1.attempts.length, 1);
  });

  test('advanceItem on failure escalates to the next level', function(assert) {
    const s0 = prompt_hierarchy.initialItemState('da_01');
    const s1 = prompt_hierarchy.advanceItem(s0, { succeeded: false });
    assert.false(s1.resolved);
    assert.strictEqual(s1.level_index, 1, 'climbed to expectant_pause');
    assert.strictEqual(s1.attempts.length, 1);
  });

  test('advanceItem at the top level locks in null score on failure', function(assert) {
    let s = prompt_hierarchy.initialItemState('da_01');
    for (let i = 0; i < 6; i++) {
      s = prompt_hierarchy.advanceItem(s, { succeeded: false });
    }
    assert.true(s.resolved, 'resolved after exhausting hierarchy');
    assert.strictEqual(s.score, null, 'no learning at any level');
    assert.strictEqual(s.attempts.length, 6);
  });

  test('summarizeDynamicAssessment buckets scores into independence / supported / not_yet', function(assert) {
    const items = [
      { score: 1 },          // independence
      { score: 2 },          // independence
      { score: 4 },          // supported
      { score: 5 },          // supported
      { score: null }        // not_yet
    ];
    const summary = prompt_hierarchy.summarizeDynamicAssessment(items);
    assert.strictEqual(summary.trial_count, 5);
    assert.strictEqual(summary.independence_pct, 40);
    assert.strictEqual(summary.supported_pct, 40);
    assert.strictEqual(summary.not_yet_pct, 20);
    assert.strictEqual(summary.independence_avg, 3, 'mean of resolved scores: (1+2+4+5)/4');
  });

  test('summarizeDynamicAssessment with no items returns zeros', function(assert) {
    const summary = prompt_hierarchy.summarizeDynamicAssessment([]);
    assert.strictEqual(summary.trial_count, 0);
    assert.strictEqual(summary.independence_pct, 0);
    assert.strictEqual(summary.independence_avg, null);
  });
});
