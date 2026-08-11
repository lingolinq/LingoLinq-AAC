import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { scheduleOnce } from '@ember/runloop';
import modal from '../utils/modal';
import i18n from '../utils/i18n';

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

  _enterSpeakModeForSuperviseeId: function(boardUserId, modeling, superviseeForModelingOnlyCheck) {
    if (!boardUserId) {
      return;
    }
    if (superviseeForModelingOnlyCheck && superviseeForModelingOnlyCheck.modeling_only && !modeling) {
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
      var row = document.querySelector('.md-caseload__list-row--active');
      if (!row || typeof row.getBoundingClientRect !== 'function') { return; }
      var rect = row.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight || 0;
      if (rect.top < 0 || rect.bottom > vh) {
        var block = (rect.height <= vh - 24) ? 'nearest' : 'start';
        row.scrollIntoView({ behavior: 'smooth', block: block, inline: 'nearest' });
      }
    } catch (e) { /* best-effort — never block toggling */ }
  },

  actions: {
    // Open the static "Managing Your Caseload" guide modal (info button next to
    // the "People you support" subheader) — maps the row quick-action icons and
    // explains what opening a communicator's card lets you do.
    showCaseloadGuide: function() {
      modal.open('modals/caseload-guide');
    },
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
        if (event.target.closest('.md-caseload__list-quick button, .md-caseload__list-quick a')) {
          return;
        }
      }
      var name = supervisee && supervisee.user_name;
      if (!name) { return; }
      if (this.get('selectedSupervisee') === name) {
        this.set('selectedSupervisee', null);
      } else {
        this.set('selectedSupervisee', name);
        // After the panel renders, bring the newly-expanded card into view —
        // expanding a low row can push its content below the fold.
        scheduleOnce('afterRender', this, this._scrollExpandedIntoView);
      }
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
      this._enterSpeakModeForSuperviseeId(boardUserId, true, supervisee);
    },
    caseload_speak_as: function(supervisee) {
      if (!supervisee) {
        return;
      }
      var boardUserId = supervisee.id != null ? supervisee.id : supervisee.user_id;
      if (boardUserId == null && supervisee.user_name) {
        boardUserId = supervisee.user_name;
      }
      this._enterSpeakModeForSuperviseeId(boardUserId, false, supervisee);
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
