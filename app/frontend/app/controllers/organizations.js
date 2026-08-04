import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import Utils from '../utils/misc';
import modal from '../utils/modal';
import i18n from '../utils/i18n';

export default Controller.extend({
  router: service('router'),
  app_state: service('app-state'),
  store: service('store'),

  refresh_lists: function() {
    this.set('orgs', {});
    this.refresh_orgs();
  },

  refresh_orgs: function() {
    var _this = this;
    if(this.get('has_admin_access')) {
      this.set('orgs.loading', true);
      Utils.all_pages('organization', {q: 'all'}).then(function(res) {
        _this.set('orgs.loading', null);
        _this.set('orgs.data', res);
      }, function() {
        _this.set('orgs.loading', null);
        _this.set('orgs.data', null);
      });
    }
  },

  managed_orgs: computed('app_state.currentUser.organizations', function() {
    return (this.get('app_state.currentUser.organizations') || []).filter(function(o) {
      return o.type == 'manager' && o.restricted != true;
    });
  }),

  supervision_orgs: computed('app_state.currentUser.organizations', function() {
    return (this.get('app_state.currentUser.organizations') || []).filter(function(o) {
      return o.type == 'supervisor';
    });
  }),

  all_orgs: computed('managed_orgs', 'supervision_orgs', function() {
    var seen = {};
    return (this.get('managed_orgs') || []).concat(this.get('supervision_orgs') || []).filter(function(org) {
      if(seen[org.id]) { return false; }
      seen[org.id] = true;
      return true;
    }).sort(function(a, b) {
      var aName = (a.name || '').toLowerCase();
      var bName = (b.name || '').toLowerCase();
      if(aName < bName) { return -1; }
      if(aName > bName) { return 1; }
      return 0;
    });
  }),

  has_admin_access: computed('all_orgs', function() {
    return !!(this.get('all_orgs') || []).find(function(org) {
      return org.admin && org.full_manager;
    });
  }),

  sorted_orgs: computed('orgs.data', function() {
    return (this.get('orgs.data') || []).map(function(o) { return o; }).sort(function(a, b) {
      var aName = (a.get('name') || '').toLowerCase();
      var bName = (b.get('name') || '').toLowerCase();
      if(aName < bName) { return -1; }
      if(aName > bName) { return 1; }
      return 0;
    });
  }),

  alphabetized_orgs: computed('sorted_orgs', function() {
    var orgs = this.get('sorted_orgs') || [];
    var letters = [];
    orgs.forEach(function(org) {
      var letter_string = (org.get('name') || '').substring(0, 1).toUpperCase();
      var letter = letters[letters.length - 1];
      if((letter || {}).letter != letter_string) {
        letter = {letter: letter_string, orgs: []};
        letters.push(letter);
      }
      letter.orgs.push(org);
      letter.expanded = (letter.orgs.length <= 5);
    });
    return letters;
  }),

  has_org_filter: computed('org_filter', function() {
    return !!(this.get('org_filter') || '').trim();
  }),

  filtered_orgs: computed('sorted_orgs', 'org_filter', function() {
    var filter = this.get('org_filter');
    if(!filter || filter == '') { return null; }
    var res = [];
    var escaped = filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp(escaped, 'i');
    (this.get('sorted_orgs') || []).forEach(function(org) {
      if((org.get('name') || '').match(re)) {
        res.push(org);
      }
    });
    return res.slice(0, 10);
  }),
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
    // Bound separately so {{on "keydown"}} keeps the KeyboardEvent (ctrlAction strips it).
    this.search_user_keydown = function(event) {
      if(event && (event.key === 'Enter' || event.keyCode === 13)) {
        if(event.preventDefault) { event.preventDefault(); }
        self.send('find_user');
      }
    };
  },


  jurisdiction_list: computed(function() {
    return [
      {name: i18n.t('org_jurisdiction_placeholder', "[ Organization location ]"), id: ''},
      {name: i18n.t('org_jurisdiction_us', "United States"), id: 'US'},
      {name: i18n.t('org_jurisdiction_eu', "European Union"), id: 'EU'}
    ];
  }),

  actions: {
    add_org: function() {
      if(this.get('has_admin_access')) {
        var _this = this;
        var user_name = this.get('org_user_name');
        var jurisdiction = (this.get('org_jurisdiction') || '').toString().trim().toUpperCase();
        if(!this.get('org_org_name')) {
          modal.error(i18n.t('org_name_required', "Organization name is required"));
          return;
        }
        if(jurisdiction !== 'US' && jurisdiction !== 'EU') {
          modal.error(i18n.t('org_jurisdiction_required', "Please choose United States or European Union for the organization location"));
          return;
        }
        var org = this.store.createRecord('organization');
        org.set('name', this.get('org_org_name'));
        org.set('jurisdiction', jurisdiction);
        org.set('org_access', true);
        org.set('premium', true);
        org.save().then(function() {
          if(user_name) {
            org.set('management_action', 'add_manager-' + user_name);
          }
          org.save().then(function() {
            _this.set('org_org_name', '');
            _this.set('org_user_name', '');
            _this.set('org_jurisdiction', '');
            _this.refresh_orgs();
            _this.router.transitionTo('organization', org.get('id'));
          }, function(err) {
            console.log(err);
            modal.error(i18n.t('add_org_manager_failed', "Adding organization manager failed unexpectedly"));
          });
        }, function(err) {
          console.log(err);
          modal.error(i18n.t('add_org_failed', "Adding organization failed unexpectedly"));
        });
      }
    },

    remove_org: function(org, decision) {
      var _this = this;
      if(!decision) {
        modal.open('modals/confirm-org-action', {action: 'remove_org', org_name: org.get('name')}).then(function(res) {
          if(res && res.confirmed) {
            _this.send('remove_org', org, true);
          }
        });
        return;
      }
      if(this.get('has_admin_access')) {
        org.deleteRecord();
        org.save().then(function() {
          _this.refresh_orgs();
        }, function(err) {
          console.log(err);
          modal.error(i18n.t('remove_org_failed', "Removing organization failed unexpectedly"));
        });
      }
    },

    toggle_letter: function(letter) {
      emberSet(letter, 'expanded', !emberGet(letter, 'expanded'));
    },

    // Global user lookup for site admins (admin org full managers). Restored on
    // the Organizations directory after the single-org shell redesign dropped it.
    find_user: function() {
      if(!this.get('has_admin_access')) { return; }
      var q = (this.get('search_user') || '').toString().trim();
      if(!q) { return; }
      this.store.query('user', {q: q}).then(function(res) {
        // Ember Data 5 RecordArray has no `.content` — use length/slice (see board-picker, search).
        var list = (res && typeof res.slice === 'function') ? res.slice() : [];
        if(list.length === 0) {
          modal.warning(i18n.t('no_user_result', "No results found for \"%{q}\"", {q: q}));
          return;
        }
        // Always open the results modal so Open Profile and Masquerade are both
        // available per row (exact username no longer auto-navigates away).
        modal.open('user-results', {list: list, q: q});
      }, function() {
        modal.error(i18n.t('error_searching', "There was an unexpected error while search for the user"));
      });
    }
  }
});
