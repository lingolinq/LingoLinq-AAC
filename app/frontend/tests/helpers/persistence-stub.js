import persistence from 'frontend/utils/persistence';
import { set as emberSet } from '@ember/object';

export function persistenceTarget() {
  if (typeof window !== 'undefined' && window.persistence) {
    return window.persistence;
  }
  return persistence;
}

/** Boot the real persistence singleton before tests stub ajax (avoids placeholder → service swap dropping stubs). */
export function primePersistenceService(owner) {
  if (!owner) {
    return persistenceTarget();
  }
  var svc = owner.lookup('service:persistence');
  if (svc && typeof svc.set === 'function') {
    svc.set('online', true);
  }
  return svc;
}

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
