import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { observer } from '@ember/object';
import { getOwner } from '@ember/application';
import Utils from '../utils/misc';
import i18n from '../utils/i18n';

export default Controller.extend({
  app_state: service('app-state'),
  router: service('router'),
  queryParams: ['org_id'],
  org_id: 'default',
  orgsLoading: false,
  orgRecords: null,

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
    this.ctrlActionEventValue = function(actionName, targetProp) {
      return function(event) {
        var value = event && event.target ? event.target[targetProp] : undefined;
        self.send(actionName, value);
      };
    };
    this.ctrlActionEventValueBound = function(actionName, boundArg, targetProp) {
      return function(event) {
        var value = event && event.target ? event.target[targetProp] : undefined;
        self.send(actionName, boundArg, value);
      };
    };
    this.loadOrganizations();
  },

  /** Site-wide settings (default org, feature groups, app defaults) require settings.admin on the server. */
  canEditSiteWide: computed('app_state.sessionUser', 'app_state.sessionUser.settings', 'app_state.currentUser', 'app_state.currentUser.settings', function() {
    var u = this.get('app_state.sessionUser') || this.get('app_state.currentUser');
    var settings = u && u.get('settings');
    return !!(settings && settings.admin === true);
  }),

  loadOrganizations: function() {
    var _this = this;
    var user = this.get('app_state.currentUser');
    var managed = (user && user.get('organizations') || []).filter(function(o) {
      return o.type === 'manager' && o.restricted !== true;
    });
    var hasAdmin = managed.find(function(o) { return o.admin && o.full_manager; });
    if (hasAdmin) {
      this.set('orgsLoading', true);
      Utils.all_pages('organization', {q: 'all'}).then(function(res) {
        _this.set('orgsLoading', false);
        _this.set('orgRecords', res || []);
      }, function() {
        _this.set('orgsLoading', false);
        _this.set('orgRecords', []);
      });
    } else {
      this.set('orgRecords', managed);
    }
  },

  showFeatureGroups: computed('router.currentRouteName', function() {
    var route = this.get('router.currentRouteName') || '';
    return route.indexOf('system-settings.features') === 0;
  }),

  scopeOptionGroups: computed('orgRecords.[]', 'showFeatureGroups', 'canEditSiteWide', function() {
    var groups = [];
    if (this.get('showFeatureGroups') && this.get('canEditSiteWide')) {
      groups.push({
        label: i18n.t('system_settings_scope_site_groups', 'Site & feature groups'),
        options: [
          {id: 'default', name: i18n.t('system_settings_default_org', 'Default (LingoLinq)')},
          {id: 'group:canary', name: i18n.t('system_settings_group_canary', 'Canary')},
          {id: 'group:beta', name: i18n.t('system_settings_group_beta', 'Beta opt-in')}
        ]
      });
    } else if (this.get('canEditSiteWide')) {
      groups.push({
        label: i18n.t('system_settings_org_label', 'Organization'),
        options: [
          {id: 'default', name: i18n.t('system_settings_default_org', 'Default (LingoLinq)')}
        ]
      });
    }

    var orgOptions = [];
    (this.get('orgRecords') || []).forEach(function(org) {
      var id = org.get ? org.get('id') : org.id;
      var name = org.get ? org.get('name') : org.name;
      if (id) {
        orgOptions.push({id: id, name: name || id});
      }
    });
    if (orgOptions.length) {
      groups.push({
        label: i18n.t('system_settings_scope_organizations', 'Organizations'),
        options: orgOptions
      });
    }
    return groups;
  }),

  flatScopeOptions: computed('scopeOptionGroups.[]', function() {
    var flat = [];
    (this.get('scopeOptionGroups') || []).forEach(function(group) {
      (group.options || []).forEach(function(opt) {
        flat.push(opt);
      });
    });
    return flat;
  }),

  selectedOrgName: computed('org_id', 'flatScopeOptions.[]', function() {
    var id = this.get('org_id') || 'default';
    var match = (this.get('flatScopeOptions') || []).find(function(o) { return o.id === id; });
    return match ? match.name : id;
  }),

  onOrgIdChanged: observer('org_id', function() {
    this.reloadActiveChild();
  }),

  ensureWritableOrgScope: observer('orgRecords.[]', 'canEditSiteWide', 'org_id', function() {
    if (this.get('canEditSiteWide')) {
      return;
    }
    var orgId = this.get('org_id') || 'default';
    if (orgId === 'default' || orgId.indexOf('group:') === 0) {
      var records = this.get('orgRecords') || [];
      var first = records[0];
      var id = first && (first.get ? first.get('id') : first.id);
      if (id) {
        this.set('org_id', id);
      }
    }
  }),

  onRouteChanged: observer('router.currentRouteName', function() {
    var route = this.get('router.currentRouteName') || '';
    var orgId = this.get('org_id') || 'default';
    if (orgId.indexOf('group:') === 0 && route.indexOf('system-settings.features') !== 0) {
      this.set('org_id', 'default');
    }
  }),

  reloadActiveChild: function() {
    var owner = getOwner(this);
    var route = this.get('router.currentRouteName') || '';
    if (route.indexOf('system-settings.email-edit') === 0) {
      var edit = owner.lookup('controller:system-settings.email-edit');
      if (edit && typeof edit.loadTemplate === 'function') {
        edit.loadTemplate();
      }
    } else if (route.indexOf('system-settings.features') === 0) {
      var features = owner.lookup('controller:system-settings.features');
      if (features && typeof features.loadFeatures === 'function') {
        features.loadFeatures();
      }
    } else if (route.indexOf('system-settings.emails') === 0) {
      var emails = owner.lookup('controller:system-settings.emails');
      if (emails && typeof emails.loadTemplates === 'function') {
        emails.loadTemplates();
      }
    } else if (route.indexOf('system-settings.app-defaults') === 0) {
      var appDefaults = owner.lookup('controller:system-settings.app-defaults');
      if (appDefaults && typeof appDefaults.loadDefaults === 'function') {
        appDefaults.loadDefaults();
      }
    }
  },

  actions: {
    setOrgId: function(orgId) {
      this.set('org_id', orgId || 'default');
    }
  }
});
