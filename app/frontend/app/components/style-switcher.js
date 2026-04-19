import Component from '@ember/component';
import { inject as service } from '@ember/service';

export default Component.extend({
  tagName: 'div',
  classNames: ['la-style-switcher'],
  router: service('router'),
  appState: service('app-state'),

  menu_open: false,

  actions: {
    toggleMenu: function() {
      this.toggleProperty('menu_open');
    },
    goToNewStyle: function() {
      this.set('menu_open', false);
      var key = this.get('appState.currentBoardState.key');
      if(key && key.indexOf('/') !== -1) {
        var parts = key.split('/');
        this.get('router').transitionTo('user.board-detail', parts[0], parts.slice(1).join('/'));
      }
    }
  }
});
