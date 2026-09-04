import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { computed, observer } from '@ember/object';
import { scheduleOnce } from '@ember/runloop';
import RSVP from 'rsvp';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import Badge from '../models/badge';

function resolveSuperviseeHomeBoardKey(s) {
  if (!s || typeof s !== 'object') {
    return null;
  }
  return (
    s.home_board_key ||
    s.homeBoardKey ||
    (s.home_board && typeof s.home_board === 'object' && s.home_board.key) ||
    (s.preferences && s.preferences.home_board && s.preferences.home_board.key) ||
    null
  );
}

// Palette for the 10 colored avatar PNGs in public/avatars/. The
// caseload card renders its outer glass frame from the inline SVG
// (kept constant across all communicators) but the inner silhouette
// pulls its head/shadow colors from this palette so the card's
// silhouette matches the avatar PNG used everywhere else for that
// communicator.
var CASELOAD_AVATAR_PALETTE = [
  { head: '#5BAEA4', shadow: '#222A4F' }, // 0: teal
  { head: '#5B9BE0', shadow: '#1F2D55' }, // 1: blue
  { head: '#9B7BF7', shadow: '#2D1A4D' }, // 2: violet
  { head: '#F0913E', shadow: '#5C3014' }, // 3: orange
  { head: '#F2C26E', shadow: '#8A6B44' }, // 4: amber
  { head: '#D8478A', shadow: '#4D1531' }, // 5: magenta
  { head: '#34C99A', shadow: '#0E4D3B' }, // 6: emerald
  { head: '#5BBEEF', shadow: '#0C4A6E' }, // 7: sky
  { head: '#4E8E8E', shadow: '#0F2A2B' }, // 8: stormy teal
  { head: '#B98DEC', shadow: '#3B1759' }  // 9: plum
];

function decorateSuperviseeForCaseload(s) {
  var copy = Object.assign({}, s);
  copy.resolved_home_board_key = resolveSuperviseeHomeBoardKey(s);
  // Extract avatar slot 0-9 from the user's avatar_url path so the
  // inline silhouette SVG on the caseload card matches the PNG
  // assigned by the backend.
  var slot = 0;
  if (s && s.avatar_url) {
    var match = String(s.avatar_url).match(/\/avatars\/avatar-(\d+)\.png/);
    if (match) {
      slot = parseInt(match[1], 10);
      if (isNaN(slot) || slot < 0 || slot > 9) { slot = 0; }
    }
  }
  var palette = CASELOAD_AVATAR_PALETTE[slot];
  copy.avatar_head_color = palette.head;
  copy.avatar_shadow_color = palette.shadow;
  // Surface a count + multi-goal flag derived from whatever the
  // payload provides. Prefer an explicit active_goals array if
  // present; otherwise fall back to 1/0 based on the legacy
  // primary_goal (`goal`) field. Templates can't use a `gt` helper
  // (none registered in this project), so the flag is computed here.
  var list = s && s.active_goals;
  var hasList = !!(list && list.length != null);
  var n = hasList ? list.length : (s && s.goal ? 1 : 0);
  copy.goals_count = n;
  copy.has_multiple_goals = n > 1;
  // Resolve which goal text the chip should show in the collapsed
  // summary state, and whether to render a PRIMARY tag next to it.
  // Plain JS arrays from the API don't expose `firstObject`, so we
  // index into [0] here rather than rely on Ember array helpers.
  var displayed = (s && s.goal) || (hasList && list[0]) || null;
  copy.displayed_goal_summary = displayed && displayed.summary;
  copy.displayed_goal_is_primary = !!(
    (s && s.goal) ||
    (hasList && list[0] && list[0].primary)
  );
  // Status for the displayed goal — picks up the value the backend
  // sends on active_goals[0]. Default 'active' when the legacy
  // primary_goal slot fires (no per-goal status in user settings).
  copy.displayed_goal_status =
    (hasList && list[0] && list[0].status) ||
    (s && s.goal ? 'active' : null);
  return copy;
}

