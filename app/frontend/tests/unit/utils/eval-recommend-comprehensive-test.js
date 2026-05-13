import { module, test } from 'qunit';
import eval_recommend from 'frontend/utils/eval_recommend';

function intake() {
  return { age_band: '6-12', etiology: 'autism', current_comm: 'single_symbol', suspected_access: 'touch' };
}

function daEvents(summary) {
  return [
    { subtest: 'dynamic_assessment', item_id: 'da_01', target: 'more', level: 'independent', level_index: 1, succeeded: true, timestamp_ms: 1000 },
    { subtest: 'dynamic_assessment', converged: true, summary: summary, items: [] }
  ];
}

function literacyEvents(summary) {
  return [
    { subtest: 'literacy_probe', converged: true, summary: summary }
  ];
}

module('Unit | Utility | eval_recommend.fromComprehensive', function() {
  test('flags eval_mode targeted upward to comprehensive', function(assert) {
    const rec = eval_recommend.fromComprehensive([], intake(), null);
    assert.strictEqual(rec.eval_mode, 'comprehensive');
    assert.ok(rec.comprehensive_report, 'comprehensive_report block exists');
  });

  test('surfaces dynamic_assessment summary in the comprehensive_report', function(assert) {
    const summary = { independence_avg: 2.4, independence_pct: 40, supported_pct: 40, not_yet_pct: 20, trial_count: 5 };
    const rec = eval_recommend.fromComprehensive(daEvents(summary), intake(), null);
    assert.deepEqual(rec.comprehensive_report.dynamic_assessment, summary);
  });

  test('surfaces literacy_probe summary', function(assert) {
    const summary = { accuracy: 0.75, hits: 3, trials: 4 };
    const rec = eval_recommend.fromComprehensive(literacyEvents(summary), intake(), null);
    assert.deepEqual(rec.comprehensive_report.literacy_probe, summary);
  });

  test('preserves the SETT payload from the session', function(assert) {
    const sett = { student: 'AAC user', environment: 'classroom', task: 'requesting' };
    const rec = eval_recommend.fromComprehensive([], intake(), sett);
    assert.deepEqual(rec.comprehensive_report.sett, sett);
  });

  test('bumps confidence for DA + literacy + filled SETT, capped at 0.99', function(assert) {
    const events = [].concat(
      daEvents({ independence_avg: 1.5, independence_pct: 80, supported_pct: 10, not_yet_pct: 10, trial_count: 5 }),
      literacyEvents({ accuracy: 0.75, hits: 3, trials: 4 })
    );
    const rec = eval_recommend.fromComprehensive(events, intake(), { student: 'x' });
    assert.ok(rec.confidence > 0, 'confidence is set');
    assert.ok(rec.confidence <= 0.99, 'capped at 0.99');
  });

  test('pushes communicator_stage upward when DA shows high independence', function(assert) {
    const events = daEvents({ independence_avg: 1.5, independence_pct: 80, supported_pct: 10, not_yet_pct: 10, trial_count: 5 });
    const base = eval_recommend.fromTargeted([], intake());
    const rec  = eval_recommend.fromComprehensive(events, intake(), null);
    assert.ok(rec.communicator_stage >= base.communicator_stage, 'DA can push stage up by 1');
  });

  test('next_action is build_starter_board (comprehensive is the final tier)', function(assert) {
    const rec = eval_recommend.fromComprehensive([], intake(), null);
    assert.strictEqual(rec.next_action, 'build_starter_board');
  });
});
