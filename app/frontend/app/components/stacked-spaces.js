import Component from '@ember/component';
import { inject as service } from '@ember/service';

export default Component.extend({
  router: service('router'),
  appState: service('app-state'),
  tagName: '',

  tab: 'home',
  isProfileOpen: false,
  isSearchOpen: false,

  actions: {
    go(key) {
      var userName = this.appState.get('currentUser.user_name');
      switch (key) {
        case 'users':
          if (userName) this.router.transitionTo('user', userName);
          else this.router.transitionTo('index');
          break;
        case 'settings':
          if (userName) this.router.transitionTo('user.preferences', userName);
          else this.router.transitionTo('index');
          break;
        case 'upgrade':
          if (userName) this.router.transitionTo('user.subscription', userName);
          else this.router.transitionTo('index');
          break;
        case 'boards.new':
          this.router.transitionTo('index');
          break;
        default:
          this.router.transitionTo('index');
      }
    },
    goTab(key) {
      this.set('tab', key);
      this.send('go', key);
    },
    openProfile() {
      this.set('isProfileOpen', true);
    },
    closeProfile() {
      this.set('isProfileOpen', false);
    },
    goAndCloseProfile(key) {
      this.send('closeProfile');
      this.send('go', key);
    },
    openSearch() {
      this.set('isSearchOpen', true);
    },
    closeSearch() {
      this.set('isSearchOpen', false);
    },
    onSearchKeydown(e) {
      if (e.key === 'Escape') this.send('closeSearch');
    },
    goAndCloseSearch(key) {
      this.send('closeSearch');
      this.send('go', key);
    },
    onUpgrade() {
      this.send('go', 'upgrade');
    },
    onNewBoard() {
      this.send('go', 'boards.new');
    }
  }
});
