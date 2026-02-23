import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';

export default Component.extend({
  router: service('router'),
  appState: service('app-state'),
  tagName: '',

  tab: 'home',
  isProfileOpen: false,
  isSearchOpen: false,

  /** Current step (1–5) for Getting Started; same order as modal */
  getting_started_step: computed('appState.currentUser.preferences.progress', function() {
    var order = ['intro_watched', 'home_board_set', 'app_added', 'preferences_edited', 'profile_edited'];
    var progress = this.appState.get('currentUser.preferences.progress') || {};
    if (progress.setup_done) { return 5; }
    for (var i = 0; i < order.length; i++) {
      if (!progress[order[i]]) { return i + 1; }
    }
    return 5;
  }),
  getting_started_percent: computed('appState.currentUser.preferences.progress', function() {
    var order = ['intro_watched', 'home_board_set', 'app_added', 'preferences_edited', 'profile_edited'];
    var progress = this.appState.get('currentUser.preferences.progress') || {};
    if (progress.setup_done) { return 100; }
    var done = 0;
    order.forEach(function(opt) {
      if (progress[opt]) { done++; }
    });
    return Math.round(done / order.length * 100);
  }),
  getting_started_percent_style: computed('getting_started_percent', function() {
    var pct = this.get('getting_started_percent');
    return pct != null ? 'width: ' + pct + '%;' : 'width: 0%;';
  }),

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
    },
    gettingStarted() {
      this.router.transitionTo('index');
    }
  }
});
