import Helper from '@ember/component/helper';
import { set } from '@ember/object';

/**
 * DDAU write-back helper: returns a setter so a child component's `@onChange`
 * callback can write a value straight back to a caller property — without
 * curly two-way binding or the discouraged `{{mut}}` helper.
 *
 * Usage: <FieldWrapper @value={{this.x}} @onChange={{set-value this "x"}} />
 * The child calls `this.onChange(newValue)`; that sets `this.x` on the caller.
 *
 * Companion to `set-field` (which reads the value off a DOM event); this variant
 * takes the value directly, for components that emit their value rather than an event.
 */
export default Helper.extend({
  compute(params) {
    var target = params[0], path = params[1];
    return function(value) {
      if (target && path) { set(target, path, value); }
    };
  }
});
