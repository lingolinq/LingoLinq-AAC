import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';

export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'request-supervision';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    this.set('lookup_value', '');
    this.set('permission_level', '');
    this.set('submitting', false);
    this.set('submitted', false);
    this.set('error', null);
  },

  permission_levels: computed(function() {
    return [
      { name: i18n.t('choose_permission_level', "[ Choose Permission Level ]"), id: '' },
      { name: i18n.t('view_only_permission', "View Only - Can see boards and reports but not make changes"), id: 'view_only' },
      { name: i18n.t('edit_boards_permission', "Edit Boards - Can view and modify boards"), id: 'edit_boards' },
      { name: i18n.t('manage_devices_permission', "Manage Devices - Can view, edit boards and manage device settings"), id: 'manage_devices' },
      { name: i18n.t('full_permission', "Full Access - Complete account management access"), id: 'full' }
    ];
  }),

  can_submit: computed('lookup_value', 'permission_level', 'submitting', function() {
    return this.get('lookup_value') && this.get('permission_level') && !this.get('submitting');
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},

    updatePermissionLevel(value) {
      this.set('permission_level', value);
    },

    submit() {
      var _this = this;
      if (!_this.get('can_submit')) { return; }

      _this.set('submitting', true);
      _this.set('error', null);

      persistence.ajax('/api/v1/supervisor_relationships', {
        type: 'POST',
        data: {
          supervisor_relationship: {
            communicator_lookup: _this.get('lookup_value'),
            permission_level: _this.get('permission_level')
          }
        }
      }).then(function() {
        _this.set('submitting', false);
        _this.set('submitted', true);
        // Reload current user to refresh pending requests
        if (app_state.get('currentUser')) {
          app_state.get('currentUser').reload();
        }
      }, function() {
        _this.set('submitting', false);
        // Show generic success message regardless of actual result
        // to prevent user enumeration
        _this.set('submitted', true);
      });
    }
  }
});
