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

  actions: {
    index() {
      this.get('application').send('index');
    },
    support() {
      this.get('application').send('support');
    },
    goUpgrade() {
      this.get('application').send('goUpgrade');
    },
    toggleThemePicker() {
      this.get('application').send('toggleThemePicker');
    },
    selectThemeMode(mode) {
      this.get('application').send('selectThemeMode', mode);
    },
    closeThemePicker() {
      this.get('application').send('closeThemePicker');
    },
    showFeatures() {
      this.get('application').send('showFeatures');
    },
    toggleHeroColors() {
      this.get('application').send('toggleHeroColors');
    },
    searchBoards() {
      this.get('application').send('searchBoards');
    },
    newBoard() {
      this.get('application').send('newBoard');
    },
    invalidateSession() {
      this.get('application').send('invalidateSession');
    },
    updateSearchString(value) {
      this.get('application').set('searchString', value);
    }
  }
});
