import Component from '@ember/component';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';
import eval_recommend from '../utils/eval_recommend';

/*
 * eval-quick-intake — 60-second intake form.
 *
 * Captures four fields that route the session to a population-appropriate
 * item-bank profile. Keeps the form short and finger-friendly: each field
 * uses a pill-button picker rather than a dropdown so it works well on iPad.
 */
export default Component.extend({
  classNames: ['evq__intake'],
  tagName: 'div',
  user: null,

  ageBand: null,
  etiology: null,
  currentComm: null,
  suspectedAccess: null,

  ageBands: computed(function() {
    return [
      { value: '<3',    label: i18n.t('age_under_3', "Under 3") },
      { value: '3-5',   label: i18n.t('age_3_5', "3 to 5") },
      { value: '6-12',  label: i18n.t('age_6_12', "6 to 12") },
      { value: '13-21', label: i18n.t('age_13_21', "13 to 21") },
      { value: '22-64', label: i18n.t('age_22_64', "22 to 64") },
      { value: '65+',   label: i18n.t('age_65_plus', "65 and up") }
    ];
  }),

  etiologyOptions: computed(function() {
    return [
      { value: 'developmental', label: i18n.t('etiology_developmental', "Developmental") },
      { value: 'autism',        label: i18n.t('etiology_autism', "Autism") },
      { value: 'cp',            label: i18n.t('etiology_cp', "Cerebral palsy") },
      { value: 'acquired',      label: i18n.t('etiology_acquired', "Acquired (stroke / TBI)") },
      { value: 'progressive',   label: i18n.t('etiology_progressive', "Progressive (ALS / MND)") },
      { value: 'sensory',       label: i18n.t('etiology_sensory', "Sensory-primary") },
      { value: 'unknown',       label: i18n.t('etiology_unknown', "Unknown / not sure") }
    ];
  }),

  currentCommOptions: computed(function() {
    return [
      { value: 'none_observable', label: i18n.t('comm_none_observable', "None observable") },
      { value: 'pre_symbolic',    label: i18n.t('comm_pre_symbolic', "Pre-symbolic (gestures, vocalizations)") },
      { value: 'single_symbol',   label: i18n.t('comm_single_symbol', "Single-symbol") },
      { value: 'phrase',          label: i18n.t('comm_phrase', "Phrase-level") },
      { value: 'sentence',        label: i18n.t('comm_sentence', "Sentence-level") }
    ];
  }),

  accessOptions: computed(function() {
    return [
      { value: 'touch', label: i18n.t('access_touch', "Direct touch") },
      { value: 'scan',  label: i18n.t('access_scan', "Switch / scanning") },
      { value: 'gaze',  label: i18n.t('access_gaze', "Eye gaze") },
      { value: 'unknown', label: i18n.t('access_unknown', "Unknown — try multiple") }
    ];
  }),

  isComplete: computed('ageBand', 'etiology', 'currentComm', 'suspectedAccess', function() {
    return !!(this.get('ageBand') && this.get('etiology') && this.get('currentComm') && this.get('suspectedAccess'));
  }),

  previewProfile: computed('ageBand', 'etiology', 'currentComm', function() {
    if (!this.get('ageBand') || !this.get('currentComm')) { return null; }
    return eval_recommend.profileForIntake({
      age_band: this.get('ageBand'),
      etiology: this.get('etiology'),
      current_comm: this.get('currentComm')
    });
  }),

  actions: {
    pick(field, value) {
      this.set(field, value);
    },
    begin() {
      if (!this.get('isComplete')) { return; }
      const intake = {
        age_band: this.get('ageBand'),
        etiology: this.get('etiology'),
        current_comm: this.get('currentComm'),
        suspected_access: this.get('suspectedAccess')
      };
      const onComplete = this.get('onComplete');
      if (onComplete) { onComplete(intake); }
    }
  }
});
