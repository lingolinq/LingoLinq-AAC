import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { run, scheduleOnce } from '@ember/runloop';
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
  screenshotDragActive: false,

  /** Per-field validation flags; replaced as a whole object for template updates */
  errors: null,

  init() {
    this._super(...arguments);
    this.clearAllErrors();
    const u = this.get('appState.sessionUser');
    if (u) {
      this.setProperties({
        name: u.get('name'),
        email: u.get('email')
      });
    }
  },

  clearAllErrors() {
    this.set('errors', {
      feedback_type: false,
      severity: false,
      subject: false,
      details: false
    });
  },

  markError(field) {
    this.set('errors', Object.assign({}, this.get('errors') || {}, { [field]: true }));
  },

  clearError(field) {
    this.set('errors', Object.assign({}, this.get('errors') || {}, { [field]: false }));
  },

  hasAnyError: computed('errors', function() {
    const e = this.get('errors');
    if (!e) {
      return false;
    }
    return !!(e.feedback_type || e.severity || e.subject || e.details);
  }),

  selectClassFeedbackType: computed('errors', function() {
    const e = this.get('errors');
    return e && e.feedback_type ? 'la-contact-input la-contact-input--invalid' : 'la-contact-input';
  }),

  selectClassSeverity: computed('errors', function() {
    const e = this.get('errors');
    return e && e.severity ? 'la-contact-input la-contact-input--invalid' : 'la-contact-input';
  }),

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

  _isPasteTargetTextField(target) {
    if (!target || !target.closest) {
      return false;
    }
    if (target.closest('textarea')) {
      return true;
    }
    const inp = target.closest('input');
    if (inp && /^(text|email|search|url|tel|password|number)$/i.test(inp.type)) {
      return true;
    }
    return false;
  },

  applyScreenshotFile(file) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) {
      modal.error(i18n.t('beta_feedback_screenshot_invalid_type', "Please use a PNG, JPG, GIF, or WebP image."));
      const el = document.getElementById('beta_feedback_screenshot');
      if (el) {
        el.value = '';
      modal.error(i18n.t('beta_feedback_screenshot_invalid_type', "Please use a PNG, JPG, GIF, or WebP image."));
      const el = document.getElementById('beta_feedback_screenshot');
      if (el) {
        el.value = '';
      }
      return;
    }
    const max = 1.5 * 1024 * 1024;
    if (file.size > max) {
      modal.error(i18n.t('beta_feedback_screenshot_too_large', "Please choose an image about 1.5 MB or smaller."));
      const el = document.getElementById('beta_feedback_screenshot');
      if (el) {
        el.value = '';
      }
      const el = document.getElementById('beta_feedback_screenshot');
      if (el) {
        el.value = '';
      }
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
    const el = document.getElementById('beta_feedback_screenshot');
    if (el) {
      el.value = '';
    }
  },

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
    clearFieldError(field) {
      this.clearError(field);
    },
    updateFeedbackType(id) {
      this.set('feedback_type', id);
      this.clearError('feedback_type');
    },
    updateSeverity(id) {
      this.set('severity', id);
      this.clearError('severity');
    },
    screenshotChanged(event) {
      const input = event.target;
      const file = input.files && input.files[0];
      if (!file) {
        this.set('screenshotData', null);
        return;
      }
      this.applyScreenshotFile(file);
    },
    screenshotPaste(event) {
      const items = event.clipboardData && event.clipboardData.items;
      if (!items || !items.length) {
        return;
      }
      let imageFile = null;
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && items[i].type.indexOf('image/') === 0) {
          imageFile = items[i].getAsFile();
          if (imageFile) {
            break;
          }
        }
      }
      if (!imageFile) {
        return;
      }
      if (this._isPasteTargetTextField(event.target)) {
        return;
      }
      event.preventDefault();
      this.applyScreenshotFile(imageFile);
    },
    screenshotDragEnter(event) {
      event.preventDefault();
      event.stopPropagation();
      this.set('screenshotDragActive', true);
    },
    screenshotDragOver(event) {
      event.preventDefault();
      event.stopPropagation();
      this.set('screenshotDragActive', true);
    },
    screenshotDragLeave(event) {
      event.preventDefault();
      if (!event.currentTarget.contains(event.relatedTarget)) {
        this.set('screenshotDragActive', false);
      }
    },
    screenshotDrop(event) {
      event.preventDefault();
      event.stopPropagation();
      this.set('screenshotDragActive', false);
      const files = event.dataTransfer && event.dataTransfer.files;
      if (files && files[0]) {
        this.applyScreenshotFile(files[0]);
      }
    },
    clearScreenshot() {
      this.setProperties({ screenshotData: null, screenshotDragActive: false });
      const el = document.getElementById('beta_feedback_screenshot');
      if (el) {
        el.value = '';
      }
    },
    submit_feedback() {
      this.clearAllErrors();
      this.set('error', false);
      if ((this.get('feedback_hp') || '').trim().length > 0) {
        return;
      }

      let firstFieldId = null;
      const mark = (field, id) => {
        this.markError(field);
        if (!firstFieldId) {
          firstFieldId = id;
        }
      };

      if (!this.get('feedback_type')) {
        mark('feedback_type', 'beta_feedback_type');
      }
      if (!this.get('severity')) {
        mark('severity', 'beta_severity');
      }
      if (!this.get('subject') || !this.get('subject').trim()) {
        mark('subject', 'beta_subject');
      }
      const detail = (this.get('general_feedback') || '').trim();
      const steps = (this.get('steps_to_reproduce') || '').trim();
      if (detail.length < 10 && steps.length < 10) {
        mark('details', 'beta_steps');
      }

      if (this.get('hasAnyError')) {
        scheduleOnce('afterRender', this, function() {
          const el = firstFieldId && document.getElementById(firstFieldId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            if (el.focus && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
              try {
                el.focus({ preventScroll: true });
              } catch (e) {
                el.focus();
              }
            }
          }
        });
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
      // JSON avoids application/x-www-form-urlencoded issues with large base64 screenshots (+/space and size).
      this.get('persistence').ajax('/api/v1/messages', {
        type: 'POST',
        contentType: 'application/json; charset=UTF-8',
        data: JSON.stringify({ message: message }),
        dataType: 'json'
      }).then(function() {
        _this.set('disabled', false);
        _this.clearAllErrors();
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
          screenshotData: null,
          screenshotDragActive: false
        });
        const el = document.getElementById('beta_feedback_screenshot');
        if (el) {
          el.value = '';
        }
        modal.success(i18n.t('beta_feedback_sent', "Thank you! Your beta feedback was sent."));
        _this.get('router').transitionTo('index');
      }, function(xhr) {
        _this.set('error', true);
        _this.set('disabled', false);
        let detail = '';
        try {
          const json = xhr.responseJSON || (xhr.responseText && JSON.parse(xhr.responseText));
          if (json && json.errors && json.errors.length) {
            detail = json.errors.join(' ');
          } else if (json && json.error) {
            detail = json.error;
          }
        } catch (e) { /* ignore parse errors */ }
        if (detail) {
          modal.error(detail);
        }
      });
    }
  }
});
