import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import i18n from '../utils/i18n';

/**
 * Help & Feedback form modal (help_feedback_v2).
 *
 * Wrapped in {{#modal-dialog}} which provides Esc-to-close, focus trap,
 * and backdrop-click suppression via uncloseable=true. Submits multipart
 * to POST /api/v1/feedbacks.
 */
export default Component.extend({
  appState: service('app-state'),
  router: service('router'),

  tagName: '',
  max_description_length: 5000,

  category_options: computed(function() {
    return [
      { value: '',                label: i18n.t('feedback_select_category', "Select a category") },
      { value: 'bug',             label: i18n.t('feedback_cat_bug', "Something's broken") },
      { value: 'outage',          label: i18n.t('feedback_cat_outage', "I can't access LingoLinq") },
      { value: 'feature_request', label: i18n.t('feedback_cat_feature', "I have an idea or suggestion") },
      { value: 'help',            label: i18n.t('feedback_cat_help', "I need help using LingoLinq") },
      { value: 'billing',         label: i18n.t('feedback_cat_billing', "Billing or subscription question") }
    ];
  }),

  description_chars_left: computed('description', function() {
    var len = (this.get('description') || '').length;
    return this.get('max_description_length') - len;
  }),

  init: function() {
    this._super(...arguments);
    this.set('category', '');
    this.set('description', '');
    this.set('screenshot_file', null);
    this.set('submitting', false);
    this.set('submitted', false);
    this.set('error_message', null);
    this.set('field_errors', {});
    this.set('status_message', '');

    var user = this.get('appState.sessionUser');
    this.set('email', (user && user.get && user.get('email')) || '');
  },

  validate: function() {
    var errors = {};
    if (!this.get('category')) {
      errors.category = i18n.t('feedback_err_category', "Please select a category");
    }
    var desc = (this.get('description') || '').trim();
    if (!desc) {
      errors.description = i18n.t('feedback_err_description_required', "Please describe your feedback");
    } else if (desc.length > this.get('max_description_length')) {
      errors.description = i18n.t('feedback_err_description_length', "Description is too long");
    }
    this.set('field_errors', errors);
    return Object.keys(errors).length === 0;
  },

  actions: {
    opening: function() {
      this.set('trigger_element', document.activeElement);
    },

    closing: function() {
      var trigger = this.get('trigger_element');
      if (trigger && trigger.focus) {
        try { trigger.focus(); } catch (e) { }
      }
    },

    close: function() {
      modal.close();
    },

    set_category: function(event) {
      this.set('category', event && event.target && event.target.value);
    },

    set_description: function(event) {
      this.set('description', event && event.target && event.target.value);
    },

    set_email: function(event) {
      this.set('email', event && event.target && event.target.value);
    },

    set_screenshot: function(event) {
      var files = event && event.target && event.target.files;
      this.set('screenshot_file', files && files.length ? files[0] : null);
    },

    submit: function() {
      var _this = this;
      if (_this.get('submitting') || _this.get('submitted')) { return; }
      if (!_this.validate()) {
        _this.set('status_message', i18n.t('feedback_err_correct', "Please correct the errors above"));
        return;
      }

      _this.set('submitting', true);
      _this.set('error_message', null);
      _this.set('status_message', i18n.t('feedback_status_submitting', "Submitting your feedback..."));

      var fd = new FormData();
      fd.append('category', _this.get('category') || '');
      fd.append('description', _this.get('description') || '');
      fd.append('email', _this.get('email') || '');
      var current = '';
      try {
        current = (_this.get('router') && _this.get('router').currentURL) || (window.location && window.location.pathname) || '';
      } catch (e) { current = ''; }
      fd.append('current_url', current);
      var file = _this.get('screenshot_file');
      if (file) { fd.append('screenshot', file); }

      persistence.ajax('/api/v1/feedbacks', {
        type: 'POST',
        data: fd,
        processData: false,
        contentType: false
      }).then(function(res) {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('submitting', false);
        _this.set('submitted', true);
        _this.set('sla_message', (res && res.message) || i18n.t('feedback_thanks', "Thanks, we've received your feedback."));
        _this.set('status_message', i18n.t('feedback_status_success', "Feedback submitted successfully"));
        runLater(function() {
          if (_this.isDestroyed || _this.isDestroying) { return; }
          modal.close();
        }, 4000);
      }, function(err) {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('submitting', false);
        var msg = (err && (err.error || (err.errors && err.errors.join(', ')))) || i18n.t('feedback_err_generic', "Something went wrong. Please try again.");
        _this.set('error_message', msg);
        _this.set('status_message', msg);
      });
    },

    dismiss_success: function() {
      modal.close();
    }
  }
});
