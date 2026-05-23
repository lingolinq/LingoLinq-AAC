import Route from '@ember/routing/route';
import { later as runLater } from '@ember/runloop';
import { inject as service } from '@ember/service';
import RSVP from 'rsvp';
import Subscription from '../utils/subscription';
import modal from '../utils/modal';
import capabilities from '../utils/capabilities';
import LingoLinq from '../app';
import session from '../utils/session';
import i18n from '../utils/i18n';
import progress_tracker from '../utils/progress_tracker';

export default Route.extend({
  router: service('router'),
  store: service('store'),
  stashes: service('stashes'),
  appState: service('app-state'),
  persistence: service('persistence'),
  beforeModel: function(transition) {
    var from = transition && transition.from;
    var from_name = (from && from.name) || '';
    // Auto-launch into speak mode ONLY on a genuine login / app-boot
    // entry into the dashboard:
    //   - cold boot / full-page reload after auth -> no `transition.from`
    //   - SPA login flow (login route -> index)    -> from a `login*` route
    // ANY other navigation into index / user.home (notably Exit Speak
    // Mode from board-detail's `exit_to_home` -> index, or board-alt's
    // EXIT BOARDS -> return_to_index -> user.home) must NOT re-enter
    // speak mode. Stored on appState because user.home extends this
    // route (inherits setupController, which has no transition arg) and
    // index.afterModel may replaceWith('user.home') — the origin
    // `transition.from` is preserved across that chain, so a recompute
    // there still resolves to "not login".
    var login_entry = !from || /^login(\.|$)/.test(from_name);
    this.appState.set('_index_login_entry', login_entry);
    return this._super.apply(this, arguments);
  },
  model: function() {
    var _this = this;
    if(session.get('access_token')) {
      return LingoLinq.store.findRecord('user', 'self').then(function(user) {
        // notifications and logs should show up when you re-visit the dashboard
        if(!user.get('really_fresh') && _this && _this.persistence && typeof _this.persistence.get === 'function' && _this.persistence.get('online')) {
          user.reload();
        }
        return RSVP.resolve(user);
      }, function() {
        return RSVP.resolve(null);
      });
    } else {
      return RSVP.resolve(null);
    }
  },
  afterModel: function(model) {
    if (model && model.get('user_name') && session.get('access_token')) {
      var home_board_key = model.get('preferences.home_board.key');
      // Direct users straight to their home board on login/app-boot —
      // the `progress.setup_done` gate was tied to the Getting Started
      // onboarding flow (now disabled / under evaluation for re-add),
      // and held users on the dashboard until that flow was complete.
      // With onboarding off, any user who has a home_board_key should
      // skip the dashboard and land in speak mode on their board.
      // Other gates kept: `_index_login_entry` so in-app returns to
      // index (e.g. Exit Speak Mode) don't bounce back into speak,
      // and supporter_view / eval_ended which need the dashboard.
      // Users without a home_board_key still fall through to the
      // dashboard below — there's no board to send them to yet.
      if (this.appState.get('_index_login_entry') && home_board_key && !model.get('supporter_view') && !model.get('eval_ended')) {
        this.appState.home_in_speak_mode({user: model});
        this.appState.set('already_homed', true);
        return;
      }
      this.router.replaceWith('user.home', model.get('user_name'));
    }
  },
  setupController: function(controller, model) {
    var _this = this;

    controller.set('user', this.store.createRecord('user', {preferences: {}, referrer: LingoLinq.referrer, ad_referrer: LingoLinq.ad_referrer}));
    controller.set('user.watch_user_name_and_cookies', true);
    LingoLinq.sale = LingoLinq.sale || parseInt(window.sale, 10) || null;
    controller.set('subscription', Subscription.create());
    controller.set('model', model);
    // Note: 'extras' is already injected via dependency injection, no need to set it again
    // Gated on `_index_login_entry` (see beforeModel): auto-speak only on
    // a login / app-boot entry. Inherited by user.home, so board-alt's
    // EXIT BOARDS (-> user.home) also lands on the dashboard, not speak.
    var jump_to_speak = !!(_this.appState.get('_index_login_entry') && ((_this.stashes.get('current_mode') == 'speak' && !document.referrer) || (model && model.get('currently_premium') && model.get('preferences.auto_open_speak_mode'))));

    var progress = _this.appState.get('sessionUser.preferences.progress') || {};
    if(!progress || (!progress.skipped_subscribe_modal && !progress.setup_done)) {
      if(_this.appState.get('sessionUser.grace_period')) {
        if(modal.route) {
          jump_to_speak = false;
        }
      }
    } else if(_this.appState.get('sessionUser.really_expired')) {
      jump_to_speak = false;
    }

    if(model && model.get('eval_ended')) { jump_to_speak = false; }
    // Only check terms_agree if user data is fresh (from server), not from stale local storage
    // This prevents showing the modal when data is incomplete due to API errors (like 401)
    if(model && model.get('id') && model.get('user_name') && !model.get('terms_agree')) {
      // If data is not fresh, try to reload first before showing modal
      if(!model.get('really_fresh') && _this && _this.persistence && typeof _this.persistence.get === 'function' && _this.persistence.get('online')) {
        model.reload().then(function() {
          // After successful reload, check again if terms_agree is still missing
          if(model.get('id') && model.get('user_name') && !model.get('terms_agree')) {
            modal.open('terms-agree');
          }
        }, function(err) {
          // If reload fails (e.g., 401 error), don't show modal
          // We can't be sure the data is complete, so don't assume terms_agree is missing
          // The modal will show on next successful load if terms_agree is actually false
        });
      } else if(model.get('really_fresh')) {
        // Data is fresh from server, safe to check terms_agree
        modal.open('terms-agree');
      }
      // If data is not fresh and we're offline, don't show modal (can't verify)
    } else {
      if(_this.stashes.get('current_mode') == 'edit') {
        _this.stashes.persist('current_mode', 'default');
      } else if(jump_to_speak && model && model.get('id') && !model.get('supporter_view') && !_this.appState.get('already_homed') && model.get('preferences.home_board.key')) {
        var homey = function() {
          _this.appState.home_in_speak_mode({user: model});
          _this.appState.set('already_homed', true);
        };
        // for some reason, iOS doesn't like being auto-launched into speak mode too quickly..
        // android installed app is taking like 5 times as long to load with auto-speak, maybe this will help there too?
        var always_wait = true;
        if(capabilities.system == 'iOS' || always_wait) {
          runLater(homey);
        } else {
          homey();
        }
        return;
      }
    }

    _this.appState.clear_mode();
    // Only query starting_boards when authenticated - user_id=self requires a token
    if(session.get('isAuthenticated') && !_this.appState.get('currentUser.preferences.home_board.id')) {
      this.store.query('board', {user_id: 'self', starred: true, public: true}).then(function(boards) {
        controller.set('starting_boards', boards);
      }, function() { });
    }
    if(!session.get('isAuthenticated')) {
      controller.set('homeBoards', {loading: true});
      controller.store.query('board', {sort: 'home_popularity', per_page: 9}).then(function(data) {
        controller.set('homeBoards', data);
        controller.checkForBlankSlate();
      }, function() {
        controller.set('homeBoards', {error: true});
        controller.checkForBlankSlate();
      });

      controller.set('popularBoards', {loading: true});
      controller.store.query('board', {sort: 'popularity', per_page: 9}).then(function(data) {
        controller.set('popularBoards', data);
        controller.checkForBlankSlate();
      }, function() {
        controller.set('popularBoards', {error: true});
        controller.checkForBlankSlate();
      });
    }
    controller.update_selected();
    controller.checkForBlankSlate();
    controller.subscription_check();
    controller.update_current_badges();
    if(_this.appState.get('show_intro')) {
      modal.open('intro');
    }
  },
  actions: {
    homeInSpeakMode: function(board_for_user_id, keep_as_self) {
      if(board_for_user_id) {
        this.appState.set_speak_mode_user(board_for_user_id, true, keep_as_self);
      } else if((this.appState.get('currentUser.permissions.delete') && (this.appState.get('currentUser.supervisees') || []).length > 0) || this.appState.get('currentUser.communicator_in_supporter_view')) {
        var prompt = i18n.t('speak_as_which_user', "Select User to Speak As");
        if(this.appState.get('currentUser.communicator_in_supporter_view')) {
          prompt = i18n.t('speak_as_which_mode', "Select Mode and User for Session");
        }
        this.appState.set('referenced_speak_mode_user', null);
        this.appState.controller.send('switch_communicators', {stay: true, modeling: 'ask', skip_me: false, header: prompt});
      } else {
        this.appState.home_in_speak_mode();
      }
    },
    manual_session: function() {
      LingoLinq.Log.manual_log(this.appState.get('currentUser.id'), !!this.appState.get('currentUser.external_device'))
    },
    home_board: function(key) {
      var parts = key ? key.split('/') : [];
      if(parts.length === 2) {
        this.router.transitionTo('user.board-detail', parts[0], parts[1]);
      } else {
        this.router.transitionTo('board', key);
      }
    },
    saveProfile: function() {
      var controller = this.get('controller');
      var user = controller.get('user');
      var _this = this;
      controller.set('triedToSave', true);
      if(!user.get('terms_agree')) { return; }
      var p = (_this && _this.persistence) || (typeof window !== 'undefined' && window.persistence);
      if(!p || typeof p.get !== 'function' || !p.get('online')) { return; }
      if(controller.get('badEmail') || controller.get('shortPassword') || controller.get('noName') || controller.get('noSpacesName')) {
        return;
      }
      controller.set('registering', {saving: true});
      user.save().then(function(user) {
        controller.set('start_code', null);
        var meta = p && typeof p.meta === 'function' ? p.meta('user', null) : null;
        controller.set('triedToSave', false);
        user.set('password', null);
        var save_done = function() {
          controller.set('registering', null);
          _this.appState.return_to_index();
          if(meta && meta.access_token) {
            session.override(meta);
          }
        };
        if(user.get('start_progress')) {
          controller.set('registering', {saving: true, initializing: true})

          progress_tracker.track(user.get('start_progress'), function(event) {
            if(event.status == 'errored' || (event.status == 'finished' && event.result && event.result.translated === false)) {
              controller.set('registering', {error: {progress: true}});
            } else if(event.status == 'finished') {
              save_done();
            }
          });
        } else {
          save_done();
        }
      }, function(err) {
        controller.set('registering', {error: true});
        if(err.errors && err.errors[0] == 'blocked email address') {
          controller.set('registering', {error: {email_blocked: true}});
        } else if(err.errors && err.errors[0] && err.errors[0].start_code_error) {
          controller.set('registering', {error: {start_code: true}});
        }
      });
    }
  }
});
