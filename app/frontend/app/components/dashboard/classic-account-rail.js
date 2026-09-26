import Component from '@ember/component';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

/* ROUTE -> ROW, for `aria-current`.
 *
 * SAME SHAPE AND SAME ANSWERS as components/account-rail.js, deliberately: the two rails serve
 * the same destinations in the two views, so a page that lights "Reports" in Modern has to
 * light "Reports" here. Divergence between them would be invisible until someone switched
 * views mid-task, which is exactly when a nav has to stay put.
 *
 * WHY A MAP AT ALL, when <LinkTo> computes its own highlight:
 *   - <LinkTo> does not set `aria-current`, and a highlight a sighted user can see has to
 *     reach a screen-reader user too. That is the whole of this map's job for seven rows.
 *   - The account page answers to TWO route names (routes/user/account.js gives `user.account`
 *     the same template as `user.index`), so its row needs `@current-when` as well.
 *   - `user.goal` and `user.log` are SIBLINGS of `user.goals` / `user.logs` in router.js, not
 *     children, so <LinkTo> does not light the parent row on a detail page. Those two rows take
 *     their `is-active` from here instead -- the same source as their `aria-current`, so the
 *     highlight and the announcement cannot disagree.
 */
const ROW_FOR_ROUTE = {
  'user.index': 'account', 'user.account': 'account', 'user.history': 'account',
  'user.stats': 'stats',
  'user.goals': 'goals', 'user.goal': 'goals', 'user.badges': 'goals',
  'user.lessons': 'lessons',
  'user.recordings': 'recordings',
  'user.edit': 'edit',
  'user.preferences': 'preferences',
  'user.subscription': 'subscription',
  'user.logs': 'logs', 'user.log': 'logs'
};

/* Bound into the account row's `@current-when`. Stated once and used twice (there and through
   the map above) so the highlight and the announcement cannot name different route sets. */
const ACCOUNT_ROUTES = 'user.account user.index user.history';

export default Component.extend({
  tagName: '',
  router: service('router'),
  app_state: service('app-state'),
  stashes: service('stashes'),
  accountCurrentWhen: ACCOUNT_ROUTES,
  /* COLLAPSE STATE IS THE DASHBOARD RAIL'S, not a second one (2026-09-25, requested: "make the
     rail collapsable (the same positioning the collapse has on the home page)").
     `classic_rail_collapsed` is the key `dashboard/classic-rail.js:118` reads and writes, and its
     note says why it is stashed rather than local: collapsing the rail on one page keeps it
     collapsed on the next. Two keys would break that the moment someone collapsed the rail on the
     home page and walked into the account page to find it open again. */
  railCollapsed: computed('stashes.classic_rail_collapsed', function() {
    return !!this.stashes.get('classic_rail_collapsed');
  }),

  /* AUTO-COLLAPSED AT 1024 AND BELOW (2026-09-25, requested).
   *
   * THE EFFECTIVE RANGE IS 901-1024, and that is not a shortcut. Every collapsed-state style in
   * _classic-home.scss lives inside `@media (min-width: 901px)` (:418) and the control itself is
   * `display: none` below 901 (:540) -- because down there the rail is already full-width and
   * sits ABOVE the content, where an 88px column would be a stripe across the top rather than a
   * sidebar. So the class is inert at those widths whether or not it is applied; setting it from
   * `max-width: 1024px` costs nothing and keeps this reading the way the request was phrased.
   *
   * PRESENTATIONAL, NOT PERSISTED. `classic_rail_collapsed` is the user's own choice and is
   * shared with the dashboard rail, so writing to it here would silently rewrite a preference
   * they set on another page, and collapse the home page's rail as a side effect of resizing.
   * This state lives on the component and disappears with it; widening the window hands control
   * straight back to the stashed preference.
   *
   * THE CONTROL STILL WORKS while narrow: `toggle_rail` flips a local override instead of the
   * stash, so someone who wants the rail open at 1000px can have it, and the override is dropped
   * whenever the breakpoint is crossed so the next visit to that width starts collapsed again. */
  narrow: false,
  narrow_expanded: false,
  isCollapsed: computed('railCollapsed', 'narrow', 'narrow_expanded', function() {
    if(this.get('narrow')) { return !this.get('narrow_expanded'); }
    return this.get('railCollapsed');
  }),
  /* `ctrlAction` IS PER-COMPONENT, not inherited (Ember 5.12). It is built in `init` by every
     component that uses the `(this.ctrlAction "…")` binding -- see
     dashboard/classic-rail.js:34-50, whose wrapper this is, copied so the collapse markup taken
     from that rail works unchanged. Without it `this.ctrlAction` is undefined and the binding is
     inert: the button renders, takes focus and does nothing, which is exactly how this shipped
     for one round of verification before the browser check caught it. */
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

    /* `matchMedia` rather than a resize handler: the browser tells us when the breakpoint is
       CROSSED, so there is nothing to debounce and no runloop scheduling (which the
       `ember/no-runloop` lint rule forbids anyway). Guarded because the value is read at init
       and a host without matchMedia should simply never be narrow. */
    if(typeof window !== 'undefined' && window.matchMedia) {
      var mql = window.matchMedia('(max-width: 1024px)');
      this._narrow_mql = mql;
      this.set('narrow', !!mql.matches);
      this._narrow_listener = function(e) {
        if(self.isDestroyed || self.isDestroying) { return; }
        /* Dropping the override on every crossing is what makes "auto" mean auto: each arrival
           at a narrow width starts collapsed, whatever was chosen at the last one. */
        self.set('narrow_expanded', false);
        self.set('narrow', !!e.matches);
      };
      if(mql.addEventListener) {
        mql.addEventListener('change', this._narrow_listener);
      } else if(mql.addListener) {
        /* Safari < 14 and the Cordova/Electron webviews that trail it. */
        mql.addListener(this._narrow_listener);
      }
    }
  },

  willDestroy() {
    var mql = this._narrow_mql;
    if(mql && this._narrow_listener) {
      if(mql.removeEventListener) {
        mql.removeEventListener('change', this._narrow_listener);
      } else if(mql.removeListener) {
        mql.removeListener(this._narrow_listener);
      }
    }
    this._narrow_mql = null;
    this._narrow_listener = null;
    this._super(...arguments);
  },
  actions: {
    toggle_rail: function() {
      /* While narrow the control is a local override (see `narrow` above); only at full width
         does it write the preference the dashboard rail shares. */
      if(this.get('narrow')) {
        this.set('narrow_expanded', !this.get('narrow_expanded'));
        return;
      }
      this.stashes.persist('classic_rail_collapsed', !this.get('railCollapsed'));
    }
  },
  activeRow: computed('router.currentRouteName', 'app_state.current_route', function() {
    var route = this.get('router.currentRouteName') || this.get('app_state.current_route') || '';
    return ROW_FOR_ROUTE[route] || null;
  })
});
