import Component from '@ember/component';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import modal from '../../utils/modal';
import { pillForRoute } from '../../utils/primary_nav';

/* The Basic-view rail, as a component any page can render.
 *
 * WHY IT EXISTS. The rail lived only inside `dashboard/classic-view.hbs`, so it appeared on the
 * Basic dashboard and nowhere else. `/organizations` is not under the `user` route and gets
 * neither this rail nor the Modern `AccountRail`, which mattered once the rail's Rooms row was
 * removed (2026-09-23): an org-unit supervisor reaches their rooms only through the
 * Organizations page, and that page had no navigation back out.
 *
 * COPIED, NOT MOVED (requested). `classic-view.hbs` still carries its own inline rail and is
 * byte-identical to what it was; this component duplicates that markup rather than replacing
 * it. That keeps the dashboard out of the blast radius, at the cost of two copies of ~370 lines
 * that can drift. Pointing `classic-view.hbs` at `<Dashboard::ClassicRail />` is the one step
 * that would remove the duplication, and nothing here blocks it.
 *
 * WHAT IT DERIVES vs WHAT IT IS GIVEN. Everything below reads from `appState`, `stashes` or
 * `persistence`, which are the same sources the dashboard's copy reads -- so these are the same
 * answers, not a second opinion. Only `@user` is passed in, because the dashboard
 * resolves that from its own supervisee context and a standalone rail has none; it falls back
 * to the session user when no argument is supplied.
 */
