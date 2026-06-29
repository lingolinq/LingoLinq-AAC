import { set as emberSet } from '@ember/object';
import {
  persistenceTarget,
  primePersistenceService,
  primeAllServices
} from './service-stub';

export { persistenceTarget, primePersistenceService, primeAllServices };

export function stubPersistence(overrides) {
  var target = persistenceTarget();
  var saved = {};
  Object.keys(overrides).forEach(function(key) {
    saved[key] = target[key];
    try {
      target[key] = overrides[key];
    } catch (e) {
      emberSet(target, key, overrides[key]);
    }
  });
  return function restore() {
    Object.keys(saved).forEach(function(key) {
      try {
        target[key] = saved[key];
      } catch (e) {
        emberSet(target, key, saved[key]);
      }
    });
  };
}

export function stubPersistenceAjax(fn) {
  return stubPersistence({ ajax: fn });
}

export function stubPersistenceGet(fn) {
  return stubPersistence({ get: fn });
}
