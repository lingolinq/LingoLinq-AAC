import { module, test } from 'qunit';
import eval_recommend from 'frontend/utils/eval_recommend';

const PEDS_INTAKE = { age_band: '6-12', etiology: 'autism', current_comm: 'single_symbol', suspected_access: 'touch' };

module('Unit | Utility | eval_recommend', function() {
  test('returns the documented schema with empty events', function(assert) {
    const rec = eval_recommend.fromQuickScreen([], PEDS_INTAKE);
    assert.ok(rec.access_method, 'access_method present');
    assert.ok(rec.grid_size, 'grid_size present');
    assert.ok(rec.vocab_recommendation, 'vocab_recommendation present');
    assert.strictEqual(rec.confidence, 0, 'zero confidence on empty events');
    assert.strictEqual(rec.next_action, 'promote_to_targeted', 'promotes when low confidence');
    assert.ok(rec.starter_board_spec, 'starter_board_spec present');
  });

  test('falls back to intake when no events', function(assert) {
    const rec = eval_recommend.fromQuickScreen([], PEDS_INTAKE);
    assert.strictEqual(rec.access_method, 'touch');
    assert.strictEqual(rec.communicator_stage, 4);
  });

  test('picks the access method with best score', function(assert) {
    const events = [
      { subtest: 'access_snapshot', access_method: 'touch', response: 'correct',   latency_ms: 1500, grid: [3, 3] },
      { subtest: 'access_snapshot', access_method: 'touch', response: 'correct',   latency_ms: 1700, grid: [3, 3] },
      { subtest: 'access_snapshot', access_method: 'gaze',  response: 'incorrect', latency_ms: 4500, grid: [3, 3] },
      { subtest: 'access_snapshot', access_method: 'gaze',  response: 'incorrect', latency_ms: 5000, grid: [3, 3] }
    ];
    const rec = eval_recommend.fromQuickScreen(events, PEDS_INTAKE);
    assert.strictEqual(rec.access_method, 'touch');
  });

  test('picks larger grid when bigger arrays are answered correctly', function(assert) {
    const events = [
      { subtest: 'access_snapshot', response: 'correct', grid: [4, 6], access_method: 'touch', latency_ms: 1200 },
      { subtest: 'access_snapshot', response: 'correct', grid: [4, 6], access_method: 'touch', latency_ms: 1400 }
    ];
    const rec = eval_recommend.fromQuickScreen(events, PEDS_INTAKE);
    assert.strictEqual(rec.grid_size.band, 'large');
  });

  test('picks the library with the highest accuracy', function(assert) {
    const events = [
      { subtest: 'library_compare', library: 'symbolstix', response: 'correct',   latency_ms: 1500 },
      { subtest: 'library_compare', library: 'symbolstix', response: 'correct',   latency_ms: 1300 },
      { subtest: 'library_compare', library: 'pcs',        response: 'incorrect', latency_ms: 2000 },
      { subtest: 'library_compare', library: 'pcs',        response: 'incorrect', latency_ms: 2200 }
    ];
    const rec = eval_recommend.fromQuickScreen(events, PEDS_INTAKE);
    assert.strictEqual(rec.library, 'symbolstix');
  });

  test('flags promotion on low event count', function(assert) {
    const rec = eval_recommend.fromQuickScreen([{ subtest: 'stage_probe', response: 'correct' }], PEDS_INTAKE);
    assert.strictEqual(rec.next_action, 'promote_to_targeted');
    assert.ok(rec.promote_reasons.indexOf('low_event_count') >= 0);
  });

  test('confidence stays in [0, 1]', function(assert) {
    const events = [];
    for (let i = 0; i < 14; i++) {
      events.push({ subtest: 'access_snapshot', response: 'correct', grid: [3, 3], access_method: 'touch', latency_ms: 1500 });
    }
    const rec = eval_recommend.fromQuickScreen(events, PEDS_INTAKE);
    assert.ok(rec.confidence >= 0 && rec.confidence <= 1, 'in range');
  });

  test('profileForIntake routes pre-symbolic to early-comm', function(assert) {
    assert.strictEqual(eval_recommend.profileForIntake({ current_comm: 'pre_symbolic', age_band: '6-12' }), 'early-comm');
  });

  test('profileForIntake routes adult progressive to adult-progressive', function(assert) {
    assert.strictEqual(eval_recommend.profileForIntake({ etiology: 'progressive', age_band: '22-64', current_comm: 'sentence' }), 'adult-progressive');
  });

  test('profileForIntake routes pediatric phrase-level to peds-established', function(assert) {
    assert.strictEqual(eval_recommend.profileForIntake({ current_comm: 'sentence', age_band: '13-21' }), 'peds-established');
  });

  test('profileForIntake falls back to peds-emerging', function(assert) {
    assert.strictEqual(eval_recommend.profileForIntake({}), 'peds-emerging');
  });
});
