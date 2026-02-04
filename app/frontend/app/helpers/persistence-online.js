import Helper from '@ember/component/helper';
import { inject as service } from '@ember/service';

/**
 * Returns whether the persistence service reports online.
 * Use in templates to avoid reading this.persistence when context may be null
 * (e.g. during run loop flush or transition), which causes
 * "Cannot read properties of null (reading 'persistence')".
 */
export default Helper.extend({
  persistence: service('persistence'),
  compute() {
    var p = null;
    if (this && typeof this.get === 'function') {
      try { p = this.get('persistence'); } catch (e) { /* teardown / null context */ }
    }
    if (!p && typeof window !== 'undefined') {
      p = window.persistence;
    }
    return p && typeof p.get === 'function' && p.get('online');
  }
});
