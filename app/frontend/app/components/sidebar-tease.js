import Component from '@ember/component';
import { inject as service } from '@ember/service';

/**
 * Reusable sidebar tease toggle button.
 *
 * Renders the double-chevron sidebar toggle that appears in speak mode.
 * Handles click to toggle the sidebar and keyboard accessibility.
 *
 * Usage:
 *   {{sidebar-tease}}
 *
 * Can be dropped into any page. Reads speak_mode and sidebar preferences
 * from app-state, toggles sidebar via the stashes service.
 */
export default Component.extend({
  tagName: '',
  appState: service('app-state'),
  stashes: service('stashes'),

  actions: {
    toggleSidebar() {
      var stashes = this.get('stashes');
      if (stashes) {
        stashes.persist('sidebarEnabled', !stashes.get('sidebarEnabled'));
      }
    },
    toggleSidebarTeaseKeydown(event) {
      var key = event && event.key;
      var code = event && event.keyCode;
      if (key === 'Enter' || key === ' ' || code === 13 || code === 32) {
        if (event && event.preventDefault) { event.preventDefault(); }
        this.send('toggleSidebar');
      }
    }
  }
});
