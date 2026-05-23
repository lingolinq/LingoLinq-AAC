/*
 * eval_prompt_hierarchy — pure Dynamic Assessment escalation policy
 * for the Comprehensive Eval (Mode 3).
 *
 * Per current AAC research best practice (Snell, Snodgrass, et al.;
 * see PMC4634893 and PMC5831088), every item escalates through a
 * fixed prompt hierarchy until the communicator succeeds or the
 * SLP reaches the highest level of support. Each level is scored
 * separately so the report surfaces *learning potential* (Vygotsky)
 * rather than just point-in-time accuracy. No commercial AAC eval
 * (DAGG-3, TASP, Communication Matrix) ships this measurement.
 *
 * The 6 prompt levels, ordered least → most supportive:
 *   1. independent          — no prompt, communicator initiates
 *   2. expectant_pause      — SLP waits silently with eye contact
 *   3. verbal_model         — SLP says the target word/phrase
 *   4. gestural_cue         — SLP points toward the target region
 *   5. partial_highlight    — SLP highlights a quadrant of the device
 *   6. full_prompt          — SLP physically/verbally directs to target
 *
 * Pure functions, fully unit-testable. The runner component owns
 * timing + rendering; this module owns the policy only.
 */

export const PROMPT_LEVELS = [
  { id: 'independent',       label: 'Independent',        index: 1 },
  { id: 'expectant_pause',   label: 'Expectant pause',    index: 2 },
  { id: 'verbal_model',      label: 'Verbal model',       index: 3 },
  { id: 'gestural_cue',      label: 'Gestural cue',       index: 4 },
  { id: 'partial_highlight', label: 'Partial highlight',  index: 5 },
  { id: 'full_prompt',       label: 'Full prompt',        index: 6 }
];

// Score for each level — lower (1) = more independent, better.
// `null` is the implicit "above 6" — communicator did not succeed
// at any prompt level.
export function levelScore(levelId) {
  const level = PROMPT_LEVELS.find(function(l) { return l.id === levelId; });
  return level ? level.index : null;
}

// New per-item state. Each item walks through the levels in order
// and records timestamped attempts.
export function initialItemState(itemId) {
  return {
    item_id: itemId,
    level_index: 0, // index into PROMPT_LEVELS
    attempts: [],
    score: null,
    resolved: false
  };
}

// Apply one attempt outcome and transition. Pure: state in → state out.
// `attempt` shape: { succeeded: bool, timestamp_ms: number }
//
// Rules:
//   succeeded → resolve, score = current level's index
//   failed at last level → resolve, score = null (no learning at any
//                          supported level)
//   failed at lower level → escalate one level, stay unresolved
export function advanceItem(state, attempt) {
  if (state.resolved) { return state; }
  const level = PROMPT_LEVELS[state.level_index];
  if (!level) { return state; }
  const nextAttempts = state.attempts.concat([{
    level: level.id,
    succeeded: !!attempt.succeeded,
    timestamp_ms: attempt.timestamp_ms || Date.now()
  }]);

  if (attempt.succeeded) {
    return {
      item_id: state.item_id,
      level_index: state.level_index,
      attempts: nextAttempts,
      score: level.index,
      resolved: true
    };
  }

  const nextLevelIndex = state.level_index + 1;
  if (nextLevelIndex >= PROMPT_LEVELS.length) {
    return {
      item_id: state.item_id,
      level_index: state.level_index,
      attempts: nextAttempts,
      score: null,
      resolved: true
    };
  }

  return {
    item_id: state.item_id,
    level_index: nextLevelIndex,
    attempts: nextAttempts,
    score: null,
    resolved: false
  };
}

// Aggregate per-item scores into a learning-potential summary.
// Returns:
//   independence_avg     — mean score across resolved items (1–6;
//                          lower is better)
//   independence_pct     — % of items resolved at levels 1–2
//                          (independent or expectant pause)
//   supported_pct        — % resolved at levels 3–5
//   not_yet_pct          — % not resolved at any level
//   trial_count          — total items
//
// Items with score === null count as "not_yet" but don't pull the
// independence_avg toward an artificially low number.
export function summarizeDynamicAssessment(itemStates) {
  const states = itemStates || [];
  const trial_count = states.length;
  if (!trial_count) {
    return { independence_avg: null, independence_pct: 0, supported_pct: 0, not_yet_pct: 0, trial_count: 0 };
  }
  let sum = 0;
  let scoredCount = 0;
  let independentCount = 0;
  let supportedCount = 0;
  let notYetCount = 0;
  states.forEach(function(s) {
    if (s.score == null) {
      notYetCount += 1;
    } else if (s.score <= 2) {
      independentCount += 1;
      sum += s.score;
      scoredCount += 1;
    } else if (s.score <= 5) {
      supportedCount += 1;
      sum += s.score;
      scoredCount += 1;
    } else {
      sum += s.score;
      scoredCount += 1;
    }
  });
  return {
    independence_avg: scoredCount ? Math.round((sum / scoredCount) * 100) / 100 : null,
    independence_pct: Math.round((independentCount / trial_count) * 100),
    supported_pct: Math.round((supportedCount / trial_count) * 100),
    not_yet_pct: Math.round((notYetCount / trial_count) * 100),
    trial_count: trial_count
  };
}

export default {
  PROMPT_LEVELS: PROMPT_LEVELS,
  levelScore: levelScore,
  initialItemState: initialItemState,
  advanceItem: advanceItem,
  summarizeDynamicAssessment: summarizeDynamicAssessment
};
