import Component from '@glimmer/component';
import { get as emberGet } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import modal from '../utils/modal';
import i18n from '../utils/i18n';

export default class ModernDashboardComponent extends Component {
  @service router;
  @service('app-state') appState;

  @tracked activeTab = 'home';
  @tracked isSearchOpen = false;
  @tracked showNewBoardForm = false;

  /**
   * Same behavior as authenticated-view Speak button: enter speak mode for current user,
   * or open switch-communicators if user has supervisees / is in supporter view.
   */
  @action
  goToSpeakMode() {
    var appState = this.appState;
    var currentUser = appState.get('currentUser');
    var hasSupervisees = (emberGet(currentUser, 'permissions.delete') && (appState.get('currentUser.supervisees') || []).length > 0);
    var communicatorInSupporterView = appState.get('currentUser.communicator_in_supporter_view');
    if (hasSupervisees || communicatorInSupporterView) {
      var prompt = i18n.t('speak_as_which_user', 'Select User to Speak As');
      if (communicatorInSupporterView) {
        prompt = i18n.t('speak_as_which_mode', 'Select Mode and User for Session');
      }
      appState.set('referenced_speak_mode_user', null);
      var controller = appState.get('controller');
      if (controller && typeof controller.send === 'function') {
        controller.send('switch_communicators', { stay: true, modeling: 'ask', skip_me: false, header: prompt });
      } else {
        modal.open('switch-communicators', { stay: true, modeling: 'ask', skip_me: false, header: prompt });
      }
    } else {
      appState.home_in_speak_mode();
    }
  }

  @action
  go(key) {
    if (key === 'speak') {
      this.goToSpeakMode();
      return;
    }
    if (key === 'boards' || key === 'supervisors' || key === 'home' || key === 'extras') {
      this.router.transitionTo('index');
    } else if (key === 'reports') {
      var u = this.appState.get('currentUser.user_name');
      if (u) {
        this.router.transitionTo('user.stats', u, { queryParams: { from_dashboard: 1 } });
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
