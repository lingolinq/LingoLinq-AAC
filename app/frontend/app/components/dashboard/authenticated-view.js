import Component from '@ember/component';
import { inject as service } from '@ember/service';
import EmberObject, { set as emberSet, get as emberGet, observer, computed } from '@ember/object';
import { alias } from '@ember/object/computed';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import { htmlSafe } from '@ember/template';
import LingoLinq from '../../app';
import capabilities from '../../utils/capabilities';
import Badge from '../../models/badge';
import Log from '../../models/log';
import session from '../../utils/session';
import modal from '../../utils/modal';
import sync from '../../utils/sync';
import i18n from '../../utils/i18n';

export default Component.extend({
  tagName: '',
  
  router: service(),
  store: service(),
  persistence: service('persistence'),
  appState: service('app-state'),
  stashes: service('stashes'),
  modal: service('modal'),
  app_state: alias('appState'),

  activeTab: 'home',
  /** When set (e.g. on user.extras), open this tab on load */
  initialActiveTab: null,
  isSearchOpen: false,
  showNewBoardForm: false,
  pillnavDropdownOpen: false,

  init() {
    this._super(...arguments);
    // Initialize supervisees_with_badges to empty array
    this.set('supervisees_with_badges', []);
    var initial = this.get('initialActiveTab');
    if (initial) {
      this.set('activeTab', initial);
    }
  },
  didInsertElement() {
    this._super(...arguments);
  },

  sync_able: computed('extras.ready', 'appState.currentUser.external_device', function() {
    return this.get('extras.ready') && !this.appState.get('currentUser.external_device');
  }),
  home_board_or_supporter: computed(
    'appState.currentUser.preferences.home_board.key',
    'appState.currentUser.supporter_view',
    function() {
        return this.appState.get('currentUser.preferences.home_board.key') || this.appState.get('currentUser.supporter_view');
    }
  ),
  last_board_name: computed('stashes.root_board_state', 'appState.currentUser.user_name', function() {
    var fromStash = this.stashes.get('root_board_state.name');
    if(fromStash) { return fromStash; }
    var userName = this.appState.get('currentUser.user_name');
    if(!userName) { return null; }
    try {
      var stored = localStorage['ll_last_board_' + userName];
      if(stored) { return JSON.parse(stored).name || null; }
    } catch(e) { }
    return null;
  }),
  needs_sync: computed('persistence.last_sync_at', function() {
    if (!this || typeof this.get !== 'function') { return false; }
    var p = null;
    try { p = this.get('persistence'); } catch (e) { }
    if (!p && typeof window !== 'undefined') { p = window.persistence; }
    if(!p || typeof p.get !== 'function') { return false; }
    var now = (new Date()).getTime() / 1000;
    var lastSync = p.get('last_sync_at') || 0;
    return (now - lastSync) > (7 * 24 * 60 * 60);
  }),
  blank_slate: computed(
    'appState.currentUser.preferences.progress',
    function() {
      var progress = this.appState.get('currentUser.preferences.progress');
      // Only hide Getting Started when user has actually completed setup
      if(progress && progress.setup_done) {
        return null;
      }
      return progress;
    }
  ),
  no_intro: computed(
    'blank_slate',
    'appState.currentUser.preferences.progress.intro_watched',
    function() {
      return this.get('blank_slate') && !this.appState.get('currentUser.preferences.progress.intro_watched');
    }
  ),
  blank_slate_percent: computed('appState.currentUser.preferences.progress', function() {
    var options = ['intro_watched', 'profile_edited', 'preferences_edited', 'home_board_set', 'app_added'];

    var total = options.length;
    if(total === 0) { return 0; }
    var done = 0;
    var progress = this.appState.get('currentUser.preferences.progress') || {};
    if(progress.setup_done) { return 100; }
    options.forEach(function(opt) {
      if(progress[opt]) {
        done++;
      }
    });
    return Math.round(done / total * 100);
  }),
  blank_slate_percent_style: computed('blank_slate_percent', function() {
    return htmlSafe("width: " + this.get('blank_slate_percent') + "%;");
  }),
  /** Current step (1–5) for Getting Started; same order as modal: intro, home board, app, preferences, profile */
  getting_started_step: computed('appState.currentUser.preferences.progress', function() {
    var order = ['intro_watched', 'home_board_set', 'app_added', 'preferences_edited', 'profile_edited'];
    var progress = this.appState.get('currentUser.preferences.progress') || {};
    if (progress.setup_done) { return 5; }
    for (var i = 0; i < order.length; i++) {
      if (!progress[order[i]]) { return i + 1; }
    }
    return 5;
  }),
  checkForBlankSlate: observer('persistence.online', function() {
    if(!this || typeof this.get !== 'function') { return; }
    var persistenceService = null;
    try { persistenceService = this.get('persistence') || this.persistence; } catch (e) { }
    if (!persistenceService && typeof window !== 'undefined') { persistenceService = window.persistence; }
    if(!persistenceService || typeof persistenceService.find_recent !== 'function') { return; }
    var _this = this;
    if(this.get('isGenerated')) { return; } // Ember testing check equivalent?
    persistenceService.find_recent('board').then(function(boards) {
      if(boards && boards.slice) {
        boards = boards.slice(0, 12);
      }
      _this.set('recentOfflineBoards', boards);
      if(_this.get('homeBoards') == [] && _this.get('popularBoards') == []) {
        _this.set('showOffline', true);
      } else {
        var p = _this.get && _this.get('persistence');
        if(!p || !p.get || !p.get('online')) {
          _this.set('showOffline', true);
        } else {
          _this.set('showOffline', false);
        }
      }
    }, function() {
      _this.set('showOffline', false);
    });
  }),
  device: computed(function() {
    var res = {
      added_somewhere: !!this.appState.get('currentUser.preferences.progress.app_added'),
      standalone: capabilities.browserless,
      android: capabilities.system == "Android",
      ios: capabilities.system == "iOS"
    };

    res.needs_install_reminder = !res.added_somewhere || ((res.android || res.ios) && !res.standalone);
    if(res.standalone && (res.android || res.ios)) {
      res.needs_install_reminder = false;
    } else if(this.appState.get('currentUser.using_for_a_while')) {
      res.needs_install_reminder = false;
    }
    return res;
  }),
  small_needs_sync_class: computed('needs_sync', function() {
    var res = "half_size list-group-item ";
    if(!this.get('needs_sync')) {
      res = res + "subtle ";
    }
    return res;
  }),
  refreshing_class: computed('persistence.syncing', function() {
    var res = "glyphicon glyphicon-refresh ";
    if (!this || typeof this.get !== 'function') { return res; }
    var p = null;
    try { p = this.get('persistence'); } catch (e) { }
    if (!p && typeof window !== 'undefined') { p = window.persistence; }
    if(p && typeof p.get === 'function' && p.get('syncing')) {
      res = res + "spinning ";
    }
    return res;
  }),
  needs_sync_class: computed('needs_sync', function() {
    var res = "list-group-item ";
    if(!this.get('needs_sync')) {
      res = res + "subtle ";
    }
    return res;
  }),
  current_boards: computed(
    'popular_selected',
    'personal_selected',
    'suggested_selected',
    'recent_selected',
    'popularBoards',
    'personalBoards',
    'homeBoards',
    'recentOfflineBoards',
    function() {
      var res = {};
      if(this.get('popular_selected')) {
        res = this.get('popularBoards');
      } else if(this.get('personal_selected')) {
        res = this.get('personalBoards');
      } else if(this.get('suggested_selected')) {
        // filter out boards that have a style.id but not style.name
        res = this.get('homeBoards');
        if(res.filter) {
          var ids = {};
          res.forEach(function(b) {
            if(b.get('style.options')) {
              ids[b.get('style.id')] = true;
            }
          })
          res = res.filter(function(b) { return !b.get('style') || !ids[b.get('style.id')] || b.get('style.options'); }).slice(0, 12);
        }

      } else if(this.get('recent_selected')) {
        res = this.get('recentOfflineBoards');
      }
      return res;
    }
  ),
  pending_updates: computed(
    'appState.currentUser.pending_org',
    'appState.currentUser.pending_supervision_org',
    'appState.currentUser.pending_board_shares',
    'appState.currentUser.unread_messages',
    function() {
      var important = this.appState.get('currentUser.pending_org') ||
                  this.appState.get('currentUser.pending_supervision_org') ||
                  (this.appState.get('currentUser.pending_board_shares') || []).length > 0 ||
                  this.appState.get('currentUser.unread_messages');
      var normal_new = this.appState.get('currentUser.unread_messages.length') || 0;
      var unread_notifications = (this.appState.get('currentUser.parsed_notifications') || []).filter(function(n) { return n.unread; }).length;
      normal_new = normal_new + (unread_notifications || 0);

      if(normal_new && !this.appState.get('currentUser.read_notifications')) {
        return {count: normal_new};
      } else if(important) {
        return true;
      } else {
        return null;
      }
    }
  ),
  update_selected: observer('selected', 'persistence.online', function() {
    if(!this || typeof this.get !== 'function') { return; }
    var persistenceService = null;
    try { persistenceService = this.get('persistence') || this.persistence; } catch (e) { }
    if (!persistenceService && typeof window !== 'undefined') { persistenceService = window.persistence; }
    if(!persistenceService || typeof persistenceService.get !== 'function' || !persistenceService.get('online')) { return; }
    var _this = this;
    var last_browse = this.stashes.get('last_index_browse');
    var default_index = 2;
    // If a user already has a home board they're not going to care about popular boards,
    // they want to see something more useful like all the boards they own, or maybe
    // the home boards of all their supervisees, or maybe all their starred boards
    if(this.appState.get('currentUser.preferences.home_board.key')) {
      if(this.appState.get('currentUser.stats.user_boards') > 0) {
        default_index = 1;
      } else {
        default_index = 3;
      }
    }
    ['popular', 'personal', 'suggested', 'recent'].forEach(function(key, idx) {
      if(_this.get('selected') == key || (!_this.get('selected') && idx === default_index && !last_browse) || (!_this.get('selected') && last_browse == key)) {
        _this.set(key + '_selected', true);
        if(_this.get('selected')) {
          _this.stashes.persist('last_index_browse', key);
        }
        if(key == 'recent') {
          var p = _this.get && _this.get('persistence');
          if(p && typeof p.find_recent === 'function') {
            p.find_recent('board').then(function(boards) {
            if(boards && boards.slice) {
              boards = boards.slice(0, 12);
            }
            _this.set('recentOfflineBoards', boards);
          });
          }
        } else {
          var list = 'homeBoards';
          var locale = ((i18n.langs || {}).preferred || window.navigator.language || 'en').split(/-/)[0];
          if(_this.appState.get('currentUser.preferences.locale')) {
            locale = _this.appState.get('currentUser.preferences.locale').split(/-/)[0];
          }
          var opts = {public: true, starred: true, user_id: _this.appState.get('currentUser.id') || 'self', sort: 'custom_order', per_page: 20, preferred_locale: locale};
          if(key == 'personal') {
            list = 'personalBoards';
            opts = {user_id: 'self', root: true, per_page: 12};
          } else if(key == 'popular') {
            list = 'popularBoards';
            opts = {sort: 'home_popularity', per_page: 12, exclude_starred: _this.appState.get('currentUser.id') || 'self', locale: locale};
          }
          if(!(_this.get(list) || {}).length) {
            _this.set(list, {loading: true});
          }
          _this.get('store').query('board', opts).then(function(data) {
            _this.set(list, data);
            _this.checkForBlankSlate();
          }, function() {
            _this.set(list, {error: true});
          });
          _this.checkForBlankSlate();
        }
      } else {
        _this.set(key + '_selected', false);
      }
    });
  }),
  allow_logs: computed('appState.currentUser.preferences.logging', 'appState.currentUser.modeling_only', 'appState.currentUser.supporter_role', 'session.modeling_session', function() {
    return this.appState.get('currentUser.preferences.logging') && !this.appState.get('currentUser.supporter_role') && !this.appState.get('currentUser.modeling_only') && !session.get('modeling_session');
  }),
  reload_logs: observer('model.id', 'persistence.online', function() {
    if(!this || typeof this.get !== 'function') { return; }
    var model = this.get('model');
    var _this = this;
    var persistenceService = null;
    try { persistenceService = this.get('persistence') || this.persistence; } catch (e) { }
    if (!persistenceService && typeof window !== 'undefined') { persistenceService = window.persistence; }
    // Skip if user_id is 'cache' or starts with 'cache:' (from boards cache endpoint)
    var model_id = model && model.get('id');
    if(model && model_id && model_id != 'cache' && !model_id.toString().match(/^cache:/) && persistenceService && typeof persistenceService.get === 'function' && persistenceService.get('online')) {
      var controller = this;
      var find_args = {user_id: model.get('id'), type: 'session'};
      if(model.get('supporter_role')) {
        find_args.supervisees = true;
      }
      if(!(controller.get('logs') || {}).length) {
        controller.set('logs', {loading: true});
      }
      this.get('store').query('log', find_args).then(function(list) {
        controller.set('logs', list.map(function(i) { return i; }));
      }, function() {
        if(!(controller.get('logs') || {}).length) {
          controller.set('logs', {error: true});
        }
      });
      this.get('store').query('badge', {user_id: model.get('id'), recent: 1}).then(function(badges) {
        var for_users = {};
        badges.forEach(function(badge) {
          for_users[badge.get('user_id')] = for_users[badge.get('user_id')] || []
          for_users[badge.get('user_id')].push(badge);
        });
        _this.set('current_user_badges', for_users);
      }, function(err) { });
      model.load_word_activities();
    }
  }),
  best_badge: function(badges, goal_id) {
    return Badge.best_next_badge(badges, goal_id);
  },
  earned_badge: function(badges) {
    return Badge.best_earned_badge(badges);
  },
  update_current_badges: observer(
    'appState.sessionUser',
    'appState.sessionUser.known_supervisees',
    'appState.currentUser',
    'appState.currentUser.known_supervisees',
    'appState.currentUser.supervisees',
    'session.modeling_session',
    'current_user_badges',
    function() {
      var _this = this;
      var model = _this.get('model');
      var for_users = _this.get('current_user_badges') || {};
      if(model && for_users[model.get('id')]) {
        var b = _this.best_badge(for_users[model.get('id')], model.get('goal.id'));
        var eb = _this.earned_badge(for_users[model.get('id')]);
        if(!this.appState.get('sessionUser.currently_premium') || this.appState.get('sessionUser.supporter_role') || session.get('modeling_session')) {
          b = null;
        }
        // If no badge for the current user use the supervisee if there's only one
        var known_sups = this.appState.get('currentUser.known_supervisees') || this.appState.get('sessionUser.known_supervisees') || [];
        if(!b && known_sups.length == 1) {
          var sup = known_sups[0];
          if(sup.premium) {
            b = _this.best_badge(for_users[emberGet(sup, 'id')], (sup.goal || {}).id)
          }
        }
        emberSet(model, 'current_badge', b);
        emberSet(model, 'earned_badge', eb);
      }
      var sups = [];
      // Use known_supervisees from currentUser first (since that's what we check for tab visibility), then sessionUser
      var supervisees_list = this.appState.get('currentUser.known_supervisees') || this.appState.get('sessionUser.known_supervisees') || [];
      // If known_supervisees is empty, try to get from supervisees array
      if(supervisees_list.length === 0) {
        var raw_supervisees = this.appState.get('currentUser.supervisees') || this.appState.get('sessionUser.supervisees') || [];
        // known_supervisees is computed from supervisees, so if supervisees exists, known_supervisees should too
        // But if it's not computed yet, we can use supervisees directly
        supervisees_list = raw_supervisees;
      }
      supervisees_list.forEach(function(sup) {
        if(for_users[emberGet(sup, 'id')] && emberGet(sup, 'premium')) {
          var b = _this.best_badge(for_users[emberGet(sup, 'id')], (sup.goal || {}).id);
          emberSet(sup, 'current_badge', b);
          var eb = _this.earned_badge(for_users[emberGet(sup, 'id')]);
          emberSet(sup, 'earned_badge', eb);
        }
        if(LingoLinq.remote_url(sup.avatar_url) && !sup.local_avatar_url) {
          _this.persistence.find_url(sup.avatar_url, 'image').then(function(url) {
            emberSet(sup, 'local_avatar_url', url);
          }, function(err) { });
        } else if(sup.local_avatar_url && sup.local_avatar_url.match(/localhost/)) {
          emberSet(sup, 'local_avatar_url', capabilities.storage.fix_url(sup.local_avatar_url));
        }
        sups.push(sup);
      });
      // Always set to an array, even if empty
      _this.set('supervisees_with_badges', sups.length > 0 ? sups : []);
    }
  ),
  modeling_ideas_available: computed(
    'appState.sessionUser.supporter_role',
    'appState.sessionUser.currently_premium',
    function() {
      if(this.appState.get('sessionUser.currently_premium')) {
        return true;
      } else if(this.appState.get('sessionUser.supporter_role')) {
        var any_premium_supervisees = false;
        (this.appState.get('sessionUser.known_supervisees') || []).forEach(function(sup) {
          if(emberGet(sup, 'premium') || emberGet(sup, 'currently_premium')) {
            any_premium_supervisees = true;
          }
        });
        if(any_premium_supervisees) {
          return true;
        }
      }
      return false;
    }
  ),
  many_supervisees: computed('appState.currentUser.supervisees', function() {
    return (this.appState.get('currentUser.supervisees') || []).length > 5;
  }),
  some_supervisees: computed('appState.currentUser.supervisees', function() {
    return (this.appState.get('currentUser.supervisees') || []).length > 3;
  }),
  has_supervisees: computed('appState.currentUser.supervisees', 'appState.currentUser.known_supervisees', function() {
    return (this.appState.get('currentUser.supervisees') || []).length > 0 || (this.appState.get('currentUser.known_supervisees') || []).length > 0;
  }),
  show_communicators_tab: computed('appState.currentUser.supporter_role', 'appState.currentUser.supervisees', 'appState.currentUser.known_supervisees', function() {
    return this.appState.get('currentUser.supporter_role') || (this.appState.get('currentUser.supervisees') || []).length > 0 || (this.appState.get('currentUser.known_supervisees') || []).length > 0;
  }),
  supervisors_count: computed('appState.currentUser.supervisors', function() {
    return (this.appState.get('currentUser.supervisors') || []).length;
  }),
  managed_orgs: computed('appState.currentUser.organizations', function() {
    return (this.appState.get('currentUser.organizations') || []).filter(function(o) { 
      return o.type == 'manager' && o.restricted != true; 
    });
  }),
  has_management_responsibility: computed('managed_orgs', function() {
    return (this.get('managed_orgs') || []).length > 0;
  }),
  manages_multiple_orgs: computed('managed_orgs', function() {
    return (this.get('managed_orgs') || []).length > 1;
  }),
  autoOpenSpeakMode: computed('appState.currentUser.preferences.auto_open_speak_mode', {
    get() {
      return this.appState.get('currentUser.preferences.auto_open_speak_mode');
    },
    set(key, value) {
      // Set the value on the model
      this.appState.set('currentUser.preferences.auto_open_speak_mode', value);
      // Trigger a save
      this.appState.get('currentUser').save().then(null, function() { });
      return value;
    }
  }),
  index_nav: computed(
    'index_nav_state',
    'model.supporter_role',
    'appState.currentUser.preference.device.last_index_nav',
    function() {
      var res = {};
      if(this.get('index_nav_state')) {
        res[this.get('index_nav_state')] = true;
      } else if(this.appState.get('currentUser.preferences.device.last_index_nav')) {
        res[this.appState.get('currentUser.preferences.device.last_index_nav')] = true;
      } else {
        if(this.get('model.supporter_role')) {
          res.main = true;
        } else {
          res.main = true;
        }
      }
      return res;
    }
  ),
  subscription_check: observer('appState.sessionUser', 'appState.logging_in', function() {
    if(this.get('appState.sessionUser') && !this.get('appState.installed_app')) {
      var progress = this.get('appState.sessionUser.preferences.progress');
      var user = this.get('appState.sessionUser');
      var needs_subscribe_modal = false;
      if(!progress || (!progress.skipped_subscribe_modal && !progress.setup_done)) {
        if(user.get('grace_period')) {
          if(modal.route) {
            needs_subscribe_modal = true;
          }
        }
      } else if(this.get('appState.sessionUser.really_expired')) {
        needs_subscribe_modal = true;
      }
      if(needs_subscribe_modal && !this.appState.get('logging_in')) {
        if(!this.get('appState.installed_app')) {
          modal.open('subscribe');
        }
      }
    }
  }),
  showSupervisorsWhenRequested: observer('appState.requestedSupervisorsView', function() {
    if(this.appState.get('requestedSupervisorsView')) {
      this.appState.set('requestedSupervisorsView', false);
      this.send('set_index_nav', 'supervisors');
      this.set('activeTab', 'supervisors');
    }
  }),
  rating_allowed: computed('appState.sessionUser', function() {
    if(capabilities.installed_app && capabilities.mobile && capabilities.subsystem != 'Kindle') {
      var progress = this.appState.get('sessionUser.preferences.progress') || {};
      if(progress.rated) {
        return false;
      }
      if(this.appState.get('sessionUser.joined') && this.appState.get('sessionUser.joined') < window.moment().add(-28, 'day')) {
        return (Math.round(this.appState.get('sessionUser.joined').getTime() / 1000 / 60 / 60 / 24 / 7) % 4) == 0;
      }
    }
    return false;
  }),
  demoMainContentBg: null,
  demoMainContentBgStyle: computed('demoMainContentBg', function() {
    var bg = this.get('demoMainContentBg');
    return bg ? htmlSafe('background: ' + bg + ';') : htmlSafe('');
  }),
  // 'off' | 'thin' | 'thick' – cycle: first toggle = thin, second = thick, third = off
  sectionBorderMode: 'off',

  activeTabLabel: computed('activeTab', function() {
    var tab = this.get('activeTab');
    var labels = { home: i18n.t('home', 'Home'), boards: i18n.t('boards', 'Boards'), reports: i18n.t('reports', 'Reports'), extras: i18n.t('extras', 'Extras'), supervisors: i18n.t('supervisors', 'Supervisors') };
    return labels[tab] || labels.home;
  }),
  /** Index route @model is the logged-in user; @user is registration placeholder — use model for boards embed */
  boardsEmbedUser: computed('model', 'appState.currentUser', function() {
    return this.get('model') || this.get('appState.currentUser');
  }),
  showGettingStarted: computed('appState.currentUser.preferences.progress', function() {
    var progress = this.appState.get('currentUser.preferences.progress');
    return progress && !progress.setup_done;
  }),
  gettingStartedPercent: computed('appState.currentUser.preferences.progress', function() {
    var options = ['intro_watched', 'profile_edited', 'preferences_edited', 'home_board_set', 'app_added'];
    var progress = this.appState.get('currentUser.preferences.progress') || {};
    if (progress.setup_done) { return 100; }
    var done = 0;
    options.forEach(function(opt) { if (progress[opt]) { done++; } });
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
    return [
      { title_key: 'learn_and_setup_card', title_default: 'Learn and Setup', subtitle_key: 'get_started_subtitle', subtitle_default: 'Get started with %app_name%', image: 'images/pastel-getting-started.svg', action: 'intro', btn_key: 'learn_action', btn_default: 'Learn', show: !modelingOnly },
      { title_key: 'sync', title_default: 'Sync', subtitle_key: 'sync_subtitle', subtitle_default: 'Sync your data', image: 'images/pastel-logging.png', action: 'sync_details', btn_key: 'sync', btn_default: 'Sync', show: !externalDevice },
      { title_key: 'goals', title_default: 'Goals', subtitle_key: 'goals_subtitle', subtitle_default: 'Track progress', image: 'images/pastel-reports2.png', action: 'goals', btn_key: 'view', btn_default: 'View', show: !!perms },
      { title_key: 'new_note', title_default: 'New Note', subtitle_key: 'new_note_subtitle', subtitle_default: 'Add a progress note', image: 'images/pastel-chat.svg', action: 'record_note', btn_key: 'add', btn_default: 'Add', show: !modelingOnly },
      { title_key: 'run_eval', title_default: 'Run Evaluation', subtitle_key: 'run_eval_subtitle', subtitle_default: 'Assessment tools', image: 'images/pastel-lightbulb.png', action: 'run_eval', btn_key: 'run_action', btn_default: 'Run', show: !modelingOnly },
      { title_key: 'my_account', title_default: 'My Account', subtitle_key: 'profile_and_settings', subtitle_default: 'Profile and settings', image: 'images/pastel-extras.png', action: 'account', btn_key: 'open', btn_default: 'Open', show: !!perms },
      { title_key: 'supervisors', title_default: 'Supervisors', subtitle_key: 'manage_supervisors_sub', subtitle_default: 'Add or manage who can support you', image: 'images/pastel-chat.svg', action: 'supervisors', btn_key: 'view', btn_default: 'View', show: true },
      { title_key: 'trainings', title_default: 'Trainings', subtitle_key: 'trainings_subtitle', subtitle_default: 'Continuing education', image: 'images/pastel-modeling.png', action: 'lessons', btn_key: 'start', btn_default: 'Start', show: !!lessons },
      { title_key: 'critical_access', title_default: 'Basic Access', subtitle_key: 'offline_boards_subtitle', subtitle_default: 'Offline boards', image: 'images/pastel-house.png', action: 'offline_boards', btn_key: 'access', btn_default: 'Access', show: !!emergencyBoards }
    ];
  }),

  actions: {
    invalidateSession: function() {
      session.invalidate(true);
    },
    setDemoMainContentBg: function(color) {
      var current = this.get('demoMainContentBg');
      this.set('demoMainContentBg', current === color ? null : color);
    },
    clearDemoMainContentBg: function() {
      this.set('demoMainContentBg', null);
    },
    toggleSectionBorder: function() {
      var mode = this.get('sectionBorderMode');
      var next = mode === 'off' ? 'thin' : (mode === 'thin' ? 'thick' : 'off');
      this.set('sectionBorderMode', next);
    },
    openSearch: function() {
      this.set('isSearchOpen', true);
    },
    closeSearch: function() {
      this.set('isSearchOpen', false);
    },
    onSearchKeydown: function(event) {
      if (event && event.key === 'Escape') {
        if (this.get('pillnavDropdownOpen')) {
          this.set('pillnavDropdownOpen', false);
        } else {
          this.set('isSearchOpen', false);
        }
      }
    },
    goTab: function(tab) {
      if (tab === 'reports') {
        var u = this.appState.get('currentUser.user_name');
        if (u) { this.get('router').transitionTo('user.stats', u, { queryParams: { from_dashboard: 1 } }); }
        return;
      }
      if (tab === 'boards') {
        var ub = this.appState.get('currentUser.user_name');
        if (ub) {
          this.get('router').transitionTo('user.boards', ub);
        }
        return;
      }
      if (tab === 'extras') {
        var ux = this.appState.get('currentUser.user_name');
        if (ux) {
          this.get('router').transitionTo('user.extras', ux);
        }
        return;
      }
      if (tab === 'home') {
        var uh = this.appState.get('currentUser.user_name');
        var homeFrom = this.get('router.currentRouteName');
        if (uh && homeFrom !== 'user.home') {
          this.get('router').transitionTo('user.home', uh);
        } else {
          this.set('activeTab', 'home');
        }
        this.set('showNewBoardForm', false);
        return;
      }
      this.set('activeTab', tab);
    },
    togglePillnavDropdown: function() {
      this.set('pillnavDropdownOpen', !this.get('pillnavDropdownOpen'));
    },
    selectTab: function(tab) {
      this.send('goTab', tab);
      this.set('pillnavDropdownOpen', false);
    },
    go: function(dest) {
      if (dest === 'speak') {
        this.send('homeInSpeakMode');
        return;
      }
      if (dest === 'reports') {
        var u = this.appState.get('currentUser.user_name');
        if (u) { this.get('router').transitionTo('user.stats', u, { queryParams: { from_dashboard: 1 } }); }
        return;
      }
      if (dest === 'boards') {
        var un = this.appState.get('currentUser.user_name');
        if (un) { this.get('router').transitionTo('user.boards', un); }
        return;
      }
      if (dest === 'extras' || dest === 'supervisors') {
        var ux2 = this.appState.get('currentUser.user_name');
        if (ux2) { this.get('router').transitionTo('user.extras', ux2); }
      }
    },
    goAndCloseSearch: function(dest) {
      this.set('isSearchOpen', false);
      this.send('go', dest);
    },
    openExtrasTab: function() {
      this.set('isSearchOpen', false);
      var ue = this.appState.get('currentUser.user_name');
      if (ue) { this.get('router').transitionTo('user.extras', ue); }
    },
    openNewBoardOnBoards: function() {
      var uo = this.appState.get('currentUser.user_name');
      if (uo) {
        this.get('router').transitionTo('user.boards', uo);
      }
      this.set('showNewBoardForm', false);
    },
    openSupervisorsModal: function() {
      modal.open('dashboard-supervisors-modal');
    },
    closeNewBoardForm: function() {
      this.set('showNewBoardForm', false);
    },
    getting_started: function() {
      this.get('modal').open('getting-started', { progress: this.appState.get('currentUser.preferences.progress') });
    },
    extraAction: function(name) {
      var appState = this.appState;
      var user = appState.get('currentUser');
      var userName = user && user.get('user_name');
      var userId = user && user.get('id');
      if (name === 'intro') {
        this.get('router').transitionTo('setup', { queryParams: { user_id: null, page: null } });
      } else if (name === 'newBoard') {
        if (this.appState.check_for_needing_purchase) {
          this.appState.check_for_needing_purchase().then(function() { modal.open('new-board'); }, function() { modal.open('new-board'); });
        } else {
          modal.open('new-board');
        }
      } else if (name === 'searchBoards') {
        this.get('router').transitionTo('search', 'any', encodeURIComponent('_'));
      } else if (name === 'sync_details') {
        var p = typeof window !== 'undefined' && window.persistence;
        var list = (p && p.get && p.get('sync_log')) ? [].concat(p.get('sync_log')).reverse() : [];
        modal.open('sync-details', { details: list });
      } else if (name === 'goals') {
        if (userName) { this.get('router').transitionTo('user.stats', userName, { queryParams: { start: null, end: null, device_id: null, location_id: null } }); }
      } else if (name === 'record_note') {
        if (this.appState.check_for_needing_purchase) {
          this.appState.check_for_needing_purchase().then(function() { modal.open('record-note', { note_type: 'text', user: user }); }, function() { modal.open('record-note', { note_type: 'text', user: user }); });
        } else {
          modal.open('record-note', { note_type: 'text', user: user });
        }
      } else if (name === 'run_eval') {
        modal.open('modals/eval-status', { action: 'pick', user: appState.get('sessionUser') });
      } else if (name === 'account') {
        if (userName) { this.get('router').transitionTo('user', userName); }
      } else if (name === 'lessons') {
        if (userId) { this.get('router').transitionTo('user.lessons', userId); }
      } else if (name === 'offline_boards') {
        this.get('router').transitionTo('offline_boards');
      }
    },
    recordNoteFor: function(supervisee) {
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
    quickAssessmentFor: function(supervisee) {
      if (emberGet(supervisee, 'premium') || emberGet(supervisee, 'currently_premium')) {
        modal.open('quick-assessment', { user: supervisee });
      } else {
        modal.open('premium-required', { user_name: supervisee.user_name, action: 'quick_assessment', reason: 'not_currently_premium' });
      }
    },
    reload: function() {
      location.reload();
    },
    searchBoards: function() {
      this.get('router').transitionTo('search', 'any', encodeURIComponent('_'));
    },
    newBoard: function() {
      this.appState.check_for_needing_purchase().then(function() {
        modal.open('new-board');
      });
    },
    quick_assessment: function(user) {
      if(emberGet(user, 'premium') || emberGet(user, 'currently_premium')) {
        modal.open('quick-assessment', {user: user});
      } else {
        modal.open('premium-required', {user_name: user.user_name, action: 'quick_assessment', reason: 'not_currently_premium'});
      }
    },
    lessons: function(user) {
      if(user == 'pick') {
        if(this.appState.get('sessionUser.supporter_role') && (this.appState.get('sessionUser.known_supervisees.length') > 0 || this.appState.get('currentUser.managed_orgs.length') > 0)) {
          this.appState.get('controller').send('switch_communicators', {header: i18n.t('select_user_to_review_lessons', "Select User to Review Trainings"), stay: true, route: 'user.lessons'})
          return;
        } else {
          user = this.appState.get('currentUser');
        }
      }
      user = user || this.appState.get('currentUser');
      this.get('router').transitionTo('user.lessons', emberGet(user, 'id'));
    },
    run_eval: function(user) {
      if(user == 'pick') {
        if(this.appState.get('sessionUser.supporter_role') && (this.appState.get('sessionUser.known_supervisees.length') > 0 || this.appState.get('currentUser.managed_orgs.length') > 0)) {
          var prompt = i18n.t('select_user_for_eval', "Select User for Evaluation");
          this.appState.get('controller').send('switch_communicators', {stay: true, modeling: false, skip_me: !this.appState.get('currentUser.subscription.premium_supporter_plus_communicator'), header: prompt, eval: true});
          return;
        } else {
          user = this.appState.get('currentUser');
        }
      }
      this.appState.check_for_currently_premium(user, 'eval', false, true).then(function() {
        this.appState.set_speak_mode_user(emberGet(user, 'id'), false, false, 'obf/eval');
      }.bind(this));
    },
    remote_model: function(user) {
      if(user.premium || emberGet(user, 'currently_premium')) {
        modal.open('modals/remote-model', {user_id: user.id});
      } else {
        modal.open('premium-required', {user_name: user.user_name, action: 'evaluation', reason: 'not_currently_premium'});
      }
    },
    support: function() {
      modal.open('support');
    },
    record_note: function(user) {
      user = user || this.appState.get('currentUser');
      if(!emberGet(user, 'avatar_url_with_fallback')) {
        emberSet(user, 'avatar_url_with_fallback', emberGet(user, 'avatar_url'));
      }
      this.appState.check_for_needing_purchase().then(function() {
        modal.open('record-note', {note_type: 'text', user: user}).then(function() {
          runLater(function() {
            this.appState.get('currentUser').reload().then(null, function() { });
          }.bind(this), 5000);
        }.bind(this));  
      }.bind(this));
    },
    sync: function() {
      var p = this.get && this.get('persistence');
      if(!p || typeof p.get !== 'function') { return; }
      if(!p.get('online') || p.get('syncing')) {
        return;
      }
      if(!p.get('syncing')) {
        console.debug('syncing because manually triggered');
        p.sync('self', true).then(null, function() { });
      } else {
        this.send('sync_details');
      }
    },
    load_reports: function() {
      var user = this.appState.get('currentUser');
      this.get('router').transitionTo('user.stats', user.get('user_name'));
    },
    hide_login: function() {
      this.appState.set('login_modal', false);
      $("html,body").css('overflow', '');
      $("#login_overlay").remove();
    },
    show_explanation: function(exp) {
      this.set('show_' + exp + '_explanation', true);
    },
    set_selected: function(selected) {
      this.set('selected', selected);
    },
    set_index_nav: function(nav) {
      if(nav == 'main' || nav == 'supervisees' || nav == 'supervisors') {
        var u = this.appState.get('currentUser');
        // Ensure preferences and preferences.device exist before setting nested value
        var preferences = u.get('preferences') || {};
        var device = preferences.device || {};
        u.set('preferences', preferences);
        u.set('preferences.device', device);
        u.set('preferences.device.last_index_nav', nav);
        u.save().then(null, function() { });
      } else if(nav == 'updates') {
        if(this.appState.get('currentUser')) {
          this.appState.set('currentUser.read_notifications', true);
          this.appState.get('currentUser').save().then(null, function() { });
        }
      }
      this.set('index_nav_state', nav);
    },
    toggle_extras: function() {
      this.set('show_main_extras', !this.get('show_main_extras'));
    },
    intro_video: function(id) {
      if(window.ga) {
        window.ga('send', 'event', 'Setup', 'video', 'Intro video opened');
      }
      modal.open('inline-video', {video: {type: 'youtube', id: id}, hide_overlay: true});
    },
    intro: function(user_id) {
      if(window.ga) {
        window.ga('send', 'event', 'Setup', 'start', 'Setup started');
      }
      this.appState.set('auto_setup', false);

      if(user_id) {
        this.get('router').transitionTo('setup', {queryParams: {user_id: user_id, page: null}});
      } else if(this.appState.get('currentUser.permissions.delete') && (this.appState.get('currentUser.supervisees') || []).length > 0) {
        var prompt = i18n.t('setup_which_user', "Select User to Run Setup");
        this.appState.get('controller').send('switch_communicators', {stay: true, modeling: false, setup: true, skip_me: false, header: prompt});
      } else {
        this.get('router').transitionTo('setup', {queryParams: {user_id: null, page: null}});
      }
    },
    opening_index: function() {
      this.appState.set('index_view', true);
    },
    closing_index: function() {
      this.appState.set('index_view', false);
    },
    manage_supervisors: function() {
      this.send('set_index_nav', 'supervisors');
      this.set('activeTab', 'supervisors');
    },
    session_select: function() {
      if(!this.appState.get('currentUser.preferences.logging')) {
        this.send('load_reports');
      } else {
        this.send('set_index_nav', 'logging');
      }
    },
    sync_details: function() {
      var p = (this && (this.get && this.get('persistence') || this.persistence)) || (typeof window !== 'undefined' && window.persistence);
      if(!p || !p.get || !p.get('online')) {
        modal.open('sync-details', {details: []});
        return;
      }
      var list = ([].concat(p.get('sync_log') || [])).reverse();
      modal.open('sync-details', {details: list});
    },
    stats: function(user_name) {
      if(!user_name) {
        if((this.appState.get('currentUser.supervisees') || []).length > 0) {
          var prompt = i18n.t('select_user_for_reports', "Select User for Reports");
          this.appState.get('controller').send('switch_communicators', {stay: true, modeling: true, skip_me: !this.appState.get('currentUser.subscription.premium_supporter_plus_communicator'), route: 'user.stats', header: prompt});
          return;
        } else {
          user_name = this.appState.get('currentUser.user_name');
        }
      }
      this.get('router').transitionTo('user.stats', user_name, {queryParams: {start: null, end: null, device_id: null, location_id: null, split: null, start2: null, end2: null, devicde_id2: null, location_id2: null}});
    },
    goals: function() {
      if(this.appState.get('sessionUser.supporter_role') && (this.appState.get('sessionUser.known_supervisees.length') > 0 || this.appState.get('currentUser.managed_orgs.length') > 0)) {
        var prompt = i18n.t('select_user_for_goals', "Select User for Goals");
        this.appState.get('controller').send('switch_communicators', {stay: true, modeling: true, skip_me: !this.appState.get('currentUser.subscription.premium_supporter_plus_communicator'), route: 'user.goals', header: prompt});
        return;
      } else {
        var user_name = this.appState.get('currentUser.user_name');
        this.get('router').transitionTo('user.stats', user_name, {queryParams: {start: null, end: null, device_id: null, location_id: null, split: null, start2: null, end2: null, devicde_id2: null, location_id2: null}});
      }
    },
    new_dashboard: function() {
      var user = this.appState.get('currentUser');
      user.set('preferences.new_index', true);
      user.save().then(null, function() { });
      modal.success(i18n.t('revert_new_dashboard', "Welcome to the new, cleaner dashboard! If you're not a fan you can switch back on your Preferences page."));
    },
    set_goal: function(user) {
      var _this = this;
      this.get('store').findRecord('user', user.id).then(function(user_model) {
        modal.open('new-goal', {user: user_model }).then(function(res) {
          if(res && res.get('id') && res.get('set_badges')) {
            _this.get('router').transitionTo('user.goal', user_model.get('user_name'), res.get('id'));
          } else if(res) {
            (_this.appState.get('currentUser.known_supervisees') || []).forEach(function(sup) {
              if(emberGet(sup, 'id') == user_model.get('id')) {
                emberSet(sup, 'goal', {
                  id: res.get('id'),
                  summary: res.get('summary')
                });
              }
            });
          }
        }, function() { });
      }, function(err) {
        modal.error(i18n.t('error_loading_user2', "There was an unexpected error trying to load the user"));
      });
    },
    update_evaluation: function(action) {
      modal.open('modals/eval-status', {action: action, user: this.appState.get('sessionUser')});
    },
    next_lesson: function() {
      var lesson = this.appState.get('sessionUser.first_incomplete_lesson');
      if(lesson) {
        var prefix = location.protocol + "//" + location.host;
        if(capabilities.installed_app && capabilities.api_host) {
          prefix = capabilities.api_host;
        }
        window.open(prefix + '/lessons/' + lesson.id + '/' + lesson.lesson_code + '/' + this.appState.get('sessionUser.user_token'), '_blank');
      }
    },
    launch_rating: function() {
      var user = this.appState.get('sessionUser');
      if(user) {
        var progress = user.get('preferences.progress') || {};

        progress.rated = (new Date()).getTime();
        user.set('preferences.progress', progress);
        user.save().then(null, function() { });
      }
      capabilities.launch_rating();
    },
    modeling_ideas: function(user_name) {
      var users = [];
      if(!user_name) {
        if((this.appState.get('currentUser.supervisees') || []).length > 0) {
          (this.appState.get('currentUser.known_supervisees') || []).forEach(function(u) {
            if(emberGet(u, 'premium')) {
              users.push(u);
            }
          });
        } else {
          users.push(this.appState.get('currentUser'));
        }
      } else {
        (this.appState.get('currentUser.known_supervisees') || []).forEach(function(u) {
          if(u.user_name == user_name) {
            users.push(u);
          }
        });
      }
      if(users.length > 0) {
        modal.open('modals/modeling-ideas', {users: users});
      }
    },
    homeInSpeakMode: function(board_for_user_id, keep_as_self) {
      if(board_for_user_id) {
        this.appState.set_speak_mode_user(board_for_user_id, true, keep_as_self);
      } else if((this.appState.get('currentUser.permissions.delete') && (this.appState.get('currentUser.supervisees') || []).length > 0) || this.appState.get('currentUser.communicator_in_supporter_view')) {
        var prompt = i18n.t('speak_as_which_user', "Select User to Speak As");
        if(this.appState.get('currentUser.communicator_in_supporter_view')) {
          prompt = i18n.t('speak_as_which_mode', "Select Mode and User for Session");
        }
        this.appState.set('referenced_speak_mode_user', null);
        this.appState.get('controller').send('switch_communicators', {stay: true, modeling: 'ask', skip_me: false, header: prompt});
      } else {
        this.appState.home_in_speak_mode();
      }
    },
    manual_session: function() {
      LingoLinq.Log.manual_log(this.appState.get('currentUser.id'), !!this.appState.get('currentUser.external_device'))
    },
    home_board: function(key) {
      this.get('router').transitionTo('board', key);
    }
  }
});
