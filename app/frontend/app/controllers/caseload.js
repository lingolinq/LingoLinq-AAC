import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
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

function decorateSuperviseeForCaseload(s) {
  var copy = Object.assign({}, s);
  copy.resolved_home_board_key = resolveSuperviseeHomeBoardKey(s);
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

  // Free-text filter for the supervisee grid — matches against
  // user_name and goal summary (case-insensitive substring). Bound
  // to the search input rendered above the grid.
  superviseeFilter: '',

  supervisees: computed('model.known_supervisees.[]', 'model.supervisees.[]', function() {
    var list = this.get('model.known_supervisees') || [];
    return list.map(decorateSuperviseeForCaseload);
  }),

  // Filtered view of supervisees driven by superviseeFilter. Falls
  // back to the unfiltered list when the input is empty so an
  // empty filter doesn't accidentally hide everyone.
  filteredSupervisees: computed('supervisees.[]', 'superviseeFilter', function() {
    var list = this.get('supervisees') || [];
    var q = (this.get('superviseeFilter') || '').trim().toLowerCase();
    if (!q) {
      return list;
    }
    return list.filter(function(s) {
      var name = (s && s.user_name ? String(s.user_name) : '').toLowerCase();
      var goal = (s && s.goal && s.goal.summary ? String(s.goal.summary) : '').toLowerCase();
      return name.indexOf(q) !== -1 || goal.indexOf(q) !== -1;
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

  actions: {
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

    // Opens the standard home-board picker for this communicator (setup wizard
    // `board_category` with `user_id`), same path as account setup for another user.
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
        if (!user_model.get('permissions.edit')) {
          modal.error(i18n.t('not_allowed_user_long', "It appears you don't have permission to access this user's information"));
          return;
        }
        _this.get('router').transitionTo('setup', {
          queryParams: { page: 'board_category', user_id: user_model.get('id') }
        });
      }, function() {
        modal.error(i18n.t('error_loading_user2', "There was an unexpected error trying to load the user"));
      });
    },

    // Keyboard navigation for the per-supervisee "extras" dropdown.
    // Wired to `keydown` on `.md-caseload__extras-dropdown`.
    // Bootstrap 3's native dropdown plugin handles open-on-click and
    // outside-click-to-close, but provides no arrow-key navigation,
    // Home/End shortcuts, or Escape support. This handler implements
    // the WAI-ARIA menu keyboard pattern on top of it.
    extras_dropdown_keydown: function(event) {
      if (!event) { return; }
      var key = event.key;
      var keyCode = event.keyCode;
      var container = event.currentTarget;
      if (!container) { return; }

      // Find the dropdown items (LinkTo + button children of <li>).
      // Filter to visible elements only, since {{#if}} branches in
      // the template can hide some items conditionally.
      var items = Array.prototype.slice.call(
        container.querySelectorAll('.dropdown-menu > li > a, .dropdown-menu > li > button')
      ).filter(function(el) { return el.offsetParent !== null; });
      if (items.length === 0) { return; }

      var trigger = container.querySelector('[data-toggle="dropdown"]');
      var menu = container.querySelector('.dropdown-menu');
      var is_open = menu && menu.parentElement && menu.parentElement.classList.contains('open');
      var current_idx = items.indexOf(document.activeElement);

      // Escape: close the dropdown and restore focus to the trigger.
      if (key === 'Escape' || key === 'Esc' || keyCode === 27) {
        if (is_open) {
          event.preventDefault();
          if (trigger) {
            trigger.click(); // Bootstrap toggles via click
            trigger.focus();
          }
        }
        return;
      }

      // ArrowDown: from trigger or any item, move to the next item.
      if (key === 'ArrowDown' || keyCode === 40) {
        if (!is_open && document.activeElement === trigger) {
          event.preventDefault();
          trigger.click(); // open the menu
          // Focus the first item after the menu opens
          var first = items[0];
          if (first) { setTimeout(function() { first.focus(); }, 0); }
          return;
        }
        if (is_open && current_idx >= 0) {
          event.preventDefault();
          var next = items[(current_idx + 1) % items.length];
          if (next) { next.focus(); }
        }
        return;
      }

      // ArrowUp: previous item; from first wraps to last.
      if (key === 'ArrowUp' || keyCode === 38) {
        if (is_open && current_idx >= 0) {
          event.preventDefault();
          var prev = items[(current_idx - 1 + items.length) % items.length];
          if (prev) { prev.focus(); }
        }
        return;
      }

      // Home: jump to first item.
      if (key === 'Home' || keyCode === 36) {
        if (is_open) {
          event.preventDefault();
          if (items[0]) { items[0].focus(); }
        }
        return;
      }

      // End: jump to last item.
      if (key === 'End' || keyCode === 35) {
        if (is_open) {
          event.preventDefault();
          if (items[items.length - 1]) { items[items.length - 1].focus(); }
        }
        return;
      }
    }
  }
});
