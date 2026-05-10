import Component from '@ember/component';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';
import eval_items from '../utils/eval_items';
import auto_score from '../utils/eval_auto_score';

/*
 * eval-quick-runner — sequences the subtests defined by the active session.
 *
 * Phase 1B: items render directly via {{eval-quick-item}} which handles
 * communicator interaction (taps, sequencing, latency, timeouts) and
 * emits a structured response payload. The runner converts that into
 * a LogSession event via auto_score.buildEvent and forwards it to the
 * session via the existing onEvent callback so the recommendation
 * engine sees the same event shape as before.
 *
 * Manual SLP override is always available inside the item card so
 * observation kinds (attention, joint_attention, preferred_*) and
 * any ambiguous response can still be scored by the SLP.
 */
export default Component.extend({
  classNames: ['evq__runner'],
  tagName: 'div',
  session: null,
  itemIndex: 0,

  init() {
    this._super(...arguments);
    this.set('itemIndex', 0);
  },

  currentSubtest: computed('session.subtestIndex', function() {
    return this.get('session').currentSubtest();
  }),

  currentSubtestLabel: computed('currentSubtest', function() {
    return labelForSubtest(this.get('currentSubtest'));
  }),

  subtestItems: computed('currentSubtest', 'session.protocolProfile', function() {
    return eval_items.forSubtest(this.get('session.protocolProfile'), this.get('currentSubtest'));
  }),

  currentItem: computed('subtestItems', 'itemIndex', function() {
    return this.get('subtestItems')[this.get('itemIndex')];
  }),

  hasItems: computed('subtestItems.length', function() {
    return this.get('subtestItems.length') > 0;
  }),

  totalSubtests: computed('session', function() {
    return this.get('session').subtestOrder().length;
  }),

  subtestNumber: computed('session.subtestIndex', function() {
    return this.get('session.subtestIndex') + 1;
  }),

  subtestProgressPct: computed('session.subtestIndex', 'totalSubtests', function() {
    const total = this.get('totalSubtests') || 1;
    return Math.round((this.get('session.subtestIndex') / total) * 100);
  }),

  itemProgressLabel: computed('itemIndex', 'subtestItems.length', function() {
    const total = this.get('subtestItems.length') || 0;
    return i18n.t('runner_item_progress', "Item %{n} of %{total}", { n: this.get('itemIndex') + 1, total: total });
  }),

  isWrap: computed('currentSubtest', function() {
    return this.get('currentSubtest') === 'wrap';
  }),

  // Surface item kind context to the SLP so they know what's about
  // to render (helpful while watching the communicator engage).
  currentItemKindLabel: computed('currentItem.kind', function() {
    return labelForKind(this.get('currentItem.kind'));
  }),

  isAutoScored: computed('currentItem', function() {
    return auto_score.isAutoScorable(this.get('currentItem'));
  }),

  // ── response handling ──────────────────────────────────────────

  emitEvent(payload) {
    const item = this.get('currentItem');
    const subtest = this.get('currentSubtest');
    const judgement = payload.judgement || 'no_response';
    const event = auto_score.buildEvent(subtest, item, payload, judgement);
    const onEvent = this.get('onEvent');
    if (onEvent) { onEvent(event); }
  },

  advanceItem() {
    const next = this.get('itemIndex') + 1;
    if (next >= this.get('subtestItems.length')) {
      this.advanceSubtest();
    } else {
      this.set('itemIndex', next);
    }
  },

  advanceSubtest() {
    this.set('itemIndex', 0);
    const onAdvance = this.get('onAdvance');
    if (onAdvance) { onAdvance(); }
  },

  actions: {
    handleItemResponse(payload) {
      this.emitEvent(payload);
      this.advanceItem();
    },

    handleItemTimeout(payload) {
      this.emitEvent(payload);
      this.advanceItem();
    },

    finishSubtest() { this.advanceSubtest(); },

    finishEval() {
      const onFinish = this.get('onFinish');
      if (onFinish) { onFinish(); }
    }
  }
});

function labelForSubtest(id) {
  switch (id) {
    case 'stage_probe':     return i18n.t('subtest_stage_probe', "Stage probe");
    case 'access_snapshot': return i18n.t('subtest_access_snapshot', "Access snapshot");
    case 'library_compare': return i18n.t('subtest_library_compare', "Library comparison");
    case 'vocab_probe':     return i18n.t('subtest_vocab_probe', "Vocabulary probe");
    case 'literacy_probe':  return i18n.t('subtest_literacy_probe', "Literacy probe");
    case 'choice_probe':    return i18n.t('subtest_choice_probe', "Choice making");
    case 'cognitive_probe': return i18n.t('subtest_cognitive_probe', "Cognitive probe");
    case 'wrap':            return i18n.t('subtest_wrap', "Wrap up");
    default:                return id;
  }
}

function labelForKind(kind) {
  switch (kind) {
    case 'cause_effect':     return i18n.t('kind_cause_effect',     "Cause and effect");
    case 'choice':           return i18n.t('kind_choice',           "Choice");
    case 'match':            return i18n.t('kind_match',            "Symbol match");
    case 'category':         return i18n.t('kind_category',         "Category");
    case 'attribute':        return i18n.t('kind_attribute',        "Attribute");
    case 'syntax':           return i18n.t('kind_syntax',           "Syntax sequence");
    case 'sequencing':       return i18n.t('kind_sequencing',       "Sequencing");
    case 'recognition':      return i18n.t('kind_recognition',      "Recognition");
    case 'orientation':      return i18n.t('kind_orientation',      "Orientation");
    case 'word_to_picture':  return i18n.t('kind_word_to_picture',  "Word ↔ picture");
    case 'first_letter':     return i18n.t('kind_first_letter',     "First letter");
    case 'attention':        return i18n.t('kind_attention',        "Attention");
    case 'joint_attention':  return i18n.t('kind_joint_attention',  "Joint attention");
    case 'preferred_object': return i18n.t('kind_preferred_object', "Preferred object");
    case 'preferred_activity': return i18n.t('kind_preferred_activity', "Preferred activity");
    case 'reject':           return i18n.t('kind_reject',           "Rejection signal");
    case 'request_more':     return i18n.t('kind_request_more',     "Request more");
    case 'access_snapshot':  return i18n.t('kind_access_snapshot',  "Grid access");
    case 'library_compare':  return i18n.t('kind_library_compare',  "Library comparison");
    case 'vocab_probe':      return i18n.t('kind_vocab_probe',      "Vocabulary find");
    default:                 return kind || '';
  }
}
