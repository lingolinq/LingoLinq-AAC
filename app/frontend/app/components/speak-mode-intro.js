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
  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
  },

  _markIntroDone() {
    const user = this.get('appState').get('currentUser');
    if (!user) { return; }
    const progress = user.get('preferences.progress') || {};
    if (progress.speak_mode_intro_done) {
      this.get('appState').set('speak-mode-intro', true);
      return;
    }
    progress.speak_mode_intro_done = (new Date()).getTime();
    this.get('appState').set('speak-mode-intro', true);
    user.set('preferences.progress', progress);
    user.save().then(null, function() {});
  },

  didInsertElement() {
    this._super(...arguments);
    // Mark seen as soon as the modal mounts — modal-dialog's opening callback
    // can run before these handlers are bound (child didRender vs parent
    // didInsertElement). Same pattern as modeling-intro.js.
    this._markIntroDone();
  },

  actions: {
    close() {
      this._markIntroDone();
      this.get('modal').close();
    },
    opening() {
      this._markIntroDone();
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
  },

});
