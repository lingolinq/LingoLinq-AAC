import Component from '@ember/component';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import modal from '../../utils/modal';

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

  classicUser: computed('user', 'appState.currentUser', function() {
    return this.get('user') || this.appState.get('currentUser');
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
