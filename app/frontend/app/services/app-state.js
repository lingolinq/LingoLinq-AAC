import Service from '@ember/service';
import { getOwner } from '@ember/application';

/**
 * Proxy Service for Legacy app_state
 *
 * This service proxies all method calls and property accesses to the legacy
 * app_state utility (registered as 'lingolinq:app_state' by the session initializer).
 *
 * All methods are dynamically copied from the legacy object so that direct
 * calls like this.appState.clear_mode() work (unknownProperty only handles .get()).
 */
export default Service.extend({
  _legacyAppState: null,

  init() {
    this._super(...arguments);

    var owner = getOwner(this);
    var legacyAppState = owner.lookup('lingolinq:app_state');

    if (!legacyAppState) {
      console.error('app-state service: Could not find legacy app_state (lingolinq:app_state)');
      return;
    }

    this.set('_legacyAppState', legacyAppState);

    // Ensure this service has the real modal service
    this.set('modal', owner.lookup('service:modal'));

    // Dynamically copy ALL methods from the legacy object so that direct
    // method calls work (e.g., this.appState.clear_mode()).
    // unknownProperty only handles .get() access, not direct property access.
    this._copyLegacyMethods(legacyAppState);

    console.log('app-state service: Successfully proxying to legacy app_state');
  },

  _copyLegacyMethods: function(legacy) {
    var self = this;
    var skipKeys = {
      'constructor': true, 'init': true, '_super': true,
      'isDestroyed': true, 'isDestroying': true,
      'destroy': true, 'willDestroy': true,
      'concatenatedProperties': true, 'mergedProperties': true,
      'unknownProperty': true, 'setUnknownProperty': true,
      '_copyLegacyMethods': true
    };
    for (var key in legacy) {
      if (skipKeys[key]) continue;
      if (key.charAt(0) === '_' || key.indexOf('__') === 0) continue;
      try {
        if (self[key] !== undefined) continue;
        if (typeof legacy[key] === 'function') {
          (function(k) {
            self[k] = function() { return legacy[k].apply(legacy, arguments); };
          })(key);
        } else if (legacy[key] !== null && typeof legacy[key] === 'object') {
          // Copy object references (e.g., url_cache) so direct access works
          self[key] = legacy[key];
        }
      } catch(e) { /* skip inaccessible properties */ }
    }
  },

  // Proxy property access via .get() to legacy app_state
  unknownProperty(key) {
    if (this._legacyAppState) {
      var value = this._legacyAppState.get(key);
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
