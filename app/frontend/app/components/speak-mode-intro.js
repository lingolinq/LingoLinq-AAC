import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';

/**
 * Speak Mode Intro modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  tagName: '',

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      const user = this.get('appState').get('currentUser');
      if (user) {
        const progress = user.get('preferences.progress') || {};
        progress.speak_mode_intro_done = (new Date()).getTime();
        this.get('appState').set('speak-mode-intro', true);
        user.set('preferences.progress', progress);
        user.save().then(null, function() {});
      }
    },
    closing() {
      const user = this.get('appState').get('currentUser');
      if (user && !user.get('preferences.progress.speak_mode_intro_done')) {
        const progress = user.get('preferences.progress') || {};
        progress.modeling_intro_done = (new Date()).getTime();
        user.set('preferences', user.get('preferences') || {});
        user.set('preferences.progress', progress);
        user.save().then(null, function() {});
      }
    }
  }
});
