import Route from '@ember/routing/route';
import { later as runLater } from '@ember/runloop';
import RSVP from 'rsvp';
import Subscription from '../utils/subscription';
import stashes from '../utils/_stashes';
import app_state from '../utils/app_state';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import capabilities from '../utils/capabilities';
import CoughDrop from '../app';
import coughDropExtras from '../utils/extras';
import session from '../utils/session';
import i18n from '../utils/i18n';

export default Route.extend({
  model: function() {
    if(session.get('access_token')) {
      return CoughDrop.store.findRecord('user', 'self').then(function(user) {
        // notifications and logs should show up when you re-visit the dashboard
        if(!user.get('really_fresh') && persistence.get('online')) {
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
  setupController: function(controller, model) {
    controller.set('user', this.get('store').createRecord('user', {preferences: {}, referrer: CoughDrop.referrer, ad_referrer: CoughDrop.ad_referrer}));
    controller.set('user.watch_user_name_and_cookies', true);
    CoughDrop.sale = CoughDrop.sale || parseInt(window.sale, 10) || null;
    controller.set('subscription', Subscription.create());
    controller.set('model', model);
    // TODO: this seems messy. got to be a cleaner way...
    controller.set('extras', coughDropExtras);
    var jump_to_speak = !!((stashes.get('current_mode') == 'speak' && !document.referrer) || (model && model.get('currently_premium') && model.get('preferences.auto_open_speak_mode')));
    if(model && model.get('eval_ended')) { jump_to_speak = false; }
    if(model && model.get('id') && !model.get('terms_agree')) {
      modal.open('terms-agree');
    } else {
      if(stashes.get('current_mode') == 'edit') {
        stashes.persist('current_mode', 'default');
      } else if(jump_to_speak && model && model.get('id') && !model.get('supporter_role') && !app_state.get('already_homed') && model.get('preferences.home_board.key')) {
        var homey = function() {
          app_state.home_in_speak_mode({user: model});
          app_state.set('already_homed', true);
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
    var _this = this;

    app_state.clear_mode();
    if(!app_state.get('currentUser.preferences.home_board.id')) {
      this.store.query('board', {user_id: app_state.get('domain_board_user_name'), starred: true, public: true}).then(function(boards) {
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
    if(app_state.get('show_intro')) {
      modal.open('intro');
    }
  },
  actions: {
    homeInSpeakMode: function(board_for_user_id, keep_as_self) {
      if(board_for_user_id) {
        app_state.set_speak_mode_user(board_for_user_id, true, keep_as_self);
      } else if((app_state.get('currentUser.supervisees') || []).length > 0) {
        var prompt = i18n.t('speak_as_which_user', "Select User to Speak As");
        app_state.set('referenced_speak_mode_user', null);
        app_state.controller.send('switch_communicators', {stay: true, modeling: 'ask', skip_me: false, header: prompt});
      } else {
        app_state.home_in_speak_mode();
      }
    },
    home_board: function(key) {
      this.transitionTo('board', key);
    },
    saveProfile: function() {
      var controller = this.get('controller');
      var user = controller.get('user');
      controller.set('triedToSave', true);
      if(!user.get('terms_agree')) { return; }
      if(!persistence.get('online')) { return; }
      if(controller.get('badEmail') || controller.get('shortPassword') || controller.get('noName') || controller.get('noSpacesName')) {
        return;
      }
      controller.set('registering', {saving: true});
      var _this = this;
      user.save().then(function(user) {
        controller.set('registering', null);
        var meta = persistence.meta('user', null);
        controller.set('triedToSave', false);
        user.set('password', null);
        _this.transitionTo('index');
        if(meta && meta.access_token) {
          session.override(meta);
        }
      }, function(err) {
        controller.set('registering', {error: true});
        if(err.errors && err.errors[0] == 'blocked email address') {
          controller.set('registering', {error: {email_blocked: true}});
        }
      });
    }
  }
});
