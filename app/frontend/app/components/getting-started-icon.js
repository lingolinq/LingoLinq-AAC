import Component from '@ember/component';
import { computed } from '@ember/object';

/**
 * Inline SVG icon for the Getting Started modal checklist.
 * Renders a single icon by name; color is controlled by parent (currentColor).
 * Icons: check, learn, home, device, preferences, profile, subscription
 */
export default Component.extend({
  tagName: '',
  name: '',

  iconName: computed('name', function() {
    return this.get('name') || 'learn';
  })
});