export default Component.extend({
  tagName: '',
  appState: service('app-state'),
  stashes: service('stashes'),
  persistence: service('persistence'),
  router: service(),

  init() {
    this._super(...arguments);
    var self = this;
    /* Same wrapper shape the dashboard components use, so the copied markup's
       `(this.ctrlAction "…")` bindings work unchanged. */
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
  },

  /* `app_state` as well as `appState`: the copied markup addresses the service by the
     underscored name the dashboard components expose, and renaming it in the markup would be a
     diff against the copy for no gain. One service, two names onto it. */
  app_state: computed('appState', function() {
    return this.get('appState');
  }),


  /* IS THIS ALREADY THE HOME PAGE? -- the gate on the rail's Home Page row (requested
   * 2026-09-24: "make sure the Home Page button does not show when the user is on their home
   * page"). A row that navigates to where you already are is dead weight in a short list.
   *
   * IT IS A REAL QUESTION, not a constant. `Dashboard::ClassicView` renders on THREE routes --
   * `index`, `bento` and `user/extras` (grep `Dashboard::ClassicView` in app/templates) -- and
   * `Dashboard::ClassicRail` renders on the organisation pages, so neither copy of the rail can
   * assume it is or is not on the dashboard.
   *
   * ASKED OF `utils/primary_nav`, which already owns "which routes are the home page" (`index`
   * and `user.home` both answer 'home'). A third list here is exactly the drift this session
   * has been removing; the gates are passed empty because only the ungated 'home' answer
   * matters. */
  onHomePage: computed('appState.current_route', function() {
    return pillForRoute(this.appState.get('current_route') || '', null, {}) === 'home';
  }),

  classicUser: computed('user', 'appState.currentUser', function() {
    return this.get('user') || this.appState.get('currentUser');
  }),

  /* ORG MODE (2026-09-25, requested: "on basic view: on the organizations page, after an
   * organization has been selected, the contents of the ch-rail need to change").
   *
   * Inside an organisation the rail stops being the personal dashboard's sidebar and becomes that
   * organisation's nav: the rows about YOUR boards, home board, logging, subscription,
   * supervisors and sync give way to the org's own pages, and Organizations reads as the section
   * you are standing in rather than as a way out of it.
   *
   * KEYED ON BEING GIVEN AN ORG, NOT ON A ROUTE LIST. `templates/organization.hbs` passes
   * `@org={{this.model}}`; `templates/organizations.hbs` (the directory) passes nothing and gets
   * the rail exactly as it was. That makes the switch a property of the call site, so there is no
   * list of `organization.*` route names here to fall out of step with router.js -- the mistake
   * this session has already had to correct once in `showClassicAccountRail`
   * (controllers/user.js). It also means the org's id for every row's link comes from the same
   * object that decided the mode, so the rail cannot be in org mode without an org to link to. */
  orgSection: computed('org', function() {
    return !!this.get('org');
  }),

  supervisorCount: computed('appState.currentUser.supervisors', function() {
    return (this.appState.get('currentUser.supervisors') || []).length;
  }),
  hasSupervisors: computed('supervisorCount', function() {
    return this.get('supervisorCount') > 0;
  }),
  homeBoardKey: computed('appState.currentUser.preferences.home_board.key', function() {
    return this.appState.get('currentUser.preferences.home_board.key');
  }),
  homeBoardPending: computed('homeBoardKey', 'appState.currentUser.home_board_pending', function() {
    return !this.get('homeBoardKey') && !!this.appState.get('currentUser.home_board_pending');
  }),
  loggingEnabled: computed('appState.currentUser.preferences.logging', function() {
    return !!this.appState.get('currentUser.preferences.logging');
  }),
  loggingWithGeo: computed('loggingEnabled', 'appState.currentUser.preferences.geo_logging', function() {
    return !!(this.get('loggingEnabled') && this.appState.get('currentUser.preferences.geo_logging'));
  }),

  /* Rooms. Reproduced from `dashboard/authenticated-view.js`, which the dashboard's own copy of
     this rail inherits them from and this standalone component does not. Same derivation, so
     the two rails resolve the same destination: the first supervised unit's organization_id,
     which is also what the Modern Rooms card's "see all" button uses. */
  sortedRooms: computed('appState.currentUser.supervised_units.[]', function() {
    var units = (this.appState.get('currentUser.supervised_units') || []).slice();
    var collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    units.sort(function(a, b) { return collator.compare((a && a.name) || '', (b && b.name) || ''); });
    return units;
  }),
  roomsAllOrgId: computed('sortedRooms.[]', function() {
    var first = (this.get('sortedRooms') || [])[0];
    return first && first.organization_id;
  }),

  /* Collapsed state is stashed, not local, so collapsing the rail on one page keeps it
     collapsed on the next -- the dashboard and this component read and write the same key. */
  railCollapsed: computed('stashes.classic_rail_collapsed', function() {
    return !!this.stashes.get('classic_rail_collapsed');
  }),

  /* COLLAPSED BY DEFAULT INSIDE AN ORGANISATION (2026-09-25, requested: "when an organization is
   * selected, make the ch-rail unexpanded by default").
   *
   * PRESENTATIONAL, NOT PERSISTED -- the same split `classic-account-rail.js` makes for its
   * auto-collapse at narrow widths, and for the same reason. `classic_rail_collapsed` is the
   * user's own choice and is SHARED with the dashboard and account rails, so writing to it here
   * would silently rewrite a preference they set elsewhere: walk into an org, walk back out, and
   * the home page's rail would be collapsed too. This state lives on the component and dies with
   * it, so leaving the org section hands control straight back to the stashed preference.
   *
   * THE CONTROL STILL WORKS: `toggle_rail` flips this local flag while in org mode instead of
   * the stash, so anyone who wants the rail open on an org page can have it, for as long as they
   * are on one.
   *
   * `isCollapsed` IS WHAT THE TEMPLATE READS, not `railCollapsed` -- the class, the
   * `aria-expanded` and the expand/collapse label all have to agree, and they only do if there is
   * one answer for them to read. */
  org_expanded: false,
  isCollapsed: computed('orgSection', 'org_expanded', 'railCollapsed', function() {
    if(this.get('orgSection')) { return !this.get('org_expanded'); }
    return this.get('railCollapsed');
  }),

  sync_able: computed('extras.ready', 'appState.currentUser.external_device', function() {
    return !this.appState.get('currentUser.external_device');
  }),
  needs_sync: computed('persistence.last_sync_at', function() {
    var p = this.get('persistence');
    if(!p || typeof p.get !== 'function') { return false; }
    var now = (new Date()).getTime() / 1000;
    var lastSync = p.get('last_sync_at') || 0;
    return (now - lastSync) > (7 * 24 * 60 * 60);
  }),

  actions: {
    toggle_rail: function() {
      /* In org mode the control is a LOCAL override (see `isCollapsed` above); only outside it
         does it write the preference the other two rails share. */
      if(this.get('orgSection')) {
        this.set('org_expanded', !this.get('org_expanded'));
        return;
      }
      this.stashes.persist('classic_rail_collapsed', !this.get('railCollapsed'));
    },
    /* The MODAL form, which is what `classic-view.js` overrides its parent with. The parent's
       version flips a dashboard tab, which does not exist on a standalone page. */
    manage_supervisors: function() {
      modal.open('supervision-settings', {user: this.appState.get('currentUser')});
    },
    load_reports: function() {
      var user = this.appState.get('currentUser');
      if(!user) { return; }
      this.get('router').transitionTo('user.stats', user.get('user_name'));
    },
    load_sessions: function() {
      var user_name = this.appState.get('currentUser.user_name');
      if(!user_name) { return; }
      this.get('router').transitionTo('user.logs', user_name);
    },
    newBoard: function() {
      var _this = this;
      this.appState.check_for_needing_purchase().then(function() {
        _this.get('router').transitionTo('create-board-new');
      });
    },
    sync: function() {
      var p = this.get('persistence');
      if(!p || typeof p.get !== 'function') { return; }
      if(!p.get('online') || p.get('syncing')) { return; }
      p.sync('self', true).then(null, function() { });
    },
    /* `reload` and `sync_details` are reached from the rail's sync row. They were missed when
       the rail's actions were first enumerated by hand and caught by diffing the copied
       template's bindings against this class -- which is why that check exists rather than a
       reading of the markup. */
    reload: function() {
      location.reload();
    },
    sync_details: function() {
      var p = this.get('persistence');
      if(!p || typeof p.get !== 'function' || !p.get('online')) {
        modal.open('sync-details', {details: []});
        return;
      }
      var list = ([].concat(p.get('sync_log') || [])).reverse();
      modal.open('sync-details', {details: list});
    }
  }
});
