import app_state from '../utils/app_state';
import modal from '../utils/modal';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  appState: service('app-state'),
  modal: service(),

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
    intro: function() {
      if(window.ga) {
        window.ga('send', 'event', 'Setup', 'launch', 'Setup started');
      }
      this.appState.set('auto_setup', false);
      this.transitionToRoute('setup', {queryParams: {user_id: null}});
      this.modal.close();
    },
    app_install: function() {
      this.modal.open('add-app');
    },
    setup_done: function() {
      var user = this.appState.get('currentUser');
      user.set('preferences.progress.setup_done', true);
      user.save().then(null, function() { });
      this.modal.close();
    }
  }
});
