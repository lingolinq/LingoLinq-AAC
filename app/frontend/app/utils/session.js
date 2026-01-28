import LingoLinq from '../app';

export default new Proxy({}, {
  get(target, prop) {
    const session = (LingoLinq && LingoLinq.session) || (typeof window !== 'undefined' && window.LingoLinq && window.LingoLinq.session);
    if (session) {
      const value = session[prop];
      if (typeof value === 'function') {
        return value.bind(session);
      }
      return value;
    }
    console.warn('[Session Proxy] Service not ready yet for property: ' + String(prop));
    return undefined;
  },
  set(target, prop, value) {
    const session = (LingoLinq && LingoLinq.session) || (typeof window !== 'undefined' && window.LingoLinq && window.LingoLinq.session);
    if (session) {
      session[prop] = value;
      return true;
    }
    console.warn('[Session Proxy] Service not ready yet for setting: ' + String(prop));
    return false;
  }
});
