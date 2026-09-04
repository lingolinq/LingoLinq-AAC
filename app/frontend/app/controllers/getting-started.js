import modal from '../utils/modal';
import app_state from '../utils/app_state';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  router: service('router'),
  intro_status_class: computed('model.progress.intro_watched', function() {
    var res = "glyphicon ";
    if(this.get('model.progress.intro_watched')) {
      res = res + "glyphicon-ok ";
    } else {
      res = res + "glyphicon-book ";
    }
    return res;
  }),
  home_status_class: computed('model.progress.home_board_set', function() {
    var res = "glyphicon ";
    if(this.get('model.progress.home_board_set')) {
      res = res + "glyphicon-ok ";
    } else {
      res = res + "glyphicon-home ";
    }
    return res;
  }),
  app_status_class: computed('model.progress.app_added', function() {
    var res = "glyphicon ";
    if(this.get('model.progress.app_added')) {
      res = res + "glyphicon-ok ";
    } else {
      res = res + "glyphicon-phone ";
    }
    return res;
  }),
  preferences_status_class: computed('model.progress.preferences_edited', function() {
    var res = "glyphicon ";
    if(this.get('model.progress.preferences_edited')) {
      res = res + "glyphicon-ok ";
    } else {
      res = res + "glyphicon-cog ";
    }
    return res;
  }),
  profile_status_class: computed('model.progress.profile_edited', function() {
    var res = "glyphicon ";
    if(this.get('model.progress.profile_edited')) {
      res = res + "glyphicon-ok ";
    } else {
      res = res + "glyphicon-user ";
    }
    return res;
  }),
  subscription_status_class: computed('model.progress.subscription_set', function() {
    var res = "glyphicon ";
    if(this.get('model.progress.subscription_set')) {
      res = res + "glyphicon-ok ";
    } else {
      res = res + "glyphicon-usd ";
    }
    return res;
  }),
  actions: {
    // Onboarding for the CURRENT user now means the home page's guided tour, not
    // the setup wizard, which is retired and route-guarded (routes/setup.js).
    intro: function() {
      if(window.ga) {
        window.ga('send', 'event', 'Onboarding', 'launch', 'Home tour started');
      }
      app_state.set('auto_open_home_tour', true);
      app_state.return_to_index();
      modal.close();
    },
    app_install: function() {
      modal.open('add-app');
    },
    setup_done: function() {
      var user = app_state.get('currentUser');
      user.set('preferences.progress.setup_done', true);
      user.save().then(null, function() { });
      modal.close();
    }
  }
});
