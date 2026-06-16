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

  /** When true, the LingoLinq company links sidebar (About, Pricing, etc.) is open. */
  isCompanySidebarOpen: false,

  application: computed(function() {
    return getOwner(this).lookup('controller:application');
  }),

  actions: {
    openSupport() {
      var fn = this.get('onSupport');
      if (fn && typeof fn === 'function') {
        fn();
      }
    },
    openBetaFeedback() {
      this.get('application').send('openBetaFeedback');
    },
    openLanguage() {
      this.get('application').send('language');
    },
    // Open the Dashboard Design / Display Style flow from the mobile drawer —
    // mirrors dashboard/authenticated-view's `editDashboard`: prefer the direct
    // opener the (still-mounted) display-style component registers on appState,
    // falling back to the appState signal it also observes. The disc itself is
    // hidden in the inner header at <=640px; this is its drawer replacement.
    openDisplayStyle() {
      var opener = this.get('appState.dashboard_design_opener');
      if (opener) {
        opener('display_style_display');
      } else {
        this.get('appState').set('open_dashboard_design', 'display');
      }
    },
    closeDrawerAndDisplayStyle() {
      this.send('closeDrawer');
      this.send('openDisplayStyle');
    },
    openCompanySidebar() {
      this.set('isCompanySidebarOpen', true);
    },
    closeCompanySidebar() {
      this.set('isCompanySidebarOpen', false);
    },
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
