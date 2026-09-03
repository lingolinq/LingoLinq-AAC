import Controller from '@ember/controller';
import { isTesting } from '@ember/debug';
import EmberObject from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater, cancel as runCancel } from '@ember/runloop';
import RSVP from 'rsvp';
import $ from 'jquery';
import LingoLinq from '../app';
import LingoLinqImage from '../models/image';
import utterance from '../utils/utterance';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import editManager from '../utils/edit_manager';
import buttonTracker from '../utils/raw_events';
import capabilities from '../utils/capabilities';
import speecher from '../utils/speecher';
import session from '../utils/session';
import obf from '../utils/obf';
import Button from '../utils/button';
import { htmlSafe } from '@ember/template';
import { inject } from '@ember/controller';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import sync from '../utils/sync';
import mineGrouping from '../utils/mine_board_grouping';
import { inject as service } from '@ember/service';
import { getOwner } from '@ember/application';
import { alias } from '@ember/object/computed';
import { board_edit_route } from '../utils/board_view';
import { set_view_style } from '../utils/view_style';

export default Controller.extend({
  router: service('router'),
  modalService: service('modal'),
  appState: service('app-state'),
  stashes: service('stashes'),
  persistence: service('persistence'),
  telemetry: service('telemetry'),
  app_state: alias('appState'),
  board: inject('board.index'),
  session: session, // replaced with service:session in init()

  isSessionAuthenticated: computed('session.isAuthenticated', 'appState.currentUser', 'appState.current_route', function() {
    return !!this.get('session.isAuthenticated') || !!this.get('appState.currentUser') || this.appState.get('current_route') === 'login.device';
  }),

  /**
   * True while an admin masquerade is active. Reads the Ember session service
   * first, then falls back to auth_settings stash (boot restore can lag).
   * Used by AppNavbar (dashboard/org chrome) — not only the legacy #identity block.
   */
  isMasquerading: computed(
    'session.as_user_id',
    'session.original_user_name',
    'appState.current_route',
    'appState.currentUser.id',
    function() {
      if (this.get('session.as_user_id') || this.get('session.original_user_name')) {
        return true;
      }
      var stashes = this.stashes || (this.appState && this.appState.stashes);
      if (stashes && typeof stashes.get_object === 'function') {
        var auth = stashes.get_object('auth_settings', true) || {};
        return !!(auth.as_user_id || auth.original_user_name);
      }
      return false;
    }
  ),

  /**
   * Acting admin username while masquerading. Session first, then auth_settings
   * stash (same restore-lag fallback as isMasquerading). Used for Stop Masquerading labels.
   */
  masqueradeOperatorName: computed(
    'session.original_user_name',
    'appState.current_route',
    'appState.currentUser.id',
    function() {
      var name = this.get('session.original_user_name');
      if (name) {
        return name;
      }
      var stashes = this.stashes || (this.appState && this.appState.stashes);
      if (stashes && typeof stashes.get_object === 'function') {
        var auth = stashes.get_object('auth_settings', true) || {};
        return auth.original_user_name || null;
      }
      return null;
    }
  ),

  /** Stop Masquerading label including operator when known; plain string if name is blank. */
  masqueradeStopLabel: computed('masqueradeOperatorName', function() {
    var name = this.get('masqueradeOperatorName');
    if (name) {
      return i18n.t('stop_masquerading_operator', "Stop Masquerading (%{user})", {user: name});
    }
    return i18n.t('stop_masquerading', "Stop Masquerading");
  }),

  /** Matches beta-feedback-admin route: site admin or admin_support_actions (e.g. org support). */
  /** Depends on `permissions` as a whole (raw attr), not nested keys — nested CP deps can fail to invalidate. */
  showBetaFeedbackAdminLink: computed(
    'appState.sessionUser',
    'appState.sessionUser.admin',
    'appState.sessionUser.is_admin',
    'appState.sessionUser.permissions',
    'appState.currentUser',
    'appState.currentUser.admin',
    'appState.currentUser.is_admin',
    'appState.currentUser.permissions',
    function() {
      // Prefer sessionUser (logged-in account); in speak mode currentUser may be the communicator.
      var u = this.get('appState.sessionUser') || this.get('appState.currentUser');
      if (!u) {
        return false;
      }
      if (u.get('admin') || u.get('is_admin')) {
        return true;
      }
      var perm = u.get('permissions');
      return !!(perm && perm.admin_support_actions);
    }
  ),

  /** Same visibility as View Beta Feedback / schema tools (admin or admin_support_actions). */
  showDatabaseExplorerLink: alias('showBetaFeedbackAdminLink'),

  showSystemSettingsLink: alias('showBetaFeedbackAdminLink'),

  landingNavOpen: false,

  useAltHeroColors: false, // when true: hero/sign-in/speak use previous (slate) colors; when false: teal/blue (#147f82, #3a6bc7)
  betaFeedbackDrawerOpen: false,

  /** Set by fullscreen-style routes (e.g. setup layout, create-board-new); do not set `hide_header` directly. */
  hide_header_force: false,

  hide_header: computed('appState.current_route', 'hide_header_force', function() {
    if (this.get('hide_header_force')) {
      return true;
    }
    var route = this.appState.get('current_route') || '';
    return route === 'demo.speak';
  }),

  showBetaFeedbackDrawer: computed('hide_header', 'appState.speak_mode', function() {
    return !this.get('hide_header') || this.appState.get('speak_mode');
  }),

  /** Show page footer when not viewing a board (so layout with fixed header/footer applies). Hidden visually via CSS when unauthenticated; kept in DOM so :has(.page-footer) layout still applies for top navbar. */
  footer: computed('appState.currentBoardState', 'appState.current_route', function() {
    if (this.isSetupRoute) {
      return true;
    }
    return !this.appState.get('currentBoardState');
  }),

  /** Username segment for Board Alt route (user_id in URL). */
  board_alt_username: computed('appState.currentBoardState.key', function() {
    var key = this.get('appState.currentBoardState.key');
    if (!key || key.indexOf('/') === -1) { return null; }
    return key.split('/')[0];
  }),
  /** Boardname segment for Board Alt route (boardname in URL). */
  board_alt_boardname: computed('appState.currentBoardState.key', function() {
    var key = this.get('appState.currentBoardState.key');
    if (!key || key.indexOf('/') === -1) { return null; }
    return key.split('/').slice(1).join('/');
  }),
  /** True when the current page is the Board Alt view, used to toggle the sidebar button label/style. */
  on_board_alt: computed('appState.current_route', function() {
    return this.appState.get('current_route') === 'user.board-alt.index';
  }),
  on_board_detail: computed('appState.current_route', function() {
    var route = this.appState.get('current_route') || '';
    return route === 'user.board-detail.index' || route === 'user.board-detail.edit';
  }),
  // ─── TEMPORARY (2026-07-27) — beta-feedback drawer hidden on board-detail SPEAK mode ───
  // Suppresses the bottom-center "Beta feedback" tab AND its drawer on
  // `user.board-detail.index` only. Everywhere else is untouched: board-detail EDIT
  // mode, classic board speak/edit, the home dashboard and every other authenticated
  // page still render it.
  //
  // Deliberately NOT keyed on `on_board_detail`, which is true for BOTH
  // `user.board-detail.index` and `user.board-detail.edit` — that would have taken
  // out edit mode too.
  //
  // TO RESTORE: delete this computed, and delete the matching
  // `{{#unless this.hide_beta_feedback_temporarily}}` wrapper in
  // templates/application.hbs (search for "TEMPORARY (2026-07-27)").
  hide_beta_feedback_temporarily: computed('appState.current_route', function() {
    return (this.appState.get('current_route') || '') === 'user.board-detail.index';
  }),
  /** True when the current page is the regular board view (not board-alt)
   *  AND a board is actually loaded. When a board route fails to resolve
   *  (error.hbs renders in the outlet), currentBoardState.id is null, and
   *  the page should NOT pick up the `.board-view` body class — that class
   *  triggers board-specific navbar variants (compact New Board, beta-feedback
   *  pill) that don't make sense without a board. */
  on_board: computed('appState.current_route', 'appState.currentBoardState.id', function() {
    return this.appState.get('current_route') === 'board.index' && !!this.appState.get('currentBoardState.id');
  }),
  /** True when on either the board or board-alt page — used to show the board picker instead of the home button. */
  on_board_or_alt: computed('on_board', 'on_board_alt', function() {
    return this.get('on_board') || this.get('on_board_alt');
  }),

  /** Intro-only header shortcuts (mirror on-board Start/Skip when board controls are obscured). */
  eval_intro_header_show_start: computed('appState.eval_mode', 'appState.currentBoardState.key', function() {
    if(!this.appState.get('eval_mode')) { return false; }
    var ev = obf.eval;
    if(!ev || !ev.intro_header_visibility) { return false; }
    return ev.intro_header_visibility().showStart;
  }),
  eval_intro_header_show_skip: computed('appState.eval_mode', 'appState.currentBoardState.key', function() {
    if(!this.appState.get('eval_mode')) { return false; }
    var ev = obf.eval;
    if(!ev || !ev.intro_header_visibility) { return false; }
    return ev.intro_header_visibility().showSkip;
  }),
  /** True on the combined welcome intro (before the evaluation actually
      starts). Used to show the regular home AppNavbar instead of the eval
      speak bar until the SLP hits Start — the welcome screen is informational,
      not yet an assessment. Once Start jumps to the first find step this goes
      false and the eval speak bar returns. */
  eval_welcome_active: computed('appState.eval_mode', 'appState.currentBoardState.key', function() {
    if(!this.appState.get('eval_mode')) { return false; }
    var ev = obf.eval;
    var intro = ev && ev.current_intro && ev.current_intro();
    return !!(intro && intro.intro === 'intro');
  }),

  // Show the in-place Pause button only during a running eval on the modern
  // board view — never on board-alt (per request) and never on the welcome
  // intro (nothing to pause before the assessment starts).
  show_eval_pause: computed('appState.eval_mode', 'on_board_alt', 'eval_welcome_active', function() {
    return !!(this.appState.get('eval_mode') && !this.get('on_board_alt') && !this.get('eval_welcome_active'));
  }),

  // Hide the header Previous button while on the first assessment section:
  // stepping back from there lands on the welcome/intro (obf/eval-0-0), which is
  // a broken dead end once the eval has started. Keyed off the board so it
  // re-evaluates on every navigation.
  show_eval_prev: computed('appState.eval_mode', 'on_board_alt', 'appState.currentBoardState.key', function() {
    if(!this.appState.get('eval_mode') || this.get('on_board_alt')) { return false; }
    var ev = obf.eval;
    return !!(ev && ev.can_go_back && ev.can_go_back());
  }),

  boardMenuOpen: false,

  init() {
    this._super(...arguments);
    // Explicit lookup of session service (implicit injection disabled to avoid deprecation)
    var owner = getOwner(this);
    var sessionService = owner.lookup('service:session') || owner.lookup('lingolinq:session');
    if(sessionService) {
      this.set('session', sessionService);
    }
    // Explicit lookup of extras (fixing implicit injection deprecation)
    var extras = owner.lookup('lingolinq:extras');
    if(extras) {
      Object.defineProperty(this, 'extras', {
        value: extras,
        writable: false,
        configurable: true
      });
    }

    var router = this.router;
    var self = this;
    this.support = () => {
      router.transitionTo('support');
    };
    this.language = () => {
      modal.open('modals/choose-locale');
    };
    this.toggleLandingNav = () => {
      self.set('landingNavOpen', !self.get('landingNavOpen'));
    };
    this.closeLandingNav = () => {
      self.set('landingNavOpen', false);
    };
    this.onCloseBetaFeedbackDrawer = () => {
      self.send('closeBetaFeedbackDrawer');
    };
    this.onToggleBetaFeedbackDrawer = () => {
      self.send('toggleBetaFeedbackDrawer');
    };

    var _this = this;
    _this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          args.pop();
        }
        _this.send.apply(_this, [actionName].concat(args));
      };
    };
  },
  updateTitle: function(str) {
    if(!isTesting()) {
      if(str) {
        document.title = str + " - " + LingoLinq.app_name;
      } else {
        document.title = LingoLinq.app_name;
      }
    }
  },
  copy_source_board: function(board) {
    var fallback = RSVP.resolve(board);
    if(!board) { return fallback; }
    var board_id = board.get('id');
    var board_global_id = board.get('global_id');
    var board_key = board.get('key');
    var current = this.appState.get('currentBoardState') || {};
    var current_matches_board = current.id == board_id || current.id == board_global_id || current.key == board_key;
    var root_state = this.stashes.get('temporary_root_board_state') || this.stashes.get('root_board_state');
    var root_id = root_state && root_state.id;
    var root_key = root_state && root_state.key;
    var root_ref = null;

    if(current_matches_board && root_state && (root_id || root_key) && root_id != board_id && root_id != board_global_id && root_key != board_key) {
      root_ref = root_key || root_id;
    }

    if(!root_ref) {
      var linked_boards = board.get('linked_boards') || [];
      var owner = board_key && board_key.split(/\//)[0];
      var linked_root = linked_boards.find(function(linked) {
        var key = linked && linked.key;
        var name = linked && linked.name;
        var same_owner = !owner || (key && key.split(/\//)[0] == owner);
        var topish_key = key && key.match(/(^|[-/])(top[-_]?page|home)([-/]|$)/);
        var topish_name = name && name.match(/(^|\s)(top page|home)(\s|$)/i);
        return linked && !linked.link_disabled && same_owner && (linked.home_board || topish_key || topish_name);
      });
      var linked_ref = linked_root && (linked_root.key || linked_root.id);
      if(!linked_ref) {
        return fallback;
      }
      return LingoLinq.store.findRecord('board', linked_ref).then(function(root_board) {
        if(root_board && root_board.get('id') != board_id && root_board.get('key') != board_key) {
          root_board.set('copy_source_from_board', board);
          return root_board;
        }
        return board;
      }, function() {
        return board;
      });
    }

    return LingoLinq.store.findRecord('board', root_ref).then(function(root_board) {
      if(root_board && root_board.get('id') != board_id) {
        root_board.set('copy_source_from_board', board);
        return root_board;
      }
      return board;
    }, function() {
      return board;
    });
  },
  copy_board: function(decision, for_editing, selected_user_name, copy_finished, source_board, skip_source_resolution) {
    if(!this || !this.get('persistence')) {
      return RSVP.reject();
    }
    var oldBoard = source_board || (decision && decision.copy_board_source) || this.get('board').get('model');
    if(!this.get('persistence').get('online')) {
      modal.error(i18n.t('need_online_for_copying', "You must be connected to the Internet to make copies of boards."));
      return RSVP.reject();
    }
    // If a board has any sub-boards or if the current user has any supervisees,
    // or if the board is in the current user's board set,
    // then there's a confirmation step before copying.

    // ALSO ask if copy should be public, if the source board is public
    var needs_decision = (oldBoard.get('linked_boards') || []).length > 0;
    if(oldBoard.get('protected_material')) {
      // Protecting boards from being copied is really only a UI constraint,
      // since the user has all the info they need via the API to create
      // their own copy. We just don't make it easy but it's totally doable.
      // As such, there isn't really any protection from this on the backend.
      if(oldBoard.get('copying_state.none')) {
        modal.error(i18n.t('cant_copy_protected_boards', "This board contains purchased content which can't be copied."));
        return RSVP.reject();
      } else {
        needs_decision = true;
      }
    }
    var _this = this;
    needs_decision = needs_decision || !!oldBoard.get('multiple_locales');
    needs_decision = needs_decision || (this.appState.get('currentUser.supervisees') || []).length > 0;
    needs_decision = needs_decision || (this.appState.get('currentUser.stats.board_set_ids') || []).indexOf(oldBoard.get('id')) >= 0;
    needs_decision = true;

    if(!decision && needs_decision) {
      var source = skip_source_resolution ? RSVP.resolve(oldBoard) : this.copy_source_board(oldBoard);
      return source.then(function(copyBoard) {
        return modal.open('copy-board', {
          board: copyBoard,
          original_board: copyBoard === oldBoard ? null : oldBoard,
          for_editing: for_editing,
          selected_user_name: selected_user_name
        });
      }).then(function(opts) {
        return _this.copy_board(opts, for_editing, selected_user_name, copy_finished, source_board, skip_source_resolution);
      });
    }
    decision = decision || {};
    decision.user = decision.user || this.appState.get('currentUser');
    decision.action = decision.action || "nothing";
    oldBoard.set('copy_name', decision.board_name);
    oldBoard.set('copy_prefix', decision.board_prefix);
    return modal.open('copying-board', {
      board: oldBoard, 
      action: decision.action, 
      user: decision.user, 
      shares: decision.shares, 
      symbol_library: decision.symbol_library,
      make_public: decision.make_public, 
      default_locale: decision.default_locale, 
      translate_locale: decision.translate_locale,
      disconnect: decision.disconnect,
      new_owner: decision.new_owner,
      copy_finished: copy_finished,
      skip_hierarchy_picker: decision.skip_hierarchy_picker,
      board_ids_to_copy: decision.board_ids_to_copy,
      expand_selected_board_ids_to_copy: decision.expand_selected_board_ids_to_copy,
      // When the copy was initiated to EDIT the board (copy-to-edit, incl. a board
      // previewed via the edit-mode Board Collections drawer), the completion lands the
      // user in edit mode of the new copy instead of the default speak-mode jump.
      for_editing: for_editing
    });
  },
  board_levels: computed(function () {
    return LingoLinq.board_levels.slice(1, 11);
  }),
  level_description: computed('board_levels', 'board.current_level', function() {
    var level = this.get('board.current_level');
    var desc = (this.get('board_levels').find(function(l) { return l.id.toString() == level.toString(); }) || {}).name;
    if(desc) { desc = htmlSafe(desc.replace(/-/, '<br/>')); }
    return null; //desc;
  }),
  update_level_buttons: observer('board.current_level', 'board.model.button_set.id', 'appState.speak_mode', function() {
    var _this = this;
    if(this.get('board.model') && !this.appState.get('speak_mode')) {
      this.get('board.model').load_button_set().then(function(bs) {
        _this.set('level_buttons', bs.buttons_for_level(_this.get('board.model.id'), _this.get('board.current_level')));
      }, function() { });
    }
  }),
  show_board_intro: computed(
    'has_board_intro',
    'appState.feature_flags.find_multiple_buttons',
    'appState.currentUser.preferences.progress.board_intros',
    'appState.pairing',
    'board.model.id',
    function() {
      // true if has_board_intro AND board intro hasn't been viewed yet
      if(this.get('has_board_intro') && this.appState.get('feature_flags.find_multiple_buttons') && !this.appState.get('pairing')) {
        var found = false;
        var board_id = this.get('board.model.id');
        var intros = this.appState.get('currentUser.preferences.progress.board_intros') || [];
        if(intros.find(function(i) { return i == board_id; })) {
          found = true;
        }
        return !found;
      }
      return false;
    }
  ),
  has_board_intro: computed(
    'stashes.root_board_state.id',
    'stashes.temporary_root_board_state.id',
    'appState.currentUser.preferences.home_board.id',
    'board.model.global_id',
    'board.model.intro',
    'board.model.intro.unapproved',
    function() {
      // TODO: also show if checking out the board in the 
      // setup process (except that's really only under 
      // advanced now), or if enabled on the embed
      var boardId = this.get('board.model.global_id') || this.get('board.model.id');
      var root_board = this.stashes.get('root_board_state.id') == boardId || this.stashes.get('temporary_root_board_state.id') == boardId;
      // TODO: option to set board level for board_intro prompt
      // TODO: when entering board intro, set root_board_state to the board's id
      return root_board && this.get('board.model.intro') && !this.get('board.model.intro.unapproved');
    }
  ),
  speak_mode_needing_hammer_js: computed('appState.speak_mode', function() {
    // iOS needs hammer.js because it's an older version of safari,
    // this causes problems when in speak mode and with dropdowns
    // since we get double-hit events
    return this.appState.get('speak_mode') && capabilities.installed_app && capabilities.system == 'iOS';
  }),
  highlight_button: function(buttons, button_set, options) {
    options = options || {};
    if(buttons && buttons != 'resume') {
      this.set('button_highlights', buttons);
      this.set('button_highlights_button_set', button_set);
      // Reset the board-detail resume tracker (see edit_manager.process_for_displaying) so the
      // first navigation of this new sequence always resumes even if it lands on the same board
      // a previous sequence last resumed on.
      if(this.appState) { this.appState.set('_bd_highlight_resume_board', null); }
      this.set('last_highlight_selection', null);
      this.set('last_highlight_explore_action', (new Date()).getTime());
      this.set('last_highlight_options', options);
      utterance.set('hint_button', null);
      modal.close();
      if(options.wait_to_prompt) {
        modal.notice(i18n.t('find_sentence_box_hint', "Try to find each word as it appears in the sentence box above"), true);
      }
    } else if(buttons == 'resume') {
      options = this.get('last_highlight_options') || options;
    }
    var _this = this;
    var defer = _this.get('highlight_button_defer') || RSVP.defer();
    runLater(function() {
      if(!_this || _this.isDestroyed) { return; }
      var will_render = false;
      if(defer.revert_board_level == undefined && buttons != 'resume') {
        defer.revert_board_level = _this.stashes.get('board_level') || 'none';
        var was = _this.stashes.get('board_level');
        var level_changed = _this.stashes.get('board_level') && _this.stashes.get('board_level') != 10;
        if(level_changed) {
          _this.send('set_level', 10);
          will_render = true;
        }
      }
      _this.set('highlight_button_defer', defer);
      if(!defer.promise.registered) {
        defer.promise.registered = true;
        defer.wait_a_bit = function(timeout) {
          if(!defer.promise.already_waiting_a_bit) {
            defer.promise.already_waiting_a_bit = true;
            runLater(function() {
              defer.promise.already_waiting_a_bit = false;
              _this.highlight_button('resume');
            }, timeout)
          }
        }
        defer.promise.then(null, function(err) { 
          console.error("highlight sequence failed", err);
          if(_this && !_this.isDestroyed) { _this.set('button_highlights', null); }
          return RSVP.resolve(); 
        }).then(function() {
          if(!_this || _this.isDestroyed) { return; }
          if(_this.get('highlight_button_defer') == defer) {
            _this.set('highlight_button_defer', null);
            _this.set('last_highlight_selection', null);
            _this.set('last_highlight_explore_action', null);
            _this.set('last_highlight_options', null);
            utterance.set('hint_button', null);
            if(defer.revert_board_level) {
              var new_level = 10;
              if(defer.revert_board_level == 'none') {
                new_level = 10;
              } else {
                new_level = defer.revert_board_level;
              }
              var level_changed = _this.stashes.get('board_level') != new_level;
              var was = _this.stashes.get('board_level');
              if(level_changed) {
                _this.send('set_level', new_level);
              }
            }
          }
        });
      }
      if(options.wait_to_prompt) {
        options.delay_prompt = true;
        var now = (new Date()).getTime();
        var last_action = _this.get('last_highlight_selection') || _this.get('last_highlight_explore_action') || now;
        var waiting_duration = (new Date()).getTime() - last_action;
        var factor = defer.already_waited ? 0.3 : (defer.not_first_action ? 1.0 : 1.5);
        options.picture_hint = true;
        if(waiting_duration > 1000) {
          // afteer 1 second change the sentence box hint to the right picture
        }
        if(waiting_duration > (5000 * factor)) {
          // afte 5 seconds do a subtle highlight
          options.subtle_highlight = true;
          options.delay_prompt = false;
          defer.wait_a_bit(1000);
          defer.did_wait = true;
        }
        if(waiting_duration > (10000 * factor)) {
          // after 10 seconds do a strong highlight
          options.subtle_highlight = false;
        }
        var button_highlights = _this.get('button_highlights') || [];
        var next_actual_button = button_highlights.find(function(b) { return b.actual_button; });
        if(next_actual_button) {
          utterance.set('hint_button', utterance.get('hint_button') || {});
          utterance.set('hint_button.label', next_actual_button.label);
        } else {
          utterance.set('hint_button', null);
        }
      }
      if(!will_render) {
        // Stale queue from find-a-button can run after re-render (e.g. focus words) while
        // board.model is briefly unset — avoid sending the action into a bad state.
        var hl = _this.get('button_highlights');
        if (hl && hl.length) {
          var h0 = hl[0];
          if (h0 && !h0.pre && h0.board_id && !_this.get('board.model')) {
            _this.set('button_highlights', null);
            _this.set('button_highlights_button_set', null);
            _this.set('last_highlight_options', null);
            var lostDefer = _this.get('highlight_button_defer');
            if (lostDefer && lostDefer.resolve) {
              lostDefer.resolve();
            }
            return;
          }
        }
        _this.send('highlight_button', options);
      }
    });
    return defer.promise;
  },
  allow_search: computed(
    'appState.domain_settings.full_domain',
    'session.isAuthenticated',
    function() {
      return this.appState.get('domain_settings.full_domain') || session.get('isAuthenticated');
    }
  ),
  setup_for_other: computed('appState.currentUser.id', 'setup_user_id', function() {
    if(this.get('setup_user_id') && this.get('setup_user_id') != this.appState.get('currentUser.id')) {
      return LingoLinq.store.peekRecord('user', this.get('setup_user_id'));
    } else {
      return null;
    }
  }),
  can_edit_from_speak_mode: computed('appState.sessionUser', 'appState.sessionUser.modeling_only', 'appState.referenced_user.preferences.speak_mode_edit', 'board.model.permissions.edit', 'board.model.uncopyable', 'board.model.for_sale', function() {
    if(this.appState.get('sessionUser') && !this.appState.get('sessionUser.modeling_only') && this.appState.get('referenced_user.preferences.speak_mode_edit')) {
      if(this.get('board.model.permissions.edit')) {
        return true;
      } else if(!this.get('board.model.for_sale') && !this.get('board.model.uncopyable')) {
        return true;    
      }
    }
    return false;
  }),
  no_hidden_buttons: computed('stashes.all_buttons_enabled', 'board.model.hidden_buttons', function() {
    if(this.stashes.get('all_buttons_enabled')) { return false; }
    return !this.get('board.model.hidden_buttons');
  }),
  no_hidden_buttons_link_style: computed('session.isAuthenticated', function() {
    var s = this.get('session.isAuthenticated') ? 'margin-top: -10px; font-size: 14px;' : 'font-size: 14px;';
    return htmlSafe(s);
  }),

  actions: {
    toggleEvalPause: function() {
      if(obf.eval && obf.eval.toggle_pause) { obf.eval.toggle_pause(); }
    },
    invalidateSession: function() {
      var sess = this.get('session');
      if (sess && typeof sess.invalidate === 'function') {
        sess.invalidate(true);
      } else if (LingoLinq.session && typeof LingoLinq.session.invalidate === 'function') {
        LingoLinq.session.invalidate(true);
      }
    },
    authenticateSession: function() {
      if(location.hostname == '127.0.0.1') {
        this.router.transitionTo('login');
        // location.href = "//localhost:" + location.port + "/login";
      } else if(location.hostname == 'www.mylingolinq.com') {
        location.href = "//app.mylingolinq.com/login";
      } else {
        this.router.transitionTo('login');
      }
    },
    cancel_sync: function() {
      var p = this && (this.get && this.get('persistence')) || (typeof window !== 'undefined' && window.persistence);
      if (p && typeof p.cancel_sync === 'function') {
        p.cancel_sync();
      }
    },
    index: function() {
      this.appState.return_to_index();
    },
    support: function() {
      this.get('router').transitionTo('support');
    },
    openBetaFeedback: function() {
      if (this.get('appState.currentUser') || this.get('appState.sessionUser')) {
        this.set('betaFeedbackDrawerOpen', true);
      } else {
        this.get('router').transitionTo('beta-feedback');
      }
    },
    toggleBetaFeedbackDrawer: function() {
      if (this.get('appState.currentUser') || this.get('appState.sessionUser')) {
        this.toggleProperty('betaFeedbackDrawerOpen');
      } else {
        this.get('router').transitionTo('beta-feedback');
      }
    },
    closeBetaFeedbackDrawer: function() {
      this.set('betaFeedbackDrawerOpen', false);
    },
    // "Try New Style" (application.hbs, classic header). This USED to navigate to
    // board-detail without touching the preference, which stranded the user: they
    // were in the modern shell while `board_view_style` still said 'classic', so
    // the next board they opened threw them back. Persist the choice, exactly as
    // the navbar View switch and the board's own Modern View button both do.
    goToNewStyle: function() {
      var user = this.appState.get('currentUser');
      if(user) { set_view_style(user, 'modern'); }
      var key = this.appState.get('currentBoardState.key');
      if(key && key.indexOf('/') !== -1) {
        var parts = key.split('/');
        this.get('router').transitionTo('user.board-detail', parts[0], parts.slice(1).join('/'));
      }
    },
    getting_started: function() {
      this.get('modalService').open('getting-started', { progress: this.appState.get('currentUser.preferences.progress') });
    },
    toggleHeroColors: function() {
      this.set('useAltHeroColors', !this.get('useAltHeroColors'));
    },
    goUpgrade: function() {
      var user = this.appState.get('currentUser');
      if (user) {
        this.get('router').transitionTo('user.subscription', user.get('user_name'));
      } else {
        modal.open('premium-required', { remind_to_upgrade: true });
      }
    },
    toggleDarkMode: function() {
      this.appState.toggleDarkMode();
    },
    toggleThemePicker: function() {
      this.set('showThemePicker', !this.get('showThemePicker'));
    },
    selectThemeMode: function(mode) {
      this.appState.setThemeMode(mode);
      this.set('showThemePicker', false);
    },
    closeThemePicker: function() {
      this.set('showThemePicker', false);
    },
    toggleLandingNav: function() {
      this.set('landingNavOpen', !this.get('landingNavOpen'));
    },
    closeLandingNav: function() {
      this.set('landingNavOpen', false);
    },
    language: function() {
      modal.open('modals/choose-locale');
    },
    stickSidebar: function() {
      var user = this.appState.get('currentUser');
      // Toggle the EFFECTIVE state (unset is treated as shown), so the first
      // collapse from the default-shown state persists `false` rather than `true`.
      var wantQuickSidebar = !this.appState.get('effective_quick_sidebar');
      user.set('preferences.quick_sidebar', wantQuickSidebar);
      this.stashes.persist('sidebarEnabled', false);
      if(!wantQuickSidebar) {
        this.stashes.set('sidebar_hidden_at', Date.now());
      }
      var _this = this;
      user.save().then(function() {
        user.set('preferences.quick_sidebar', wantQuickSidebar);
      }, function() { });
    },
    toggleSidebar: function() {
      this.stashes.persist('sidebarEnabled', !this.stashes.get('sidebarEnabled'));
    },
    toggleSidebarTeaseKeydown: function(event) {
      var key = event && event.key;
      var code = event && event.keyCode;
      if (key === 'Enter' || key === ' ' || code === 13 || code === 32) {
        if (event.preventDefault) {
          event.preventDefault();
        }
        this.send('toggleSidebar');
      }
    },
    hide_temporary_sidebar: function() {
      if(this.stashes.get('sidebarEnabled') && !this.appState.get('currentUser.preferences.quick_sidebar')) {
        this.send('toggleSidebar');
      }
    },
    searchBoards: function() {
      if(this.get('searchString') == 'home') {
        this.router.transitionTo('home-boards');
      } else {
        this.router.transitionTo('search', 'any', encodeURIComponent(this.get('searchString') || '_'));
      }
    },
    backspace: function(opts) {
      this.appState.set('last_activation', (new Date()).getTime());
      utterance.backspace(opts);
      if(!opts || !opts.skip_click) {
        if(this.appState.get('currentUser.preferences.click_buttons') && this.appState.get('speak_mode')) {
          speecher.click();
        }
        if(this.appState.get('currentUser.preferences.vibrate_buttons') && this.appState.get('speak_mode')) {
          capabilities.vibrate();
        }
      }
    },
    clear: function(opts) {
      this.appState.set('last_activation', (new Date()).getTime());
      this.appState.toggle_modeling(false);
      utterance.clear(opts);
      if(!opts || !opts.skip_click) {
        if(this.appState.get('currentUser.preferences.click_buttons') && this.appState.get('speak_mode')) {
          speecher.click();
        }
        if(this.appState.get('currentUser.preferences.vibrate_buttons') && this.appState.get('speak_mode')) {
          capabilities.vibrate();
        }
      }
    },
    toggle_home_lock: function() {
      this.appState.toggle_home_lock();
    },
    toggle_all_buttons: function() {
      var state = this.stashes.get('all_buttons_enabled');
      if(state) {
        this.stashes.persist('all_buttons_enabled', null);
        sync.send_update(this.appState.get('referenced_user.id') || this.appState.get('currentUser.id'), {assertion: {show_all: false}});
      } else {
        this.stashes.persist('all_buttons_enabled', true);
        sync.send_update(this.appState.get('referenced_user.id') || this.appState.get('currentUser.id'), {assertion: {show_all: true}});
      }
    },
    toggle_focus: function() {
      // Menu click bubbles/re-fires the action twice; debounce so rapid re-invocations are ignored.
      var now = Date.now();
      if(this._lastToggleFocusAt && (now - this._lastToggleFocusAt) < 300) {
        return false;
      }
      this._lastToggleFocusAt = now;
      if(this.appState.get('focus_words')) {
        this.appState.set('focus_words', null);
        var ec = editManager.controller;
        var model = ec && ec.get && ec.get('model');
        if(model && model.set) {
          model.set('focus_id', 'blank');
        }
        if(this.appState.get('pairing') || this.appState.get('followers.allowed')) {
          sync.send_update(this.appState.get('referenced_user.id') || this.appState.get('currentUser.id'), {assertion: {focus_words: []}});
        }
      } else {
        modal.open('modals/focus-words', {user: this.appState.get('sessionUser'), root_board_id: this.stashes.get('root_board_state.id'), inactivity_timeout: true});
      }
      return false;
    },
    end_evaluation: function() {
      obf.eval.conclude();
    },
    assessment_settings: function() {
      obf.eval.settings();
    },
    change_section: function(direction) {
      obf.eval.move(direction);
    },
    eval_intro_header_start: function() {
      obf.eval.intro_header_start();
    },
    eval_intro_header_skip: function() {
      obf.eval.intro_header_skip();
    },
    jump_section: function() {
      obf.eval.jump_to();
    },
    repeat_prompt: function() {
      var model = this.get('board.model');
      runLater(function() {
        model.prompt();
      }, 100);
    },

    /* My Boards button (navbar) — replaces the old modal-based
       picker. Transitions the user to the boards page
       (`/u/:user_name/boards`) so they get the SAME UI the
       boards page renders directly: no parallel modal markup,
       no parallel state machine. If the user lands here and
       didn't actually want to be on the boards page, they can
       use the browser back button to return to the board they
       were viewing — Ember pushes a history entry on transition
       so the back stack handles this without app-level state.
       Implemented 2026-05-23 as the replacement for the
       old modal-based My Boards flow. */
    openMyBoards: function() {
      var userName = this.appState.get('referenced_user.user_name')
                  || this.appState.get('currentUser.user_name');
      if(userName) {
        this.router.transitionTo('user.boards', userName);
      }
    },

    home: function(opts) {
      this.appState.set('last_activation', (new Date()).getTime());
      opts = opts || {};
      if(this.appState.get('eval_mode') && this.appState.get('speak_mode')) {
        modal.notice(i18n.t('eval_mode_home_disabled', "Home is disabled during an evaluation, you can end the evaluation using the menu icon"), true);
        return;
      }
      var state = this.stashes.get('temporary_root_board_state') || this.stashes.get('root_board_state');
      var current = this.appState.get('currentBoardState');
      this.set('last_highlight_explore_action', (new Date()).getTime());
      // if you're on a temporary home board and you hit home, it should take you to the real home
      if(state && current && state.key == current.key && this.stashes.get('temporary_root_board_state')) {
        this.stashes.persist('temporary_root_board_state', null);
        state = this.stashes.get('root_board_state');
      }
      if(state && current && state.key == current.key) {
        editManager.clear_history();
        if(state == this.stashes.get('temporary_root_board_state')) {
          modal.notice(i18n.t('already_temporary_home', "This board was set as the home board temporarily. To cancel hit the icon in the top right corner and select 'Release Home Lock'."), true);
        } else {
          if(state.meta_home) {
            modal.notice(i18n.t('already_home2', "You are already on the home board. To return to the home board list, hit the icon in the top right corner."), true);
          } else {
            modal.notice(i18n.t('already_home', "You are already on the home board. To exit Speak Mode hit the icon in the top right corner."), true);
          }
          this.highlight_button('resume');
        }
      } else {
        if(this.stashes.get('sticky_board') && this.appState.get('speak_mode')) {
          modal.warning(i18n.t('sticky_board_notice', "Board lock is enabled, disable to leave this board."), true);
        } else {
          this.appState.track_depth('home');
          this.rootBoard({index_as_fallback: true, button_triggered: opts.button_triggered});
          if(this.appState.get('currentUser.preferences.click_buttons') && this.appState.get('speak_mode')) {
            speecher.click();
          }
          if(this.appState.get('currentUser.preferences.vibrate_buttons') && this.appState.get('speak_mode')) {
            capabilities.vibrate();
          }
        }
      }
    },
    jump: function(path, source, board) {
      if(this.stashes.get('sticky_board') && this.appState.get('speak_mode')) {
        modal.warning(i18n.t('sticky_board_notice', "Board lock is enabled, disable to leave this board."), true);
      } else {
        this.jumpToBoard({
          key: path,
          source: source,
          level: board && board.level,
          locale: board && board.locale,
          home_lock: board && board.home_lock,
          meta_home: board && board.meta_home
        });
      }
    },
    setAsHome: function(option, user) {
      var _this = this;
      user = user || this.appState.get('currentUser');
      var controller = this.appState && this.appState.controller;
      if(option == 'starting' && controller && controller.get('setup_user_id') && controller.get('setup_user_id') != 'self' && user != 'skip_lookup') {
        LingoLinq.store.findRecord('user', controller.get('setup_user_id')).then(function(u) {
          _this.send('setAsHome', option, u);
        }, function(err) {
          _this.send('setAsHome', option, 'skip_lookup');
        });
        return;
      }
      this.appState.check_for_needing_purchase().then(function() {
        _this.appState.assert_source().then(function() {
          var board = _this.get('board.model');
          if(option == 'starting') {
            board = _this.stashes.get('root_board_state') || _this.get('board').get('model');
          }
          var board_user_name = emberGet(board, 'key').split(/\//)[1];
          var preferred_symbols = user.get('preferences.preferred_symbols') || 'original';
          var needs_confirmation = user.get('supervisees') || preferred_symbols != 'original' || board_user_name != user.get('user_name');
          var done = function(sync) {
            if(sync && _this && _this.get && _this.get('persistence') && _this.get('persistence').get('online') && _this.get('persistence').get('auto_sync')) {
              _this.set('simple_board_header', false);
              runLater(function() {
                if(_this && _this.get && _this.get('persistence') && _this.get('persistence').get('auto_sync')) {
                  console.debug('syncing because home board changes');
                  _this.get('persistence').sync('self', null, null, 'home_board_changed').then(null, function() { });
                }
              }, 1000);
              if(_this.get('setup_footer')) {
                _this.send('setup_go', 'forward');
              } else {
                modal.success(i18n.t('board_set_as_home', "Great! This is now the user's home board!"), true);
              }
            } else {
              if(_this.get('setup_footer')) {
                _this.send('setup_go', 'forward');
              }          
            }
          }
          if(needs_confirmation && !option) {
            modal.open('set-as-home', {board: board, user_id: _this.get('setup_user_id')}).then(function(res) {
              if(res && res.updated) {
                done(true);
              }
            }, function() { });
          } else {
            if(user) {
              if(option == 'starting') {
                user.copy_home_board(board, true).then(function() { }, function() {
                  modal.error(i18n.t('set_as_home_failed', "Home board update failed unexpectedly"));
                });
                done();
              } else {
                user.set('preferences.home_board', {
                  id: emberGet(board, 'id'),
                  level: _this.stashes.get('board_level'),
                  locale: _this.appState.get('label_locale'), // optional locale, otherwise server will assign board's locale
                  key: emberGet(board, 'key')
                });
                user.save().then(function() {
                  done(true);
                }, function() {
                  modal.error(i18n.t('set_as_home_failed', "Home board update failed unexpectedly"));
                });
              }
            }
          }  
        }, function() { });
      });
    },
    add_to_sidebar: function() {
      var _this = this;
      this.appState.check_for_needing_purchase().then(function() {
        _this.appState.assert_source().then(function() {
          var board = _this.get('board').get('model');
          modal.open('add-to-sidebar', {board: {
            name: board.get('name'),
            key: board.get('key'),
            levels: board.get('levels'),
            home_lock: false,
            image: board.get('image_url')
          }});  
        }, function() { });
      });
    },
    adjust_level: function(direction) {
      var prior_level = parseInt(this.get('board.current_level'), 10);
      var level = prior_level || 10;
      if(direction == 'plus') {
        level = Math.min(10, level + 1);
      } else {
        level = Math.max(1, level - 1);
      }
      if(level != prior_level) {
        this.send('set_level', level);
      }
      // Can't think of a cleaner way to prevent the dropdown
      // from closing when hitting plus or minus, but still
      // closing if they hit outside the dropdown
      $("#level_dropdown").attr('data-toggle', '');
      setTimeout(function() {
        $("#level_dropdown").attr('data-toggle', 'dropdown');
      }, 500);
    },
    set_level: function(level) {
      this.stashes.persist('board_level', level);
      this.set('board.preview_level', level);
      this.set('board.model.display_level', level);
      // The cached fast_html was rendered at the previous level, and the
      // classic board template renders board.fast_html.html directly, so
      // a stale copy keeps showing the old level (level preview appeared
      // broken on board-alt). Clear it — mirroring the modern view's
      // set_speak_level cache invalidation — and nudge current_level so
      // the dependent computeds re-evaluate, then let
      // process_for_displaying rebuild the grid at the newly selected
      // level in both normal and speak mode.
      if(this.get('board.model')) {
        this.set('board.model.fast_html', null);
      }
      if(this.get('board') && this.get('board').notifyPropertyChange) {
        this.get('board').notifyPropertyChange('current_level');
      }
      editManager.process_for_displaying();
    },
    clear_overrides: function() {
      if(this.get('board.model.permissions.edit')) {
        this.get('board.model').clear_overrides().then(function() {
          editManager.process_for_displaying();
        }, function() {
          modal.error(i18n.t('error_clearing_overrides', "There was an unexpected error while clearing overrides"));
        })
      }
    },
    stopMasquerading: function() {
      var data = session.restore();
      data.user_name = data.original_user_name;
      delete data.original_user_name;
      delete data.as_user_id;
      session.persist(data).then(function() {
        location.reload();
      });
    },
    back: function(opts) {
      // TODO: true back button vs. separate history? one is better for browser,
      // other is better if you end up with intermediate pages at all.. what about
      // full screen browser mode? Prolly needs a localstorage component as well,
      // since if I reload and then click the browser back button it's all kinds
      // of backward.
      this.appState.set('last_activation', (new Date()).getTime());
      if(this.stashes.get('sticky_board') && this.appState.get('speak_mode')) {
        modal.warning(i18n.t('sticky_board_notice', "Board lock is enabled, disable to leave this board."), true);
      } else {
        this.appState.track_depth('back');
        this.backOneBoard(opts);
        if(!opts || !opts.skip_click) {
          if(this.appState.get('currentUser.preferences.click_buttons') && this.appState.get('speak_mode')) {
            speecher.click();
          }
          if(this.appState.get('currentUser.preferences.vibrate_buttons') && this.appState.get('speak_mode')) {
            capabilities.vibrate();
          }
        }
      }
      this.set('last_highlight_explore_action', (new Date()).getTime());
    },
    board_intro: function() {
      modal.open('modals/board-intro', {board: this.get('board.model'), step: 0});
    },
    vocalize: function(opts) {
      this.appState.set('last_activation', (new Date()).getTime());
      this.vocalize(null, opts);
    },
    remote_modeling: function() {
      if(this.appState.get('pairing.user_id')) {
        modal.open('modals/remote-model', {communicator: !this.appState.get('pairing.partner'), user_id: this.appState.get('pairing.user_id')});
      } else {
        modal.error(i18n.t('remote_modeling_error', "Error loading remote modeling"));
      }
    },
    alert: function() {
      utterance.alert({button_triggered: true});
      this.send('hide_temporary_sidebar');
    },
    special: function(opts) {
      // sidebar actions (opts is often an EmberObject from sidebar_boards_with_fallbacks)
      var action = emberGet(opts, 'action');
      var arg = emberGet(opts, 'arg');
      var name = emberGet(opts, 'name');
      if(!action) { return; }
      if(action == ':app' || action.indexOf(':app(') === 0) {
        var launchArg = arg;
        if(!launchArg) {
          var appMatch = action.match(/^:app\((.+)\)$/);
          launchArg = appMatch && appMatch[1];
        }
        if(capabilities.installed_app && (capabilities.system == 'iOS' || capabilities.system == 'Android')) {
          if(!launchArg) {
            modal.error(i18n.t('app_launch_failed', "App failed to launch"), true);
            return;
          }
          capabilities.apps.launch(launchArg).then(null, function(err) {
            modal.error(i18n.t('app_launch_failed', "App failed to launch"), true);
          });
        } else {
          modal.error(i18n.t('no_app_launches', "App launches not available in this view"), true);
        }
      } else {
        var vocalization = action;
        if(arg != null && arg !== '' && vocalization.indexOf('(') === -1) {
          vocalization = vocalization + '(' + arg + ')';
        }
        var obj = {
          label: name,
          vocalization: vocalization,
          prevent_return: true,
          button_id: null,
          source: 'click',
          board: {id: this.appState.get('currentBoardState.id'), parent_id: this.appState.get('currentBoardState.parent_id'), key: this.appState.get('currentBoardState.key')},
          type: 'speak'
        };
        this.appState.activate_button(obj, obj);
      }
    },
    setSpeakModeUser: function(id, type) {
      this.appState.set_speak_mode_user(id, false, type == 'modeling');
    },
    pickSpeakModeUser: function(type) {
      var prompt = i18n.t('speak_as_which_user', "Select User to Speak As");
      if(type == 'modeling') {
        prompt = i18n.t('model_for_which_user', "Select User to Model For");
      }
      this.appState.set('referenced_speak_mode_user', null);
      this.send('switch_communicators', {modeling: (type == 'modeling'), stay: true, header: prompt});
    },
    toggleSpeakMode: function(decision) {
      var appState = this.appState;
      var routeName = appState.get('router.currentRouteName') || '';
      var onBoardDetail = routeName.indexOf('board-detail') !== -1 && routeName.indexOf('.edit') === -1;
      var exiting = appState.get('speak_mode') && decision !== 'off';
      if(onBoardDetail && !exiting && appState.speak_mode_exit_pin_required()) {
        exiting = true;
      }
      if(onBoardDetail && exiting) {
        var detailCtrl = getOwner(this).lookup('controller:user.board-detail') ||
          getOwner(this).lookup('controller:user/board-detail');
        if(detailCtrl) {
          detailCtrl.send('exit_to_home');
          return;
        }
      }
      appState.toggle_speak_mode(decision);
    },
    startRecording: function() {
      // currently-speaking user must have active paid subscription to do video recording
      this.appState.check_for_currently_premium(this.appState.get('speakModeUser'), 'record_session').then(function() {
        alert("not yet implemented");
      }, function() { });
    },
    toggleEditMode: function(decision) {
      if(!this.appState.get('edit_mode')) {
        if(this.appState.speak_mode_exit_pin_required()) {
          modal.open('speak-mode-pin', {action: 'edit', hide_hint: this.appState.get('currentUser.preferences.hide_pin_hint')});
        } else {
          this.appState.toggle_edit_mode(decision);
        }
      } else {
        var _this = this;
        this.appState.check_for_needing_purchase().then(function() {
          _this.appState.toggle_edit_mode(decision);
        }, function() { });
      }
    },
    editBoardDetails: function() {
      if(!this.appState.get('edit_mode')) { return; }
      modal.open('edit-board-details', {board: this.get('board.model')});
    },
    toggle_sticky_board: function() {
      this.stashes.persist('sticky_board', !this.stashes.get('sticky_board'));
    },
    toggle_pause_logging: function() {
      var ts = (new Date()).getTime();
      if(this.stashes.get('logging_paused_at')) {
        ts = null;
      }
      this.stashes.persist('logging_paused_at', ts);
    },
    switch_communicators: function(opts) {
      var ready = RSVP.resolve({correct_pin: true});
      if(this.appState.get('speak_mode') && this.appState.get('currentUser.preferences.require_speak_mode_pin') && this.appState.get('currentUser.preferences.speak_mode_pin')) {
        ready = modal.open('speak-mode-pin', {action: 'none', hide_hint: this.appState.get('currentUser.preferences.hide_pin_hint')});
      }
      ready.then(function(res) {
        if(res && res.correct_pin) {
          modal.open('switch-communicators', opts || {});
        }
      }, function() { });
    },
    find_button: function() {
      var include_other_boards = this.appState.get('speak_mode') && ((this.stashes.get('root_board_state') || {}).key) == this.appState.get('currentUser.preferences.home_board.key');
      var boardCtrl = this.get('board');
      var boardModel = boardCtrl && boardCtrl.get('model');
      modal.open('find-button', {
        inactivity_timeout: this.appState.get('speak_mode'),
        board: boardModel,
        include_other_boards: include_other_boards
      });
    },
    shareBoard: function() {
      var _this = this;
      this.appState.assert_source().then(function() {
        modal.open('share-board', {board: _this.get('board.model')});
      }, function() { }); 
    },
    copy_and_edit_board: function(source_board, skip_source_resolution) {
      var _this = this;
      var edit_copy = function(board) {
        if(!board) { return; }
        // `board` may be the copiedBoard model OR the copying-board close payload
        // ({ copied: true, id, key }) — both carry `key`.
        var key = (board.get && board.get('key')) || board.key;
        var parts = key ? String(key).split('/') : [];
        if(parts.length >= 2) {
          // Transition STRAIGHT into the copy's edit route (same as the edit-mode
          // finish_copy). The old path did jump_to_board (speak) + toggle_edit_mode(),
          // but toggle_edit_mode re-checks permissions.edit — still stale/false on the
          // brand-new copy — and re-showed the "Edit this Board" copy prompt. A direct
          // edit transition skips that re-check; the copy is owned, so editing/saving works.
          _this.stashes.persist('copy_on_save', null);
          // View-aware edit destination. board-detail has an /edit subroute; the
          // classic board has none (router.js declares only `index` under board-alt) —
          // classic editing is a MODE entered via app_state.toggle_edit_mode. So a
          // classic user lands on their own board here rather than being ejected into
          // modern. KNOWN GAP: edit mode is not auto-entered for them; closing that
          // needs the classic edit route (Cluster C in the restoration plan).
          _this.get('router').transitionTo(board_edit_route(_this.get('appState.currentUser')), parts[0], parts.slice(1).join('/'));
          return;
        }
        // Fallback (no usable key): previous jump-to-board behavior.
        _this.appState.jump_to_board({ id: board.id, key: board.key });
      };
      this.appState.check_for_needing_purchase().then(function() {
        _this.copy_board(null, true, null, edit_copy, source_board, skip_source_resolution).then(edit_copy, function() { });
      }, function() { });
    },
    tweakBoard: function(decision) {
      var _this = this;
      var update_locale = null;
      if(decision && decision.update_locale) {
        update_locale = decision.update_locale;
        decision = null;
      }
      this.appState.check_for_needing_purchase().then(function() {
        _this.appState.assert_source().then(function() {
          if(_this.appState.get('edit_mode')) {
            _this.appState.toggle_mode('edit');
          }
          _this.copy_board(decision).then(function(board) {
            // Distinguish three close payloads from copying-board:
            //   { copied: true, id, key } — success: jump to the new board
            //   { error: <msg> }          — backend error: notify user and
            //                                clear the copy_on_save stash so
            //                                the user isn't stuck repeating
            //                                a broken save → copy → fail loop
            //   undefined                 — clean cancel (decision modal X'd
            //                                or copying-board closed before
            //                                an error appeared): stay silent
            //                                so the user can retry from edit
            //                                mode
            if(board && board.error) {
              _this.stashes.persist('copy_on_save', null);
              modal.error(i18n.t('copy_failed_msg', "Couldn't copy this board to save your changes. Please try again, or cancel to discard your edits."));
              return;
            }
            if(board) {
              _this.stashes.persist('label_locale', update_locale);
              _this.stashes.persist('vocalization_locale', update_locale);
              _this.stashes.persist('override_label_locale', update_locale);
              _this.stashes.persist('override_vocalization_locale', update_locale);
              if(update_locale) {
                _this.appState.set('label_locale', update_locale);
                _this.appState.set('vocalization_locale', update_locale);
              }
              _this.appState.jump_to_board({
                id: board.id,
                key: board.key
              });
            }
          }, function() { });
        }, function() { });  
      }, function() { });
    },
    downloadBoard: function() {
      var _this = this;
      this.appState.assert_source().then(function() {
        var has_links = _this.get('board').get('model').get('linked_boards').length > 0;
        modal.open('download-board', {type: 'obf', has_links: has_links, id: _this.get('board.model.id')});
      }, function() { });
    },
    printBoard: function() {
      var _this = this;
      this.appState.assert_source().then(function() {
        var has_links = _this.get('board').get('model').get('linked_boards').length > 0;
        modal.open('download-board', {type: 'pdf', has_links: has_links, id: _this.get('board.model.id')});
      }, function() { });
    },
    saveBoard: function() {
      this.get('board').saveButtonChanges();
    },
    resetBoard: function() {
      if(!this || !this.get) { return; }
      this.toggleMode('edit');
      var board = this.get('board');
      if(!board) { return; }
      var model = board.get('model');
      if(model && typeof model.rollbackAttributes === 'function') {
        model.rollbackAttributes();
      }
      if(typeof board.processButtons === 'function') {
        board.processButtons();
      }
    },
    undoEdit: function() {
      editManager.undo();
    },
    redoEdit: function() {
      editManager.redo();
    },
    modifyGrid: function(action, type, location) {
      if(location == 'top' || location == 'left') {
        location = 0;
      } else {
        location = null;
      }
      editManager.modify_size(type, action, location);
    },
    noPaint: function() {
      editManager.clear_paint_mode();
    },
    paint: function(fill, border, parts_of_speech) {
      if(fill == 'level') {
        modal.open('modals/paint-level', {});
      } else {
        var part_of_speech = (parts_of_speech || [])[0];
        editManager.set_paint_mode(fill, border, part_of_speech);
      }
    },
    star: function() {
      var _this = this;
      this.appState.assert_source().then(function() {
        var board = _this.get('board').get('model');
        if(board.get('starred')) {
          board.unstar();
        } else {
          board.star();
        }
      }, function() { });
    },
    check_scanning: function() {
      if(!this) { return; }
      if(this.appState && typeof this.appState.check_scanning === 'function') {
        this.appState.check_scanning();
      }
    },
    exitBoards: function() {
      this.set('boardMenuOpen', false);
      this.appState.return_to_index();
    },
    toggleBoardMenu: function() {
      this.toggleProperty('boardMenuOpen');
      if(this.get('boardMenuOpen')) {
        var _this = this;
        var handler = function(e) {
          if(!e.target.closest('.la-board-mobile-menu') && !e.target.closest('.la-board-hamburger')) {
            _this.set('boardMenuOpen', false);
            document.removeEventListener('click', handler, true);
          }
        };
        setTimeout(function() {
          document.addEventListener('click', handler, true);
        }, 10);
      }
    },
    boardDetails: function() {
      this.set('boardMenuOpen', false);
      modal.open('board-details', {board: this.get('board.model')});
    },
    // "Card View" header button on the classic page delegates to the
    // board.index controller, which persists the user's view-style
    // preference to 'modern' and then navigates to the modern view.
    go_to_modern: function() {
      this.get('board').send('go_to_modern');
    },
    set_locale: function(loc) {
      this.appState.set('label_locale', loc);
      this.appState.set('vocalization_locale', loc);
      this.stashes.persist('label_locale', loc);
      this.stashes.persist('vocalization_locale', loc);
      this.stashes.persist('override_label_locale', loc);
      this.stashes.persist('override_vocalization_locale', loc);
      editManager.process_for_displaying();    
    },
    openButtonStash: function() {
      if(!this.appState.get('edit_mode')) { return; }
      editManager.clear_paint_mode();
      modal.open('button-stash');
    },
    preview_levels: function() {
      if(!this.appState.get('edit_mode')) { return; }
      // Match the modern view's toggle_preview_levels: entering preview
      // mode starts at Level 1 and actually applies it so the user sees
      // the level-filtered grid immediately (previously only the mode
      // flag flipped and nothing changed until a chevron was clicked).
      editManager.preview_levels();
      this.set('board.preview_level', 1);
      this.set('board.model.display_level', 1);
      editManager.apply_preview_level(1);
    },
    shift_level: function(direction) {
      var levels = this.get('board.button_levels');
      if(levels[0] != 1) { levels.unshift(1); }
      if(levels[levels.length - 1] != 10) { levels.push(10); }
      if(direction == 'done') {
        editManager.clear_preview_levels();
      } else if(direction == 'down') {
        var lvl = Math.max(1, (this.get('board.current_level') || 10) - 1);
        var new_level = null;
        for(var idx = 0; idx < levels.length; idx++) {
          if(levels[idx] <= lvl) { new_level = levels[idx]; }
        }
        this.set('board.preview_level', new_level);
        this.set('board.model.display_level', new_level);
        editManager.apply_preview_level(new_level);
      } else if(direction == 'up') {
        var lvl = Math.min(10, (this.get('board.current_level') || 10) + 1);
        var new_level = null;
        for(var idx = 0; idx < levels.length; idx++) {
          if(!new_level && levels[idx] >= lvl) { new_level = levels[idx]; }
        }
        this.set('board.preview_level', new_level);
        this.set('board.model.display_level', new_level);
        editManager.apply_preview_level(new_level);
      }
    },
    list_copies: function() {
      modal.open('board-copies', {board: this.get('board.model')});
    },
    board_actions: function() {
      modal.open('modals/board-actions', {board: this.get('board.model')})
    },
    highlight_button: function(options) {
      if(!this || this.isDestroyed) { return; }
      options = options || {};
      // TODO: this and activateButton belong somewhere more testable
      var buttons = this.get('button_highlights');
      var defer = this.get('highlight_button_defer') || RSVP.defer();
      this.set('highlight_button_defer', defer);

      var _this = this;
      var picture_prompt = function($button) {
        if(utterance && utterance.get && utterance.get('hint_button')) {
          utterance.set('hint_button.label', $button.find(".button-label").eq(0).text());
          utterance.set('hint_button.image_url', $button.find(".symbol").attr('src'));
        }
      };

      if(buttons && buttons.length > 0) {
        var button = buttons[0];
        var boardModel = this.get('board.model');
        if(button.pre == 'home' || button.pre == 'true_home' || button.pre == 'home' || button.pre == 'sidebar') {
          // handle pre-buttons if there are any
          this.set('button_highlights', buttons);
          // On the board-detail page a true_home/home return step can't use the old
          // "#speak > button:first" home target (it matches nothing there) and Home would
          // navigate to the session root, not back up the tree the search is walking. Use the
          // Back button instead (go_back → pops the nav-history pushed on the way in → returns
          // to the parent board). Falls back to the classic home target off board-detail.
          // Target ONE visible Back button — the board-detail page renders go_back in more than
          // one place (speak-bar nav stack + nav-btns cluster); highlighting the whole jQuery set
          // would size the overlay to the bounding box of all of them and sweep in the Home
          // button. `.first()` on the visible set keeps the highlight on a single Back button.
          var $bd_back_btn = $("[data-bd-action='go_back']:visible").first();
          var bd_back = (button.pre == 'true_home' || button.pre == 'home')
            && $(".md-board-detail-nav-stack").length > 0
            && $bd_back_btn.length > 0;
          var $button = bd_back ? $bd_back_btn : $("#speak > button:first");
          if(button.pre == 'sidebar') {
            $button = $("#sidebar a[data-key='" + button.linked_board_key + "']");
          }
          if(options.delay_prompt) {
            defer.wait_a_bit(500);
            return;
          }
          modal.highlight($button, {clear_overlay: options.subtle_highlight, highlight_type: 'button_search'}).then(function() {
            _this.set('last_highlight_selection', (new Date()).getTime());
            if(defer.did_wait) { defer.already_waited = true; }
            defer.not_first_action = true;

            if(button.pre == 'true_home' || button.pre == 'home') {
              if(bd_back) {
                // board-detail: return via the Back button (go_back) rather than Home, so we
                // step back up to the parent board the sequence came from instead of jumping
                // to the (possibly unrelated) session home board.
                buttons.shift();
                // Click the SAME Back button we highlighted when it's still attached, so the
                // highlighted element and the clicked element can't desync if the board
                // re-rendered/reordered the two go_back buttons; only re-query if that node was
                // detached (which would otherwise no-op the click and stall the sequence).
                try {
                  var _bk = ($bd_back_btn[0] && document.contains($bd_back_btn[0]))
                    ? $bd_back_btn[0]
                    : $("[data-bd-action='go_back']:visible")[0];
                  if(_bk) { _bk.click(); }
                } catch(e) {}
              } else {
                var has_temporary_home = !!_this.stashes.get('temporary_root_board_state');
                var already_on_temporary_home = _this.stashes.get('temporary_root_board_state.id') == _this.appState.get('currentBoardState.id');
                if(!has_temporary_home || already_on_temporary_home) {
                  buttons.shift();
                }
                _this.send('home');
              }
            } else if(button.pre == 'temp_home') {
              buttons.shift();
              _this.send('home');
            } else {
              buttons.shift();
              _this.jumpToBoard({
                key: button.linked_board_key,
                home_lock: button.home_lock,
                meta_home: button.meta_home
              });
            }
          }, function(err) {
            if(err && (err.reason == 'force close' || err.highlight_close)) {
              runLater(function() {
                var not_highlighting = (modal.highlight_settings || {}).highlight_type == 'button_search' && !modal.is_open('highlight');
                not_highlighting = not_highlighting || ((modal.highlight2_settings || {}).highlight_type == 'button_search' && !modal.is_open('highlight-secondary'));
                if(not_highlighting) {
                  _this.highlight_button('resume');
                }
              }, 1000);
            } else {
              defer.reject(err || {canceled: true});
            }
          });
        } else if(button && boardModel && button.board_id == boardModel.get('id')) {
          // otherwise if you're currently on the correct board
          var findButtonElem = function() {
            var bm = _this.get('board.model');
            if(bm && button.board_id == bm.get('id')) {
              var $button = $(".button[data-id='" + button.id + "']");
              if($button[0] && $button.width()) {
                // Find the (visible) button in the UI
                if(options.picture_hint) {
                  picture_prompt($button);
                }
                if(options.delay_prompt) {
                  defer.wait_a_bit(500);
                  return;
                }
                _this.set('button_highlights', buttons);
                modal.highlight($button, {clear_overlay: options.subtle_highlight, highlight_type: 'button_search'}).then(function() {
                  if(defer.did_wait) { defer.already_waited = true; }
                  defer.not_first_action = true;
                  _this.set('last_highlight_selection', (new Date()).getTime());
                  buttons.shift();
                  var found_button = editManager.find_button(button.id);
                  var board = _this.get('board.model');
                  // If this step navigates INTO a sub-board on the board-detail page, push the
                  // nav-history so the Back button renders (the guided activateButton path
                  // otherwise bypasses it, leaving no in-session trail / no way to return via
                  // Back). Delegate to the board-detail controller's _push_nav_history so there's
                  // a single source of truth rather than a divergent inline copy.
                  if(found_button && emberGet(found_button, 'load_board') && board && $(".md-board-detail-nav-stack").length > 0) {
                    try {
                      var _bd_ctrl = getOwner(_this).lookup('controller:user.board-detail') ||
                        getOwner(_this).lookup('controller:user/board-detail');
                      if(_bd_ctrl && !_bd_ctrl.isDestroyed && typeof _bd_ctrl._push_nav_history === 'function') {
                        _bd_ctrl._push_nav_history();
                      }
                    } catch(e) {}
                  }
                  _this.activateButton(found_button, {board: board, skip_highlight_check: true});
                  var next_button = buttons[0];
                  if(next_button && board && (next_button.board_id == board.id || next_button.pre)) {
                    // If there is more to the sequence, and the 
                    // user selection isn't going to involve loading
                    // a different board, then call highlight_button again
                    _this.highlight_button('resume'); 
                  } else if(next_button && board && (next_button.board_id != board.id)) {
                    // If there is more to the sequence but we're
                    // in the process of navigating, do nothing, the
                    // load board process should highlight the next
                    // step on its own
                  } else {
                    // If there aren't any more valid steps, end the sequence
                    defer.resolve();
                  }
                }, function(err) {
                  if(err && (err.reason == 'force close' || err.highlight_close)) {
                    runLater(function() {
                      var not_highlighting = (modal.highlight_settings || {}).highlight_type == 'button_search' && !modal.is_open('highlight');
                      not_highlighting = not_highlighting || ((modal.highlight2_settings || {}).highlight_type == 'button_search' && !modal.is_open('highlight-secondary'));
                      if(not_highlighting) {
                        _this.highlight_button('resume');
                      }
                    }, 1000);
                  } else {
                    defer.reject(err || {canceled: true});
                  }
                });
              } else {
                // If you can't find the correct button, try again in a minute
                runLater(findButtonElem, 100);
              }
            }
          };
          findButtonElem();
        } else {
          // looks like we're on the wrong board...
          // pull hint buttons from the list until we find the next
          // actual_button,
          button = buttons.shift();
          while(button && !button.actual_button) {
            button = buttons.shift();
          }
          if(button && _this.get('button_highlights_button_set')) {
            // try to find the sequence to get from here to there
            var bs = _this.get('button_highlights_button_set');
            var stashesSvc = _this.get('stashes');
            if (!stashesSvc) {
              defer.reject({error: 'no stashes for highlight path'});
              return;
            }
            var current = _this.get('board.model.id');
            var home = stashesSvc.get('root_board_state.id');
            var tmp_home = stashesSvc.get('temporary_root_board_state.id');
            var map = bs.board_map([bs]).map;
            var sequence = bs.button_steps(current, button.board_id, map, home, tmp_home);
            if (!sequence || !sequence.buttons) {
              defer.reject({error: 'no path to highlighted button'});
              return;
            }
            var new_buttons = [];
            if(sequence.pre == 'true_home') {
              new_buttons.push({pre: 'true_home'});
            }
            sequence.buttons.forEach(function(btn) {
              new_buttons.push(btn);
            });
            new_buttons.push(button);
            while(new_buttons.length > 0) {
              buttons.unshift(new_buttons.pop());
            }
            runLater(function() {
              _this.highlight_button('resume');
            });
          } else {
            // nothing to do, give up
            defer.reject({error: 'no buttons left to guide to'});
          }
        }
      } else {
        defer.resolve();
      }
    },
    about_modal: function() {
      modal.open('about-lingolinq');
    },
    full_screen: function() {
      capabilities.fullscreen(true).then(null, function() {
        modal.warning(i18n.t('fullscreen_failed', "Full Screen Mode failed to load"), true);
      });
    },
    launch_board: function() {
      if(this.appState.get('board_url')) {
        capabilities.window_open(this.appState.get('board_url'), '_blank');
      }
    },
    confirm_update: function() {
      modal.open('confirm-update-app');
    },
    toggle_modeling: function() {
      this.appState.toggle_modeling_if_possible(true);
    },
    meta_home_click: function() {
    },
    meta_home: function() {
      this.appState.meta_home_if_possible();
    },
    switch_languages: function() {
      modal.open('switch-languages', {board: this.get('board.model')}).then(function(res) {
        if(res && res.switched) {
          editManager.process_for_displaying();
        }
      });
    },
    back_to_from_route: function() {
      this.set('boardMenuOpen', false);
      this.appState.return_to_index();
      setTimeout(function() {
        window.scrollTo(0, 0);
        var content = document.getElementById('content');
        if(content) { content.scrollTop = 0; }
      }, 100);
    },
    suggestions: function() {
      modal.open('button-suggestions', {board: this.get('board.model'), user: this.appState.get('currentUser')});
    },
    setup_go: function(direction) {
      var setupController = this.router && this.router.controllerFor && this.router.controllerFor('setup');
      if(setupController && typeof setupController.flush_pending_save === 'function') {
        setupController.flush_pending_save();
      }
      var order = this.get('setup_order');
      var current = this.get('setup_page') || 'intro';
      var current_index = order.indexOf(current) || 0;
      var wait = RSVP.resolve();
      if(direction == 'forward') {
        var u = this.appState.get('setup_user') || this.appState.get('currentUser');
        if(order[current_index + 1] == 'board_category') {
          // Skip board selection if a home board is already
          // set and this was an auto-launch
          if(this.appState.get('auto_setup') && u &&u.get('preferences.home_board')) {
            current_index++;
          }
        }
        if(order[current_index] == 'symbols') {
          if(u && u.get('preferred_symbols_changed') && u.get('preferences.preferred_symbols') != 'original') {
            var promise = u.swap_home_board_images();
            if(promise.wait) { wait = promise; }
          }
        }
        current_index = Math.min(current_index + 1, order.length - 1);
        if(window.ga && current_index > (this.get('max_index') || 0)) {
          this.set('max_index', current_index);
          console.log('progression', this.get('max_index'));
          window.ga('send', 'event', 'Setup', 'step_' + this.get('max_index'),'Progressed to Step ' + this.get('max_index'));
        }
  
      } else if(direction == 'backward') {
        current_index = Math.max(current_index - 1, 0);
      }
      var _this = this;
      wait.then(function() {
        var params = {page: order[current_index]}
        var user_id = _this.get('setup_user_id');
        if(user_id) {
          params.user_id = user_id;
        }
        var transition = _this.router.transitionTo('setup', {queryParams: params});
        transition.then(function() {
          runLater(function() {
            // Scroll every possible container to the top
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
            if (document.scrollingElement) {
              document.scrollingElement.scrollTop = 0;
            }
            // Walk up from setup_container and reset all scrollable ancestors
            var container = document.getElementById('setup_container');
            if (container) {
              var el = container.parentElement;
              while (el) {
                if (el.scrollTop > 0) { el.scrollTop = 0; }
                el = el.parentElement;
              }
            }
          }, 50);
        }, function() { });
      }, function() { });
    },
    speak_mode_notification: function() {
      if(this.appState.get('speak_mode_modeling_ideas.enabled')) {
        modal.open('modals/modeling-ideas', {inactivity_timeout: true, speak_mode: true, users: [this.appState.get('referenced_user')]});
      } else if(this.appState.get('user_badge')) {
        modal.open('badge-awarded', {inactivity_timeout: true, speak_mode: true, badge: {id: this.appState.get('user_badge.id')}});
      } else if(this.appState.get('speak_mode_modeling_ideas.timeout')) {
        modal.open('modals/modeling-ideas', {inactivity_timeout: true, speak_mode: true, users: [this.appState.get('referenced_user')]});
      }
    }
  },
  setup_next: computed('setup_page', 'setup_order', function() {
    if(this.get('setup_order')) {
      return this.get('setup_page') != this.get('setup_order')[this.get('setup_order').length - 1];
    }
  }),
  setup_previous: computed('setup_page', 'setup_order', function() {
    if(this.get('setup_order')) {
      return !!(this.get('setup_page') && this.get('setup_page') != this.get('setup_order')[0]);
    }
  }),
  setup_index: computed('setup_order', 'setup_page', function() {
    var order = this.get('setup_order');
    var current = this.get('setup_page') || 'intro';
    var idx = order.indexOf(current);
    return (idx >= 0 ? idx : 0) + 1;
  }),
  activateButton: function(button, options) {
    var _this = this;
    speecher.unlock_speech();
    var contentPromise = (button.findContentLocally && typeof button.findContentLocally === 'function') ? button.findContentLocally() : null;
    var p = (contentPromise && typeof contentPromise.then === 'function') ? contentPromise : RSVP.resolve();
    var done = false;
    var runActivation = function() {
      if(done) { return; }
      done = true;
      _this._activateButtonWithOptions(button, options);
    };
    var timeout = runLater(runActivation, 300);
    p.then(function() {
      runCancel(timeout);
      runActivation();
    }, function() {
      runCancel(timeout);
      runActivation();
    });
  },
  _activateButtonWithOptions: function(button, options) {
    var _this = this;
    options = options || {};
    var image = options.image || button.get('image');
    var sound = options.sound || button.get('sound');
    var board = options.board;
    if(!board || typeof board.get !== 'function') {
      return;
    }
    var oldState = {
      id: board.get('id'),
      key: board.get('key'),
      parent_id: board.get('parent_board_id')
    };
    var image_url = (button.get && (button.get('local_image_url') || button.get('image_url'))) ||
      button.local_image_url ||
      button.image_url ||
      button.image;
    if(image && image.get && image.get('best_url') && !image_url) {
      image_url = image.get('best_url');
    }
    if(image && image.get('personalized_url') && !button.no_skin) {
      image_url = image.get('personalized_url');
    } else if(button.get('original_image_url') && LingoLinqImage.personalize_url) {
      image_url = LingoLinqImage.personalize_url(button.get('original_image_url'), _this.appState.get('currentUser.protected_image_token'), _this.appState.get('referenced_user.preferences.skin'), button.no_skin);
    }
    var part_of_speech = (button.get && button.get('part_of_speech')) || button.part_of_speech ||
      (button.get && button.get('painted_part_of_speech')) || button.painted_part_of_speech ||
      (button.get && button.get('suggested_part_of_speech')) || button.suggested_part_of_speech;
    var label = (button.get && button.get('label')) || button.label;
    var vocalization = (button.get && button.get('vocalization')) || button.vocalization;
    // Spelling-style "+s" on a dedicated "-s" modifier should inflect (walks), not append "s" (watchs).
    if((vocalization || '').match(/^\+s$/i) && (label || '').trim().match(/^-?s$/i)) {
      vocalization = ':plural';
    }
    var obj = {
      label: label,
      vocalization: vocalization,
      image: image_url,
      button_id: button.id,
      part_of_speech: part_of_speech,
      sound: (sound && sound.get && sound.get('url')) || button.get('original_sound_url'),
      board: oldState,
      completion: button.completion,
      source: options.trigger_source,
      blocking_speech: button.blocking_speech,
      type: 'speak'
    };
    if(options.overlay_location) {
      obj.overlay_location = options.overlay_location;
    } else if(options.event && options.event.swipe_direction && options.swipe_direction != 'clear') {
      obj.swipe_location = options.event.swipe_direction;
      var grid = editManager.grid_for(button.id);
      var inflection = (grid || []).find(function(i) { return i.location == options.event.swipe_direction; });
      if(inflection) {
        options.overlay_label = inflection.label;
        options.overlay_vocalization = inflection.vocalization;
      }
      button = editManager.overlay_button_from(button);
    }

    obj.label = options.overlay_label || obj.label;
    obj.vocalization = options.overlay_vocalization || obj.vocalization;
    if(options.event && options.event.overlay_target) { obj.overlay = options.event.overlay_target; }
    if(options.event && options.event.trigger_source) { obj.source = options.event.trigger_source; }
    var location = buttonTracker.locate_button_on_board(button.id, options.event);
    if(location) {
      obj.percent_x = location.percent_x;
      obj.percent_y = location.percent_y;
      obj.prior_percent_x = location.prior_percent_x;
      obj.prior_percent_y = location.prior_percent_y;
      obj.percent_travel = location.percent_travel;
    }
    this.telemetry.trackBoardActivation(obj);
    _this.set('last_highlight_explore_action', (new Date()).getTime());

    var highlight_buttons = _this.get('button_highlights') || [];
    var next_actual_button = highlight_buttons.find(function(b) { return b.actual_button; });
    utterance.set('hint_button', null);
    if(!options.skip_highlight_check && next_actual_button && (!button.load_board || button.link_disabled) && (next_actual_button.vocalization || next_actual_button.label) == (button.vocalization || button.label)) {
      var btn = null;
      while(btn != next_actual_button) {
        btn = highlight_buttons.shift();
      }
      _this.set('highlight_buttons', highlight_buttons);
      var defer = _this.get('highlight_button_defer');
      if(defer) {
        defer.already_waited = false;
        defer.did_wait = false;
        defer.not_first_action = true;
      }
    }
    _this.appState.activate_button(button, obj);
  },
  background_class: computed(
    'appState.speak_mode',
    'appState.currentUser.preferences.board_background',
    'appState.currentUser.preferences.dim_header',
    'board.model.dim_header',
    function() {
      var res = "";
      if(this.appState.get('speak_mode')) {
        var color = this.appState.get('currentUser.preferences.board_background');
        if(color) {
          if(color == '#000') { color = 'black'; }
          res = res + "color_" + color;
        }
        if(this.appState.get('currentUser.preferences.dim_level')) {
          res = res + " " + this.appState.get('currentUser.preferences.dim_level');
        }
        if(this.appState.get('currentUser.preferences.dim_header') || this.get('board.model.dim_header')) {
          res = res + " dim_sides";
        }
      }
      return htmlSafe(res);
    }
  ),
  set_and_say_buttons: function(buttons) {
    utterance.set_and_say_buttons(buttons);
  },
  few_supervisees: computed(
    'appState.currentUser.supervisees',
    'appState.currentBoardState.key',
    function() {
      var max_to_show = 2;
      var sups = this.appState.get('currentUser.supervisees') || [];
      var list = sups;
      var more = [];
      var current_board_user_name = (this.appState.get('currentBoardState.key') || '').split(/\//)[0];
      if(current_board_user_name) {
        var new_list = [];
        var new_more = [];
        sups.forEach(function(sup) {
          if(sup.user_name == current_board_user_name) {
            new_list.push(sup);
          } else {
            new_more.push(sup);
          }
        });
        // don't rearrange if all will be shown anyway, since that would be confusing
        if(new_list.length > 0 && (new_list.length + new_more.length <= max_to_show)) {
          list = new_list;
          more = new_more;
        }
      }
      if(list.length > max_to_show) { return null; }
      return {
        list: list,
        more: more.length > 0
      };
    }
  ),
  sayLouder: function(pct) {
    this.vocalize(pct || 3.0);
  },
  vocalize: function(volume, opts) {
    if(this.appState.get('eval_mode')) {
      if(this.get('board.model')) {
        this.get('board.model').prompt();
      }
    } else if(this.appState.get('currentUser.preferences.repair_on_vocalize')) {
      modal.open('modals/repairs', {inactivity_timeout: true, speak_on_done: true});
    } else {
      utterance.vocalize_list(volume, opts);
      if(this.appState.get('currentUser.preferences.vibrate_buttons') && this.appState.get('speak_mode')) {
        capabilities.vibrate();
      }
    }
  },
  jumpToBoard: function(new_state, old_state) {
    this.appState.jump_to_board(new_state, old_state);
  },
  backOneBoard: function(opts) {
    this.appState.back_one_board(opts);
  },
  rootBoard: function(options) {
    this.appState.jump_to_root_board(options);
  },
  toggleMode: function(mode, opts) {
    this.appState.toggle_mode(mode, opts);
  },
  swatch_style: computed('swatches', function() {
    var swatches = this.get('swatches');
    var extra_rows = (swatches[1].extras || []).length;
    var width = 285 + (extra_rows * 60);
    return htmlSafe('width: ' + width + 'px;');
  }),
  swatches: computed('appState.colored_keys', 'appState.extra_colored_keys', function() {
    var res = [].concat(LingoLinq.keyed_colors);
    var extras = this.appState.get('extra_colored_keys') || [];
    var extras_per_row = Math.ceil(extras.length / (res.length / 2))
    res.forEach(function(swatch, idx) {
      if(idx % 2 == 1) {
        emberSet(swatch, 'right_edge', true);
      }
      if(idx % 2 == 1 && extras_per_row > 0 && extras.length > 0) {
        var list = [];
        for(var idx = 0; idx < extras_per_row; idx++) {
          var extra = extras.shift();
          if(extra) {
            list.push(extra);
          }
        }
        emberSet(swatch, 'extras', list);
      } else {
        emberSet(swatch, 'extras', null);
      }
    });
    return res;
  }),
  show_back: computed(
    'appState.empty_board_history',
    'appState.currentUser.preferences.device.always_show_back',
    'appState.eval_mode',
    'appState.currentBoardState.extra_back',
    function() {
      return (!this.appState.get('empty_board_history') || this.appState.get('currentUser.preferences.device.always_show_back') || this.get('eval_mode') || this.appState.get('currentBoardState.extra_back'));
    }
  ),
  on_home: computed(
    'stashes.root_board_state.id',
    'appState.currentBoardState.id',
    'appState.eval_mode',
    function() {
      return !!((this.appState.get('currentBoardState.id') && this.appState.get('currentBoardState.id') == this.stashes.get('root_board_state.id')) || this.appState.get('eval_mode'));
    }
  ),
  button_list_class: computed(
    'stashes.ghost_utterance',
    'stashes.working_vocalization',
    'stashes.root_board_state.text_direction',
    'extras.eye_gaze_state',
    'show_back',
    'appState.pairing',
    'appState.currentUser.preferences.device.button_text_position',
    'appState.currentUser.preferences.device.utterance_text_only',
    'appState.currentUser.preferences.high_contrast',
    'board.text_style',
    'board.button_style',
    'appState.header_size',
    'appState.flipped',
    'appState.currentUser.preferences.device.flipped_override',
    function() {
      var res = "button_list ";
      var flipped = this.appState.get('flipped');
      if(flipped) {
        res = res + "flipped ";
        // always show text-only when flipping
      }
      if(this.stashes.get('ghost_utterance') && !flipped) {
        res = res + "ghost_utterance ";
      }
      if(this.get('extras.eye_gaze_state')) {
        res = res + "with_eyes ";
      }
      if(this.get('show_back')) {
        res = res + "with_back ";
      }
      if(speecher.text_direction() == 'rtl' || this.stashes.get('root_board_state.text_direction') == 'rtl') {
        res = res + "rtl ";
      }
      if(this.appState.get('pairing')) {
        res = res + "paired ";
      }
      var currentUser = this.appState.get('currentUser');
      var userPrefs = currentUser && currentUser.get ? currentUser.get('preferences') : null;
      var devicePrefs = userPrefs && userPrefs.device ? userPrefs.device : null;
      var text_position = (devicePrefs && devicePrefs.button_text_position) || (window.user_preferences && window.user_preferences.device && window.user_preferences.device.button_text_position);
      var show_always = (devicePrefs && devicePrefs.utterance_text_only) || (window.user_preferences && window.user_preferences.device && window.user_preferences.device.utterance_text_only) || this.appState.get('pairing.partner');
      if(text_position == 'text_only' || show_always || flipped) {
        res = res + "text_only ";
      }
      if(userPrefs && userPrefs.high_contrast === true) {
        res = res + 'high_contrast ';
      }

      if(this.appState.get('flipped') && devicePrefs && devicePrefs.flipped_override && devicePrefs.flipped_text) {
        res = res + 'text_' + devicePrefs.flipped_text + ' ';
      } else {
        if(this.get('board.text_style')) {
          var style = this.get('board.text_style') || ' ';
          var big_header = this.appState.get('header_size') == 'large' || this.appState.get('header_size') == 'huge';
          if(flipped && big_header && (style == ' ' || style == 'text_small' || style == 'text_medium')) {
            style = 'text_large';
          }
          res = res + style + " ";
        }
      }
      if(this.get('board.button_style')) {
        var style = Button.style(this.get('board.button_style'));
        if(style.upper) {
          res = res + "upper ";
        } else if(style.lower) {
          res = res + "lower ";
        }
        if(style.font_class) {
          res = res + style.font_class + " ";
        }
      }
      if(this.stashes.get('working_vocalization.length')) {
        res = res + "has_content ";
      }

      return htmlSafe(res);
    }
  ),
  no_paint_mode_class: computed('board.paint_mode', function() {
    var res = "btn ";
    if(this.get('board.paint_mode')) {
      res = res + "btn-default";
    } else {
      res = res + "btn-info";
    }
    return res;
  }),
  paint_mode_class: computed('board.paint_mode', function() {
    var res = "btn ";
    if(this.get('board.paint_mode')) {
      res = res + "btn-info";
    } else {
      res = res + "btn-default";
    }
    return res;
  }),
  undo_class: computed('board.noUndo', function() {
    var res = "skinny ";
    if(this.get('board.noUndo')) {
      res = res + "disabled";
    }
    return res;
  }),
  redo_class: computed('board.noRedo', function() {
    var res = "skinny ";
    if(this.get('board.noRedo')) {
      res = res + "disabled";
    }
    return res;
  }),
  content_class: computed(
    'appState.sidebar_visible',
    'appState.index_view',
    'appState.current_route',
    'appState.index_or_landing_view',
    'session.isAuthenticated',
    'appState.currentUser.preferences.new_index',
    'isModernDashboardRoute',
    function() {
      var res = "";
      if(this.appState.get('sidebar_visible')) {
        res = res + "with_sidebar ";
      }
      var route = this.appState.get('current_route');
      if(this.appState.get('index_or_landing_view')) {
        res = res + "index ";
      }
      if(this.get('isModernDashboardRoute')) {
        res = res + "modern-dashboard ";
      }
      if(route === 'user.stats') {
        res = res + "stats-page ";
      }
      if(route === 'user.home') {
        res = res + "home-page ";
      }
      if(route === 'user.boards') {
        res = res + "boards-page ";
      }
      if(route === 'user.extras') {
        res = res + "extras-page ";
      }
      if(route === 'caseload') {
        res = res + "modern-dashboard ";
      }
      if(this.get('session.isAuthenticated')) {
        res = res + "with_user ";
      } else if(this.appState.get('domain_settings.full_domain')) {
        res = res + "no_user ";
      } else {
        res = res + "blank_user ";
      }
      if(this.appState.get('browser') == 'Safari' || this.appState.get('system') == 'iOS' || capabilities.system == 'iOS') {
        res = res + "low_for_high_contrast ";
      }
      res = res + "new_index ";
      return res;
    }
  ),
  header_class: computed(
    'appState.header_size',
    'appState.speak_mode',
    'appState.currentBoardState.id',
    'appState.currentUser.preferences.new_index',
    function() {
      var res = "row ";
      res = res + 'new_index ';
      if(this.appState.get('header_size')) {
        res = res + this.appState.get('header_size') + ' ';
      }
      // Only flag the header as "speaking" when we're actually rendering
      // a board in speak mode. When the board route fails to load
      // (error.hbs renders in the outlet), speak_mode may still be set
      // from the prior eval initialization but the speak chrome is
      // suppressed — emitting `.speaking` here would trigger a chain of
      // speak-mode-specific overrides (e.g. compact #identity button
      // at 58px, disabled user-select) that shouldn't apply when there's
      // nothing to speak. Mirrors the same currentBoardState.id gate
      // used on the speak-header conditional in application.hbs.
      if (this.appState.get('speak_mode') && this.appState.get('currentBoardState.id')) {
        res = res + 'speaking advanced_selection';
      }
      return res;
    }
  ),
  /** True when bento dashboard is shown with page footer so layout uses full-height flex chain (footer at bottom). */
  showBentoPageWithFooter: computed('footer', 'appState.index_or_landing_view', 'appState.current_route', function() {
    var route = this.appState.get('current_route');
    var userSubRoutes = [
      'home-boards', 'user.index', 'user.preferences', 'user.account',
      'user.subscription', 'user.edit', 'user.stats', 'user.boards',
      'user.goals', 'user.goal', 'user.logs', 'user.log', 'user.badges',
      'user.device', 'user.history', 'user.recordings', 'user.lessons',
      'user.focus', 'user.board-detail'
    ];
    return this.get('footer') &&
      (this.appState.get('index_or_landing_view') || userSubRoutes.indexOf(route) !== -1) &&
      route !== 'landing';
  }),
  /** True when the top navbar should use bento styling and contents (index/landing or user.stats with currentUser). */
  showBentoStyleHeader: computed('appState.index_or_landing_view', 'appState.current_route', 'appState.currentUser', function() {
    var route = this.appState.get('current_route');
    var cu = this.appState.get('currentUser');
    return (this.appState.get('index_or_landing_view') && cu) ||
      (route === 'user.home' && cu) ||
      (route === 'user.extras' && cu) ||
      (route === 'user.stats' && cu) ||
      (route === 'user.boards' && cu) ||
      (route === 'caseload' && cu);
  }),
  /** user.extras: full-bleed dashboard body (CSS class name is historical). */
  isModernDashboardRoute: computed('appState.current_route', function() {
    return this.appState.get('current_route') === 'user.extras';
  }),
  /** True when current route is setup or any nested route (e.g. setup.intro, setup.voice). */
  isSetupRoute: computed('appState.current_route', function() {
    var route = this.appState.get('current_route');
    return route === 'setup' || (route && route.indexOf('setup.') === 0);
  }),
  /** True when current route is user or any nested route (e.g. user.index, user.edit, user.preferences). */
  isUserRoute: computed('appState.current_route', function() {
    var route = this.appState.get('current_route');
    return route === 'user' || (route && route.indexOf('user.') === 0);
  }),
  /** True when current route is organization or any nested route (e.g. organization.index, organization.people). */
  isOrganizationRoute: computed('appState.current_route', function() {
    var route = this.appState.get('current_route');
    return route === 'organization' || (route && route.indexOf('organization.') === 0);
  }),
  /** Use AppNavbar in #inner_header for both authenticated dashboard-like pages and unauthenticated landing/info pages. */
  useAppNavbarInHeader: computed('showBentoStyleHeader', 'isModernDashboardRoute', 'isSetupRoute', 'isUserRoute', 'isOrganizationRoute', 'appState.current_route', 'appState.currentUser', 'appState.currentBoardState.id', 'eval_welcome_active', function() {
    var route = this.appState.get('current_route');
    var cu = this.appState.get('currentUser');
    if (route === 'user.board-alt.index') { return false; }
    // Eval welcome intro: show the regular home AppNavbar (not the eval speak
    // bar) until the evaluation actually starts. See `eval_welcome_active`.
    if (this.get('eval_welcome_active')) { return true; }
    // Authenticated pages
    if (this.get('showBentoStyleHeader') || this.get('isModernDashboardRoute') || this.get('isSetupRoute') || (this.get('isUserRoute') && cu) || (this.get('isOrganizationRoute') && cu) ||
      (route === 'about' && cu) ||
      (route === 'features' && cu) ||
      (route === 'pricing' && cu) ||
      (route === 'privacy' && cu) ||
      (route === 'terms' && cu) ||
      (route === 'home-boards' && cu) ||
      (route === 'search' && cu) ||
      (route === 'offline_boards' && cu) ||
      (route === 'caseload' && cu) ||
      route === 'support' ||
      route === 'database' ||
      (route && route.indexOf('system-settings') === 0) ||
      route === 'faq' ||
      route === 'beta-feedback' ||
      (route && route.indexOf('beta-feedback-admin') === 0) ||
      route === 'contact' ||
      route === 'login.device') {
      return true;
    }
    // No board loaded — use AppNavbar regardless of route or auth state.
    // This catches every error path: board route rejecting, OBF lookup
    // returning null, parent route bubbling, error.hbs rendering at any
    // level. The legacy `<span id="nav_header">` chrome assumes a board
    // is present (Done/Back/Speak Mode controls only make sense with
    // currentBoardState); without one, fall back to the AppNavbar so
    // chrome matches the home page. The user.board-alt early return at
    // the top of this computed already protects the alt-board route.
    if (!this.appState.get('currentBoardState.id')) {
      return true;
    }
    return false;
  })
});