export default Controller.extend({
  appState: service('app-state'),
  persistence: service('persistence'),
  router: service('router'),
  store: service(),

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

  // Free-text filter for the supervisee grid — matches against
  // user_name and goal summary (case-insensitive substring). Bound
  // to the search input rendered above the grid.
  superviseeFilter: '',

  // Google Classroom-style flow: the caseload page renders a compact
  // student list by default. The full supervisee card only renders
  // when the supporter clicks a row in the list. selectedSupervisee
  // holds the user_name of the currently expanded row (null = list
  // only, no card showing).
  selectedSupervisee: null,

  // Deep-link target: the user_name of one communicator to focus on arrival, used
  // by the dashboard "Communicators Need Attention" card. A query param rather than
  // a dynamic segment so /caseload stays the URL for all eight existing entry points
  // (pill nav, dashboard cards, org page) and none of them need updating.
  queryParams: ['supervisee'],
  supervisee: null,

  // user_name of a row to HIGHLIGHT without expanding it. Set only by the deep-link
  // path, for a communicator this supporter is linked to as modeling-only: the
  // expanded panel's actions (reports, goals, badges, modeling ideas) are gated on
  // that link, so we point at the person rather than opening a panel of locked
  // controls. Distinct from selectedSupervisee, which exclusively means "expanded".
  highlightedSupervisee: null,

  // Applied once, when BOTH the query param and the supervisee list are available —
  // the param is read during setup but `supervisees` resolves from
  // model.known_supervisees, which arrives later (load_all_connections is set in
  // routes/caseload.js#afterModel). Hence an observer on both rather than a one-shot
  // in setupController. `_deepLinkAppliedFor` keeps the URL shareable (the param is left
  // in place) while ensuring a later list refresh can't yank the supporter's manual
  // selection back to the deep-linked row.
  _deepLinkAppliedFor: null,
  _superviseeDeepLink: observer('supervisee', 'supervisees.[]', function() {
    this._applySuperviseeDeepLink();
  }),
  _applySuperviseeDeepLink: function() {
    var name = this.get('supervisee');
    if (!name) { return; }
    /* Keyed to the NAME that was applied, not a boolean. As a one-way latch this also
       swallowed a genuinely NEW deep link: arriving from the attention card for Bob and
       then for Alice left Alice's URL rendering BOB's expanded panel — his goals, badge
       progress and org status. The original intent still holds, because a later
       `supervisees` refresh re-fires the observer with the SAME name and returns here. */
    if (this.get('_deepLinkAppliedFor') === name) { return; }
    var list = this.get('supervisees') || [];
    var match = list.find(function(s) { return s && s.user_name === name; });
    // Not loaded yet, or not on this caseload at all — leave the page alone and let
    // a later list update re-run this. Never invent a selection for an unknown name.
    if (!match) { return; }
    this.set('_deepLinkAppliedFor', name);
    /* A stale roster filter can hide the very row we are deep-linking to, which made the
       arrival silently do nothing for the rest of the session. */
    if (this.get('superviseeFilter')) { this.set('superviseeFilter', ''); }
    if (match.modeling_only) {
      this.set('highlightedSupervisee', name);
      this.set('selectedSupervisee', null);
    } else {
      this.set('highlightedSupervisee', null);
      this.set('selectedSupervisee', name);
      this._loadBadgeForSupervisee(match);
    }
    // Deferred so the row has actually rendered with its --active/--highlighted
    // class before we look for it. requestAnimationFrame rather than the runloop's
    // scheduleOnce (used by selectSupervisee below) purely to avoid adding another
    // `ember/no-runloop` violation to this file — the project has no ember-lifeline
    // dependency to migrate to. The callback is best-effort: it re-checks isDestroyed
    // and _scrollExpandedIntoView is itself try/caught and no-ops when the row is
    // absent, so a teardown mid-frame is harmless.
    var _this = this;
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame(function() {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        _this._scrollExpandedIntoView();
      });
    }
  },

  supervisees: computed('model.known_supervisees.[]', 'model.supervisees.[]', function() {
    var list = this.get('model.known_supervisees') || [];
    return list.map(decorateSuperviseeForCaseload);
  }),

  // Filtered view of supervisees driven by superviseeFilter. Falls
  // back to the unfiltered list when the input is empty so an
  // empty filter doesn't accidentally hide everyone. Matches the
  // query against the user_name AND every goal-text source we
  // surface for a supervisee: legacy primary_goal (s.goal.summary),
  // the displayed-goal computed (s.displayed_goal_summary), and
  // every entry in the active_goals array.
  filteredSupervisees: computed('supervisees.[]', 'superviseeFilter', function() {
    var list = this.get('supervisees') || [];
    var q = (this.get('superviseeFilter') || '').trim().toLowerCase();
    if (!q) {
      return list;
    }
    return list.filter(function(s) {
      if (!s) { return false; }
      var name = (s.user_name ? String(s.user_name) : '').toLowerCase();
      if (name.indexOf(q) !== -1) { return true; }
      var legacy = (s.goal && s.goal.summary ? String(s.goal.summary) : '').toLowerCase();
      if (legacy.indexOf(q) !== -1) { return true; }
      var displayed = (s.displayed_goal_summary ? String(s.displayed_goal_summary) : '').toLowerCase();
      if (displayed.indexOf(q) !== -1) { return true; }
      var actives = s.active_goals;
      if (actives && actives.length) {
        for (var i = 0; i < actives.length; i++) {
          var g = actives[i];
          if (g && g.summary && String(g.summary).toLowerCase().indexOf(q) !== -1) {
            return true;
          }
        }
      }
      return false;
    });
  }),

  // Show the filter when there's more than one supervisee, or the
  // filter has text in it (so an active filter that just narrowed
  // the list to one match doesn't hide the input the user is typing
  // into). Computed in JS to avoid needing a `gt` truth-helper in
  // Handlebars — this project doesn't register one.
  showSuperviseeFilter: computed('supervisees.length', 'superviseeFilter', function() {
    var count = (this.get('supervisees') || []).length;
    var q = this.get('superviseeFilter') || '';
    return count > 1 || q.length > 0;
  }),

  // When a communicator's home is the eval board (obf/eval…), opening "Model for" would
  // land on the same eval UI as "Run evaluation". Prefer starred boards or a non-eval
  // sidebar board — same idea as home_in_speak_mode's obf/stars-{id} for sync_starred_boards.
  _modelingEntryBoardKeyAvoidingEval: function(u) {
    if (!u || typeof u.get !== 'function') {
      return null;
    }
    if (u.get('preferences.sync_starred_boards')) {
      var starredLen = (u.get('stats.starred_board_refs') || []).length;
      var starredCount = u.get('stats.starred_boards');
      if (starredLen > 0 || starredCount) {
        return 'obf/stars-' + u.get('id');
      }
    }
    var side = u.get('preferences.sidebar_boards') || [];
    for (var i = 0; i < side.length; i++) {
      var brd = side[i];
      var k = brd && (brd.key || (typeof brd === 'string' ? brd : null));
      if (k && !String(k).match(/^obf\/eval/)) {
        return k;
      }
    }
    return null;
  },

  // `modeling` picks which mode we enter, and it maps to set_speak_mode_user's
  // `keep_as_self`: true keeps the supporter as themselves on the communicator's
  // board (modeling), false makes them the speaking user (speak-as).
  //
  // A modeling-only link used to be blocked from the speak-as path here. That
  // guard was UI policy, not a backend constraint: api/logs_controller#create
  // requires only `allowed?(user, 'model')` (logs_controller.rb:187), which every
  // supervisor including modeling-only holds (user.rb:63), and it records
  // `:author => @api_user` regardless of client mode — so the supporter is
  // attributed server-side either way. Modelers may now Speak.
  _enterSpeakModeForSuperviseeId: function(boardUserId, modeling) {
    if (!boardUserId) {
      return;
    }
    var appState = this.get('appState');
    var _this = this;
    if (!modeling) {
      appState.set_speak_mode_user(boardUserId, true, false);
      return;
    }
    this.get('store').findRecord('user', boardUserId).then(function(u) {
      var homeKey = u.get('preferences.home_board.key');
      var forceKey = null;
      if (homeKey && String(homeKey).match(/^obf\/eval/)) {
        forceKey = _this._modelingEntryBoardKeyAvoidingEval(u);
      }
      if (forceKey) {
        appState.set_speak_mode_user(u.get('id'), true, true, forceKey);
      } else {
        appState.set_speak_mode_user(u.get('id'), true, true);
      }
    }, function() {
      modal.error(i18n.t('error_loading_user2', "There was an unexpected error trying to load the user"));
    });
  },

  // Scroll the just-expanded communicator card into view. If it fits the
  // viewport, bring it fully in; if it's taller, align its top near the top so
  // the header + goals show and the rest can scroll. Only scrolls when the card
  // actually extends past the viewport, so already-visible rows don't jump.
  _scrollExpandedIntoView: function() {
    try {
      // Also matches the deep-link highlight, which is NOT expanded and so carries
      // no --active class; both states want the identical top-aligned scroll.
      var row = document.querySelector('.md-caseload__list-row--active, .md-caseload__list-row--highlighted');
      if (!row || typeof row.scrollIntoView !== 'function') { return; }
      // ALWAYS top-align the opened card, and always scroll.
      //
      // This used to pick `block: 'nearest'` whenever the card fitted the
      // viewport, and to skip scrolling entirely when the row was already fully
      // visible. Both produced the reported behaviour: 'nearest' scrolls the
      // MINIMUM distance, so a card whose bottom was below the fold got its
      // BOTTOM pulled to the viewport bottom — leaving the previous
      // communicator's row occupying the top of the screen, which reads as
      // "it scrolled to the wrong person".
      // 'start' puts the card's own top edge at the top every time.
      //
      // The navbar clearance is MEASURED from the live header, not taken from
      // --topbar-height: that token resolves to 16px on authenticated layouts
      // (app.scss ~367) while the bar this page actually renders is ~88px, so
      // trusting it scrolled the card up UNDER the header and clipped its top.
      // Measuring also survives the bar changing height between layouts (16 /
      // 68 / 70 / 129px are all live values in this app) and when it wraps.
      // Written to inline scroll-margin-top rather than doing the arithmetic
      // ourselves, so this keeps working whether the scroll container is the
      // window or an ancestor element.
      var offset = 0;
      var header = document.querySelector('#within_ember > header') || document.querySelector('body > header');
      if (header && typeof window.getComputedStyle === 'function') {
        var pos = window.getComputedStyle(header).position;
        if (pos === 'fixed' || pos === 'sticky') {
          offset = header.getBoundingClientRect().height || 0;
        }
      }
      if (offset > 0) {
        row.style.scrollMarginTop = (offset + 12) + 'px';
      }
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      row.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start', inline: 'nearest' });
    } catch (e) { /* best-effort — never block toggling */ }
  },

  // Load the in-progress badge for the row that just opened.
  //
  // Two requests, and both are needed:
  //   1. `query('badge', {user_id: <me>, recent: 1})` — the index endpoint's
  //      `recent` branch returns badges for the supporter AND every supervisee
  //      (badges_controller.rb ~13), including unearned, un-superseded ones,
  //      which is exactly "in progress". Cached on the controller so opening a
  //      second row costs nothing.
  //   2. `findRecord('badge', id)` for the winner — the INDEX serializer omits
  //      `completion_settings` (it is gated on `args[:permissions]`,
  //      json_api/badge.rb ~33), and both `completion_explanation` and
  //      `time_left` are computed from it. Without this second call the panel
  //      could show a name and a bar but never the "to earn this badge…" text.
  _loadBadgeForSupervisee: function(supervisee) {
    var _this = this;
    var user_id = supervisee && (supervisee.id != null ? supervisee.id : supervisee.user_id);
    if (!user_id) { return; }
    this.set('selectedBadge', null);
    // Tracked separately from `selectedBadge` because null means two different
    // things — "still loading" and "there is no badge" — and the empty state
    // must not flash while the request is in flight.
    this.set('badgeLoading', true);
    /* Every write below has to re-check that this response still describes the
       row on screen. `_badgesForUser` only populates its cache after the FIRST
       query resolves, so clicking row A then row B inside that window fires two
       concurrent queries with no ordering guarantee — and if A's lands last it
       used to set `selectedBadge` to A's badge while `selectedSupervisee` was
       already B. The panel captions the tile with `supervisee.user_name`
       (caseload.hbs:354), so that rendered one communicator's badge progress
       under another communicator's name — and because the nested findRecord
       handler DID guard, B's own detail load then correctly refused to
       overwrite it, leaving the mismatch on screen rather than flickering past.
       Safe as a precondition: selectSupervisee sets `selectedSupervisee`
       immediately before calling this (:416-417). */
    var stale = function() {
      return _this.isDestroyed || _this.isDestroying ||
             _this.get('selectedSupervisee') !== supervisee.user_name;
    };
    this._badgesForUser(user_id).then(function(badges) {
      if (stale()) { return; }
      var best = Badge.best_next_badge(badges || [], null);
      if (!best) {
        _this.set('badgeLoading', false);
        return;
      }
      // Keep the summary visible while the detailed record loads, so the tile
      // does not flash empty on a slow connection.
      _this.set('selectedBadge', best);
      _this.set('badgeLoading', false);
      _this.get('store').findRecord('badge', best.get('id')).then(function(full) {
        // Same guard: the supporter may have collapsed this row, or opened a
        // different one, while the request was in flight.
        if (stale()) { return; }
        _this.set('selectedBadge', full);
      }, function() { /* keep the summary record — it still renders */ });
    }, function() {
      // A failed lookup is not proof there is no badge, but the panel has
      // nothing to show either way — fall through to the empty state, which
      // offers a useful next step rather than an error the supporter cannot act on.
      if (stale()) { return; }
      _this.set('badgeLoading', false);
    });
  },

  /* Badges for ONE communicator, cached per user id.
     This used to be a single `{user_id: me, recent: 1}` query covering the
     supporter and every supervisee at once, which the API paginates at
     DEFAULT_PAGE = 10 (lib/json_api/badge.rb:5) with no ordering and no
     `per_page` sent (json_api/json.rb:24,30) — SQL `LIMIT 11`. A supporter with
     more than a handful of communicators therefore got at most 10 rows in
     arbitrary order, and because the `recent` branch also returns EARNED badges
     that best_next_badge immediately discards, the supporter's own recently
     earned badges could consume the whole page and leave every supervisee panel
     showing "No badge in progress".
     Raising per_page only moves the ceiling (MAX_PAGE is 25). The panel opens
     one communicator at a time, so scoping the request to that communicator
     removes the ceiling entirely — and the non-`recent` branch of
     badges_controller#index is exactly this query (`user_id` + not superseded,
     not disabled). One request per row, cached for the session. */
  _badgesForUser: function(user_id) {
    var _this = this;
    if (!user_id) { return RSVP.reject(); }
    var cache = this.get('_superviseeBadges') || {};
    if (cache[user_id]) { return RSVP.resolve(cache[user_id]); }
    return this.get('store').query('badge', {user_id: user_id}).then(function(badges) {
      var list = [];
      badges.forEach(function(badge) { list.push(badge); });
      if (!_this.isDestroyed && !_this.isDestroying) {
        // Re-read: another row's request may have populated the cache meanwhile.
        var current = _this.get('_superviseeBadges') || {};
        var next = Object.assign({}, current);
        next[user_id] = list;
        _this.set('_superviseeBadges', next);
      }
      return list;
    });
  },

  /* Drops the per-user badge cache. The controller is a singleton that survives
     route exit, so without this a badge earned (or a goal-with-badge added)
     after the first look stayed invisible for the rest of the session. */
  _clearBadgeCache: function() {
    if (!this.isDestroyed && !this.isDestroying) { this.set('_superviseeBadges', null); }
  },

  actions: {
    // Open the static "Managing Your Caseload" guide modal (info button next to
    // the "People you support" subheader) — maps the row quick-action icons and
    // explains what opening a communicator's card lets you do.
    // Toggle the selected supervisee. Clicking a row in the compact
    // student list opens that supervisee's full card below; clicking
    // the same row again (or another row) collapses or switches.
    selectSupervisee: function(supervisee, event) {
      // The action is bound to the entire <li> row so clicking
      // anywhere on the row (including the chevron) toggles the
      // selection. Skip if the click originated from a quick-action
      // button or LinkTo inside .md-caseload__list-quick so those
      // controls handle their own click without also toggling the
      // card.
      if (event && event.target && event.target.closest) {
        /* `--more` is EXCLUDED: it deliberately carries no handler of its own and relies
           on this click bubbling to the row header, but it is itself a
           `.md-caseload__list-quick button`, so this guard swallowed it — the button did
           nothing and aria-expanded never flipped. The tour now points at it, so a dead
           control is the first thing a new supporter is shown. */
        if (event.target.closest('.md-caseload__list-quick button:not(.md-caseload__quick-action--more), .md-caseload__list-quick a')) {
          return;
        }
      }
      var name = supervisee && supervisee.user_name;
      if (!name) { return; }
      // Any manual row interaction retires the deep-link highlight — it exists only
      // to point out the person you arrived for, not as a persistent state.
      this.set('highlightedSupervisee', null);
      if (this.get('selectedSupervisee') === name) {
        this.set('selectedSupervisee', null);
        this.set('selectedBadge', null);
      } else {
        this.set('selectedSupervisee', name);
        this._loadBadgeForSupervisee(supervisee);
        // After the panel renders, bring the newly-expanded card into view —
        // expanding a low row can push its content below the fold.
        scheduleOnce('afterRender', this, this._scrollExpandedIntoView);
      }
    },

    // The badge tile opens the same modal the dashboard uses, so the panel is a
    // preview of it rather than a second, divergent presentation of a badge.
    show_badge: function(badge) {
      if (!badge) { return; }
      modal.open('badge-awarded', {badge: badge, user_name: badge.get('user_name')});
    },

    // Reset the supervisee text filter. Bound to the × inside the
    // filter input and to the "Clear filter" CTA in the no-matches
    // empty state.
    clearSuperviseeFilter: function() {
      this.set('superviseeFilter', '');
    },

    // Same API as index route / dashboard: set_speak_mode_user(id, true, keep_as_self).
    // Modeling uses findRecord first so we can avoid opening obf/eval (eval tools) when
    // that is only the communicator's eval placeholder home — same symptom as Run evaluation.
    caseload_model_for: function(supervisee) {
      if (!supervisee) {
        return;
      }
      var boardUserId = supervisee.id != null ? supervisee.id : supervisee.user_id;
      if (boardUserId == null && supervisee.user_name) {
        boardUserId = supervisee.user_name;
      }
      this._enterSpeakModeForSuperviseeId(boardUserId, true);
    },
    caseload_speak_as: function(supervisee) {
      if (!supervisee) {
        return;
      }
      var boardUserId = supervisee.id != null ? supervisee.id : supervisee.user_id;
      if (boardUserId == null && supervisee.user_name) {
        boardUserId = supervisee.user_name;
      }
      this._enterSpeakModeForSuperviseeId(boardUserId, false);
    },

    stats: function(userName) {
      this.get('router').transitionTo('user.stats', userName);
    },

    modeling_ideas: function(userName) {
      var users = [];
      var model = this.get('model');
      if (!model) {
        return;
      }
      if (!userName) {
        var knownSupervisees = model.get('known_supervisees') || [];
        if (knownSupervisees.length > 0) {
          knownSupervisees.forEach(function(u) {
            if (u.premium) {
              users.push(u);
            }
          });
        } else {
          users.push(model);
        }
      } else {
        (model.get('known_supervisees') || []).forEach(function(u) {
          if (u.user_name === userName) {
            users.push(u);
          }
        });
      }
      if (users.length > 0) {
        modal.open('modals/modeling-ideas', { users: users });
      }
    },

    set_goal: function(supervisee) {
      if (!supervisee) {
        return;
      }
      var rawId = supervisee.id != null ? supervisee.id : supervisee.user_id;
      if (rawId == null) {
        return;
      }
      var _this = this;
      this.get('store').findRecord('user', rawId).then(function(user_model) {
        // modal.open resolves with the saved goal record when Add Goal
        // succeeds, and rejects when the user cancels. Reload the
        // current user on success so the goal we just saved appears
        // in the supervisee card's goal slot without a manual page
        // refresh.
        modal.open('new-goal', { user: user_model }).then(function(res) {
          if (!res) { return; }
          /* A goal can carry a badge, so the cached badge list for this
             communicator is now stale — the empty state's own "Add Goal with
             Badge" CTA otherwise kept saying "No badge in progress" for the
             rest of the session, including after re-navigating to /caseload. */
          _this._clearBadgeCache();
          if (_this.get('selectedSupervisee')) {
            var open_row = (_this.get('supervisees') || []).filter(function(s) {
              return s.user_name === _this.get('selectedSupervisee');
            })[0];
            if (open_row) { _this._loadBadgeForSupervisee(open_row); }
          }
          var current = _this.get('appState.currentUser');
          if (current && typeof current.reload === 'function') {
            current.reload();
          }
        }, function() { });
      }, function() {
        modal.error(i18n.t('error_loading_user2', "There was an unexpected error trying to load the user"));
      });
    },

    record_note: function(supervisee) {
      if (!supervisee) {
        return;
      }
      var uid = supervisee.id != null ? supervisee.id : supervisee.user_id;
      modal.open('record-note', { user: { user_name: supervisee.user_name, id: uid } });
    },

    quick_assessment: function(supervisee) {
      if (!supervisee) {
        return;
      }
      var uid = supervisee.id != null ? supervisee.id : supervisee.user_id;
      modal.open('quick-assessment', { user: { user_name: supervisee.user_name, id: uid } });
    },

    run_eval: function(supervisee) {
      var _this = this;
      if (!supervisee) {
        return;
      }
      var rawId = supervisee.id != null ? supervisee.id : supervisee.user_id;
      if (rawId == null) {
        return;
      }
      this.get('store').findRecord('user', rawId).then(function(user_model) {
        _this.get('appState').check_for_currently_premium(user_model, 'eval', false, true).then(function() {
          _this.get('appState').set_speak_mode_user(user_model.get('id'), false, false, 'obf/eval');
        });
      }, function() {
        modal.error(i18n.t('error_loading_user2', "There was an unexpected error trying to load the user"));
      });
    },

    intro: function(supervisee) {
      if (supervisee && supervisee.user_name) {
        this.get('router').transitionTo('user', supervisee.user_name);
      }
    },

    // Opens the standalone home-board picker scoped to this communicator.
    caseload_set_home_board: function(supervisee) {
      var _this = this;
      if (!supervisee || supervisee.modeling_only) {
        return;
      }
      var rawId = supervisee.id != null ? supervisee.id : supervisee.user_id;
      if (rawId == null) {
        return;
      }
      this.get('store').findRecord('user', rawId).then(function(user_model) {
        if (!user_model.get('permissions.edit') && !user_model.get('permissions.supervise')) {
          modal.error(i18n.t('not_allowed_user_long', "It appears you don't have permission to access this user's information"));
          return;
        }
        _this.get('router').transitionTo('board-picker', {
          queryParams: { user_id: user_model.get('id') }
        });
      }, function() {
        modal.error(i18n.t('error_loading_user2', "There was an unexpected error trying to load the user"));
      });
    }
  }
});
