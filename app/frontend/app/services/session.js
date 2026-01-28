import Service from '@ember/service';
import { getOwner } from '@ember/application';

/**
 * Proxy Service for Legacy session
 *
 * This service acts as a proxy to the legacy session util registered
 * as 'lingolinq:session' by the session initializer. Several files
 * inject service('session') so this proxy must exist.
 */
export default Service.extend({
  _legacySession: null,

  init() {
    this._super(...arguments);
    var owner = getOwner(this);
    var legacy = owner.lookup('lingolinq:session');
    if (!legacy) {
      console.error('session service: Could not find legacy session (lingolinq:session)');
      return;
    }
    this.set('_legacySession', legacy);
    console.log('session service: Successfully proxying to legacy session');
  },

  // Proxy commonly used methods
  persist() { return this._legacySession.persist.apply(this._legacySession, arguments); },
  restore() { return this._legacySession.restore.apply(this._legacySession, arguments); },
  invalidate() { return this._legacySession.invalidate.apply(this._legacySession, arguments); },
  override() { return this._legacySession.override.apply(this._legacySession, arguments); },
  check_token() { return this._legacySession.check_token.apply(this._legacySession, arguments); },
  authenticate() { return this._legacySession.authenticate.apply(this._legacySession, arguments); },

  unknownProperty(key) {
    if (this._legacySession) {
      var value = this._legacySession.get(key);
      if (typeof value === 'function') {
        var legacyInstance = this._legacySession;
        return function() { return value.apply(legacyInstance, arguments); };
      }
      return value;
    }
    return undefined;
  },

  setUnknownProperty(key, value) {
    if (this._legacySession) {
      return this._legacySession.set(key, value);
    }
    return value;
  }
});
