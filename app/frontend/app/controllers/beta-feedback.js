import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { run } from '@ember/runloop';
import modal from '../utils/modal';
import i18n from '../utils/i18n';

export default Controller.extend({
  appState: service('app-state'),
  persistence: service('persistence'),
  router: service('router'),

  feedback_type: '',
  severity: '',
  subject: '',
  steps_to_reproduce: '',
  expected_result: '',
  actual_result: '',
  general_feedback: '',
  device_context: '',
  name: '',
  email: '',
  /** Honeypot — must stay empty; submitted for server validation */
  feedback_hp: '',
  screenshotData: null,

  init() {
    this._super(...arguments);
    const u = this.get('appState.sessionUser');
    if (u) {
      this.setProperties({
        name: u.get('name'),
        email: u.get('email')
      });
    }
  },

  prompt_user: computed('appState.sessionUser', function() {
    return !this.get('appState.sessionUser');
  }),

  feedbackTypeOptions: computed(function() {
    return [
      { id: '', name: i18n.t('beta_feedback_type_prompt', "Choose a category"), disabled: true },
      { id: 'crash', name: i18n.t('beta_feedback_type_crash', "Crash or freeze") },
      { id: 'speak_mode', name: i18n.t('beta_feedback_type_speak_mode', "Speak mode or speech / TTS") },
      { id: 'boards', name: i18n.t('beta_feedback_type_boards', "Boards or editing") },
      { id: 'sync', name: i18n.t('beta_feedback_type_sync', "Sync, offline, or data") },
      { id: 'account', name: i18n.t('beta_feedback_type_account', "Login or account") },
      { id: 'performance', name: i18n.t('beta_feedback_type_performance', "Performance or loading") },
      { id: 'accessibility', name: i18n.t('beta_feedback_type_accessibility', "Accessibility or UI") },
      { id: 'feature', name: i18n.t('beta_feedback_type_feature', "Feature idea") },
      { id: 'other', name: i18n.t('beta_feedback_type_other', "Other") }
    ];
  }),

  severityOptions: computed(function() {
    return [
      { id: '', name: i18n.t('beta_feedback_severity_prompt', "How severe is the impact?"), disabled: true },
      { id: 'blocker', name: i18n.t('beta_feedback_severity_blocker', "Blocker — cannot complete key tasks") },
      { id: 'major', name: i18n.t('beta_feedback_severity_major', "Major — serious problem with a workaround") },
      { id: 'minor', name: i18n.t('beta_feedback_severity_minor', "Minor — small issue or polish") },
      { id: 'suggestion', name: i18n.t('beta_feedback_severity_suggestion', "Suggestion — idea or enhancement") }
    ];
  }),

  actions: {
    updateFeedbackType(id) {
      this.set('feedback_type', id);
    },
    updateSeverity(id) {
      this.set('severity', id);
    },
    screenshotChanged(event) {
      const input = event.target;
      const file = input.files && input.files[0];
      if (!file) {
        this.set('screenshotData', null);
        return;
      }
      const max = 1.5 * 1024 * 1024;
      if (file.size > max) {
        modal.error(i18n.t('beta_feedback_screenshot_too_large', "Please choose an image about 1.5 MB or smaller."));
        input.value = '';
        this.set('screenshotData', null);
        return;
      }
      const reader = new FileReader();
      const _this = this;
      reader.onload = function() {
        run(_this, function() {
          _this.set('screenshotData', reader.result);
        });
      };
      reader.readAsDataURL(file);
    },
    clearScreenshot() {
      this.set('screenshotData', null);
      const el = document.getElementById('beta_feedback_screenshot');
      if (el) {
        el.value = '';
      }
    },
    submit_feedback() {
      if (!this.get('email') && !this.get('appState.currentUser')) {
        return;
      }
      if (!this.get('feedback_type')) {
        modal.error(i18n.t('beta_feedback_validation_type', "Please choose a feedback category."));
        return;
      }
      if (!this.get('severity')) {
        modal.error(i18n.t('beta_feedback_validation_severity', "Please choose a severity level."));
        return;
      }
      if (!this.get('subject') || !this.get('subject').trim()) {
        modal.error(i18n.t('beta_feedback_validation_summary', "Please add a short summary."));
        return;
      }
      const detail = (this.get('general_feedback') || '').trim();
      const steps = (this.get('steps_to_reproduce') || '').trim();
      if (detail.length < 10 && steps.length < 10) {
        modal.error(i18n.t('beta_feedback_validation_details', "Please describe what happened in “General feedback” or “Steps to reproduce” (at least a few words)."));
        return;
      }
      if ((this.get('feedback_hp') || '').trim().length > 0) {
        return;
      }
      const message = {
        name: this.get('name'),
        email: this.get('email'),
        recipient: 'beta_feedback',
        subject: this.get('subject'),
        locale: i18n.langs.preferred,
        message: '',
        feedback_type: this.get('feedback_type'),
        severity: this.get('severity'),
        steps_to_reproduce: this.get('steps_to_reproduce'),
        expected_result: this.get('expected_result'),
        actual_result: this.get('actual_result'),
        general_feedback: this.get('general_feedback'),
        device_context: this.get('device_context'),
        screenshot_data: this.get('screenshotData'),
        beta_feedback_hp: this.get('feedback_hp')
      };
      const _this = this;
      this.set('disabled', true);
      this.set('error', false);
      this.get('persistence').ajax('/api/v1/messages', {
        type: 'POST',
        data: { message: message }
      }).then(function() {
        _this.set('disabled', false);
        _this.setProperties({
          subject: '',
          steps_to_reproduce: '',
          expected_result: '',
          actual_result: '',
          general_feedback: '',
          device_context: '',
          feedback_type: '',
          severity: '',
          feedback_hp: '',
          screenshotData: null
        });
        const el = document.getElementById('beta_feedback_screenshot');
        if (el) {
          el.value = '';
        }
        modal.success(i18n.t('beta_feedback_sent', "Thank you! Your beta feedback was sent."));
        _this.get('router').transitionTo('index');
      }, function() {
        _this.set('error', true);
        _this.set('disabled', false);
      });
    }
  }
});
