import Component from '@ember/component';
import { inject as service } from '@ember/service';
import app_state from '../utils/app_state';
import modal from '../utils/modal';

/**
 * Modeling Intro modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  didInsertElement() {
    this._super(...arguments);
    const user = app_state.get('currentUser');
    if (user) {
      const progress = user.get('preferences.progress') || {};
      progress.modeling_intro_done = (new Date()).getTime();
      app_state.set('modeling-intro', true);
      user.set('preferences.progress', progress);
      user.save().then(null, function() {});
    }
  },

  willDestroyElement() {
    const user = app_state.get('currentUser');
    if (user && !user.get('preferences.progress.modeling_intro_done')) {
      const progress = user.get('preferences.progress') || {};
      progress.modeling_intro_done = (new Date()).getTime();
      user.set('preferences.progress', progress);
      user.save().then(null, function() {});
    }
    this._super(...arguments);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {
      const user = app_state.get('currentUser');
      if (user && !user.get('preferences.progress.modeling_intro_done')) {
        const progress = user.get('preferences.progress') || {};
        progress.modeling_intro_done = (new Date()).getTime();
        user.set('preferences.progress', progress);
        user.save().then(null, function() {});
      }
    }
  }
});
