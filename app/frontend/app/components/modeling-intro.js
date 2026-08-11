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

  // init(), NOT didInsertElement(): the template binds these bare
  // (`{{on "click" this.onClose}}`, `@opening={{this.onOpening}}`) and the
  // modifier installs during render, before didInsertElement runs. Assigning
  // them there left the modifier binding `undefined` and the X button dead.
  init() {
    this._super(...arguments);
    var self = this;
    this.onClose = function() {
      self.send('close');
    };
    this.onOpening = function() {
      self.send('opening');
    };
    this.onClosing = function() {
      self.send('closing');
    };
  },

  // Stays in didInsertElement — this marks the intro as seen, which should
  // happen when the modal actually appears, not when the component is built.
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
