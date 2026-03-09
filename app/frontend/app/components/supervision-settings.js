import Component from '@ember/component';
import { inject as service } from '@ember/service';
import EmberObject from '@ember/object';
import { computed, set as emberSet, get as emberGet } from '@ember/object';
import modalUtil from '../utils/modal';
import capabilities from '../utils/capabilities';

/**
 * Supervision Settings Modal Component
 * 
 * Converted from supervision-settings template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  persistence: service('persistence'),
  tagName: '',
  compactInline: false,

  init() {
    this._super(...arguments);
    this.set('add_supervisee_hit', false);

    if (this.get('inline')) {
      const model = this.get('model');
      if (model && model.reload) {
        model.reload();
        this.set('model.load_all_connections', true);
      }
    } else {
      const modal = this.get('modal');
      const template = 'supervision-settings';
      const options = (modal && modal.getSettingsFor && modal.getSettingsFor(template)) ||
                      (modal && modal.settingsFor && modal.settingsFor[template]) ||
                      this.get('model') || {};
      if (options.user) {
        this.set('model', options.user);
        this.get('model').reload();
        this.set('model.load_all_connections', true);
      } else {
        // No user passed - use EmberObject so .get() works; plain {} would break model.get(), model.reload(), etc.
        this.set('model', EmberObject.create(options));
      }
    }
  },
  
  aliasable_orgs: computed(
    'model.organizations',
    'appState.currentUser.organizations',
    function() {
      var my_orgs = {};
      var admin = false;
      (this.appState.get('currentUser.organizations') || []).forEach(function(org) {
        if(org.type == 'manager') {
          my_orgs[org.id] = org;
          if(org.admin) {
            admin = true;
          }
        }
      });
      var _this = this;
      var list = [];
      (_this.get('model.organizations') || []).forEach(function(org) {
        if(org.external_auth) {
          if((my_orgs[org.id] || admin)) {
            emberSet(org, 'aliasable', true);
          }
          if(_this.get('model.permissions.link_auth')) {
            list.push(org);  
          }
        }
      });
      return list;
    }
  ),
  
  show_supervisees: computed(
    'model.supervisees',
    'model.known_supervisees',
    'model.all_connections.loading',
    'model.all_connections.error',
    function() {
      var res = this.get('model.supervisees.length') || this.get('model.known_supervisees.length');
      return res > 0;
    }
  ),
  
  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      // Opening lifecycle handled by service
      const component = this;
      this.get('modal').setComponent(component);
      
      // Set model and reload (from original controller opening hook)
      const model = this.get('model');
      if (model && model.reload) {
        model.reload();
        this.set('model.load_all_connections', true);
      }
    },
    closing() {
      // Closing lifecycle
    },
    remove_supervisor: function(id, type) {
      var user = this.get('model');
      var code = "remove_supervisor-" + id;
      if(type == 'org') {
        code = "remove_supervisor-org-" + id;
      }
      user.set('supervisor_key', code);
      user.save().then(null, function() {
        alert("sadness!");
      });
    },
    remove_supervision: function(id) {
      var user = this.get('model');
      user.set('supervisor_key', "remove_supervision-" + id);
      user.save().then(null, function() {
        alert("sadness!");
      });
    },
    remove_supervisee: function(id) {
      var user = this.get('model');
      user.set('supervisor_key', "remove_supervisee-" + id);
      user.save().then(null, function() {
        alert("sadness!");
      });
    },
    add_supervisor: function() {
      var _this = this;
      _this.appState.check_for_currently_premium(_this.get('model'), 'add_supervisor', true).then(function() {
        modalUtil.open('add-supervisor', {user: _this.get('model')});
      }, function() { });
    },
    add_supervisee: function() {
      this.set('add_supervisee_hit', !this.get('add_supervisee_hit'));
    },
    update_alias: function(org) {
      var _this = this;
      var user_id = _this.get('model.id');
      var org_id = org.id;
      var alias = emberGet(org, 'external_auth_alias');
      emberSet(org, 'alias_state', {updating: true});
      _this.persistence.ajax("/api/v1/organizations/" + org_id + "/alias", {
        type: 'POST', data: {
          user_id: user_id,
          alias: alias
        }
      }).then(function(res) {
        setTimeout(function() {
          _this.get('model').reload();
          if(emberGet(org, 'alias_state.updated')) {
            emberSet(org, 'alias_state', null);
          }
        }, 3000);
        emberSet(org, 'alias_state', {updated: true});
      }, function(err) {
        emberSet(org, 'alias_state', {error: true});
      })
    },
    link_auth: function(org) {
      var _this = this;
      emberSet(org, 'alias_state', {temping: true});
      // first generate temp token
      _this.persistence.ajax('/saml/tmp_token', {type: 'POST'}).then(function(res) {
        var token = res.tmp_token;
        emberSet(org, 'alias_state', {temp_go: true});
        setTimeout(function() {
          if(emberGet(org, 'alias_state.temp_go')) {
            emberSet(org, 'alias_state', null);
          }
        }, 3000);
        var url = "/saml/init?org_id=" + org.id + "&user_id=" + _this.get('model.id') + "&tmp_token=" + token;
        if(capabilities.installed_app) {
          // window.open or embed
          window.open(url + "&embed=1", '_blank');
        } else {
          location.href = url;
        }  
      }, function(err) {
        emberSet(org, 'alias_state', {temp_error: true});
      });
    },
    start_codes: function() {
      modalUtil.open('modals/start-codes', {user: this.get('model')});
    }
  }
});
