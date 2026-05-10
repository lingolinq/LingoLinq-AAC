import Component from '@ember/component';
import { computed } from '@ember/object';
import { later, cancel } from '@ember/runloop';
import auto_score from '../utils/eval_auto_score';
import speecher from '../utils/speecher';

/*
 * eval-quick-item — dispatches the right inline renderer based on
 * `item.kind` so the runner can stay generic. Each kind is rendered
 * directly in this component's template via {{#if (is_equal …)}}
 * branches; we kept them all together to avoid a component per kind
 * (the visual chrome they share — instruction, latency timer,
 * sequence buffer — is cheaper to wire once).
 *
 * Public actions:
 *   onResponse({ picked?, picked_index?, sequence?, latency_ms,
 *                hit_pos?, target_pos?, access_method?, judgement })
 *     Called when the communicator (or runner timeout) produces a
 *     terminal response. The runner consumes this and emits the
 *     LogSession event via eval_auto_score.buildEvent.
 *   onTimeout()
 *     Called when the per-item timer expires with no input. The
 *     runner emits a no_response event.
 *
 * Public attrs:
 *   item:           required  — current item from utils/eval_items
 *   subtest:        required  — current subtest id
 *   accessMethod:   optional  — touch | scan | gaze (from intake)
 *   timeoutMs:      optional  — defaults to 30s; 0 disables
 *   speakPrompts:   optional  — defaults true; speaks prompt_default
 */

const DEFAULT_TIMEOUT_MS = 30_000;

