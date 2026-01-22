import Service from '@ember/service';
import { getOwner } from '@ember/application';

/**
 * CRITICAL FIX: Proxy Service for Legacy persistence
 *
 * This service acts as a proxy/adapter to the legacy persistence util.
 * Similar to app-state service, persistence was partially migrated but never completed.
 * The complete implementation with all methods lives in utils/persistence.js.
 *
 * The legacy util is registered as 'lingolinq:persistence' by the session initializer.
 */
export default Service.extend({
  _legacyPersistence: null,
  
  init() {
    this._super(...arguments);
    
    // Lookup the legacy persistence util that has all the methods
    var owner = getOwner(this);
    var legacyPersistence = owner.lookup('lingolinq:persistence');
    
    if (!legacyPersistence) {
      console.error('persistence service: Could not find legacy persistence (lingolinq:persistence)');
      console.error('Make sure the session initializer has run and registered it');
      return;
    }
    
    // Store reference to legacy implementation
    this.set('_legacyPersistence', legacyPersistence);
    
    console.log('persistence service: Successfully proxying to legacy persistence');
  },
  
  // Proxy commonly used methods to legacy persistence
  prime_caches() {
    if (!this._legacyPersistence) {
      console.error('persistence service: legacy persistence not available');
      return Promise.resolve();
    }
    return this._legacyPersistence.prime_caches.apply(this._legacyPersistence, arguments);
  },
  
  find() {
    return this._legacyPersistence.find.apply(this._legacyPersistence, arguments);
  },
  
  store() {
    return this._legacyPersistence.store.apply(this._legacyPersistence, arguments);
  },
  
  remove() {
    return this._legacyPersistence.remove.apply(this._legacyPersistence, arguments);
  },
  
  sync() {
    return this._legacyPersistence.sync.apply(this._legacyPersistence, arguments);
  },
  
  store_json() {
    return this._legacyPersistence.store_json.apply(this._legacyPersistence, arguments);
  },
  
  ajax() {
    return this._legacyPersistence.ajax.apply(this._legacyPersistence, arguments);
  },
  
  store_url() {
    return this._legacyPersistence.store_url.apply(this._legacyPersistence, arguments);
  },
  
  find_url() {
    return this._legacyPersistence.find_url.apply(this._legacyPersistence, arguments);
  },
  
  // Proxy all property access to legacy persistence
  unknownProperty(key) {
    if (this._legacyPersistence) {
      var value = this._legacyPersistence.get(key);
      // If it's a function, bind it to the legacy instance
      if (typeof value === 'function') {
        var legacyInstance = this._legacyPersistence;
        return function() {
          return value.apply(legacyInstance, arguments);
        };
      }
      return value;
    }
    return undefined;
  },
  
  setUnknownProperty(key, value) {
    if (this._legacyPersistence) {
      return this._legacyPersistence.set(key, value);
    }
    return value;
  }
});
