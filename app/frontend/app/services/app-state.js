import Service from '@ember/service';
import EmberObject from '@ember/object';
import {
  set as emberSet,
  setProperties as setProperties,
  get as emberGet
} from '@ember/object';
import {
  later as runLater,
  cancel as runCancel,
  next as runNext
} from '@ember/runloop';
import RSVP from 'rsvp';
import $ from 'jquery';
import { inject as service } from '@ember/service';
import boundClasses from '../utils/bound_classes';
import utterance from '../utils/utterance';
import LingoLinq from '../app';
import contentGrabbers from '../utils/content_grabbers';
import editManager from '../utils/edit_manager';
import buttonTracker from '../utils/raw_events';
import capabilities from '../utils/capabilities';
import scanner from '../utils/scanner';
import session from '../utils/session';
import speecher from '../utils/speecher';
import geolocation from '../utils/geo';
import i18n from '../utils/i18n';
import frame_listener from '../utils/frame_listener';
import Button from '../utils/button';
import { htmlSafe } from '@ember/string';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import sync from '../utils/sync';

/**
 * Modern Ember Service for Application State Management
 *
 * Replaces app/utils/app_state.js with proper service pattern.
 * Handles:
 * - Current mode (edit mode, speak mode, default)
 * - Sidebar state
 * - Currently-visible board
 * - Currently-logged-in user
 * - Speak mode user
 * - Logging state
 * - Back button history
 */
export default Service.extend({
  // Explicit service dependencies
  stashes: service(),
  persistence: service(),
  modal: service(),

  // Initialize method replaces setup() from old util
  init() {
    this._super(...arguments);

    // Set up initial state (migrated from app_state.setup)
    this.set('browser', capabilities.browser);
    this.set('system', capabilities.system);
    this.set('button_list', []);
    this.set('geolocation', geolocation);
    this.set('installed_app', capabilities.installed_app);
    this.set('no_linky', capabilities.installed_app && capabilities.system == 'iOS');
    this.set('licenseOptions', LingoLinq.licenseOptions);
    this.set('device_name', capabilities.readable_device_name);

    var settings = window.domain_settings || {};
    settings.app_name = LingoLinq.app_name || settings.app_name || "LingoLinq";
    settings.company_name = LingoLinq.company_name || settings.company_name || "LingoLinq";
    this.set('domain_settings', settings);

    // Ensure window.user_preferences.any_user exists to prevent TypeError
    window.user_preferences = window.user_preferences || {};
    window.user_preferences.any_user = window.user_preferences.any_user || {};
    this.set('currentBoardState', null);
    this.set('version', window.app_version || 'unknown');

    // Set up battery monitoring
    this._setupBatteryMonitoring();
  },

  _setupBatteryMonitoring() {
    var _this = this;
    capabilities.battery.listen(function(battery) {
      battery.level = Math.round(battery.level * 100);
      if(battery.level != _this.get('battery.level') || battery.charging !== _this.get('battery.charging')) {
        _this.set('battery', battery);
        _this.set('battery.progress_style', htmlSafe("width: " + parseInt(battery.level) + "%;"));
        _this.set('battery.low', battery.level < 30);
        _this.set('battery.really_low', battery.level < 15);
        // ... (rest of battery monitoring logic will be migrated here)
      }
    });
  },

  // NOTE: All other methods from app_state.js will be migrated here
  // For Phase 1, we're just creating the service structure
  // Methods will be copied in subsequent steps to avoid breaking existing code

  /**
   * Placeholder for activate_button - will be migrated from utils/app_state.js
   */
  activate_button(button, opts) {
    // TODO: Migrate from app_state.js in Phase 2
    console.warn('app-state service: activate_button not yet fully migrated');
  }

  // Additional methods will be added during full migration
});
