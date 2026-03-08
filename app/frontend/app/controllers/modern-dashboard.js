import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { set } from '@ember/object';
import { computed } from '@ember/object';
import { get as emberGet, set as emberSet } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import { htmlSafe } from '@ember/template';
import modal from '../utils/modal';
import i18n from '../utils/i18n';

export default Controller.extend({
  router: service(),
  appState: service('app-state'),

  activeTab: 'home',
  isSearchOpen: false,
  showNewBoardForm: false,
  pillnavDropdownOpen: false,

  activeTabLabel: computed('activeTab', function() {
    var tab = this.get('activeTab');
    var labels = {
      home: i18n.t('home', 'Home'),
      boards: i18n.t('boards', 'Boards'),
      reports: i18n.t('reports', 'Reports'),
      extras: i18n.t('extras', 'Extras'),
      supervisors: i18n.t('supervisors', 'Supervisors')
    };
    return labels[tab] || labels.home;
  }),

  /** Show Getting Started card when user has not completed all checklist items (same logic as authenticated-view blank_slate) */
  showGettingStarted: computed('appState.currentUser.preferences.progress', function() {
    var progress = this.appState.get('currentUser.preferences.progress');
    return progress && !progress.setup_done;
  }),
  gettingStartedPercent: computed('appState.currentUser.preferences.progress', function() {
    var options = ['intro_watched', 'profile_edited', 'preferences_edited', 'home_board_set', 'app_added'];
    var progress = this.appState.get('currentUser.preferences.progress') || {};
    if (progress.setup_done) { return 100; }
    var done = 0;
    options.forEach(function(opt) {
      if (progress[opt]) { done++; }
    });
    return options.length ? Math.round(done / options.length * 100) : 0;
  }),
  gettingStartedPercentStyle: computed('gettingStartedPercent', function() {
    return htmlSafe('width: ' + this.get('gettingStartedPercent') + '%;');
  }),
  gettingStartedStep: computed('appState.currentUser.preferences.progress', function() {
    var order = ['intro_watched', 'home_board_set', 'app_added', 'preferences_edited', 'profile_edited'];
    var progress = this.appState.get('currentUser.preferences.progress') || {};
    if (progress.setup_done) { return 5; }
    for (var i = 0; i < order.length; i++) {
      if (!progress[order[i]]) { return i + 1; }
    }
    return 5;
  }),

  /* Board count for stat (value will be wired in the future); used for number and Board vs Boards label */
  boardCount: computed('appState.currentUser.root_boards.length', 'appState.currentUser.my_boards.length', function() {
    var user = this.get('appState.currentUser');
    if (!user) { return 12; }
    var roots = user.get('root_boards');
    if (roots && roots.length !== undefined) { return roots.length; }
    var mine = user.get('my_boards');
    if (mine && mine.length !== undefined) { return mine.length; }
    return 12;
  }),

  extrasItems: computed('appState.currentUser', 'appState.currentUser.permissions.delete', 'appState.feature_flags.lessons', 'appState.feature_flags.emergency_boards', 'appState.currentUser.currently_premium_or_fully_purchased', 'appState.currentUser.external_device', function() {
    var appState = this.appState;
    var user = appState.get('currentUser');
    var perms = user && user.get('permissions.delete');
    var modelingOnly = user && user.get('modeling_only');
    var externalDevice = user && user.get('external_device');
    var lessons = appState.get('feature_flags.lessons') && user && user.get('currently_premium_or_fully_purchased');
    var emergencyBoards = appState.get('feature_flags.emergency_boards');
    var introWatched = user && user.get('preferences.progress.intro_watched');
    var items = [
      { title_key: 'learn_and_setup_card', title_default: 'Learn and Setup', subtitle_key: 'get_started_subtitle', subtitle_default: 'Get started with %app_name%', image: 'images/pastel-getting-started.svg', action: 'intro', btn_key: 'learn_action', btn_default: 'Learn', show: !modelingOnly },
      { title_key: 'new_board', title_default: 'New Board', subtitle_key: 'new_board_subtitle', subtitle_default: 'Create a new vocabulary board', image: 'images/icon-boards.png', action: 'newBoard', btn_key: 'create', btn_default: 'Create', show: !modelingOnly },
      { title_key: 'search_boards', title_default: 'Search Boards', subtitle_key: 'find_boards_subtitle', subtitle_default: 'Find vocabulary boards', image: 'images/browse-boards-icon.svg', action: 'searchBoards', btn_key: 'search', btn_default: 'Search', show: !modelingOnly && introWatched },
      { title_key: 'sync', title_default: 'Sync', subtitle_key: 'sync_subtitle', subtitle_default: 'Sync your data', image: 'images/pastel-logging.png', action: 'sync_details', btn_key: 'sync', btn_default: 'Sync', show: !externalDevice },
      { title_key: 'goals', title_default: 'Goals', subtitle_key: 'goals_subtitle', subtitle_default: 'Track progress', image: 'images/pastel-reports2.png', action: 'goals', btn_key: 'view', btn_default: 'View', show: !!perms },
      { title_key: 'new_note', title_default: 'New Note', subtitle_key: 'new_note_subtitle', subtitle_default: 'Add a progress note', image: 'images/pastel-chat.svg', action: 'record_note', btn_key: 'add', btn_default: 'Add', show: !modelingOnly },
      { title_key: 'run_eval', title_default: 'Run Evaluation', subtitle_key: 'run_eval_subtitle', subtitle_default: 'Assessment tools', image: 'images/pastel-lightbulb.png', action: 'run_eval', btn_key: 'run_action', btn_default: 'Run', show: !modelingOnly },
      { title_key: 'my_account', title_default: 'My Account', subtitle_key: 'profile_and_settings', subtitle_default: 'Profile and settings', image: 'images/pastel-extras.png', action: 'account', btn_key: 'open', btn_default: 'Open', show: !!perms },
      { title_key: 'trainings', title_default: 'Trainings', subtitle_key: 'trainings_subtitle', subtitle_default: 'Continuing education', image: 'images/pastel-modeling.png', action: 'lessons', btn_key: 'start', btn_default: 'Start', show: !!lessons },
      { title_key: 'critical_access', title_default: 'Basic Access', subtitle_key: 'offline_boards_subtitle', subtitle_default: 'Offline boards', image: 'images/pastel-house.png', action: 'offline_boards', btn_key: 'access', btn_default: 'Access', show: !!emergencyBoards }
    ];
    return items;
  }),

  openSearch() {
    set(this, 'isSearchOpen', true);
  },

  closeSearch() {
    set(this, 'isSearchOpen', false);
  },

  onSearchKeydown(event) {
    if (event && event.key === 'Escape') {
      if (this.get('pillnavDropdownOpen')) {
        set(this, 'pillnavDropdownOpen', false);
      } else {
        set(this, 'isSearchOpen', false);
      }
    }
  },

  goHelp() {
    modal.open('support');
  },

  openAccount() {
    var user = this.appState.get('currentUser.user_name');
    if (user) {
      this.router.transitionTo('user', user);
    }
  },

  goTab(tab) {
    if (tab === 'reports') {
      var u = this.appState.get('currentUser.user_name');
      if (u) { this.router.transitionTo('user.stats', u, { queryParams: { from_dashboard: 1 } }); }
      return;
    }
    if (tab === 'home') {
      set(this, 'activeTab', 'home');
      set(this, 'showNewBoardForm', false);
      this.router.transitionTo('modern-dashboard');
      return;
    }
    if (tab === 'boards') {
      this.router.transitionTo('modern-dashboard.boards');
      return;
    }
    if (tab === 'extras') {
      this.router.transitionTo('modern-dashboard.extras');
      return;
    }
    if (tab === 'supervisors') {
      this.router.transitionTo('modern-dashboard.supervisors');
      return;
    }
    set(this, 'activeTab', tab);
  },

  togglePillnavDropdown() {
    set(this, 'pillnavDropdownOpen', !this.get('pillnavDropdownOpen'));
  },

  selectTab(tab) {
    this.goTab(tab);
    set(this, 'pillnavDropdownOpen', false);
  },

  go(dest) {
    if (dest === 'speak') {
      this.router.transitionTo('index');
    } else if (dest === 'boards') {
      this.router.transitionTo('modern-dashboard.boards');
    } else if (dest === 'supervisors') {
      this.router.transitionTo('modern-dashboard.supervisors');
    } else if (dest === 'reports') {
      var u = this.appState.get('currentUser.user_name');
      if (u) { this.router.transitionTo('user.stats', u, { queryParams: { from_dashboard: 1 } }); }
    } else if (dest === 'extras') {
      this.router.transitionTo('modern-dashboard.extras');
    }
  },

  goAndCloseSearch(dest) {
    set(this, 'isSearchOpen', false);
    this.go(dest);
  },

  openExtrasTab() {
    set(this, 'isSearchOpen', false);
    this.router.transitionTo('modern-dashboard.extras');
  },

  newBoard() {
    this.router.transitionTo('index');
  },

  openNewBoardOnBoards() {
    this.router.transitionTo('modern-dashboard.boards-new');
  },

  closeNewBoardForm() {
    this.router.transitionTo('modern-dashboard.boards');
  },

  goUpgrade() {
    var user = this.appState.get('currentUser');
    if (user) {
      modal.open('premium-required', { user_name: user.get('user_name'), user: user, remind_to_upgrade: true });
    } else {
      modal.open('premium-required', { remind_to_upgrade: true });
    }
  },

  getting_started() {
    modal.open('getting-started', { progress: this.appState.get('currentUser.preferences.progress') });
  },

  extraAction(name) {
    var appState = this.appState;
    var user = appState.get('currentUser');
    var userName = user && user.get('user_name');
    var userId = user && user.get('id');
    if (name === 'intro') {
      this.router.transitionTo('setup', { queryParams: { user_id: null, page: null } });
    } else if (name === 'newBoard') {
      if (this.appState.check_for_needing_purchase) {
        this.appState.check_for_needing_purchase().then(function() { modal.open('new-board'); }, function() { modal.open('new-board'); });
      } else {
        modal.open('new-board');
      }
    } else if (name === 'searchBoards') {
      this.router.transitionTo('search', 'any', encodeURIComponent('_'));
    } else if (name === 'sync_details') {
      var p = typeof window !== 'undefined' && window.persistence;
      var list = (p && p.get && p.get('sync_log')) ? [].concat(p.get('sync_log')).reverse() : [];
      modal.open('sync-details', { details: list });
    } else if (name === 'goals') {
      if (userName) { this.router.transitionTo('user.stats', userName, { queryParams: { start: null, end: null, device_id: null, location_id: null } }); }
    } else if (name === 'record_note') {
      if (this.appState.check_for_needing_purchase) {
        this.appState.check_for_needing_purchase().then(function() { modal.open('record-note', { note_type: 'text', user: user }); }, function() { modal.open('record-note', { note_type: 'text', user: user }); });
      } else {
        modal.open('record-note', { note_type: 'text', user: user });
      }
    } else if (name === 'run_eval') {
      modal.open('modals/eval-status', { action: 'pick', user: appState.get('sessionUser') });
    } else if (name === 'account') {
      if (userName) { this.router.transitionTo('user', userName); }
    } else if (name === 'lessons') {
      if (userId) { this.router.transitionTo('user.lessons', userId); }
    } else if (name === 'offline_boards') {
      this.router.transitionTo('offline_boards');
    }
  },

  homeInSpeakMode(boardForUserId, keepAsSelf) {
    var appState = this.appState;
    if (boardForUserId) {
      appState.set_speak_mode_user(boardForUserId, true, keepAsSelf);
    } else if ((emberGet(appState.get('currentUser'), 'permissions.delete') && (appState.get('currentUser.supervisees') || []).length > 0) || appState.get('currentUser.communicator_in_supporter_view')) {
      var prompt = i18n.t('speak_as_which_user', "Select User to Speak As");
      if (appState.get('currentUser.communicator_in_supporter_view')) {
        prompt = i18n.t('speak_as_which_mode', "Select Mode and User for Session");
      }
      appState.set('referenced_speak_mode_user', null);
      appState.get('controller').send('switch_communicators', { stay: true, modeling: 'ask', skip_me: false, header: prompt });
    } else {
      appState.home_in_speak_mode();
    }
  },

  recordNoteFor(supervisee) {
    var user = supervisee || this.appState.get('currentUser');
    if (!emberGet(user, 'avatar_url_with_fallback')) {
      emberSet(user, 'avatar_url_with_fallback', emberGet(user, 'avatar_url'));
    }
    var _this = this;
    this.appState.check_for_needing_purchase().then(function() {
      modal.open('record-note', { note_type: 'text', user: user }).then(function() {
        runLater(function() {
          _this.appState.get('currentUser').reload().then(null, function() {});
        }, 5000);
      });
    }, function() {
      modal.open('record-note', { note_type: 'text', user: user });
    });
  },

  quickAssessmentFor(supervisee) {
    if (emberGet(supervisee, 'premium') || emberGet(supervisee, 'currently_premium')) {
      modal.open('quick-assessment', { user: supervisee });
    } else {
      modal.open('premium-required', { user_name: supervisee.user_name, action: 'quick_assessment', reason: 'not_currently_premium' });
    }
  },

  actions: {
    openSearch() { this.openSearch(); },
    closeSearch() { this.closeSearch(); },
    onSearchKeydown(e) { this.onSearchKeydown(e); },
    goHelp() { this.goHelp(); },
    openAccount() { this.openAccount(); },
    goTab(tab) { this.goTab(tab); },
    selectTab(tab) { this.selectTab(tab); },
    togglePillnavDropdown() { this.togglePillnavDropdown(); },
    go(dest) { this.go(dest); },
    goAndCloseSearch(dest) { this.goAndCloseSearch(dest); },
    newBoard() { this.newBoard(); },
    openNewBoardOnBoards() { this.openNewBoardOnBoards(); },
    closeNewBoardForm() { this.closeNewBoardForm(); },
    goUpgrade() { this.goUpgrade(); },
    extraAction(name) { this.extraAction(name); },
    openExtrasTab() { this.openExtrasTab(); },
    homeInSpeakMode(boardForUserId, keepAsSelf) { this.homeInSpeakMode(boardForUserId, keepAsSelf); },
    recordNoteFor(supervisee) { this.recordNoteFor(supervisee); },
    quickAssessmentFor(supervisee) { this.quickAssessmentFor(supervisee); },
    getting_started() { this.getting_started(); }
  }
});
