import Component from '@ember/component';
import { inject as service } from '@ember/service';

export default Component.extend({
  tagName: 'div',
  classNames: ['la-style-switcher'],
  router: service('router'),
  appState: service('app-state'),

  menu_open: false,

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
  },

  actions: {
    toggleMenu: function() {
      this.toggleProperty('menu_open');
    },
    goToNewStyle: function() {
      this.set('menu_open', false);
      var key = this.get('appState.currentBoardState.key');
      if(key && key.indexOf('/') !== -1) {
        var parts = key.split('/');
        // Debounced "Preparing your Board" mask for the style-switch load (shown
        // only if it's slow), matching the go_to_modern/go_to_classic paths.
        this.get('appState').arm_board_load_overlay(this.get('router'));
        this.get('router').transitionTo('user.board-detail', parts[0], parts.slice(1).join('/'));
      }
    }
  }
});
