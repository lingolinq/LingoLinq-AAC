import Component from '@ember/component';
import buttonTracker from '../utils/raw_events';
import editManager from '../utils/edit_manager';
import capabilities from '../utils/capabilities';
import { htmlSafe } from '@ember/template';
import { inject as service } from '@ember/service';

export default Component.extend({
  appState: service('app-state'),
  didInsertElement: function() {
    if(this.appState.get('speak_mode')) {
      var elem = document.getElementsByClassName('board')[0];
      var board = editManager.controller && editManager.controller.get('model');
      if(board && board.get('id') == elem.getAttribute('data-id')) {
        board.set_fast_html({
          width: editManager.controller.get('width'),
          height: editManager.controller.get('height'),
          inflection_prefix: this.appState.get('inflection_prefix'),
          inflection_shift: this.appState.get('inflection_shift'),
          skin: this.appState.get('referenced_user.preferences.skin'),
          symbols: this.appState.get('referenced_user.preferences.preferred_symbols'),
          label_locale: this.appState.get('label_locale'),
          display_level: board.get('display_level'),
          revision: editManager.controller.get('model.current_revision'),
          html: htmlSafe(elem.innerHTML)
        });
      }
    }
  }
});
