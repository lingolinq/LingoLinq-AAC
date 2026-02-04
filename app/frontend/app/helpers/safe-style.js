import { helper } from '@ember/component/helper';
import { htmlSafe } from '@ember/template';

/**
 * Returns an htmlSafe style string for use in style bindings.
 * Use this when binding style attributes to avoid the "binding style attributes"
 * deprecation warning. Pass a plain string (or empty string); it will be marked trusted.
 */
export default helper(function(params) {
  var str = params[0];
  return htmlSafe(typeof str === 'string' ? str : '');
});
