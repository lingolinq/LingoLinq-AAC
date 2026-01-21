import Service from '@ember/service';
import { getOwner } from '@ember/application';
import { computed } from '@ember/object';

/**
 * CRITICAL FIX: Proxy Service for Legacy app_state
 *
 * This service acts as a proxy/adapter to the legacy app_state util.
 * 60+ files were migrated to use service('app-state') but the migration was never completed.
 * Instead of rewriting all those files or completing the full migration, we proxy all
 * method calls and property accesses to the legacy util which has the complete implementation.
 *
 * The legacy util is registered as 'lingolinq:app_state' by the session initializer.
 */
export default Service.extend({
  _legacyAppState: null,
  
  init() {
    this._super(...arguments);
    
    // Lookup the legacy app_state util that has all the methods
    var owner = getOwner(this);
    var legacyAppState = owner.lookup('lingolinq:app_state');
    
    if (!legacyAppState) {
      console.error('app-state service: Could not find legacy app_state (lingolinq:app_state)');
      console.error('Make sure the session initializer has run and registered it');
      return;
    }
    
    // Store reference to legacy implementation
    this.set('_legacyAppState', legacyAppState);
    
    console.log('app-state service: Successfully proxying to legacy app_state');
  },
  
  // Proxy commonly used methods to legacy app_state
  global_transition() {
    return this._legacyAppState.global_transition.apply(this._legacyAppState, arguments);
  },
  
  finish_global_transition() {
    return this._legacyAppState.finish_global_transition.apply(this._legacyAppState, arguments);
  },
  
  setup_controller() {
    return this._legacyAppState.setup_controller.apply(this._legacyAppState, arguments);
  },
  
  toggle_mode() {
    return this._legacyAppState.toggle_mode.apply(this._legacyAppState, arguments);
  },
  
  toggle_edit_mode() {
    return this._legacyAppState.toggle_edit_mode.apply(this._legacyAppState, arguments);
  },
  
  activate_button() {
    return this._legacyAppState.activate_button.apply(this._legacyAppState, arguments);
  },
  
  set_speak_mode_user() {
    return this._legacyAppState.set_speak_mode_user.apply(this._legacyAppState, arguments);
  },
  
  check_scanning() {
    return this._legacyAppState.check_scanning.apply(this._legacyAppState, arguments);
  },
  
  // Proxy all property access to legacy app_state
  unknownProperty(key) {
    if (this._legacyAppState) {
      var value = this._legacyAppState.get(key);
      // If it's a function, bind it to the legacy instance
      if (typeof value === 'function') {
        var legacyInstance = this._legacyAppState;
        return function() {
          return value.apply(legacyInstance, arguments);
        };
      }
      return value;
    }
    return undefined;
  },
  
  setUnknownProperty(key, value) {
    if (this._legacyAppState) {
      return this._legacyAppState.set(key, value);
    }
    return value;
  }
});