export default Component.extend({
  classNames: ['evq-item'],
  classNameBindings: ['kindClass'],
  tagName: 'div',

  item: null,
  subtest: null,
  accessMethod: null,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  speakPrompts: true,

  itemStartedAt: null,
  pickedSequence: null,
  timer: null,
  resolved: false,

  // ── lifecycle ──────────────────────────────────────────────────

  didInsertElement() {
    this._super(...arguments);
    this.startItem();
  },

  willDestroyElement() {
    this._super(...arguments);
    if (this.get('timer')) { cancel(this.get('timer')); }
  },

  // Re-arm the item when the controller swaps in a new one rather
  // than re-mounting (the runner reuses the same component instance
  // across items in a subtest).
  itemDidChange: function() {
    if (this.get('item.id')) {
      this.startItem();
    }
  },

  init() {
    this._super(...arguments);
    this.addObserver('item.id', this, 'itemDidChange');
  },

  startItem() {
    if (this.get('isDestroying') || this.get('isDestroyed')) { return; }
    this.set('itemStartedAt', Date.now());
    this.set('pickedSequence', []);
    this.set('resolved', false);

    if (this.get('speakPrompts') && speecher && speecher.speak_text && this.get('item.prompt_default')) {
      try { speecher.speak_text(this.get('item.prompt_default')); }
      catch (e) { /* ignore — speech is best-effort */ }
    }

    if (this.get('timer')) { cancel(this.get('timer')); }
    const ms = this.get('timeoutMs');
    if (ms && ms > 0 && this.get('isAutoScorable')) {
      const _this = this;
      this.set('timer', later(this, function() {
        if (!_this.get('resolved') && !_this.get('isDestroyed')) {
          _this.fireTimeout();
        }
      }, ms));
    }
  },

  // ── computed dispatch ──────────────────────────────────────────

  kind: computed.alias('item.kind'),

  kindClass: computed('kind', function() {
    const k = this.get('kind');
    return k ? `evq-item--${k}` : 'evq-item--unknown';
  }),

  isCauseEffect: computed('kind', function() { return this.get('kind') === 'cause_effect'; }),
  isAccessSnapshot: computed('kind', function() { return this.get('kind') === 'access_snapshot'; }),
  isLibraryCompare: computed('kind', function() { return this.get('kind') === 'library_compare'; }),
  isSequence: computed('kind', function() {
    const k = this.get('kind');
    return k === 'syntax' || k === 'sequencing';
  }),
  isObserve: computed('item', function() {
    return !auto_score.isAutoScorable(this.get('item'));
  }),
  // Catch-all: choice/match/category/attribute/recognition/orientation/
  // vocab_probe/word_to_picture/first_letter all render as a multi-
  // choice grid.
  isChoiceLike: computed('kind', 'isCauseEffect', 'isAccessSnapshot', 'isLibraryCompare', 'isSequence', 'isObserve', function() {
    if (this.get('isCauseEffect') || this.get('isAccessSnapshot') ||
        this.get('isLibraryCompare') || this.get('isSequence') ||
        this.get('isObserve')) { return false; }
    return !!this.get('kind');
  }),

  isAutoScorable: computed('item', function() {
    return auto_score.isAutoScorable(this.get('item'));
  }),

  // ── access_snapshot grid bookkeeping ───────────────────────────

  gridCells: computed('item', function() {
    const item = this.get('item');
    if (!item || !item.grid) { return []; }
    const total = item.grid[0] * item.grid[1];
    const cells = [];
    for (let i = 0; i < total; i++) {
      cells.push({ index: i, isTarget: i === item.target });
    }
    return cells;
  }),

  gridStyle: computed('item', function() {
    const item = this.get('item');
    if (!item || !item.grid) { return ''; }
    return `grid-template-columns: repeat(${item.grid[1]}, 1fr); grid-template-rows: repeat(${item.grid[0]}, 1fr);`;
  }),

  // ── sequence bookkeeping ───────────────────────────────────────

  sequenceProgress: computed('pickedSequence.length', 'item.options.[]', function() {
    const item = this.get('item') || {};
    const total = (item.options || []).filter(function(o) { return o.sequence; }).length;
    return { picked: (this.get('pickedSequence') || []).length, total: total };
  }),

  // ── event emission ─────────────────────────────────────────────

  latencyMs() {
    const start = this.get('itemStartedAt');
    return start ? (Date.now() - start) : 0;
  },

  resolveWith(payload) {
    if (this.get('resolved')) { return; }
    this.set('resolved', true);
    if (this.get('timer')) { cancel(this.get('timer')); this.set('timer', null); }
    payload.latency_ms = this.latencyMs();
    if (this.get('accessMethod')) {
      payload.access_method = this.get('accessMethod');
    }
    const judgement = auto_score.judge(this.get('item'), payload);
    payload.judgement = judgement;
    const onResponse = this.get('onResponse');
    if (onResponse) { onResponse(payload); }
  },

  fireTimeout() {
    this.set('resolved', true);
    if (this.get('timer')) { cancel(this.get('timer')); this.set('timer', null); }
    const payload = { latency_ms: this.latencyMs(), judgement: 'no_response' };
    if (this.get('accessMethod')) { payload.access_method = this.get('accessMethod'); }
    const onTimeout = this.get('onTimeout');
    if (onTimeout) { onTimeout(payload); }
    else {
      const onResponse = this.get('onResponse');
      if (onResponse) { onResponse(payload); }
    }
  },

  // ── actions ────────────────────────────────────────────────────

  actions: {
    pickOption(opt) {
      // syntax/sequencing accumulate; everything else terminates.
      if (this.get('isSequence')) {
        const buf = (this.get('pickedSequence') || []).slice();
        // Distractors don't advance the sequence — they fail it.
        if (opt.distractor) {
          this.resolveWith({ picked: opt, sequence: buf.concat([opt.label]) });
          return;
        }
        buf.push(opt.label);
        this.set('pickedSequence', buf);
        const required = (this.get('item.options') || [])
          .filter(function(o) { return o.sequence; }).length;
        if (buf.length >= required) {
          this.resolveWith({ picked: opt, sequence: buf });
        }
        return;
      }
      this.resolveWith({ picked: opt });
    },

    pickGridCell(cell) {
      const item = this.get('item');
      const target_pos = item ? [item.target, 0] : null;
      this.resolveWith({
        picked_index: cell.index,
        target_pos: target_pos,
        hit_pos: [cell.index, 0]
      });
    },

    triggerCauseEffect() {
      // Any tap on the cause-effect button counts as a correct
      // intentional response; the runner shows the reward briefly.
      this.resolveWith({ picked: { label: this.get('item.button_label') || 'press', is_target: true } });
    },

    libraryCompareTap() {
      // For the library comparison the communicator simply taps the
      // word — the recommendation engine compares latency / accuracy
      // across the paired (a/b) items.
      this.resolveWith({
        picked: { label: this.get('item.word'), is_target: true }
      });
    },

    // ── manual override (always available, used for observation
    //    items and SLP intervention on auto-scored items) ─────────
    manualScore(verdict) {
      this.resolveWith({
        picked: { label: '__manual__', is_target: verdict === 'correct' },
        manual: true,
        manual_verdict: verdict
      });
    }
  }
});
