import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import RSVP from 'rsvp';
import Subscription from '../utils/subscription';
import modal from '../utils/modal';
import LingoLinq from '../app';
import session from '../utils/session';

export default Route.extend({
  router: service('router'),
  store: service('store'),
  stashes: service('stashes'),
  appState: service('app-state'),
  persistence: service('persistence'),

  beforeModel() {
    if (!session.get('access_token')) {
      this.router.transitionTo('index');
    }
  },

  model: function() {
    var _this = this;
    if (session.get('access_token')) {
      return LingoLinq.store.findRecord('user', 'self').then(function(user) {
        if (!user.get('really_fresh') && _this && _this.persistence && typeof _this.persistence.get === 'function' && _this.persistence.get('online')) {
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
    var _this = this;

    controller.set('user', this.store.createRecord('user', { preferences: {}, referrer: LingoLinq.referrer, ad_referrer: LingoLinq.ad_referrer }));
    controller.set('user.watch_user_name_and_cookies', true);
    LingoLinq.sale = LingoLinq.sale || parseInt(window.sale, 10) || null;
    controller.set('subscription', Subscription.create());
    controller.set('model', model);

    if (model && model.get('id') && model.get('user_name') && !model.get('terms_agree')) {
      if (!model.get('really_fresh') && _this && _this.persistence && typeof _this.persistence.get === 'function' && _this.persistence.get('online')) {
        model.reload().then(function() {
          if (model.get('id') && model.get('user_name') && !model.get('terms_agree')) {
            modal.open('terms-agree');
          }
        }, function() {});
      } else if (model.get('really_fresh')) {
        modal.open('terms-agree');
      }
    } else {
      if (_this.stashes.get('current_mode') === 'edit') {
        _this.stashes.persist('current_mode', 'default');
      }
    }

    _this.appState.clear_mode();

    if (session.get('isAuthenticated') && !_this.appState.get('currentUser.preferences.home_board.id')) {
      this.store.query('board', { user_id: 'self', starred: true, public: true }).then(function(boards) {
        controller.set('starting_boards', boards);
      }, function() {});
    }
    if (!session.get('isAuthenticated')) {
      controller.set('homeBoards', { loading: true });
      controller.store.query('board', { sort: 'home_popularity', per_page: 9 }).then(function(data) {
        controller.set('homeBoards', data);
        controller.checkForBlankSlate();
      }, function() {
        controller.set('homeBoards', { error: true });
        controller.checkForBlankSlate();
      });

      controller.set('popularBoards', { loading: true });
      controller.store.query('board', { sort: 'popularity', per_page: 9 }).then(function(data) {
        controller.set('popularBoards', data);
        controller.checkForBlankSlate();
      }, function() {
        controller.set('popularBoards', { error: true });
        controller.checkForBlankSlate();
      });
    }
    if (controller.update_selected) {
      controller.update_selected();
    }
    if (controller.checkForBlankSlate) {
      controller.checkForBlankSlate();
    }
    if (controller.subscription_check) {
      controller.subscription_check();
    }
    if (controller.update_current_badges) {
      controller.update_current_badges();
    }
    if (_this.appState.get('show_intro')) {
      modal.open('intro');
    }
  }
});
