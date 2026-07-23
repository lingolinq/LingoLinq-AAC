import Helper from '@ember/component/helper';
import { set } from '@ember/object';

/**
 * One-way write-back helper for native form controls, replacing Ember's
 * two-way-bound <Input>/<Textarea> (see no-builtin-form-components).
 *
 * Returns an {{on}}-ready event handler that writes the control's current
 * value (or `checked`, for checkboxes/radios) back to `path` on `target`.
 * Uses Ember's `set`, so paths on Ember-Data models and objects still trigger
 * observers/computeds (e.g. a user_name_check watcher).
 *
 * Usage:
 *   <input  value={{this.model.user.name}}
 *           {{on "input"  (set-field this "model.user.name")}}>
 *   <input  type="checkbox" checked={{this.flag}}
 *           {{on "change" (set-field this "flag" "checkbox")}}>
 *
 * `target` is normally `this` (the component or controller); `path` may be a
 * nested dotted path. Pass "checkbox" (or "radio") as the third arg to read
 * `checked` instead of `value`.
 */
export default Helper.extend({
  compute(params) {
    var target = params[0];
    var path = params[1];
    var kind = params[2];
    return function(event) {
      var el = event && event.target;
      if (!el || !target || !path) { return; }
      set(target, path, kind === 'checkbox' || kind === 'radio' ? el.checked : el.value);
    };
  }
});
