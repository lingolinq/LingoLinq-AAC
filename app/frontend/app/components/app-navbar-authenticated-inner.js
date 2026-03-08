import Component from '@ember/component';
import { getOwner } from '@ember/application';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

/**
 * Reusable authenticated navbar inner: brand, search, identity (with optional
 * Modern Dashboard link). Use as the single baseline for the authenticated view
 * (index) and modern-dashboard. Pass showModernDashboardLink=true only on the
 * authenticated view page so the link appears there and not on modern-dashboard.
 */
export default Component.extend({
  tagName: '',
  appState: service('app-state'),

  /** When true, the mobile drawer (same structure as landing la-mobile-drawer) is open. */
  isDrawerOpen: false,

  application: computed(function() {
    return getOwner(this).lookup('controller:application');
  }),

  actions: {
    toggleDrawer() {
      this.toggleProperty('isDrawerOpen');
    },
    closeDrawer() {
      this.set('isDrawerOpen', false);
      this.get('application').send('closeThemePicker');
    },
    closeDrawerAndSend(signal) {
      this.send('closeDrawer');
      this.get('application').send(signal);
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
    },
    handleSearchInput(event) {
      this.send('updateSearchString', event.target.value);
    }
  }
});
