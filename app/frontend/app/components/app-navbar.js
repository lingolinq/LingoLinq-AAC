import Component from '@ember/component';
import { getOwner } from '@ember/application';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import { is_classic } from '../utils/view_style';

/**
 * Reusable navbar: matches bento #inner_header when authenticated,
 * or landing-alt style (Features, Pricing, About, Try Free) when unauthenticated.
 * Pass a block to replace inner content entirely.
 */
export default Component.extend({
  tagName: 'nav',
  classNames: ['app-navbar'],
  attributeBindings: ['role', 'ariaLabel:aria-label'],
  role: 'navigation',

  appState: service('app-state'),

  /* Classic takes the beta-feedback tab's CENTRED base placement instead of the
     `--navbar` corner anchor — see the template. Reads through utils/view_style so
     the preference key keeps a single reader. */
  isClassic: computed('appState.currentUser.preferences.board_view_style', function() {
    return is_classic(this.get('appState.currentUser'));
  }),

  application: computed(function() {
    return getOwner(this).lookup('controller:application');
  }),

  ariaLabel: computed(function() {
    return i18n.t('main_navigation', 'Main navigation');
  }),

  isAuthenticated: computed('application.isSessionAuthenticated', function() {
    var app = this.get('application');
    return app && !!app.get('isSessionAuthenticated');
  }),

  /** True on login.device route — hide search, upgrade, and user controls. */
  isDevicePage: computed('appState.current_route', function() {
    return this.appState.get('current_route') === 'login.device';
  }),

  /** Hide the speak-mode "Home" nav link when already on dashboard home (/username/home). */
  isOnUserHomeDashboard: computed('appState.current_route', function() {
    return this.appState.get('current_route') === 'user.home';
  }),
  showModernDashboardLink: computed('isOnUserHomeDashboard', function() {
    return !this.get('isOnUserHomeDashboard');
  }),

  showBetaFeedbackDrawerTab: computed(
    'isAuthenticated',
    'application.showBetaFeedbackDrawer',
    'application.on_board_detail',
    'appState.speak_mode',
    'appState.edit_mode',
    'appState.currentBoardState.id',
    function() {
      // Hide while a board is actively rendered in speak OR edit mode (the
      // board-detail chrome crowds the navbar tab there, and application.hbs
      // shows the bottom-center drawer tab instead). When a board route
      // fails to load, currentBoardState.id is null even though the mode may
      // still be set — in that case the board header is suppressed (see
      // application.hbs) and the drawer tab should show, matching home-page
      // behavior.
      // board-detail is decoupled from the global speak_mode flag (it renders
      // through its own controller state, so appState.speak_mode stays false
      // there); without an explicit board-detail check the navbar tab would
      // wrongly show at the top. application.hbs renders the bottom-center
      // --speak drawer tab on board-detail, so suppress the navbar tab here.
      if(this.get('application.on_board_detail')) { return false; }
      return this.get('isAuthenticated') &&
        this.get('application.showBetaFeedbackDrawer') &&
        ((!this.appState.get('speak_mode') && !this.appState.get('edit_mode')) || !this.appState.get('currentBoardState.id'));
    }
  ),

  /** When true, the mobile drawer (landing-alt nav) is open. */
  isLandingDrawerOpen: false,

  init() {
    this._super(...arguments);
    var self = this;
    var owner = getOwner(this);
    this.toggleLandingDrawer = () => {
      self.set('isLandingDrawerOpen', !self.get('isLandingDrawerOpen'));
    };
    this.closeLandingDrawer = () => {
      self.set('isLandingDrawerOpen', false);
    };
    this.toggleBetaFeedbackDrawer = () => {
      owner.lookup('controller:application').send('toggleBetaFeedbackDrawer');
    };
  },

  index() {
    this.get('application').send('index');
  },
  toggleHeroColors() {
    this.get('application').send('toggleHeroColors');
  }
});
