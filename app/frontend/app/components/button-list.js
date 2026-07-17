import Component from '@ember/component';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default Component.extend({
  // Classic Ember component for rendering a list of buttons
  // Usage: {{button-list buttonList=button_list}}
  appState: service('app-state'),

  // Mirror board-detail's `utterance_text_on_top` exactly so the
  // classic speak bar chips honor the same user preference the board
  // grid uses (label above the image vs. below). Default 'top'.
  text_on_top: computed('appState.referenced_user.preferences.device.button_text_position', function() {
    var pos = this.get('appState.referenced_user.preferences.device.button_text_position') || 'top';
    return pos === 'top';
  })
});
