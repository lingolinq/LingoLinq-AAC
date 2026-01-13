import Component from '@ember/component';
import buttonTracker from '../utils/raw_events';
import app_state from '../utils/app_state';
import editManager from '../utils/edit_manager';
import capabilities from '../utils/capabilities';
import { htmlSafe } from '@ember/template';
import stashes from '../utils/_stashes';

export default Component.extend({
  didInsertElement: function() {
    if(app_state.get('speak_mode')) {
      var elem = document.getElementsByClassName('board')[0];
      var board = editManager.controller && editManager.controller.get('model');
      if(board && board.get('id') == elem.getAttribute('data-id')) {
        board.set_fast_html({
          width: editManager.controller.get('width'),
          height: editManager.controller.get('height'),
          inflection_prefix: app_state.get('inflection_prefix'),
          inflection_shift: app_state.get('inflection_shift'),
          skin: app_state.get('referenced_user.preferences.skin'),
          symbols: app_state.get('referenced_user.preferences.preferred_symbols'),
          label_locale: app_state.get('label_locale'),
          display_level: board.get('display_level'),
          revision: editManager.controller.get('model.current_revision'),
          html: htmlSafe(elem.innerHTML)
        });
      }
    }
  }
});
