import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import persistence from '../utils/persistence';
import session from '../utils/session';
import i18n from '../utils/i18n';
import modal from '../utils/modal';

export default Controller.extend({
  router: service('router'),
  queryParams: ['action'],
  action: null,
  token: null,
  consent_action: null,

  is_authenticated: computed(function() {
    return session.get('isAuthenticated');
  }),

  is_approve: computed('consent_action', function() {
    return this.get('consent_action') === 'approve';
  }),

  is_deny: computed('consent_action', function() {
    return this.get('consent_action') === 'deny';
  }),

  load_request: function() {
    var _this = this;
    var token = this.get('token');
    if (!token) {
      _this.set('result', { error: true });
      return;
    }
    _this.set('result', { loading: true });
    persistence.ajax('/api/v1/supervisor_relationships/consent_lookup?token=' + encodeURIComponent(token), {
      type: 'GET'
    }).then(function(res) {
      _this.set('result', res);
      // If action is already set from query params, auto-confirm
      if (_this.get('consent_action') && !_this.get('needs_login')) {
        // Don't auto-submit; let user confirm
      }
    }, function(err) {
      if (err && err.status === 404) {
        _this.set('result', { error: true, not_found: true });
      } else if (err && err.status === 410) {
        _this.set('result', { error: true, expired: true });
      } else {
        _this.set('result', { error: true });
      }
    });
  },

  needs_login: computed('is_authenticated', 'result.requires_auth', function() {
    return this.get('result.requires_auth') && !this.get('is_authenticated');
  }),

  actions: {
    login_and_return: function() {
      var token = this.get('token');
      var action = this.get('consent_action');
      // Store return URL and redirect to login
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('consent_return_token', token);
        sessionStorage.setItem('consent_return_action', action || '');
      }
      this.router.transitionTo('login');
    },

    approve: function() {
      this._respond('approve');
    },

    deny: function() {
      this._respond('deny');
    },

  },

  _respond: function(consent_action) {
    var _this = this;
    var token = _this.get('token');
    _this.set('submitting', true);
    _this.set('submit_error', null);
    persistence.ajax('/api/v1/supervisor_relationships/consent_response', {
      type: 'POST',
      data: {
        token: token,
        action: consent_action
      }
    }).then(function(res) {
      _this.set('submitting', false);
      _this.set('submitted', true);
      _this.set('submitted_action', consent_action);
      if (consent_action === 'approve') {
        modal.success(i18n.t('consent_approved', "Supervision access has been approved."));
      } else {
        modal.success(i18n.t('consent_denied', "Supervision request has been denied."));
      }
    }, function(err) {
      _this.set('submitting', false);
      if (err && err.status === 410) {
        _this.set('submit_error', i18n.t('consent_expired', "This consent request has expired or already been responded to."));
      } else {
        _this.set('submit_error', i18n.t('consent_error', "There was an error processing your response. Please try again."));
      }
    });
  }
});
