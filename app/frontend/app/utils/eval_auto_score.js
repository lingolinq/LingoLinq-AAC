/*
 * Auto-score helper for in-app eval items.
 *
 * Pure function: (item, response) → event payload. Used by the
 * runner when the communicator interacts with an item directly so
 * the same `onEvent` contract that powered manual scoring keeps
 * working without changes to the recommendation engine.
 *
 * The runner is responsible for measuring latency and constructing
 * the `response` object — this helper only decides correct/incorrect
 * and assembles the payload.
 *
 * `response` shape (passed in):
 *   { picked: <option>, picked_index?: number, latency_ms: number,
 *     hit_pos?: [x,y], target_pos?: [x,y],
 *     access_method?: string, sequence?: number[] }
 *
 * Returned event matches the existing manual-score event shape so
 * eval_recommend.js / lib/eval_recommend.rb don't need changes.
 */

const OBSERVATION_KINDS = [
  'attention',
  'joint_attention',
  'preferred_object',
  'preferred_activity',
  'reject',
  'request_more'
];

function isObservationKind(kind) {
  return OBSERVATION_KINDS.indexOf(kind) !== -1;
}

// True when the item supports auto-scoring (the platform can
// decide correct/incorrect itself). Observation kinds always fall
// back to manual SLP scoring.
function isAutoScorable(item) {
  if (!item || !item.kind) { return false; }
  if (item.observe) { return false; }
  if (isObservationKind(item.kind)) { return false; }
  return true;
}

function judgeChoice(item, response) {
  const picked = response.picked;
  if (!picked) { return 'no_response'; }
  return picked.is_target ? 'correct' : 'incorrect';
}

function judgeSequence(item, response) {
  const sequence = response.sequence || [];
  const expected = (item.options || [])
    .filter(function(o) { return o.sequence; })
    .sort(function(a, b) { return a.sequence - b.sequence; })
    .map(function(o) { return o.label; });
  if (sequence.length !== expected.length) { return 'incorrect'; }
  for (let i = 0; i < expected.length; i++) {
    if (sequence[i] !== expected[i]) { return 'incorrect'; }
  }
  return 'correct';
}

function judgeAccessSnapshot(item, response) {
  // For grid-tap items the picked index must match item.target.
  if (response.picked_index == null) { return 'no_response'; }
  return response.picked_index === item.target ? 'correct' : 'incorrect';
}

function judgeCauseEffect(item, response) {
  // Any tap counts — the item exists to confirm the communicator
  // can produce intentional motor output. Time-out (no_response)
  // emitted by the runner when the timer expires.
  return response.picked || response.picked_index != null
    ? 'correct'
    : 'no_response';
}

function judge(item, response) {
  if (!isAutoScorable(item)) { return null; }
  if (!response) { return 'no_response'; }
  switch (item.kind) {
    case 'cause_effect':
      return judgeCauseEffect(item, response);
    case 'syntax':
    case 'sequencing':
      return judgeSequence(item, response);
    case 'access_snapshot':
      return judgeAccessSnapshot(item, response);
    default:
      // choice, match, category, attribute, recognition, orientation,
      // word_to_picture, first_letter, library_compare, vocab_probe
      return judgeChoice(item, response);
  }
}

function buildEvent(subtest, item, response, judgement) {
  const event = {
    subtest: subtest,
    item_id: item.id,
    response: judgement,
    latency_ms: (response && response.latency_ms) || 0
  };
  if (response && response.access_method) {
    event.access_method = response.access_method;
  }
  if (item.grid) {
    event.grid = item.grid;
  }
  if (item.library) {
    event.library = item.library;
  }
  if (response && response.hit_pos) {
    event.hit_pos = response.hit_pos;
  }
  if (response && response.target_pos) {
    event.target_pos = response.target_pos;
  }
  return event;
}

export default {
  isAutoScorable: isAutoScorable,
  isObservationKind: isObservationKind,
  judge: judge,
  buildEvent: buildEvent,
  OBSERVATION_KINDS: OBSERVATION_KINDS
};
