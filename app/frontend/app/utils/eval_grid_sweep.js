/*
 * eval_grid_sweep — pure adaptive grid sweep policy for the
 * Targeted Feature-Match eval (Mode 2).
 *
 * Replaces the legacy eval.js linear `levels` stepping with a true
 * binary-search policy. Starts at the middle of the ladder, then
 * climbs or descends based on response correctness/latency until
 * it brackets the highest grid the communicator can still perform
 * accurately at. Each step takes 2–3 items so the whole sweep is
 * ~6–8 items and runs in well under 2 minutes.
 *
 * Ladder (rows x cols): 4 (2x2) → 9 (3x3) → 16 (4x4) → 24 (4x6) →
 * 36 (6x6) → 60 (6x10) → 84 (7x12).
 *
 * Pure functions, fully unit-testable. The runner component owns
 * timing and rendering; this module only owns the policy.
 */

export const GRID_LADDER = [
  { id: 'g4',  rows: 2, cols: 2,  label: '4', band: 'tiny' },
  { id: 'g9',  rows: 3, cols: 3,  label: '9', band: 'small' },
  { id: 'g16', rows: 4, cols: 4,  label: '16', band: 'medium' },
  { id: 'g24', rows: 4, cols: 6,  label: '24', band: 'medium' },
  { id: 'g36', rows: 6, cols: 6,  label: '36', band: 'large' },
  { id: 'g60', rows: 6, cols: 10, label: '60', band: 'wide' },
  { id: 'g84', rows: 7, cols: 12, label: '84', band: 'wide' }
];

// State seed: start at index 2 (16 buttons) — the middle of the
// ladder. Tracks bracket bounds so we converge.
export function initialSweepState(seedIndex) {
  const start = (typeof seedIndex === 'number' && seedIndex >= 0 && seedIndex < GRID_LADDER.length)
    ? seedIndex
    : 2;
  return {
    index: start,
    lowerBound: 0,
    upperBound: GRID_LADDER.length - 1,
    history: [],
    converged: false,
    bestIndex: null
  };
}

// Evaluate a single attempt at the current grid and return a
// transition. Pure: state in → state out.
//
// `attempt` shape: { correct: bool, latency_ms: number }
// Convergence rule: stop once lower === upper, OR after 5 attempts
// (whichever comes first), OR after the user fails at the bottom.
export function advanceSweep(state, attempt) {
  const next = {
    index: state.index,
    lowerBound: state.lowerBound,
    upperBound: state.upperBound,
    history: state.history.concat([{
      grid: GRID_LADDER[state.index].id,
      correct: !!attempt.correct,
      latency_ms: attempt.latency_ms || null
    }]),
    converged: false,
    bestIndex: state.bestIndex
  };

  const fastEnough = (attempt.latency_ms == null) || attempt.latency_ms < 5000;
  const passed = attempt.correct && fastEnough;

  if (passed) {
    // Performed at this grid → push lower bound up, try higher.
    next.bestIndex = state.index;
    next.lowerBound = Math.min(state.index + 1, state.upperBound);
  } else {
    // Failed (or too slow) → push upper bound down, try smaller.
    // Do not clamp to lowerBound: when the bracket is already collapsed
    // (lower === upper), failing at that tier must let upperBound fall
    // below lowerBound so convergence triggers on the next check.
    next.upperBound = state.index - 1;
  }

  // Convergence: bracket collapsed, exhausted attempts, or floored.
  if (next.lowerBound > next.upperBound) {
    next.converged = true;
    next.index = next.bestIndex != null ? next.bestIndex : 0;
    return next;
  }
  if (next.history.length >= 5) {
    next.converged = true;
    next.index = next.bestIndex != null ? next.bestIndex : next.lowerBound;
    return next;
  }
  // Pick the midpoint of the remaining bracket as the next step.
  next.index = Math.floor((next.lowerBound + next.upperBound) / 2);
  return next;
}

// Helper: derive a final recommendation from a converged sweep.
export function recommendationFromSweep(state) {
  if (!state.converged) { return null; }
  const idx = state.bestIndex != null ? state.bestIndex : 0;
  const grid = GRID_LADDER[idx];
  return {
    rows: grid.rows,
    cols: grid.cols,
    band: grid.band,
    capacity: grid.rows * grid.cols,
    attempts: state.history.length,
    history: state.history
  };
}

export default {
  GRID_LADDER: GRID_LADDER,
  initialSweepState: initialSweepState,
  advanceSweep: advanceSweep,
  recommendationFromSweep: recommendationFromSweep
};
