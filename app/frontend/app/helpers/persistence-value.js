import Helper from '@ember/component/helper';
import { inject as service } from '@ember/service';

/**
 * Returns a property value from the persistence service.
 * Use in templates to avoid reading this.persistence when context may be null
 * (e.g. during run loop flush or transition), which causes
 * "Cannot read properties of null (reading 'persistence')".
 * Usage: (persistence-value 'online'), (persistence-value 'syncing'), etc.
 */
export default Helper.extend({
  persistence: service('persistence'),
  compute(params) {
    var key = params && params[0];
    if (!key) { return undefined; }
    var p = null;
    if (this && typeof this.get === 'function') {
      try { p = this.get('persistence'); } catch (e) { /* teardown / null context */ }
    }
    if (!p && typeof window !== 'undefined') {
      p = window.persistence;
    }
    return p && typeof p.get === 'function' ? p.get(key) : undefined;
  }
});
