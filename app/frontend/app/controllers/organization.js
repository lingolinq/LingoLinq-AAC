import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import session from '../utils/session';
import persistence from '../utils/persistence';
import LingoLinq from '../app';
import { computed } from '@ember/object';
import { is_classic } from '../utils/view_style';
import { pillForRoute } from '../utils/primary_nav';
import { showsRoomsPill } from '../utils/rooms_nav';
import { later as runLater } from '@ember/runloop';
import app_state from '../utils/app_state';
import capabilities from '../utils/capabilities';

export default Controller.extend({
  /* BASIC VIEW WEARS THE `ch-` TAB STRIP IN THIS NAV'S PLACE (requested 2026-09-23).
   *
   * This is the ORGANISATION pages' own nav -- `templates/organization.hbs` -- and it is a
   * different element from `components/user-pill-nav`, which serves the user-level pages. Both
   * render `md-pillnav md-pillnav--dashboard`, which is why converting one looked like it had
   * not worked when viewed on the other's pages.
   *
   * Same technique as there: swap the BASE class names only, never fork the markup. Half these
   * pills are behind permission gates (`permissions.manage`, the telemetry and trainings flags)
   * and a second Basic copy of the nav would mean a second copy of those gates. */
  isClassic: computed('app_state.effective_view_user.preferences.board_view_style', function() {
    return is_classic(this.get('app_state.effective_view_user'));
  }),
  /* WHETHER THIS SECTION DRAWS ITS OWN NAV, or stands down for the app shell's (2026-09-23).
   *
   * The rooms page is in the PRIMARY nav for a rooms-only supervisor -- Rooms is their pill in
   * the Organizations slot -- so on that page the app shell mounts the rail and the full pill
   * row with Rooms active, and this section's two-item strip would be a SECOND nav stacked
   * underneath it.
   *
   * ASKED OF `utils/primary_nav`, NOT RESTATED HERE. That module already answers "does the
   * primary nav name this page", and it is the same call `controllers/application.js` makes to
   * decide whether to draw the nav at all -- so this strip stands down exactly when the other
   * one appears, and the page can never end up with two navs or none. `canSeeRooms` comes from
   * `utils/rooms_nav`, the one reading of the user both navs share.
   *
   * BASIC KEEPS ITS OWN STRIP unconditionally: `showGlobalChrome` returns false for Basic
   * (controllers/application.js), so there is no app-shell nav there to stand down for.
   *
   * Reads `router.currentRouteName` with `app_state.current_route` as the fallback, the same
   * pair and the same order as `components/account-rail.js` -- one of the two is stale during a
   * transition, and which one depends on the direction. */
  showSectionPillNav: computed('router.currentRouteName', 'appState.current_route',
                               'appState.currentUser.has_management_responsibility',
                               'appState.currentUser.supervised_units.[]', function() {
    var route = this.get('router.currentRouteName') || this.get('appState.current_route') || '';
    var hoisted = pillForRoute(route, null, {
      canManageOrgs: this.get('appState.currentUser.has_management_responsibility'),
      canSeeRooms: showsRoomsPill(this.get('appState.currentUser'))
    });
    return !hoisted;
  }),

  /* THE ORGS THIS PERSON COULD SWITCH TO, for the picker above the header.
   *
   * Built from `supervised_units`, which carries an `organization_id` per unit and is NOT
   * filtered to one org: `OrganizationUnit.supervised_units` collects every
   * `org_unit_supervisor` link the person holds, so rooms in two districts are possible even
   * though the current seed data has none. Without a switcher the rail's Rooms row resolves to
   * `sortedRooms[0].organization_id` and the others are unreachable.
   *
   * Names come from `currentUser.organizations`, since the units carry ids only. */
  switchableOrgs: computed('appState.currentUser.supervised_units.[]',
                           'appState.currentUser.organizations.[]', 'model.id', function() {
    var names = {};
    (this.get('appState.currentUser.organizations') || []).forEach(function(o) {
      if(o && o.id) { names[o.id] = o.name; }
    });
    var seen = {};
    (this.get('appState.currentUser.supervised_units') || []).forEach(function(u) {
      if(u && u.organization_id) { seen[u.organization_id] = true; }
    });
    var current = this.get('model.id');
    var collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return Object.keys(seen).map(function(id) {
      return { id: id, name: names[id] || id, is_current: id === current };
    }).sort(function(a, b) { return collator.compare(a.name || '', b.name || ''); });
  }),

  /* ONLY WORTH SHOWING WITH SOMETHING TO CHOOSE BETWEEN (requested). With a single org the
     control is a dropdown whose only option is the page you are already on.
     BOTH VIEWS AS OF 2026-09-23 (requested: "on modern view, there's no organization dropdown
     on the rooms page, filtering the rooms results"). It was gated on `isClassic` because Basic
     is where it was first asked for -- but the thing it fixes is not a Basic problem: a
     supervisor with rooms in two organisations can only reach one of them without it, since
     every entry point resolves to `sortedRooms[0].organization_id`. Modern had the same dead
     end and no switcher to escape it.
     NOTHING ELSE CHANGED TO SUIT MODERN: the `.ch-org-switcher` / `.ch-org-dropdown` rules in
     _classic-home.scss are written unscoped (only the hero-spacing rule beside them carried a
     `body.ll-view-basic`, now widened to match this), and the control's look was already built
     to the app's modern-select idiom rather than Basic's. */
  showOrgSwitcher: computed('switchableOrgs.[]', function() {
    return (this.get('switchableOrgs') || []).length > 1;
  }),

  /* The org sub-page currently open, for the Basic strip's second tab. Derived from the router
     rather than passed down, because this template is the PARENT of every org sub-route and has
     no other way to know which child is rendering. Falls back to the org's own name so the tab
     is never blank on a route added later without a label here. */
  currentSectionLabel: computed('router.currentRouteName', 'model.name', function() {
    var route = (this.get('router.currentRouteName') || '').replace(/^organization\./, '');
    var labels = {
      /* "Organizations", NOT "Dashboard" (requested 2026-09-24). This strip reads
         "< Home | <section>", and on an org's own index page the second item named the page
         type rather than the section you are in -- so a manager standing on Cedar Valley
         Therapy saw "Dashboard", which is also what the app's OWN home page is called two
         items to the left. Naming the section keeps the pair reading as "up one level" and
         "where you are", and it is the same word the rail and the Modern pill use for this
         destination. It renders as the active item already, since the current section is a
         non-link span with `aria-current="page"`. */
      'index':        i18n.t('organizations', "Organizations"),
      'people':       i18n.t('user', "User"),
      'reports':      i18n.t('reports', "Reports"),
      'telemetry':    i18n.t('telemetry', "Telemetry"),
      'rooms':        i18n.t('rooms', "Rooms"),
      /* SINGULAR ON THE DETAIL PAGE (requested 2026-09-23). It read "Rooms" there, which named
         the LIST while standing on one room -- and with the way back also reading "Home" there
         was nothing in the strip that said which page you were on or how to get back to the
         list. See `backRoute` below for the other half. */
      'room':         i18n.t('room', "Room"),
      'lessons':      i18n.t('trainings', "Trainings"),
      'settings':     i18n.t('settings', "Settings"),
      'extras':       i18n.t('extras', "Extras"),
      'subscription': i18n.t('subscription', "Subscription")
    };
    return labels[route] || this.get('model.name') || i18n.t('dashboard', "Dashboard");
  }),
  /* THE WAY BACK, one step up rather than always to the app's home (requested 2026-09-23:
     "Back (instead of Home) that takes the user back to the Rooms page").
     ONE ROUTE NEEDS IT TODAY -- `organization.room`, the room detail page, whose parent is the
     rooms LIST and not the dashboard. Every other org sub-page IS a top-level section of the
     org, so for those the way out of the section is still the app's home page.
     THREE COMPUTEDS, NOT A BRANCH IN THE TEMPLATE, because the strip is written twice (once
     with Basic's `ch-` classes and once with Modern's pills) and a conditional in the markup
     would be a conditional in each -- which is how the two views come to disagree about where
     Back goes. The templates bind `@route` and `@models` and say nothing about the rule.
     `@models` is an ARRAY so both cases use one LinkTo: empty for a route with no dynamic
     segment, one org id for the rooms list. */
  backRoute: computed('router.currentRouteName', function() {
    var route = this.get('router.currentRouteName') || '';
    return route === 'organization.room' ? 'organization.rooms' : 'index';
  }),
  backModels: computed('backRoute', 'model.id', function() {
    if(this.get('backRoute') !== 'organization.rooms') { return []; }
    return [this.get('model.id')];
  }),
  backLabel: computed('backRoute', function() {
    return this.get('backRoute') === 'organization.rooms' ?
      i18n.t('back', "Back") : i18n.t('home', "Home");
  }),

  router: service('router'),
  // Ember Data 5.x removed automatic `store` injection into controllers.
  store: service('store'),
  appState: service('app-state'),
  app_state: alias('appState'),
  actions: {
    update_org: function() {
      var org = this.get('model');
      org.save().then(null, function(err) {
        console.log(err);
        modal.error(i18n.t('org_update_failed', "Organization update failed unexpectedly"));
      });
    },
    jobs: function() {
      if(capabilities.installed_app) {
        modal.error(i18n.t('not_allowed_in_app', "Job tracking only available on the web"));
        return;
      }
      persistence.ajax('/api/v1/auth/admin', {type: 'POST', data: {}}).then(function(res) {
        if(res && res.success) {
          location.href = '/jobby';
        } else {
          modal.error(i18n.t('jobs_unauthorized', "Job tracking not authorized"));
        }
      }, function(err) {
        modal.error(i18n.t('unauthorized', "Not authorized"));
      })
    },
    masquerade: function() {
      if(this.get('model.admin') && this.get('model.permissions.manage')) {
        var user_name = this.get('masquerade_user_name');
        var _this = this;
        this.store.findRecord('user', user_name).then(function(u) {
          var data = session.restore();
          data.original_user_name = data.user_name;
          data.as_user_id = user_name;
          data.user_name = user_name;
          session.persist(data).then(function() {
            app_state.return_to_index();
            runLater(function() {
              location.reload();
            });
          });
        }, function() {
          modal.error(i18n.t('couldnt_find_user', "Couldn't retrieve user \"%{user_name}\" for masquerading", {user_name: user_name}));
        });
      }
    },
    find_board: function() {
      var key = this.get('search_board');
      var _this = this;
      if(key) {
        LingoLinq.store.findRecord('board', key).then(function(res) {
          _this.router.transitionTo('board', res.get('key'));
        }, function(err) {
          if(err.deleted && err.key) {
            _this.router.transitionTo('board', err.key);
          } else {
            modal.error(i18n.t('no_boards_found', "No boards found matching that lookup"));
          }
        });
      }
    },
    find_user: function() {
      var q = this.get('search_user');
      var _this = this;
      if(q) {
        var opts = {q: q};
        if(!this.get('model.admin')) {
          opts.org_id = this.get('model.id');
        }
        LingoLinq.store.query('user', opts).then(function(res) {
          if(res.content.length === 0) {
            modal.warning(i18n.t('no_user_result', "No results found for \"%{q}\"", {q: q}));
          } else if(res.content.length == 1) {
            _this.router.transitionTo('user.index', res.slice()[0].get('user_name'));
          } else {
            modal.open('user-results', {list: res, q: q});
          }
        }, function() {
          modal.error(i18n.t('error_searching', "There was an unexpected error while search for the user"));
        });
      }
    }
  }
});
