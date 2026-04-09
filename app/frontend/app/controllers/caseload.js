import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import i18n from '../utils/i18n';

export default Controller.extend({
  appState: service('app-state'),
  persistence: service('persistence'),
  router: service('router'),

  supervisees: computed('model.known_supervisees.[]', function() {
    return this.get('model.known_supervisees') || [];
  }),

  actions: {
    homeInSpeakMode: function(userId, asModeling) {
      var user = this.get('model');
      if (!user) { return; }
      var supervisees = user.get('known_supervisees') || [];
      var supervisee = null;
      supervisees.forEach(function(s) {
        if (s.id === userId) { supervisee = s; }
      });
      if (!supervisee || !supervisee.home_board_key) { return; }
      var app_state = this.get('appState');
      if (asModeling) {
        app_state.set('modeling_for_user', supervisee);
      } else {
        app_state.set('speak_as_user', supervisee);
      }
      this.get('router').transitionTo('board', supervisee.home_board_key);
    },

    stats: function(userName) {
      this.get('router').transitionTo('user.stats', userName);
    },

    modeling_ideas: function(userName) {
      this.get('router').transitionTo('user.goals', userName);
    },

    set_goal: function(supervisee) {
      modal.open('set-goal', { user_name: supervisee.user_name });
    },

    record_note: function(supervisee) {
      modal.open('record-note', { user: { user_name: supervisee.user_name, id: supervisee.id } });
    },

    quick_assessment: function(supervisee) {
      modal.open('quick-assessment', { user_name: supervisee.user_name });
    },

    run_eval: function(supervisee) {
      modal.open('run-eval', { user_name: supervisee.user_name });
    },

    intro: function(userId) {
      var user = this.get('model');
      var supervisees = user.get('known_supervisees') || [];
      var supervisee = null;
      supervisees.forEach(function(s) {
        if (s.id === userId) { supervisee = s; }
      });
      if (supervisee) {
        this.get('router').transitionTo('user', supervisee.user_name);
      }
    }
  }
});
