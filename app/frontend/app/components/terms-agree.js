import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';

/**
 * Terms agree modal (Phase 2).
 * Converted from terms-agree controller/template.
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  router: service('router'),
  session: service('session'),
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
  },


  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    confirm() {
      const _this = this;
      const user = this.get('appState').get('currentUser');
      if (user) {
        user.set('terms_agree', true);
        user.save().then(function() {
          _this.get('modal').close();
          _this.get('appState').set('auto_setup', true);
          if (!user.get('preferences.progress.intro_watched')) {
            // Mark intro_watched and let the home page's Shepherd tour auto-open
            // (mirrors routes/register.js). The `home_tour`-off fallback to the
            // setup wizard was removed 2026-08-15 — setup is retired as a
            // user-facing destination. With the flag off the user just lands on
            // home and no tour opens, which is the intended degraded state.
            var preferences = user.get('preferences') || {};
            var progress = preferences.progress || {};
            user.set('preferences', preferences);
            user.set('preferences.progress', progress);
            user.set('preferences.progress.intro_watched', true);
            _this.get('appState').set('auto_open_home_tour', true);
            user.save().then(null, function() { });
          }
        }, function() {
          _this.set('agree_error', true);
        });
      } else {
        _this.get('modal').close();
      }
    }
  },

  didInsertElement() {
  this._super(...arguments);
  var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
},

});
