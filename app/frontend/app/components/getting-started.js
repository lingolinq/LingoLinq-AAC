import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';

/**
 * Getting Started modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  router: service('router'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'getting-started';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  intro_status_class: computed('model.progress.intro_watched', function() {
    let res = 'glyphicon ';
    if (this.get('model.progress.intro_watched')) {
      res = res + 'glyphicon-ok ';
    } else {
      res = res + 'glyphicon-book ';
    }
    return res;
  }),
  home_status_class: computed('model.progress.home_board_set', function() {
    let res = 'glyphicon ';
    if (this.get('model.progress.home_board_set')) {
      res = res + 'glyphicon-ok ';
    } else {
      res = res + 'glyphicon-home ';
    }
    return res;
  }),
  app_status_class: computed('model.progress.app_added', function() {
    let res = 'glyphicon ';
    if (this.get('model.progress.app_added')) {
      res = res + 'glyphicon-ok ';
    } else {
      res = res + 'glyphicon-phone ';
    }
    return res;
  }),
  preferences_status_class: computed('model.progress.preferences_edited', function() {
    let res = 'glyphicon ';
    if (this.get('model.progress.preferences_edited')) {
      res = res + 'glyphicon-ok ';
    } else {
      res = res + 'glyphicon-cog ';
    }
    return res;
  }),
  profile_status_class: computed('model.progress.profile_edited', function() {
    let res = 'glyphicon ';
    if (this.get('model.progress.profile_edited')) {
      res = res + 'glyphicon-ok ';
    } else {
      res = res + 'glyphicon-user ';
    }
    return res;
  }),
  subscription_status_class: computed('model.progress.subscription_set', function() {
    let res = 'glyphicon ';
    if (this.get('model.progress.subscription_set')) {
      res = res + 'glyphicon-ok ';
    } else {
      res = res + 'glyphicon-usd ';
    }
    return res;
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    intro() {
      if (window.ga) {
        window.ga('send', 'event', 'Setup', 'launch', 'Setup started');
      }
      this.get('appState').set('auto_setup', false);
      this.get('router').transitionTo('setup', { queryParams: { user_id: null } });
      this.get('modal').close();
    },
    app_install() {
      modal.open('add-app');
    },
    setup_done() {
      const user = this.get('appState').get('currentUser');
      user.set('preferences.progress.setup_done', true);
      user.save().then(null, function() {});
      this.get('modal').close();
    }
  }
});
