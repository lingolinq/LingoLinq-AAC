import Service from '@ember/service';
import { getOwner } from '@ember/application';

/**
 * Proxy Service for Legacy stashes
 *
 * All methods are dynamically copied from the legacy object so that direct
 * calls work (unknownProperty only handles .get()).
 */
export default Service.extend({
  _legacyStashes: null,

  init() {
    this._super(...arguments);
    var owner = getOwner(this);
    var legacy = owner.lookup('lingolinq:stashes');
    if (!legacy) {
      console.error('stashes service: Could not find legacy stashes (lingolinq:stashes)');
      return;
    }
    this.set('_legacyStashes', legacy);

    // Dynamically copy ALL methods and object properties from the legacy object
    this._copyLegacyMethods(legacy);

    console.log('stashes service: Successfully proxying to legacy stashes');
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
          self[key] = legacy[key];
        }
      } catch(e) { /* skip inaccessible properties */ }
    }
  },

  unknownProperty(key) {
    if (this._legacyStashes) {
      var value = this._legacyStashes.get(key);
      if (typeof value === 'function') {
        var legacyInstance = this._legacyStashes;
        return function() { return value.apply(legacyInstance, arguments); };
      }
      return value;
    }
    return undefined;
  },

  setUnknownProperty(key, value) {
    if (this._legacyStashes) {
      return this._legacyStashes.set(key, value);
    }
    return value;
  }
});
