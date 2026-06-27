import persistence from 'frontend/utils/persistence';

export function persistenceTarget() {
  if (typeof window !== 'undefined' && window.persistence) {
    return window.persistence;
  }
  return persistence;
}

export function stubPersistence(overrides) {
  var target = persistenceTarget();
  var saved = {};
  Object.keys(overrides).forEach(function(key) {
    saved[key] = target[key];
    target[key] = overrides[key];
  });
  return function restore() {
    Object.keys(saved).forEach(function(key) {
      target[key] = saved[key];
    });
  };
}

export function stubPersistenceAjax(fn) {
  return stubPersistence({ ajax: fn });
}

export function stubPersistenceGet(fn) {
  return stubPersistence({ get: fn });
}
