import Component from '@ember/component';
import { inject as service } from '@ember/service';
import EmberObject, { set as emberSet, get as emberGet, observer, computed } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import { htmlSafe } from '@ember/template';
import LingoLinq from '../../app';
import persistence from '../../utils/persistence';
import capabilities from '../../utils/capabilities';
import app_state from '../../utils/app_state';
import Badge from '../../models/badge';
import session from '../../utils/session';
import modal from '../../utils/modal';
import sync from '../../utils/sync';
import stashes from '../../utils/_stashes';
import i18n from '../../utils/i18n';

export default Component.extend({
  tagName: '',
  
  router: service(),
  store: service(),
  persistence: service('persistence'),

  init() {
    this._super(...arguments);
    // Initialize supervisees_with_badges to empty array
    this.set('supervisees_with_badges', []);
  },

  sync_able: computed('extras.ready', 'app_state.currentUser.external_device', function() {
    return this.get('extras.ready') && !app_state.get('currentUser.external_device');
  }),
  home_board_or_supporter: computed(
    'app_state.currentUser.preferences.home_board.key',
    'app_state.currentUser.supporter_view',
    function() {
        return this.get('app_state.currentUser.preferences.home_board.key') || this.get('app_state.currentUser.supporter_view');
    }
  ),
  needs_sync: computed('persistence.last_sync_at', function() {
    var now = (new Date()).getTime() / 1000;
    var persistenceService = this.persistence || window.persistence;
    if(!persistenceService || typeof persistenceService.get !== 'function') {
      return false;
    }
    var lastSync = persistenceService.get('last_sync_at') || 0;
    return (now - lastSync) > (7 * 24 * 60 * 60);
  }),
  blank_slate: computed(
    'app_state.currentUser.preferences.progress',
    'app_state.currentUser.using_for_a_while',
    function() {
      var progress = this.get('app_state.currentUser.preferences.progress');
      // TODO: eventually this should go away, maybe after a few weeks of active use or something
      if(progress && progress.setup_done) {
        return null;
      } else if(this.get('app_state.currentUser.using_for_a_while')) {
        return null;
      } else {
        return progress;
      }
    }
  ),
  no_intro: computed(
    'blank_slate',
    'app_state.currentUser.preferences.progress.intro_watched',
    function() {
      return this.get('blank_slate') && !this.get('app_state.currentUser.preferences.progress.intro_watched');
    }
  ),
  blank_slate_percent: computed('app_state.currentUser.preferences.progress', function() {
    var options = ['intro_watched', 'profile_edited', 'preferences_edited', 'home_board_set', 'app_added'];

    var total = options.length;
    if(total === 0) { return 0; }
    var done = 0;
    var progress = this.get('app_state.currentUser.preferences.progress') || {};
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
  checkForBlankSlate: observer('persistence.online', function() {
    var _this = this;
    if(this.get('isGenerated')) { return; } // Ember testing check equivalent?
    var persistenceService = this.persistence || window.persistence;
    if(!persistenceService || typeof persistenceService.find_recent !== 'function') {
      return;
    }
    persistenceService.find_recent('board').then(function(boards) {
      if(boards && boards.slice) {
        boards = boards.slice(0, 12);
      }
      _this.set('recentOfflineBoards', boards);
      if(_this.get('homeBoards') == [] && _this.get('popularBoards') == []) {
        _this.set('showOffline', true);
      } else {
        var persistenceForCheck = _this.persistence || window.persistence;
        if(!persistenceForCheck || typeof persistenceForCheck.get !== 'function' || !persistenceForCheck.get('online')) {
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
      added_somewhere: !!this.get('app_state.currentUser.preferences.progress.app_added'),
      standalone: capabilities.browserless,
      android: capabilities.system == "Android",
      ios: capabilities.system == "iOS"
    };

    res.needs_install_reminder = !res.added_somewhere || ((res.android || res.ios) && !res.standalone);
    if(res.standalone && (res.android || res.ios)) {
      res.needs_install_reminder = false;
    } else if(this.get('app_state.currentUser.using_for_a_while')) {
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
    var persistenceService = this.persistence || window.persistence;
    if(persistenceService && typeof persistenceService.get === 'function' && persistenceService.get('syncing')) {
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
    'app_state.currentUser.pending_org',
    'app_state.currentUser.pending_supervision_org',
    'app_state.currentUser.pending_board_shares',
    'app_state.currentUser.unread_messages',
    function() {
      var important = this.get('app_state.currentUser.pending_org') ||
                  this.get('app_state.currentUser.pending_supervision_org') ||
                  (this.get('app_state.currentUser.pending_board_shares') || []).length > 0 ||
                  this.get('app_state.currentUser.unread_messages');
      var normal_new = app_state.get('currentUser.unread_messages.length') || 0;
      var unread_notifications = (app_state.get('currentUser.parsed_notifications') || []).filter(function(n) { return n.unread; }).length;
      normal_new = normal_new + (unread_notifications || 0);

      if(normal_new && !app_state.get('currentUser.read_notifications')) {
        return {count: normal_new};
      } else if(important) {
        return true;
      } else {
        return null;
      }
    }
  ),
  update_selected: observer('selected', 'persistence.online', function() {
    var _this = this;
    var persistenceService = this.persistence || window.persistence;
    if(!persistenceService || typeof persistenceService.get !== 'function' || !persistenceService.get('online')) { return; }
    var last_browse = stashes.get('last_index_browse');
    var default_index = 2;
    // If a user already has a home board they're not going to care about popular boards,
    // they want to see something more useful like all the boards they own, or maybe
    // the home boards of all their supervisees, or maybe all their starred boards
    if(app_state.get('currentUser.preferences.home_board.key')) {
      if(app_state.get('currentUser.stats.user_boards') > 0) {
        default_index = 1;
      } else {
        default_index = 3;
      }
    }
    ['popular', 'personal', 'suggested', 'recent'].forEach(function(key, idx) {
      if(_this.get('selected') == key || (!_this.get('selected') && idx === default_index && !last_browse) || (!_this.get('selected') && last_browse == key)) {
        _this.set(key + '_selected', true);
        if(_this.get('selected')) {
          stashes.persist('last_index_browse', key);
        }
        if(key == 'recent') {
          persistence.find_recent('board').then(function(boards) {
            if(boards && boards.slice) {
              boards = boards.slice(0, 12);
            }
            _this.set('recentOfflineBoards', boards);
          });
        } else {
          var list = 'homeBoards';
          var locale = ((i18n.langs || {}).preferred || window.navigator.language || 'en').split(/-/)[0];
          if(app_state.get('currentUser.preferences.locale')) {
            locale = app_state.get('currentUser.preferences.locale').split(/-/)[0];
          }
          var opts = {public: true, starred: true, user_id: app_state.get('currentUser.id') || 'self', sort: 'custom_order', per_page: 20, preferred_locale: locale};
          if(key == 'personal') {
            list = 'personalBoards';
            opts = {user_id: 'self', root: true, per_page: 12};
          } else if(key == 'popular') {
            list = 'popularBoards';
            opts = {sort: 'home_popularity', per_page: 12, exclude_starred: app_state.get('currentUser.id') || 'self', locale: locale};
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
  allow_logs: computed('app_state.currentUser.preferences.logging', 'app_state.currentUser.modeling_only', 'app_state.currentUser.supporter_role', 'session.modeling_session', function() {
    return app_state.get('currentUser.preferences.logging') && !app_state.get('currentUser.supporter_role') && !app_state.get('currentUser.modeling_only') && !session.get('modeling_session');
  }),
  reload_logs: observer('model.id', 'persistence.online', function() {
    var model = this.get('model');
    var _this = this;
    // Skip if user_id is 'cache' or starts with 'cache:' (from boards cache endpoint)
    var model_id = model && model.get('id');
    var persistenceService = this.persistence || window.persistence;
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
    'app_state.sessionUser',
    'app_state.sessionUser.known_supervisees',
    'app_state.currentUser',
    'app_state.currentUser.known_supervisees',
    'app_state.currentUser.supervisees',
    'session.modeling_session',
    'current_user_badges',
    function() {
      var _this = this;
      var model = _this.get('model');
      var for_users = _this.get('current_user_badges') || {};
      if(model && for_users[model.get('id')]) {
        var b = _this.best_badge(for_users[model.get('id')], model.get('goal.id'));
        var eb = _this.earned_badge(for_users[model.get('id')]);
        if(!app_state.get('sessionUser.currently_premium') || app_state.get('sessionUser.supporter_role') || session.get('modeling_session')) {
          b = null;
        }
        // If no badge for the current user use the supervisee if there's only one
        var known_sups = app_state.get('currentUser.known_supervisees') || app_state.get('sessionUser.known_supervisees') || [];
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
      var supervisees_list = app_state.get('currentUser.known_supervisees') || app_state.get('sessionUser.known_supervisees') || [];
      // If known_supervisees is empty, try to get from supervisees array
      if(supervisees_list.length === 0) {
        var raw_supervisees = app_state.get('currentUser.supervisees') || app_state.get('sessionUser.supervisees') || [];
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
          persistence.find_url(sup.avatar_url, 'image').then(function(url) {
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
    'app_state.sessionUser.supporter_role',
    'app_state.sessionUser.currently_premium',
    function() {
      if(app_state.get('sessionUser.currently_premium')) {
        return true;
      } else if(app_state.get('sessionUser.supporter_role')) {
        var any_premium_supervisees = false;
        (app_state.get('sessionUser.known_supervisees') || []).forEach(function(sup) {
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
  many_supervisees: computed('app_state.currentUser.supervisees', function() {
    return (app_state.get('currentUser.supervisees') || []).length > 5;
  }),
  some_supervisees: computed('app_state.currentUser.supervisees', function() {
    return (app_state.get('currentUser.supervisees') || []).length > 3;
  }),
  has_supervisees: computed('app_state.currentUser.supervisees', 'app_state.currentUser.known_supervisees', function() {
    return (app_state.get('currentUser.supervisees') || []).length > 0 || (app_state.get('currentUser.known_supervisees') || []).length > 0;
  }),
  show_communicators_tab: computed('app_state.currentUser.supporter_role', 'app_state.currentUser.supervisees', 'app_state.currentUser.known_supervisees', function() {
    return app_state.get('currentUser.supporter_role') || (app_state.get('currentUser.supervisees') || []).length > 0 || (app_state.get('currentUser.known_supervisees') || []).length > 0;
  }),
  supervisors_count: computed('app_state.currentUser.supervisors', function() {
    return (app_state.get('currentUser.supervisors') || []).length;
  }),
  managed_orgs: computed('app_state.currentUser.organizations', function() {
    return (app_state.get('currentUser.organizations') || []).filter(function(o) { 
      return o.type == 'manager' && o.restricted != true; 
    });
  }),
  has_management_responsibility: computed('managed_orgs', function() {
    return (this.get('managed_orgs') || []).length > 0;
  }),
  manages_multiple_orgs: computed('managed_orgs', function() {
    return (this.get('managed_orgs') || []).length > 1;
  }),
  save_user_pref_change: observer('app_state.currentUser.preferences.auto_open_speak_mode', function() {
    var mode = app_state.get('currentUser.preferences.auto_open_speak_mode');
    if(mode !== undefined) {
      var last_mode = this.get('last_auto_open_speak_mode');
      if(last_mode !== undefined && mode !== null && last_mode != mode) {
        app_state.get('currentUser').save().then(null, function() { });
      }
      this.set('last_auto_open_speak_mode', mode);
    }
  }),
  index_nav: computed(
    'index_nav_state',
    'model.supporter_role',
    'app_state.currentUser.preference.device.last_index_nav',
    function() {
      var res = {};
      if(this.get('index_nav_state')) {
        res[this.get('index_nav_state')] = true;
      } else if(app_state.get('currentUser.preferences.device.last_index_nav')) {
        res[app_state.get('currentUser.preferences.device.last_index_nav')] = true;
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
  subscription_check: observer('app_state.sessionUser', 'app_state.logging_in', function() {
    if(this.get('app_state.sessionUser') && !this.get('app_state.installed_app')) {
      var progress = this.get('app_state.sessionUser.preferences.progress');
      var user = this.get('app_state.sessionUser');
      var needs_subscribe_modal = false;
      if(!progress || (!progress.skipped_subscribe_modal && !progress.setup_done)) {
        if(user.get('grace_period')) {
          if(modal.route) {
            needs_subscribe_modal = true;
          }
        }
      } else if(this.get('app_state.sessionUser.really_expired')) {
        needs_subscribe_modal = true;
      }
      if(needs_subscribe_modal && !app_state.get('logging_in')) {
        if(!this.get('app_state.installed_app')) {
          modal.open('subscribe');
        }
      }
    }
  }),
  rating_allowed: computed('app_state.sessionUser', function() {
    if(capabilities.installed_app && capabilities.mobile && capabilities.subsystem != 'Kindle') {
      var progress = app_state.get('sessionUser.preferences.progress') || {};
      if(progress.rated) {
        return false;
      }
      if(app_state.get('sessionUser.joined') && app_state.get('sessionUser.joined') < window.moment().add(-28, 'day')) {
        return (Math.round(app_state.get('sessionUser.joined').getTime() / 1000 / 60 / 60 / 24 / 7) % 4) == 0;
      }
    }
    return false;
  }),
  actions: {
    invalidateSession: function() {
      session.invalidate(true);
    },
    reload: function() {
      location.reload();
    },
    searchBoards: function() {
      this.get('router').transitionTo('search', 'any', encodeURIComponent('_'));
    },
    newBoard: function() {
      app_state.check_for_needing_purchase().then(function() {
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
        if(app_state.get('sessionUser.supporter_role') && (app_state.get('sessionUser.known_supervisees.length') > 0 || app_state.get('currentUser.managed_orgs.length') > 0)) {
          app_state.controller.send('switch_communicators', {header: i18n.t('select_user_to_review_lessons', "Select User to Review Trainings"), stay: true, route: 'user.lessons'})
          return;
        } else {
          user = app_state.get('currentUser');
        }
      }
      user = user || app_state.get('currentUser');
      this.get('router').transitionTo('user.lessons', emberGet(user, 'id'));
    },
    run_eval: function(user) {
      if(user == 'pick') {
        if(app_state.get('sessionUser.supporter_role') && (app_state.get('sessionUser.known_supervisees.length') > 0 || app_state.get('currentUser.managed_orgs.length') > 0)) {
          var prompt = i18n.t('select_user_for_eval', "Select User for Evaluation");
          app_state.controller.send('switch_communicators', {stay: true, modeling: false, skip_me: !app_state.get('currentUser.subscription.premium_supporter_plus_communicator'), header: prompt, eval: true});
          return;
        } else {
          user = app_state.get('currentUser');
        }
      }
      app_state.check_for_currently_premium(user, 'eval', false, true).then(function() {
        app_state.set_speak_mode_user(emberGet(user, 'id'), false, false, 'obf/eval');
      });
    },
    remote_model: function(user) {
      if(user.premium || emberGet(user, 'currently_premium')) {
        modal.open('modals/remote-model', {user_id: user.id});
      } else {
        modal.open('premium-required', {user_name: user.user_name, action: 'evaluation', reason: 'not_currently_premium'});
      }
    },
    getting_started: function() {
       modal.open('getting-started', {progress: app_state.get('currentUser.preferences.progress')});
    },
    record_note: function(user) {
      user = user || app_state.get('currentUser');
      if(!emberGet(user, 'avatar_url_with_fallback')) {
        emberSet(user, 'avatar_url_with_fallback', emberGet(user, 'avatar_url'));
      }
      app_state.check_for_needing_purchase().then(function() {
        modal.open('record-note', {note_type: 'text', user: user}).then(function() {
          runLater(function() {
            app_state.get('currentUser').reload().then(null, function() { });
          }, 5000);
        });  
      });
    },
    sync: function() {
      var persistenceService = this.persistence || window.persistence;
      if(!persistenceService || typeof persistenceService.get !== 'function' || persistenceService.get('syncing')) {
        return;
      }
      if(!persistenceService.get('syncing')) {
        console.debug('syncing because manually triggered');
        persistence.sync('self', true).then(null, function() { });
      } else {
        this.send('sync_details');
      }
    },
    load_reports: function() {
      var user = app_state.get('currentUser');
      this.get('router').transitionTo('user.stats', user.get('user_name'));
    },
    hide_login: function() {
      app_state.set('login_modal', false);
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
      if(nav == 'main' || nav == 'supervisees') {
        var u = app_state.get('currentUser');
        // Ensure preferences and preferences.device exist before setting nested value
        var preferences = u.get('preferences') || {};
        var device = preferences.device || {};
        u.set('preferences', preferences);
        u.set('preferences.device', device);
        u.set('preferences.device.last_index_nav', nav);
        u.save().then(null, function() { });
      } else if(nav == 'updates') {
        if(app_state.get('currentUser')) {
          app_state.set('currentUser.read_notifications', true);
          app_state.get('currentUser').save().then(null, function() { });
        }
      }
      this.set('index_nav_state', nav);
    },
    toggle_extras: function() {
      this.set('show_main_extras', !this.get('show_main_extras'));
    },
    expand_left_nav: function() {
      this.set('left_nav_expanded', !this.get('left_nav_expanded'));
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
      app_state.set('auto_setup', false);

      if(user_id) {
        this.get('router').transitionTo('setup', {queryParams: {user_id: user_id, page: null}});
      } else if(app_state.get('currentUser.permissions.delete') && (app_state.get('currentUser.supervisees') || []).length > 0) {
        var prompt = i18n.t('setup_which_user', "Select User to Run Setup");
        app_state.controller.send('switch_communicators', {stay: true, modeling: false, setup: true, skip_me: false, header: prompt});
      } else {
        this.get('router').transitionTo('setup', {queryParams: {user_id: null, page: null}});
      }
    },
    opening_index: function() {
      app_state.set('index_view', true);
    },
    closing_index: function() {
      app_state.set('index_view', false);
    },
    manage_supervisors: function() {
      modal.open('supervision-settings', {user: app_state.get('currentUser')});
    },
    session_select: function() {
      if(!app_state.get('currentUser.preferences.logging')) {
        this.send('load_reports');
      } else {
        this.send('set_index_nav', 'updates');
      }
    },
    sync_details: function() {
      var persistenceService = this.persistence || window.persistence;
      if(!persistenceService || typeof persistenceService.get !== 'function') {
        modal.open('sync-details', {details: []});
        return;
      }
      var list = ([].concat(persistenceService.get('sync_log') || [])).reverse();
      modal.open('sync-details', {details: list});
    },
    stats: function(user_name) {
      if(!user_name) {
        if((app_state.get('currentUser.supervisees') || []).length > 0) {
          var prompt = i18n.t('select_user_for_reports', "Select User for Reports");
          app_state.controller.send('switch_communicators', {stay: true, modeling: true, skip_me: !app_state.get('currentUser.subscription.premium_supporter_plus_communicator'), route: 'user.stats', header: prompt});
          return;
        } else {
          user_name = app_state.get('currentUser.user_name');
        }
      }
      this.get('router').transitionTo('user.stats', user_name, {queryParams: {start: null, end: null, device_id: null, location_id: null, split: null, start2: null, end2: null, devicde_id2: null, location_id2: null}});
    },
    goals: function() {
      if(app_state.get('sessionUser.supporter_role') && (app_state.get('sessionUser.known_supervisees.length') > 0 || app_state.get('currentUser.managed_orgs.length') > 0)) {
        var prompt = i18n.t('select_user_for_goals', "Select User for Goals");
        app_state.controller.send('switch_communicators', {stay: true, modeling: true, skip_me: !app_state.get('currentUser.subscription.premium_supporter_plus_communicator'), route: 'user.goals', header: prompt});
        return;
      } else {
        var user_name = app_state.get('currentUser.user_name');
        this.get('router').transitionTo('user.stats', user_name, {queryParams: {start: null, end: null, device_id: null, location_id: null, split: null, start2: null, end2: null, devicde_id2: null, location_id2: null}});
      }
    },
    new_dashboard: function() {
      var user = app_state.get('currentUser');
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
            (app_state.get('currentUser.known_supervisees') || []).forEach(function(sup) {
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
      modal.open('modals/eval-status', {action: action, user: app_state.get('sessionUser')});
    },
    next_lesson: function() {
      var lesson = app_state.get('sessionUser.first_incomplete_lesson');
      if(lesson) {
        var prefix = location.protocol + "//" + location.host;
        if(capabilities.installed_app && capabilities.api_host) {
          prefix = capabilities.api_host;
        }
        window.open(prefix + '/lessons/' + lesson.id + '/' + lesson.lesson_code + '/' + app_state.get('sessionUser.user_token'), '_blank');
      }
    },
    launch_rating: function() {
      var user = app_state.get('sessionUser');
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
        if((app_state.get('currentUser.supervisees') || []).length > 0) {
          (app_state.get('currentUser.known_supervisees') || []).forEach(function(u) {
            if(emberGet(u, 'premium')) {
              users.push(u);
            }
          });
        } else {
          users.push(app_state.get('currentUser'));
        }
      } else {
        (app_state.get('currentUser.known_supervisees') || []).forEach(function(u) {
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
        app_state.set_speak_mode_user(board_for_user_id, true, keep_as_self);
      } else if((app_state.get('currentUser.permissions.delete') && (app_state.get('currentUser.supervisees') || []).length > 0) || app_state.get('currentUser.communicator_in_supporter_view')) {
        var prompt = i18n.t('speak_as_which_user', "Select User to Speak As");
        if(app_state.get('currentUser.communicator_in_supporter_view')) {
          prompt = i18n.t('speak_as_which_mode', "Select Mode and User for Session");
        }
        app_state.set('referenced_speak_mode_user', null);
        app_state.controller.send('switch_communicators', {stay: true, modeling: 'ask', skip_me: false, header: prompt});
      } else {
        app_state.home_in_speak_mode();
      }
    },
    manual_session: function() {
      LingoLinq.Log.manual_log(app_state.get('currentUser.id'), !!app_state.get('currentUser.external_device'))
    },
    home_board: function(key) {
      this.get('router').transitionTo('board', key);
    }
  }
});
