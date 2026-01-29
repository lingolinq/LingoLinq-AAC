import Service from '@ember/service';
import { getOwner } from '@ember/application';

export default Service.extend({
  _legacySession: null,

  getLegacy() {
    if (!this._legacySession) {
      var owner = getOwner(this);
      this._legacySession = owner.lookup('lingolinq:session');
    }
    return this._legacySession;
  },

  unknownProperty(key) {
    var legacy = this.getLegacy();
    if (legacy) {
      var value = legacy.get(key);
      if (typeof value === 'function') {
        return function() { return value.apply(legacy, arguments); };
      }
      return value;
    }
  },

  setUnknownProperty(key, value) {
    var legacy = this.getLegacy();
    if (legacy) {
      return legacy.set(key, value);
    }
    return value;
  },

  persist() {
    return this.getLegacy().persist(...arguments);
  },

  restore() {
    return this.getLegacy().restore(...arguments);
  },

  invalidate() {
    return this.getLegacy().invalidate(...arguments);
  },

  override() {
    return this.getLegacy().override(...arguments);
  },

  check_token() {
    return this.getLegacy().check_token(...arguments);
  },

  authenticate() {
    return this.getLegacy().authenticate(...arguments);
  }
});