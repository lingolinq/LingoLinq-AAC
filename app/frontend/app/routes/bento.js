import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import RSVP from 'rsvp';
import Subscription from '../utils/subscription';
import modal from '../utils/modal';
import LingoLinq from '../app';
import session from '../utils/session';
import { onlyIfGenuinelyResolved, maybeShowSessionEntryGate } from '../utils/article50_gate';

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

    // EU AI Act Art.50 session-entry gate (03-UI-SPEC 7.1, applied identically
    // to routes/index.js): tracks whether a terms_agree-missing sub-branch
    // below has already claimed responsibility for the Art.50 check this
    // render, so the shared tail doesn't also check. bento.js has no
    // auto-speak-launch fork (confirmed by grep, see 03-05-SUMMARY), so there
    // is no auto-launch branch to protect here.
    var art50_checked_inline = false;

    if (model && model.get('id') && model.get('user_name') && !model.get('terms_agree')) {
      if (!model.get('really_fresh') && _this && _this.persistence && typeof _this.persistence.get === 'function' && _this.persistence.get('online')) {
        art50_checked_inline = true;
        model.reload().then(function() {
          if (model.get('id') && model.get('user_name') && !model.get('terms_agree')) {
            // A resolved .then() here is not the same thing as "the user
            // acknowledged" -- modal.open() resolves a bumped modal's promise
            // with {replaced: true}. onlyIfGenuinelyResolved rejects that.
            modal.open('terms-agree', { scannable: true }).then(function(result) {
              onlyIfGenuinelyResolved(result, model);
            });
          } else {
            // Reload cleared terms_agree -- this call isn't chained off any
            // other modal's promise, so it needs no {replaced: true} guard.
            maybeShowSessionEntryGate(model);
          }
        }, function() {
          // Reload failed -- can't verify, don't show either modal this pass.
          // art50_checked_inline stays true so the tail skips its own check.
        });
      } else if (model.get('really_fresh')) {
        art50_checked_inline = true;
        modal.open('terms-agree', { scannable: true }).then(function(result) {
          onlyIfGenuinelyResolved(result, model);
        });
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
    // Skip intro when the terms-agree branch already claimed this render
    // (LL-53cb93fab1). Opening both in the same run loop replaces terms-agree
    // before it mounts. show_intro stays set for a later visit.
    if (_this.appState.get('show_intro') && !art50_checked_inline) {
      modal.open('intro');
    }
    // EU AI Act Art.50 session-entry opportunity (03-UI-SPEC 7.1): only check
    // here if none of the terms_agree-missing sub-branches above already
    // claimed it. Deliberately placed AFTER modal.open('intro') above -- a
    // compliance-load-bearing BLOCK modal beats a discretionary onboarding
    // tour if both would fire in the same render.
    if (!art50_checked_inline) {
      maybeShowSessionEntryGate(model);
    }
  }
});
