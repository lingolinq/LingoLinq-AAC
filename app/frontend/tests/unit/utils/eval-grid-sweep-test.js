import { module, test } from 'qunit';
import grid_sweep from 'frontend/utils/eval_grid_sweep';

module('Unit | Utility | eval_grid_sweep', function() {
  test('GRID_LADDER has seven tiers ordered small → large', function(assert) {
    assert.strictEqual(grid_sweep.GRID_LADDER.length, 7, 'seven tiers');
    const sizes = grid_sweep.GRID_LADDER.map(function(g) { return g.rows * g.cols; });
    const sorted = sizes.slice().sort(function(a, b) { return a - b; });
    assert.deepEqual(sizes, sorted, 'tiers ordered by capacity');
    assert.strictEqual(grid_sweep.GRID_LADDER[0].rows * grid_sweep.GRID_LADDER[0].cols, 4, 'bottom tier is 4 buttons');
    assert.strictEqual(grid_sweep.GRID_LADDER[6].rows * grid_sweep.GRID_LADDER[6].cols, 84, 'top tier is 84 buttons');
  });

  test('initialSweepState seeds at the middle of the ladder', function(assert) {
    const s = grid_sweep.initialSweepState();
    assert.strictEqual(s.index, 2, 'starts at index 2 (16 buttons)');
    assert.strictEqual(s.lowerBound, 0);
    assert.strictEqual(s.upperBound, 6);
    assert.deepEqual(s.history, []);
    assert.false(s.converged);
    assert.strictEqual(s.bestIndex, null);
  });

  test('advanceSweep climbs when the attempt passes (correct + fast)', function(assert) {
    const s0 = grid_sweep.initialSweepState();
    const s1 = grid_sweep.advanceSweep(s0, { correct: true, latency_ms: 1500 });
    assert.strictEqual(s1.bestIndex, 2, 'records bestIndex at the passed tier');
    assert.strictEqual(s1.lowerBound, 3, 'lowerBound advances past current');
    assert.strictEqual(s1.index, Math.floor((3 + 6) / 2), 'next tier is midpoint of bracket');
    assert.false(s1.converged);
  });

  test('advanceSweep descends when the attempt fails', function(assert) {
    const s0 = grid_sweep.initialSweepState();
    const s1 = grid_sweep.advanceSweep(s0, { correct: false, latency_ms: 1200 });
    assert.strictEqual(s1.upperBound, 1, 'upperBound retreats below current');
    assert.strictEqual(s1.index, 0, 'next tier is midpoint of new bracket');
    assert.strictEqual(s1.bestIndex, null, 'no best recorded on fail');
  });

  test('advanceSweep treats slow correct as a fail (latency > 5000)', function(assert) {
    const s0 = grid_sweep.initialSweepState();
    const s1 = grid_sweep.advanceSweep(s0, { correct: true, latency_ms: 7000 });
    assert.strictEqual(s1.upperBound, 1, 'slow correct counts as fail for bracket purposes');
    assert.strictEqual(s1.bestIndex, null);
  });

  test('advanceSweep converges when the bracket collapses', function(assert) {
    let s = grid_sweep.initialSweepState();
    s = grid_sweep.advanceSweep(s, { correct: true, latency_ms: 1000 });  // index 2 → bestIndex 2, bracket [3,6], next 4
    s = grid_sweep.advanceSweep(s, { correct: false, latency_ms: 1000 }); // index 4 → bracket [3,3], next 3
    s = grid_sweep.advanceSweep(s, { correct: false, latency_ms: 1000 }); // index 3 → bracket collapses
    assert.true(s.converged, 'converged on collapse');
    assert.strictEqual(s.bestIndex, 2, 'best is the last passed tier');
    assert.strictEqual(s.index, 2, 'final index points at bestIndex');
  });

  test('advanceSweep converges after 5 attempts regardless', function(assert) {
    let s = grid_sweep.initialSweepState();
    for (let i = 0; i < 5; i++) {
      s = grid_sweep.advanceSweep(s, { correct: true, latency_ms: 1000 });
    }
    assert.true(s.converged, 'converged after 5 attempts');
    assert.strictEqual(s.history.length, 5);
  });

  test('recommendationFromSweep returns the best grid dimensions', function(assert) {
    let s = grid_sweep.initialSweepState();
    s = grid_sweep.advanceSweep(s, { correct: true, latency_ms: 1000 });
    s = grid_sweep.advanceSweep(s, { correct: false, latency_ms: 1000 });
    s = grid_sweep.advanceSweep(s, { correct: false, latency_ms: 1000 });
    const rec = grid_sweep.recommendationFromSweep(s);
    assert.ok(rec, 'returns a recommendation when converged');
    assert.strictEqual(rec.rows, grid_sweep.GRID_LADDER[s.bestIndex].rows);
    assert.strictEqual(rec.cols, grid_sweep.GRID_LADDER[s.bestIndex].cols);
    assert.strictEqual(rec.capacity, rec.rows * rec.cols);
    assert.ok(rec.history && rec.history.length > 0);
  });

  test('recommendationFromSweep returns null for non-converged state', function(assert) {
    const s = grid_sweep.initialSweepState();
    assert.strictEqual(grid_sweep.recommendationFromSweep(s), null);
  });
});
