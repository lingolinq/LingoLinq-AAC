import Component from '@ember/component';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';
import eval_items from '../utils/eval_items';

/*
 * eval-quick-runner — sequences the subtests defined by the active session.
 *
 * Phase 1A scaffolds the SLP-driven scoring path: the SLP records correct/
 * incorrect taps for each item (mirrors the manual quick-assessment pattern).
 * Phase 1B+ will replace this with auto-scored OBF item rendering — the
 * scoring contract (events emitted via onEvent) stays the same so future
 * automation slots in cleanly.
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

  recordResponse(response) {
    const item = this.get('currentItem');
    const subtest = this.get('currentSubtest');
    const onEvent = this.get('onEvent');
    if (onEvent) {
      onEvent({
        subtest: subtest,
        item_id: item ? item.id : null,
        response: response,
        latency_ms: this.get('itemStartedAt') ? (Date.now() - this.get('itemStartedAt')) : 0,
        access_method: this.get('session.intake.suspected_access') || 'touch',
        grid: item ? item.grid : null,
        library: item ? item.library : null
      });
    }
    this.advanceItem();
  },

  advanceItem() {
    const next = this.get('itemIndex') + 1;
    if (next >= this.get('subtestItems.length')) {
      this.advanceSubtest();
    } else {
      this.set('itemIndex', next);
      this.set('itemStartedAt', Date.now());
    }
  },

  advanceSubtest() {
    this.set('itemIndex', 0);
    this.set('itemStartedAt', Date.now());
    const onAdvance = this.get('onAdvance');
    if (onAdvance) { onAdvance(); }
  },

  didInsertElement() {
    this._super(...arguments);
    this.set('itemStartedAt', Date.now());
  },

  actions: {
    correct() { this.recordResponse('correct'); },
    incorrect() { this.recordResponse('incorrect'); },
    skip() { this.recordResponse('skip'); },
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
