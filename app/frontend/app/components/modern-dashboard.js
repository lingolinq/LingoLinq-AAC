import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import modal from '../utils/modal';

export default class ModernDashboardComponent extends Component {
  @service router;
  @service('app-state') appState;

  @tracked activeTab = 'home';
  @tracked isSearchOpen = false;
  @tracked showNewBoardForm = false;

  @action
  go(key) {
    if (key === 'speak' || key === 'boards' || key === 'supervisors' || key === 'home' || key === 'extras') {
      this.router.transitionTo('index');
    } else if (key === 'reports') {
      var u = this.appState.get('currentUser.user_name');
      if (u) {
        this.router.transitionTo('user.stats', u);
      }
    } else if (key === 'upgrade') {
      var user = this.appState.get('currentUser');
      if (user) {
        modal.open('premium-required', { user_name: user.get('user_name'), user: user, remind_to_upgrade: true });
      } else {
        modal.open('premium-required', { remind_to_upgrade: true });
      }
    } else if (key === 'help') {
      modal.open('support');
    }
  }

  @action
  goTab(key) {
    this.activeTab = key;
    if (key === 'extras' || key === 'boards' || key === 'home') {
      return;
    }
    this.go(key);
  }

  @action
  goUpgrade() {
    this.go('upgrade');
  }

  @action
  goHelp() {
    this.go('help');
  }

  @action
  openAccount() {
    var user = this.appState.get('currentUser.user_name');
    if (user) {
      this.router.transitionTo('user', user);
    }
  }

  @action
  newBoard() {
    this.router.transitionTo('index');
  }

  @action
  openSearch() {
    this.isSearchOpen = true;
  }

  @action
  closeSearch() {
    this.isSearchOpen = false;
  }

  @action
  onSearchKeydown(e) {
    if (e.key === 'Escape') {
      this.closeSearch();
    }
  }

  @action
  goAndCloseSearch(key) {
    this.closeSearch();
    this.go(key);
  }

  @action
  openNewBoardOnBoards() {
    this.activeTab = 'boards';
    this.showNewBoardForm = true;
  }

  @action
  closeNewBoardForm() {
    this.showNewBoardForm = false;
  }
}
