import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { set } from '@ember/object';
import modal from '../utils/modal';

export default Controller.extend({
  router: service(),
  appState: service('app-state'),

  activeTab: 'home',
  isSearchOpen: false,

  openSearch() {
    set(this, 'isSearchOpen', true);
  },

  closeSearch() {
    set(this, 'isSearchOpen', false);
  },

  onSearchKeydown(event) {
    if (event && event.key === 'Escape') {
      set(this, 'isSearchOpen', false);
    }
  },

  goHelp() {
    modal.open('support');
  },

  openAccount() {
    var user = this.appState.get('currentUser.user_name');
    if (user) {
      this.router.transitionTo('user', user);
    }
  },

  goTab(tab) {
    set(this, 'activeTab', tab);
    if (tab === 'boards') {
      this.router.transitionTo('index');
    } else if (tab === 'supervisors') {
      this.router.transitionTo('index');
    } else if (tab === 'reports') {
      var u = this.appState.get('currentUser.user_name');
      if (u) { this.router.transitionTo('user.stats', u); }
    }
  },

  go(dest) {
    if (dest === 'speak') {
      this.router.transitionTo('index');
    } else if (dest === 'boards') {
      this.router.transitionTo('index');
    } else if (dest === 'supervisors') {
      this.router.transitionTo('index');
    } else if (dest === 'reports') {
      var u = this.appState.get('currentUser.user_name');
      if (u) { this.router.transitionTo('user.stats', u); }
    } else if (dest === 'extras') {
      this.router.transitionTo('index');
    }
  },

  goAndCloseSearch(dest) {
    set(this, 'isSearchOpen', false);
    this.go(dest);
  },

  newBoard() {
    this.router.transitionTo('index');
  },

  goUpgrade() {
    var user = this.appState.get('currentUser');
    if (user) {
      modal.open('premium-required', { user_name: user.get('user_name'), user: user, remind_to_upgrade: true });
    } else {
      modal.open('premium-required', { remind_to_upgrade: true });
    }
  },

  actions: {
    openSearch() { this.openSearch(); },
    closeSearch() { this.closeSearch(); },
    onSearchKeydown(e) { this.onSearchKeydown(e); },
    goHelp() { this.goHelp(); },
    openAccount() { this.openAccount(); },
    goTab(tab) { this.goTab(tab); },
    go(dest) { this.go(dest); },
    goAndCloseSearch(dest) { this.goAndCloseSearch(dest); },
    newBoard() { this.newBoard(); },
    goUpgrade() { this.goUpgrade(); }
  }
});
