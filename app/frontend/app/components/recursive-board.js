import Component from '@ember/component';
import { computed } from '@ember/object';

/**
 * One node in the board-hierarchy tree. The CHECKBOX stays in a single
 * left-aligned column for every row; the hierarchy is shown by indenting the
 * node's CONTENT (toggle + label) by its depth. So each node tracks its depth
 * and hands children depth + 1.
 */
export default Component.extend({
  tagName: '',

  childDepth: computed('depth', function() {
    return (parseInt(this.get('depth'), 10) || 0) + 1;
  })
});
