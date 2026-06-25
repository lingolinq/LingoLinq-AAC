import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { getOwner } from '@ember/application';
import i18n from '../../utils/i18n';
import modal from '../../utils/modal';

export default Controller.extend({
  persistence: service('persistence'),

  features: null,
  categories: null,
  inheritedFrom: null,
  scopeType: null,
  scopeId: null,
  loading: false,
  loadError: false,
  saving: false,
  searchQuery: '',
  categoryFilter: '',
  pendingToggles: null,

  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
    this.ctrlActionMut = function(propPath, targetProp) {
      return function(event) {
        var value = event && event.target ? event.target[targetProp] : undefined;
        self.set(propPath, value);
      };
    };

    this.set('pendingToggles', {});
  },

  filteredFeatures: computed('features.[]', 'searchQuery', 'categoryFilter', function() {
    var list = this.get('features') || [];
    var q = (this.get('searchQuery') || '').trim().toLowerCase();
    var cat = this.get('categoryFilter') || '';
    return list.filter(function(f) {
      if (cat && f.category !== cat) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (f.name || '').toLowerCase().indexOf(q) !== -1 ||
        (f.key || '').toLowerCase().indexOf(q) !== -1 ||
        (f.description || '').toLowerCase().indexOf(q) !== -1;
    });
  }),

  categoryOptions: computed('categories.[]', function() {
    var cats = this.get('categories') || [];
    var options = [{id: '', label: i18n.t('system_settings_filter_all_categories', 'All categories')}];
    cats.forEach(function(c) {
      options.push({id: c, label: c});
    });
    return options;
  }),

  scopeHint: computed('scopeType', function() {
    var scopeType = this.get('scopeType');
    if (scopeType === 'group') {
      var scopeId = this.get('scopeId');
      if (scopeId === 'canary') {
        return i18n.t('system_settings_features_hint_canary', 'Set which features are granted site-wide to users with the canary flag.');
      }
      if (scopeId === 'beta') {
        return i18n.t('system_settings_features_hint_beta', 'Set which features are available site-wide for per-user beta opt-in.');
      }
    }
    if (scopeType === 'org') {
      return i18n.t('system_settings_features_hint_org', 'Set which features are enabled for users in the selected organization. Per-user beta opt-in can still enable additional features from the beta pool.');
    }
    return i18n.t('system_settings_features_hint_default', 'Set the site-wide default features enabled for all organizations that do not have a custom list.');
  }),

  inheritedLabel: computed('inheritedFrom', 'scopeType', function() {
    var inherited = this.get('inheritedFrom');
    if (!inherited) {
      return null;
    }
    if (inherited === 'code_default') {
      return i18n.t('system_settings_inherited_code_default', 'Using code default');
    }
    if (inherited === 'site_default') {
      return i18n.t('system_settings_inherited_site_default', 'Using site default');
    }
    if (inherited === 'site_custom') {
      return i18n.t('system_settings_inherited_site_custom', 'Customized site setting');
    }
    if (inherited === 'org_custom') {
      return i18n.t('system_settings_inherited_org_custom', 'Custom organization override');
    }
    return null;
  }),

  resetButtonLabel: computed('scopeType', function() {
    if (this.get('scopeType') === 'org') {
      return i18n.t('system_settings_reset_site_default', 'Reset to site default');
    }
    return i18n.t('system_settings_reset_code_default', 'Reset to code default');
  }),

  resetConfirmMessage: computed('scopeType', function() {
    if (this.get('scopeType') === 'org') {
      return i18n.t('system_settings_features_reset_confirm', 'Reset feature settings to inherit the site default?');
    }
    return i18n.t('system_settings_features_reset_code_confirm', 'Reset feature settings to the code default?');
  }),

  getOrgId: function() {
    var parent = getOwner(this).lookup('controller:system-settings');
    return (parent && parent.get('org_id')) || 'default';
  },

  loadFeatures: function() {
    var _this = this;
    var orgId = this.getOrgId();
    this.set('loading', true);
    this.set('loadError', false);
    this.set('pendingToggles', {});
    this.persistence.ajax('/api/v1/system_features?org_id=' + encodeURIComponent(orgId), {type: 'GET'}).then(function(res) {
      _this.set('loading', false);
      _this.set('features', res.features || []);
      _this.set('categories', res.categories || []);
      _this.set('inheritedFrom', res.inherited_from);
      _this.set('scopeType', res.scope_type);
      _this.set('scopeId', res.scope_id);
      var pending = {};
      (res.features || []).forEach(function(f) {
        pending[f.key] = !!f.enabled;
      });
      _this.set('pendingToggles', pending);
    }, function() {
      _this.set('loading', false);
      _this.set('loadError', true);
    });
  },

  isFeatureEnabled: function(key) {
    var pending = this.get('pendingToggles') || {};
    if (pending.hasOwnProperty(key)) {
      return pending[key];
    }
    var f = (this.get('features') || []).find(function(item) { return item.key === key; });
    return f ? !!f.enabled : false;
  },

  actions: {
    toggleFeature: function(key) {
      var pending = Object.assign({}, this.get('pendingToggles') || {});
      pending[key] = !this.isFeatureEnabled(key);
      this.set('pendingToggles', pending);
    },

    saveFeatures: function() {
      var _this = this;
      var orgId = this.getOrgId();
      var enabled = [];
      var pending = this.get('pendingToggles') || {};
      Object.keys(pending).forEach(function(key) {
        if (pending[key]) {
          enabled.push(key);
        }
      });
      this.set('saving', true);
      this.persistence.ajax('/api/v1/system_features', {
        type: 'PUT',
        data: {org_id: orgId, enabled_features: enabled}
      }).then(function() {
        _this.set('saving', false);
        modal.success(i18n.t('system_settings_features_saved', 'Feature settings saved.'));
        _this.loadFeatures();
      }, function(err) {
        _this.set('saving', false);
        modal.error(err.error || err.errors || i18n.t('system_settings_save_error', 'Could not save settings.'));
      });
    },

    resetFeatures: function() {
      var _this = this;
      var orgId = this.getOrgId();
      if (!window.confirm(this.get('resetConfirmMessage'))) {
        return;
      }
      this.set('saving', true);
      this.persistence.ajax('/api/v1/system_features?org_id=' + encodeURIComponent(orgId), {type: 'DELETE'}).then(function() {
        _this.set('saving', false);
        modal.success(i18n.t('system_settings_features_reset_done', 'Feature settings reset.'));
        _this.loadFeatures();
      }, function(err) {
        _this.set('saving', false);
        modal.error(err.error || err.errors || i18n.t('system_settings_save_error', 'Could not save settings.'));
      });
    }
  }
});
