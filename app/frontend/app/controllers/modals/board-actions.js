import modal from '../../utils/modal';
import app_state from '../../utils/app_state';
import utterance from '../../utils/utterance';
import RSVP from 'rsvp';
import stashes from '../../utils/_stashes';
import { computed } from '@ember/object';
import LingoLinq from '../../app';
import editManager from '../../utils/edit_manager';

export default modal.ModalController.extend({
  opening: function() {
  },
  cannot_edit: computed('model.board.permissions.edit', function() {
    return !this.get('model.board.permissions.edit');
  }),
  cannot_categorize: computed('app_state.current_user', function() {
    return !app_state.get('currentUser');
  }),
  actions: {
    privacy: function() {
      modal.open('modals/board-privacy', {board: this.get('model.board'), button_set: this.get('model.board.button_set')});
    },
    categorize: function() {
      modal.open('modals/tag-board', {board: this.get('model.board'), user: app_state.get('currentUser')});
    },
    langs: function() {
      modal.open('modals/slice-locales', {board: this.get('model.board'), button_set: this.get('model.board.button_set')});
    },
    translate: function() {
      modal.open('translation-select', {board: this.get('model.board'), button_set: this.get('model.board.button_set')});
    },
    swap_images: function() {
      modal.open('swap-images', {board: this.get('model.board'), button_set: this.get('model.board.button_set')});
    },
    download: function() {
      var _this = this;
      app_state.assert_source().then(function() {
        var has_links = _this.get('model.board.linked_boards').length > 0;
        modal.open('download-board', {type: 'obf', has_links: has_links, id: _this.get('model.board.id')});
      }, function() { });
    },
    batch_recording: function() {
      var _this = this;
      modal.open('batch-recording', {user: app_state.get('currentUser'), board: this.get('model.board')}).then(function() {
        _this.get('model').reload().then(function() {
          _this.get('model').load_button_set(true);
          editManager.process_for_displaying();
        });
      });
    },
    delete: function() {
      modal.open('confirm-delete-board', {board: this.get('model.board'), redirect: true});
    }
  }
});
