import Component from '@ember/component';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';

/*
 * eval-quick-report — final summary card.
 *
 * Reads the recommendation off the session and surfaces it in an SLP-friendly
 * card with action buttons for "Save", "Build starter board", and
 * "Promote to Targeted Eval". The starter-board build is stubbed in 1A;
 * Phase 1B+ will wire it to the existing board generator.
 */
export default Component.extend({
  classNames: ['evq__report'],
  tagName: 'div',
  session: null,
  user: null,

  recommendation: computed('session.recommendation', function() {
    return this.get('session.recommendation') || {};
  }),

  durationLabel: computed('session', function() {
    const seconds = this.get('session') ? this.get('session').durationSeconds() : 0;
    const minutes = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return i18n.t('report_duration', "%{m}m %{s}s", { m: minutes, s: sec });
  }),

  confidencePct: computed('recommendation.confidence', function() {
    return Math.round((this.get('recommendation.confidence') || 0) * 100);
  }),

  shouldPromote: computed('recommendation.next_action', function() {
    return this.get('recommendation.next_action') === 'promote_to_targeted';
  }),

  promoteReasonsLabel: computed('recommendation.promote_reasons', function() {
    const reasons = this.get('recommendation.promote_reasons') || [];
    if (!reasons.length) { return null; }
    return reasons.map(function(r) {
      switch (r) {
        case 'low_event_count':   return i18n.t('promote_reason_low_count', "Limited data captured");
        case 'access_ambiguous':  return i18n.t('promote_reason_access', "Two access methods scored close");
        case 'library_tie':       return i18n.t('promote_reason_library', "Symbol libraries scored evenly");
        case 'stage_borderline':  return i18n.t('promote_reason_stage', "Communicator stage borderline");
        default:                  return r;
      }
    }).join(' · ');
  }),

  gridLabel: computed('recommendation.grid_size', function() {
    const grid = this.get('recommendation.grid_size');
    if (!grid) { return ''; }
    return i18n.t('report_grid_label', "%{rows} × %{cols} (%{band})", { rows: grid.rows, cols: grid.cols, band: grid.band });
  }),

  actions: {
    save() {
      const onSave = this.get('onSave');
      if (onSave) { onSave(); }
    },
    promote() {
      const onPromote = this.get('onPromote');
      if (onPromote) { onPromote(); }
    }
  }
});
