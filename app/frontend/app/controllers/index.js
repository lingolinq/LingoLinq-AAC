import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { inject as controller } from '@ember/controller';
import { alias } from '@ember/object/computed';
import { computed } from '@ember/object';
import { is_classic } from '../utils/view_style';

export default Controller.extend({
  appState: service('app-state'),
  store: service('store'),
  applicationController: controller('application'),
  // Alias for template compatibility (template uses this.app_state)
  app_state: alias('appState'),


  // Computed properties to safely access app_state properties
  // Note: We need to track the service itself and the nested properties separately
  hasCurrentUser: computed('appState.currentUser', 'appState', function() {
    var appState = this.get('appState');
    if (!appState) { return false; }
    var currentUser = appState.get('currentUser');
    if ((window.LingoLinq || {}).verboseDebug) { console.log('[INDEX CONTROLLER] hasCurrentUser computed:', currentUser ? 'has user' : 'no user'); }
    return !!currentUser;
  }),
  
  // TRUE only when the signed-in user has chosen the CLASSIC view — the same
  // `preferences.board_view_style` the board Classic/Modern toggle writes
  // (components/board-actions.js#set_view_style) and utils/board_view.js reads.
  // Modern is the default: unset, missing, or any other value is false, so the
  // modern dashboard stays the fall-through for everyone who hasn't opted in.
  // Pure computed, no observers — nothing here runs for a modern user beyond
  // this comparison.
  classicHome: computed('appState.currentUser.preferences.board_view_style', function() {
    var appState = this.get('appState');
    if (!appState) { return false; }
    return is_classic(appState.get('currentUser'));
  }),

  hasFullDomain: computed('appState.domain_settings.full_domain', 'appState.domain_settings', 'appState', function() {
    var appState = this.get('appState');
    if (!appState) { return false; }
    var domainSettings = appState.get('domain_settings');
    // domain_settings is a plain object, not an Ember object, so access properties directly
    return domainSettings && domainSettings.full_domain;
  }),
  
  logoUrl: computed('appState.domain_settings.logo_url', 'appState.domain_settings', 'appState', function() {
    var appState = this.get('appState');
    if (!appState) { return null; }
    var domainSettings = appState.get('domain_settings');
    // domain_settings is a plain object, not an Ember object, so access properties directly
    return domainSettings && domainSettings.logo_url;
  }),
  
  init() {
    this._super(...arguments);
    var _vb = (window.LingoLinq || {}).verboseDebug;
    // Debug: verify service injection
    if (!this.appState) {
      console.error('[INDEX CONTROLLER] appState service not injected!');
    } else if (_vb) {
      console.log('[INDEX CONTROLLER] appState service injected:', typeof this.appState);
    }
    if (!this.app_state) {
      console.error('[INDEX CONTROLLER] app_state alias not working!');
    } else if (_vb) {
      console.log('[INDEX CONTROLLER] app_state alias working:', typeof this.app_state);
    }
    
    // Debug: monitor currentUser changes
    var _this = this;
    if (this.appState) {
      // Use Ember's observer pattern to monitor currentUser changes
      this.appState.addObserver('currentUser', function() {
        if (_vb) { console.log('[INDEX CONTROLLER] currentUser changed:', _this.appState.get('currentUser') ? 'has user' : 'no user'); }
        // Force recomputation of hasCurrentUser
        _this.notifyPropertyChange('hasCurrentUser');
      });
      if (_vb) {
        console.log('[INDEX CONTROLLER] Initial currentUser:', this.appState.get('currentUser') ? 'has user' : 'no user');
        console.log('[INDEX CONTROLLER] Initial sessionUser:', this.appState.get('sessionUser') ? 'has user' : 'no user');
      }
    }

    var appState = this.appState;
    this.hide_login = () => {
      appState.set('login_modal', false);
      var html = document.querySelector('html');
      var body = document.querySelector('body');
      if (html) { html.style.overflow = ''; }
      if (body) { body.style.overflow = ''; }
      var overlay = document.getElementById('login_overlay');
      if (overlay) { overlay.remove(); }
    };
    this.opening_index = () => {
      appState.set('index_view', true);
    };
    this.closing_index = () => {
      appState.set('index_view', false);
    };
  },
  
  update_selected: function() {
    var user = this.get('model');
    if(user && user.get('id') && this.appState.controller) {
      this.appState.controller.updateTitle();
    }
  },
  checkForBlankSlate: function() {
    if(this.get('model.id')) { return; }
    if(!this.get('homeBoards.length') && !this.get('homeBoards.loading') && !this.get('popularBoards.length') && !this.get('popularBoards.loading')) {
      // TODO: maybe hit a different endpoint?
    }
  },
  subscription_check: function() {
    // Check subscription status if needed
    var user = this.get('model');
    if(user && user.get('id')) {
      // subscription checks happen in the app_state or elsewhere
    }
  },
  update_current_badges: function() {
    // Update badges display
    var user = this.get('model');
    if(user && user.get('id')) {
      // badge updates happen through the user model
    }
  }
});
