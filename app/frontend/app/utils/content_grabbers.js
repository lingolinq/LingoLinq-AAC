export default new Proxy({}, {
  get(target, prop) {
    // Return a dummy object for prototype access checks if useful?
    // Ember might check 'prototype' or 'create'. 
    if (prop === 'create') {
        // Some code calls .create()? No, I removed that. Old code might.
        return function() { return window.cg; }; 
    }
    if (window.cg) {
      const value = window.cg[prop];
      if (typeof value === 'function') {
        return value.bind(window.cg);
      }
      return value;
    }
    console.warn('[ContentGrabbers Proxy] Service not ready yet for property: ' + String(prop));
    return undefined;
  },
  set(target, prop, value) {
    if (window.cg) {
      window.cg[prop] = value;
      return true;
    }
    console.warn('[ContentGrabbers Proxy] Service not ready yet for setting: ' + String(prop));
    return false;
  }
});
