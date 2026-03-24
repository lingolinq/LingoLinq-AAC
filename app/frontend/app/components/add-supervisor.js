import RSVP from 'rsvp';
import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import i18n from '../utils/i18n';
import app_state from '../utils/app_state';
import progress_tracker from '../utils/progress_tracker';

/**
 * Add Supervisor modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  store: service('store'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'add-supervisor';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    this.set('existing_user', true);
    this.set('new_user', false);
    this.set('start_code', false);
    this.set('consent_request', false);
    this.set('consent_submitted', false);
    this.set('consent_submitting', false);
    this.set('owner_email', '');
    const sup = this.get('store').createRecord('user', {
      preferences: {
        registration_type: 'manually-added-supervisor'
      }
    });
    this.set('linking', false);
    this.set('error', null);
    sup.set('watch_user_name_and_cookies', true);
    this.set('model.supervisor', sup);
  },

  supervisor_sponsorships: computed(
    'model.user.subscription.purchased_supporters',
    'model.user.subscription.available_supporters',
    function() {
      return this.get('model.user.subscription.available_supporters') || 0;
    }
  ),

  supervisor_types: computed(function() {
    return [
      { name: i18n.t('choose_access_level', "[ Choose Access Level ]"), id: '' },
      { name: i18n.t('edit_access', "Can modify boards and settings, and see reports"), id: 'edit' },
      { name: i18n.t('read_only_access', "Can see boards, settings and reports, but not modify"), id: 'read_only' },
      { name: i18n.t('modeling_access', "Can see boards, and model only"), id: 'modeling_only' }
    ];
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    set_user_type(type) {
      this.set('start_code', false);
      this.set('existing_user', false);
      this.set('new_user', false);
      this.set('consent_request', false);
      if (type === 'new') {
        this.set('new_user', true);
      } else if (type === 'start_code') {
        this.set('start_code', true);
      } else if (type === 'consent_request') {
        this.set('consent_request', true);
      } else {
        this.set('existing_user', true);
      }
    },
    updateSupervisorPermission(value) {
      this.set('supervisor_permission', value);
    },
    send_consent_request() {
      var _this = this;
      var lookup_key = (_this.get('owner_email') || '').trim();
      var uiPermission = _this.get('supervisor_permission');
      if (!lookup_key || !uiPermission) { return; }
      var permission_level = 'view_only';
      if (uiPermission === 'edit') {
        permission_level = 'edit_boards';
      } else if (uiPermission === 'modeling_only') {
        permission_level = 'modeling_only';
      } else if (uiPermission === 'read_only') {
        permission_level = 'view_only';
      }
      _this.set('consent_submitting', true);
      _this.set('error', null);
      persistence.ajax('/api/v1/supervisor_relationships', {
        type: 'POST',
        data: {
          supervisor_relationship: {
            lookup_key: lookup_key,
            permission_level: permission_level
          }
        }
      }).then(function() {
        _this.set('consent_submitting', false);
        _this.set('consent_submitted', true);
      }, function() {
        _this.set('consent_submitting', false);
        // Show success regardless to prevent user enumeration
        _this.set('consent_submitted', true);
      });
    },
    add() {
      const controller = this;
      if (!controller.get('supervisor_permission') && !controller.get('start_code')) {
        return;
      }
      controller.set('linking', true);
      let get_user_name = RSVP.resolve(this.get('supervisor_key'));
      if (this.get('new_user')) {
        const supervisor = this.get('model.supervisor');
        supervisor.set('watch_user_name_and_cookies', false);
        get_user_name = supervisor.save().then(function(user) {
          return user.get('user_name');
        }, function() {
          return RSVP.reject(i18n.t('creating_supervisor_failed', "Failed to create a new user with the given settings"));
        });
      } else if (this.get('start_code')) {
        get_user_name = RSVP.resolve(this.get('start_code_key'));
      }
      get_user_name.then(function(user_name) {
        const user = controller.get('model.user');
        let type = 'add';
        if (controller.get('supervisor_permission') === 'edit') {
          type = 'add_edit';
        } else if (controller.get('supervisor_permission') === 'modeling_only') {
          type = 'add_modeling';
        } else if (controller.get('start_code')) {
          type = 'start';
        }
        if (controller.get('premium_supporter') && controller.get('supervisor_sponsorships')) {
          type = type.replace(/^add/, 'add_premium');
        }
        user.set('supervisor_key', type + '-' + user_name);
        return user.save().then(function(user) {
          const add_done = function() {
            controller.set('linking', false);
            app_state.get('currentUser').reload();
            modal.close();
          };
          if (user.get('start_progress')) {
            controller.set('linking', { start_code: true });
            progress_tracker.track(user.get('start_progress'), function(event) {
              if (event.status === 'errored' || (event.status === 'finished' && event.result && event.result.translated === false)) {
                user.reload();
                controller.set('linking', false);
                controller.set('error', i18n.t('start_code_failed', "The start code failed to process completely, and may need to be re-tried"));
              } else if (event.status === 'finished') {
                user.reload();
                add_done();
              }
            });
          } else {
            add_done();
          }
        }, function() {
          controller.set('linking', false);
          controller.set('error', i18n.t('adding_supervisor_failed_explanation', "The user name provided was not valid, or can't be added to this account."));
        });
      }, function(err) {
        controller.set('linking', false);
        controller.set('error', err);
      });
    }
  }
});
