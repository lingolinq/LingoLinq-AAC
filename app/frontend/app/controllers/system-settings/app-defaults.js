import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import i18n from '../../utils/i18n';
import modal from '../../utils/modal';

export default Controller.extend({
  persistence: service('persistence'),

  fields: null,
  settings: null,
  loading: false,
  loadError: false,
  saving: false,

  loadDefaults: function() {
    var _this = this;
    this.set('loading', true);
    this.set('loadError', false);
    this.persistence.ajax('/api/v1/system_app_defaults', {type: 'GET'}).then(function(res) {
      _this.set('loading', false);
      _this.set('fields', res.fields || []);
      _this.set('settings', res.settings || {});
    }, function() {
      _this.set('loading', false);
      _this.set('loadError', true);
    });
  },

  actions: {
    updateField: function(key, value) {
      var settings = Object.assign({}, this.get('settings') || {});
      settings[key] = value;
      this.set('settings', settings);
    },

    saveDefaults: function() {
      var _this = this;
      this.set('saving', true);
      this.persistence.ajax('/api/v1/system_app_defaults', {
        type: 'PUT',
        data: {
          settings: this.get('settings') || {}
        }
      }).then(function() {
        _this.set('saving', false);
        modal.success(i18n.t('system_settings_app_defaults_saved', 'App defaults saved.'));
        _this.loadDefaults();
      }, function(err) {
        _this.set('saving', false);
        modal.error(err.error || err.errors || i18n.t('system_settings_save_error', 'Could not save settings.'));
      });
    }
  }
});
