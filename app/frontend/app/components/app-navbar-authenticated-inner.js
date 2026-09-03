import Component from '@ember/component';
import { getOwner } from '@ember/application';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import { is_classic } from '../utils/view_style';

/**
 * Reusable authenticated navbar inner: brand, search, identity (with optional
 * Modern Dashboard link). Use as the single baseline for the authenticated view
 * (index) and modern-dashboard. Pass showModernDashboardLink=true only on the
 * authenticated view page so the link appears there and not on modern-dashboard.
 */
export default Component.extend({
  tagName: '',
  appState: service('app-state'),

  /* True when the user is in Classic. The tour trigger and the Display Style
     selector are BOTH Card-View concepts and are hidden in Classic:
       - Classic has its own "Take a tour" row in the rail, so the navbar disc
         would be a second trigger for the same tour.
       - Display Style chooses Gentle vs Focused, which are arrangements of the
         CARD grid. Classic has no card grid, so the control has nothing to act on.
     Reads through utils/view_style so the preference key has one reader. */
  isClassic: computed('appState.currentUser.preferences.board_view_style', function() {
    return is_classic(this.get('appState.currentUser'));
  }),

  /** When true, the mobile drawer (same structure as landing la-mobile-drawer) is open. */
  isDrawerOpen: false,

  /** When true, the LingoLinq company links sidebar (About, Pricing, etc.) is open. */
  isCompanySidebarOpen: false,

  application: computed(function() {
    return getOwner(this).lookup('controller:application');
  }),

  init() {
    this._super(...arguments);
    var self = this;
    var send = function(name) {
      var args = Array.prototype.slice.call(arguments, 1);
      self.send.apply(self, [name].concat(args));
    };
    this.onSearchBoardsSubmit = (event) => {
      if (event && event.preventDefault) { event.preventDefault(); }
      send('searchBoards');
    };
    this.onSearchBoards = () => { send('searchBoards'); };
    this.onHandleSearchInput = (event) => {
      send('handleSearchInput', event && event.target ? event.target.value : '');
    };
    this.onOpenSupport = (event) => {
      if (event && event.preventDefault) { event.preventDefault(); }
      send('openSupport');
    };
    this.onOpenCompanySidebar = (event) => {
      if (event && event.preventDefault) { event.preventDefault(); }
      send('openCompanySidebar');
    };
    this.onOpenLanguage = (event) => {
      if (event && event.preventDefault) { event.preventDefault(); }
      send('openLanguage');
    };
    this.onSelectThemeModeLight = () => { send('selectThemeMode', 'light'); };
    this.onSelectThemeModeMidDay = () => { send('selectThemeMode', 'midDay'); };
    this.onSelectThemeModeDark = () => { send('selectThemeMode', 'dark'); };
    this.onSelectThemeModeDefault = () => { send('selectThemeMode', 'default'); };
    this.onInvalidateSession = (event) => {
      if (event && event.preventDefault) { event.preventDefault(); }
      send('invalidateSession');
    };
    this.onStopMasquerading = (event) => {
      if (event && event.preventDefault) { event.preventDefault(); }
      send('stopMasquerading');
    };
    this.onToggleDrawer = () => { send('toggleDrawer'); };
    this.onCloseDrawer = () => { send('closeDrawer'); };
    this.onCloseDrawerAndNewBoard = (event) => {
      if (event && event.preventDefault) { event.preventDefault(); }
      send('closeDrawerAndSend', 'newBoard');
    };
    this.onCloseDrawerAndStopMasquerading = () => { send('closeDrawerAndSend', 'stopMasquerading'); };
    this.onCloseDrawerAndGoUpgrade = () => { send('closeDrawerAndSend', 'goUpgrade'); };
    this.onCloseDrawerAndSupport = () => { send('closeDrawerAndSend', 'support'); };
    this.onCloseDrawerAndOpenBetaFeedback = () => { send('closeDrawerAndSend', 'openBetaFeedback'); };
    this.onCloseDrawerAndLanguage = () => { send('closeDrawerAndSend', 'language'); };
    this.onCloseDrawerAndInvalidateSession = (event) => {
      if (event && event.preventDefault) { event.preventDefault(); }
      send('closeDrawerAndSend', 'invalidateSession');
    };
    this.onCloseDrawerAndDisplayStyle = () => { send('closeDrawerAndDisplayStyle'); };
    this.onCloseCompanySidebar = () => { send('closeCompanySidebar'); };
  },

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
    stopMasquerading() {
      this.get('application').send('stopMasquerading');
    },
    updateSearchString(value) {
      this.get('application').set('searchString', value);
    },
    handleSearchInput(event) {
      this.send('updateSearchString', event.target.value);
    }
  }
});
