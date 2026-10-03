import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { later as runLater } from '@ember/runloop';
import persistence from '../../utils/persistence';
import modal from '../../utils/modal';
import i18n from '../../utils/i18n';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import LingoLinq from '../../app';
import { is_classic } from '../../utils/view_style';

export default Controller.extend({
  router: service('router'),
  app_state: service('app-state'),
  refresh_lists: function() {
    this.set('users', {});
    this.set('evals', {});
    this.set('org_extras', {});
    this.set('managers', {});
    this.set('supervisors', {});
    /* `section` is NOT reset here: it is a query param now, so the URL is what says which
       section to open, and nulling it on arrival would discard the one a link just supplied.
       Switching orgs does not carry a stale section either -- a link without the param leaves it
       null, which `shown_view` reads as Managers. */
    this.refresh_users();
    this.refresh_evals();
    this.refresh_extras();
    this.refresh_managers();
    this.refresh_supervisors();
  },
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
  /* WHICH PEOPLE SECTION IS SHOWING, AND IT LIVES IN THE URL (2026-09-25).
   *
   * It was `selected_view`, a transient property set by the `pick` action and nulled on every
   * entry to the route. That was enough while the only way to change sections was a button
   * INSIDE this page. It stopped being enough when the org tab strip
   * (templates/organization.hbs) started offering the five sections from OUTSIDE it: a parent
   * template cannot set a child controller's transient state, and a `<LinkTo>` that could only
   * reach the page's default section would have made four of the five tabs go to the same place.
   *
   * A QUERY PARAM IS THE ANSWER THIS CODEBASE ALREADY REACHES FOR -- see the note on
   * `homeNavContext` in controllers/user.js: state read from the URL survives a reload, the Back
   * button and a bookmark, where a click-time flag is lost by all three. Sharing a link to an
   * org's Evals list now works, which it never did.
   *
   * NAMED `section`, NOT `view`: this app already uses "view" for the Basic/Modern axis
   * (`board_view_style`, `effective_view_user`, `utils/view_style`), and a `?view=` on an org
   * page would read as that.
   *
   * ONE SOURCE, NOT TWO. `pick` now writes this param rather than a second property, so the
   * in-page tabs and the parent strip cannot disagree about which section is open -- and
   * `refresh_lists` no longer nulls it, which would have discarded the param on arrival and sent
   * every link to Managers. */
  queryParams: ['section'],
  section: null,

  shown_view: computed(
    'section',
    'managers',
    function() {
      return this.get('section') || 'managers';
    }
  ),
  /* Basic view swaps the section pills for the `ch-` tab strip the Basic home page uses.
     Read through `utils/view_style#is_classic`, the single reader for this preference, and
     against `effective_view_user` so a supervisor working on someone else's pages gets the
     shell that person's view calls for. */
  isBasicView: computed('app_state.effective_view_user.preferences.board_view_style', function() {
    return is_classic(this.get('app_state.effective_view_user'));
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
  },

  actions: {
    pick: function(view) {
      /* Writes the QUERY PARAM, so an in-page tab click and a link from the org strip land in the
         same place and the URL always names the section on screen. */
      this.set('section', view);
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
    management_action: function(action, user_name, decision, home_board, symbol_library, offboarding) {
      var model = this.get('model');
      var _this = this;
      _this.set('missing_user_name', null);
      var cleanup = function() { };
      if(action && action.match(/remove/) && !decision) {
        modal.open('modals/confirm-org-action', {action: action, user_name: user_name}).then(function(res) {
          if(res && res.confirmed) {
            _this.send('management_action', action, user_name, true, null, null, {
              parent_email: res.offboarding_parent_email,
              birth_month: res.offboarding_birth_month,
              birth_year: res.offboarding_birth_year,
              under_13: res.offboarding_under_13,
              under_16: res.offboarding_under_16
            });
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
              action = action + '-plus_extras';
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
      if(action === 'remove_user' && offboarding) {
        model.set('offboarding_parent_email', offboarding.parent_email || null);
        model.set('offboarding_birth_month', offboarding.birth_month ? parseInt(offboarding.birth_month, 10) : null);
        model.set('offboarding_birth_year', offboarding.birth_year ? parseInt(offboarding.birth_year, 10) : null);
        model.set('offboarding_under_13', !!offboarding.under_13);
        model.set('offboarding_under_16', !!offboarding.under_16);
      } else {
        model.set('offboarding_parent_email', null);
        model.set('offboarding_birth_month', null);
        model.set('offboarding_birth_year', null);
        model.set('offboarding_under_13', null);
        model.set('offboarding_under_16', null);
      }
      if(home_board) {
        model.set('assignment_action', 'copy_board:' + home_board + ':' + (symbol_library || 'original'));
      }
      model.save().then(function() {
        model.set('offboarding_parent_email', null);
        model.set('offboarding_birth_month', null);
        model.set('offboarding_birth_year', null);
        model.set('offboarding_under_13', null);
        model.set('offboarding_under_16', null);
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
              // COMMENTED OUT 2026-08-15 — the "Run Setup Wizard" action on this
              // toast was one of the last UI entry points into the retired
              // onboarding wizard, and routes/setup.js now guards the route, so
              // the button would bounce straight back to the manager's home page.
              // Kept rather than deleted because the toast's `opts.action` shape
              // (timeout + action{text, callback}) is the only example of a
              // modal.success action button in this controller — useful if a
              // replacement follow-up action is wanted here later.
              // if(user.get('permissions.edit')) {
              //   opts = {
              //     timeout: 15000,
              //     action: {
              //       text: i18n.t('run_setup', "Run Setup Wizard"),
              //       callback: function() {
              //         _this.router.transitionTo('setup', {queryParams: {user_id: user.get('id')}});
              //       }
              //     }
              //   };
              // }
              modal.success(i18n.t('user_added', "User \"%{un}\" added!", {un: user_name}), false, false, opts);
            });
          });
        }
        cleanup();
      }, function(err) {
        model.set('offboarding_parent_email', null);
        model.set('offboarding_birth_month', null);
        model.set('offboarding_birth_year', null);
        model.set('offboarding_under_13', null);
        model.set('offboarding_under_16', null);
        console.log(err);
        if(err && err.errors && err.errors.length === 1 && err.errors[0].match(/invalid user/)) {
          _this.set('missing_user_name', user_name);
        } else if(err && err.errors && err.errors.length === 1 && err.errors[0].match(/extras already activated/)) {
          modal.error(i18n.t('user_already_has_premium_symbols', "Premium symbols have already been enabled for this user"));
        } else {
          modal.error(i18n.t('management_action_failed', "Management action failed unexpectedly"));
        }
      });
    }
  }
});
