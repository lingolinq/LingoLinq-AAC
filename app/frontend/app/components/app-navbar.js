import Component from '@ember/component';
import { getOwner } from '@ember/application';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';

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

  /** Hide "Modern Dashboard" nav link when already on dashboard home (/username/home). */
  isOnUserHomeDashboard: computed('appState.current_route', function() {
    return this.appState.get('current_route') === 'user.home';
  }),
  showModernDashboardLink: computed('isOnUserHomeDashboard', function() {
    return !this.get('isOnUserHomeDashboard');
  }),

  /** When true, the mobile drawer (landing-alt nav) is open. */
  isLandingDrawerOpen: false,

  actions: {
    index() {
      this.get('application').send('index');
    },
    toggleHeroColors() {
      this.get('application').send('toggleHeroColors');
    },
    toggleLandingDrawer() {
      this.set('isLandingDrawerOpen', !this.get('isLandingDrawerOpen'));
    },
    closeLandingDrawer() {
      this.set('isLandingDrawerOpen', false);
    },
  }
});
