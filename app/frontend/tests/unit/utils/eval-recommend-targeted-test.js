import { module, test } from 'qunit';
import eval_recommend from 'frontend/utils/eval_recommend';

function intake() {
  return { age_band: '6-12', etiology: 'autism', current_comm: 'single_symbol', suspected_access: 'touch' };
}

// Synthetic event builders — keep tests legible and force-cover
// just the targeted subtests; the screening base is exercised by
// the existing eval-recommend-test.
function gridSweepEvents(rows, cols, attempts) {
  return [
    { subtest: 'adaptive_grid', grid: 'g16', correct: true,  latency_ms: 1500 },
    {
      subtest: 'adaptive_grid', converged: true,
      recommendation: { rows: rows, cols: cols, band: 'small', capacity: rows * cols, attempts: attempts, history: [] }
    }
  ];
}
function libraryEvents(winner, picks) {
  return [
    { subtest: 'library_3way', word: 'eat',  library: winner, correct: true, latency_ms: 1000 },
    { subtest: 'library_3way', converged: true, winner: winner, picks: picks }
  ];
}
function accessEvents(winner, summary, tallies) {
  return [
    { subtest: 'access_co_trial', trial: 'aco_01', target: 'eat', access_method: winner, correct: true, latency_ms: 900 },
    { subtest: 'access_co_trial', converged: true, winner: winner, summary: summary, tallies: tallies }
  ];
}
function syntaxEvents(receptive, expressive) {
  return [
    { subtest: 'syntax_probe', trial: 'syn_01', phrase: 'I want more', modality: 'receptive',  correct: true, latency_ms: 1200 },
    {
      subtest: 'syntax_probe', converged: true,
      summary: { receptive_accuracy: receptive, expressive_accuracy: expressive, trial_count: 3 },
      scores: []
    }
  ];
}

module('Unit | Utility | eval_recommend.fromTargeted', function() {
  test('returns a recommendation that builds on the screening base', function(assert) {
    const events = [].concat(gridSweepEvents(6, 6, 4));
    const rec = eval_recommend.fromTargeted(events, intake());
    assert.strictEqual(rec.eval_mode, 'targeted', 'flagged as targeted mode');
    assert.strictEqual(rec.grid_size.rows, 6);
    assert.strictEqual(rec.grid_size.cols, 6);
    assert.ok(rec.targeted_report.adaptive_grid, 'adaptive_grid subreport present');
    assert.ok(rec.starter_board_spec, 'still emits a starter_board_spec');
  });

  test('library_3way winner overrides the screening library pick', function(assert) {
    const events = [].concat(libraryEvents('arasaac', { symbolstix: 1, pcs: 1, arasaac: 2 }));
    const rec = eval_recommend.fromTargeted(events, intake());
    assert.strictEqual(rec.library, 'arasaac');
    assert.ok(rec.targeted_report.library_3way);
    assert.strictEqual(rec.targeted_report.library_3way.winner, 'arasaac');
    assert.strictEqual(rec.targeted_report.library_3way.margin, 0.25, 'margin computed from picks');
  });

  test('access_co_trial winner overrides the screening access method', function(assert) {
    const summary = [
      { method: 'gaze',  attempts: 2, accuracy: 1.0 },
      { method: 'touch', attempts: 2, accuracy: 0.5 },
      { method: 'scan',  attempts: 2, accuracy: 0.0 }
    ];
    const tallies = {
      touch: { hits: 1, misses: 1 },
      scan:  { hits: 0, misses: 2 },
      gaze:  { hits: 2, misses: 0 }
    };
    const rec = eval_recommend.fromTargeted(accessEvents('gaze', summary, tallies), intake());
    assert.strictEqual(rec.access_method, 'gaze');
    assert.strictEqual(rec.access_secondary, 'touch', 'second-best is surfaced when >= 0.5');
    assert.ok(rec.targeted_report.access_co_trial);
  });

  test('syntax_probe summary lands intact', function(assert) {
    const rec = eval_recommend.fromTargeted(syntaxEvents(1.0, 0.33), intake());
    assert.ok(rec.targeted_report.syntax_probe);
    assert.strictEqual(rec.targeted_report.syntax_probe.receptive_accuracy, 1.0);
    assert.strictEqual(rec.targeted_report.syntax_probe.expressive_accuracy, 0.33);
  });

  test('confidence climbs for each converged subtest, capped at 0.95', function(assert) {
    const events = [].concat(
      gridSweepEvents(6, 6, 4),
      libraryEvents('symbolstix', { symbolstix: 4, pcs: 0, arasaac: 0 }),
      accessEvents('touch',
        [{ method: 'touch', attempts: 4, accuracy: 1.0 }, { method: 'scan', attempts: 0, accuracy: 0 }, { method: 'gaze', attempts: 0, accuracy: 0 }],
        { touch: { hits: 4, misses: 0 }, scan: { hits: 0, misses: 0 }, gaze: { hits: 0, misses: 0 } }
      ),
      syntaxEvents(1.0, 0.67)
    );
    const rec = eval_recommend.fromTargeted(events, intake());
    assert.ok(rec.confidence > 0, 'confidence is set');
    assert.ok(rec.confidence <= 0.95, 'capped at 0.95');
  });

  test('next_action requests comprehensive when confidence is still low', function(assert) {
    const rec = eval_recommend.fromTargeted([], intake());
    assert.strictEqual(rec.next_action, 'promote_to_comprehensive');
  });
});
