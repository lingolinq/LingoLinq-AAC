import Controller from '@ember/controller';
import { later as runLater } from '@ember/runloop';
import persistence from '../../utils/persistence';
import modal from '../../utils/modal';
import Utils from '../../utils/misc';
import i18n from '../../utils/i18n';
import { set as emberSet, get as emberGet } from '@ember/object';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import LingoLinq from '../../app';

export default Controller.extend({
  refresh_lists: function() {
    this.set('orgs', {});
    this.set('users', {});
    this.set('evals', {});
    this.set('org_extras', {});
    this.set('managers', {});
    this.set('supervisors', {});
    this.set('selected_view', null);
    this.refresh_users();
    this.refresh_evals();
    this.refresh_extras();
    this.refresh_managers();
    this.refresh_supervisors();
    this.refresh_orgs();
  },
  refresh_orgs: function() {
    var _this = this;
    if(this.get('model.admin')) {
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
  sorted_orgs: computed('orgs.data', function() {
    return this.get('orgs.data').map(function(o) { return o; }).sort(function(a, b) {
        if(a.get('name').toLowerCase() < b.get('name').toLowerCase()) {
          return -1;
        } else if(a.get('name').toLowerCase() > b.get('name').toLowerCase()) {
          return 1;
        } else {
          return 0;
        }
    });
  }),
  alphabetized_orgs: computed('sorted_orgs', function() {
    var orgs = this.get('sorted_orgs') || [];
    var letters = [];
    orgs.forEach(function(org) {
      var letter_string = org.get('name').substring(0, 1).toUpperCase();
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
  filtered_orgs: computed('sorted_orgs', 'org_filter', function() {
    var filter = this.get('org_filter');
    if(!filter || filter == '') { return null; }
    var res = [];
    try {
      var re = new RegExp(filter, 'i');
      (this.get('sorted_orgs') || []).forEach(function(org) {
        if(org.get('name').match(re)) {
          res.push(org);
        }
      });
    } catch(e) { }
    return res.slice(0, 10);
  }),
  refresh_users: function() {
    var _this = this;
    this.set('users.loading', true);
    var id = this.get('model.id');
    persistence.ajax('/api/v1/organizations/' + id + '/users', {type: 'GET'}).then(function(data) {
      _this.set('users.loading', null);
      _this.set('users.data', data.user);
      _this.set('more_users', data.meta && data.meta.next_url);
    }, function() {
      _this.set('users.loading', null);
      _this.set('users.data', null);
    });
  },
  refresh_evals: function() {
    var _this = this;
    this.set('evals.loading', true);
    var id = this.get('model.id');
    persistence.ajax('/api/v1/organizations/' + id + '/evals', {type: 'GET'}).then(function(data) {
      _this.set('evals.loading', null);
      _this.set('evals.data', data.user);
      _this.set('more_evals', data.meta && data.meta.next_url);
    }, function() {
      _this.set('evals.loading', null);
      _this.set('evals.data', null);
    });
  },
  refresh_extras: function() {
    var _this = this;
    this.set('org_extras.loading', true);
    var id = this.get('model.id');
    persistence.ajax('/api/v1/organizations/' + id + '/extras', {type: 'GET'}).then(function(data) {
      _this.set('org_extras.loading', null);
      _this.set('org_extras.data', data.user);
    }, function() {
      _this.set('org_extras.loading', null);
      _this.set('org_extras.data', null);
    });
  },
  refresh_managers: function() {
    var _this = this;
    _this.set('managers.loading', true);
    var id = _this.get('model.id');
    persistence.ajax('/api/v1/organizations/' + id + '/managers', {type: 'GET'}).then(function(data) {
      _this.set('managers.loading', null);
      _this.set('managers.data', data.user);
    }, function() {
      _this.set('managers.loading', null);
      _this.set('managers.data', null);
    });
  },
  refresh_supervisors: function() {
    var _this = this;
    _this.set('supervisors.loading', true);
    var id = _this.get('model.id');
    persistence.ajax('/api/v1/organizations/' + id + '/supervisors', {type: 'GET'}).then(function(data) {
      _this.set('supervisors.loading', null);
      _this.set('supervisors.data', data.user);
      _this.set('more_supervisors', data.meta && data.meta.next_url);
    }, function() {
      _this.set('supervisors.loading', null);
      _this.set('supervisors.data', null);
    });
  },
  shown_view: computed(
    'selected_view',
    'model.admin',
    'managers',
    'model.children_orgs',
    function() {
      if(this.get('selected_view')) {
        return this.get('selected_view');
      } else if(this.get('model.admin')) {
        return 'organizations';
      } else if(!this.get('managers.length') && this.get('model.children_orgs.length')) {
        return 'organizations';
      } else {
        return 'managers';
      }
    }
  ),
  show_organizations: computed('shown_view', function() {
    return this.get('shown_view') == 'organizations';
  }),
  show_managers: computed('shown_view', function() {
    return this.get('shown_view') == 'managers';
  }),
  show_communicators: computed('shown_view', function() {
    return this.get('shown_view') == 'communicators';
  }),
  show_evals: computed('shown_view', function() {
    return this.get('shown_view') == 'evals';
  }),
  show_extras: computed('shown_view', function() {
    return this.get('shown_view') == 'extras';
  }),
  show_supervisors: computed('shown_view', function() {
    return this.get('shown_view') == 'supervisors';
  }),
  no_licenses: computed('model.licenses_available', function() {
    return !this.get('model.licenses_available');
  }),
  no_supervisor_licenses: computed('model.supervisor_licenses_available', function() {
    return !this.get('model.supervisor_licenses_available');
  }),
  no_eval_licenses: computed('model.eval_licenses_available', function() {
    return !this.get('model.eval_licenses_available');
  }),
  no_extras: computed('model.extras_available', function() {
    return !this.get('model.extras_available');
  }),
  suggest_creating_manager: computed('manager_user_name', 'missing_user_name', function() {
    return this.get('missing_user_name') && this.get('missing_user_name') == this.get('manager_user_name');
  }),
  suggest_creating_supervisor: computed('supervisor_user_name', 'missing_user_name', function() {
    return this.get('missing_user_name') && this.get('missing_user_name') == this.get('supervisor_user_name');
  }),
  suggest_creating_communicator: computed('user_user_name', 'missing_user_name', function() {
    return this.get('missing_user_name') && this.get('missing_user_name') == this.get('user_user_name');
  }),
  suggest_creating_eval: computed('eval_user_name', 'missing_user_name', function() {
    return this.get('missing_user_name') && this.get('missing_user_name') == this.get('eval_user_name');
  }),
  actions: {
    pick: function(view) {
      this.set('selected_view', view);
    },
    new_user: function(attr) {
      var _this = this;

      modal.open('new-user', {default_org_management_action: attr, organization_id: this.get('model.id'), org: this.get('model'), no_licenses: this.get('no_licenses'), no_supervisor_licenses: this.get('no_supervisor_licenses'), premium: this.get('model.premium'), no_eval_licenses: this.get('no_eval_licenses')}).then(function(res) {
        if(res && res.created) {
          if(res.user && res.user.get('org_management_action')) {
            _this.send('management_action', res.user.get('org_management_action'), res.user.get('user_name'), null, res.user.get('home_board_template'), res.user.get('home_board_symbols'));
          }
        }
      });
    },
    management_action: function(action, user_name, decision, home_board, symbol_library) {
      var model = this.get('model');
      var _this = this;
      _this.set('missing_user_name', null);
      var cleanup = function() { };
      if(action && action.match(/remove/) && !decision) {
        modal.open('modals/confirm-org-action', {action: action, user_name: user_name}).then(function(res) {
          if(res && res.confirmed) {
            _this.send('management_action', action, user_name, true);
          }
        });
        return;
      } else if(action && (action.match(/add_.*user/) || action.match(/add_\.*supervisor/)) && _this.get('model.home_board_keys.length') > 0 && !home_board) {
        user_name = this.get('user_user_name');
        if(action.match(/supervisor/)) {
          user_name = this.get('supervisor_user_name');
        }
        modal.open('modals/confirm-org-action', {action: 'add_home', for_supervisor: !!action.match(/supervisor/), org: _this.get('model'), user_name: user_name}).then(function(res) {
          if(res && res.home) {
            if(res.extras) {
              action = action + "-plus_extras";
            }
            _this.send('management_action', action, user_name, true, res.home, res.symbols);
          }
        });
        return;
      }
      if(!user_name) {
        if(action == 'add_manager' || action == 'add_assistant') {
          user_name = this.get('manager_user_name');
          cleanup = function() { _this.set('manager_user_name', ''); };
        } else if(action == 'add_supervisor') {
          user_name = this.get('supervisor_user_name');
          cleanup = function() { _this.set('supervisor_user_name', ''); };
        } else if(action == 'add_premium_supervisor') {
          user_name = this.get('supervisor_user_name');
          cleanup = function() { _this.set('supervisor_user_name', ''); };
        } else if(action == 'add_user' || action == 'add_unsponsored_user') {
          user_name = this.get('user_user_name');
          cleanup = function() {
            _this.set('user_user_name', '');
          };
        } else if(action == 'add_eval') {
          user_name = this.get('eval_user_name');
          cleanup = function() { _this.set('eval_user_name', ''); };
        } else if(action == 'add_extras') {
          user_name = this.get('extras_user_name');
          cleanup = function() { _this.set('extras_user_name', ''); };
        }
      }
      if(!user_name) { return; }
      model.set('management_action', action + '-' + user_name);
      if(home_board) {
        model.set('assignment_action', 'copy_board:' + home_board + ':' + (symbol_library || 'original'));
      }
      model.save().then(function() {
        if(home_board) {
          runLater(function() {
            model.reload();
          }, 15000);
        }
        if(action.match(/user/)) {
          _this.refresh_users();
          if(action.match(/plus_extras/)) {
            _this.refresh_extras();
          }
        } else if(action.match(/eval/)) {
          _this.refresh_evals();
        } else if(action.match(/extra/)) {
          _this.refresh_extras();
        } else if(action.match(/manager/) || action.match(/assistant/)) {
          _this.refresh_managers();
        } else if(action.match(/supervisor/)) {
          _this.refresh_supervisors();
        }
        if(action.match(/add_.*user/)) {
          LingoLinq.store.findRecord('user', user_name).then(function(user) {
            user.reload().then(function(user) {
              var opts = {};
              if(user.get('permissions.edit')) {
                opts = {
                  timeout: 15000,
                  action: {
                    text: i18n.t('run_setup', "Run Setup Wizard"),
                    callback: function() {
                      _this.transitionToRoute('setup', {queryParams: {user_id: user.get('id')}});
                    }
                  }
                };
              }
              modal.success(i18n.t('user_added', "User \"%{un}\" added!", {un: user_name}), false, false, opts);
            });
          });
        }
        cleanup();
      }, function(err) {
        console.log(err);
        if(err && err.errors && err.errors.length === 1 && err.errors[0].match(/invalid user/)) {
          _this.set('missing_user_name', user_name);
        } else if(err && err.errors && err.errors.length === 1 && err.errors[0].match(/extras already activated/)) {
          modal.error(i18n.t('user_already_has_premium_symbols', "Premium symbols have already been enabled for this user"));
        } else {
          modal.error(i18n.t('management_action_failed', "Management action failed unexpectedly"));
        }
      });
    },
    add_org: function() {
      if(this.get('model.admin') && this.get('model.permissions.manage')) {
        var _this = this;
        var user_name = this.get('org_user_name');
        var org = this.store.createRecord('organization');
        org.set('name', this.get('org_org_name'));
        org.set('org_access', true);
        org.set('premium', true);
        org.save().then(function() {
          if(user_name) {
            org.set('management_action', 'add_manager-' + user_name);
          }
          org.save().then(function() {
            _this.refresh_orgs();
            _this.transitionToRoute('organization', org.get('id'));
          }, function(err) {
            console.log(err);
            modal.error(i18n.t('add_org_manager_failed', 'Adding organization manager failed unexpectedly'));
          });
        }, function(err) {
          console.log(err);
          modal.error(i18n.t('add_org_failed', 'Adding organization failed unexpectedly'));
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
      if(this.get('model.admin') && this.get('model.permissions.manage')) {
        org.deleteRecord();
        org.save().then(function() {
          _this.refresh_orgs();
        }, function(err) {
          console.log(err);
          modal.error(i18n.t('remove_org_failed', 'Removing organization failed unexpectedly'));
        });
      }
    },
    toggle_letter: function(letter) {
      emberSet(letter, 'expanded', !emberGet(letter, 'expanded'));
    }
  }
});
