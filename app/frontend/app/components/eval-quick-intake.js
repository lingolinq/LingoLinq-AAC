import Component from '@ember/component';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';
import eval_recommend from '../utils/eval_recommend';
import eval_access_detect from '../utils/eval_access_detect';

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

  // Two-step intake: 'choose' shows the tailor-vs-general gate; 'form' shows the
  // four demographic questions. Supervisors can skip the questions and run a
  // general (un-narrowed) screen — see chooseSkip / eval_session.beginScreening.
  step: 'choose',
  isChoosing: computed('step', function() {
    return this.get('step') === 'choose';
  }),

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

  // Detected hardware availability for each access method. Computed
  // once on intake mount so the badges below the access pills reflect
  // what the eval can actually run in (see eval_access_detect.js).
  accessDetection: computed(function() {
    try { return eval_access_detect.detect(); }
    catch (e) { return { touch: { status: 'ready' }, scan: { status: 'software_fallback' }, gaze: { status: 'unavailable' } }; }
  }),

  accessOptions: computed('accessDetection', function() {
    const det = this.get('accessDetection');
    const statusLabel = function(s) {
      if (s === 'ready') { return i18n.t('access_status_ready', "Detected"); }
      if (s === 'software_fallback') { return i18n.t('access_status_fallback', "Software fallback"); }
      return i18n.t('access_status_unavailable', "No hardware detected");
    };
    return [
      {
        value: 'touch',
        label: i18n.t('access_touch', "Direct touch"),
        status: det.touch.status,
        statusLabel: statusLabel(det.touch.status),
        unavailable: det.touch.status === 'unavailable'
      },
      {
        value: 'scan',
        label: i18n.t('access_scan', "Switch / scanning"),
        status: det.scan.status,
        statusLabel: statusLabel(det.scan.status),
        unavailable: det.scan.status === 'unavailable'
      },
      {
        value: 'gaze',
        label: i18n.t('access_gaze', "Eye gaze"),
        status: det.gaze.status,
        statusLabel: statusLabel(det.gaze.status),
        unavailable: det.gaze.status === 'unavailable'
      },
      {
        value: 'unknown',
        label: i18n.t('access_unknown', "Unknown — try multiple"),
        status: 'ready',
        statusLabel: null,
        unavailable: false
      }
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
    chooseTailor() {
      this.set('step', 'form');
    },
    chooseSkip() {
      // Skip the demographic questions → run a general screen with no demographic
      // narrowing (eval_session.beginScreening reads intake.generalized).
      const onComplete = this.get('onComplete');
      if (onComplete) { onComplete({ generalized: true }); }
    },
    backToChoice() {
      this.set('step', 'choose');
    },
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
