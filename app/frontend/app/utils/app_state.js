import LingoLinq from '../app';

export default new Proxy({}, {
  get(target, prop) {
    // Return a dummy object for prototype access checks if useful?
    // Ember might check 'prototype' or 'create'. 
    if (prop === 'create') {
        // Only return if we can actually get the appState, otherwise delay or handle gracefully?
        // Actually for create(), we might want to return the proxy itself or null?
        // But let's stick to this for now.
        return function() { return (LingoLinq && LingoLinq.appState) || (typeof window !== 'undefined' && window.LingoLinq && window.LingoLinq.appState); }; 
    }
    const appState = (LingoLinq && LingoLinq.appState) || (typeof window !== 'undefined' && window.LingoLinq && window.LingoLinq.appState);
    if (appState) {
      const value = appState[prop];
      if (typeof value === 'function') {
        return value.bind(appState);
      }
      return value;
    }
    console.warn('[AppState Proxy] Service not ready yet for property: ' + String(prop));
    return undefined;
  },
  set(target, prop, value) {
    const appState = (LingoLinq && LingoLinq.appState) || (typeof window !== 'undefined' && window.LingoLinq && window.LingoLinq.appState);
    if (appState) {
      appState[prop] = value;
      return true;
    }
    console.warn('[AppState Proxy] Service not ready yet for setting: ' + String(prop));
    return false;
  }
});
