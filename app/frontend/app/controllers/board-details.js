import modal from '../utils/modal';
import BoardHierarchy from '../utils/board_hierarchy';
import i18n from '../utils/i18n';
import app_state from '../utils/app_state';
import editManager from '../utils/edit_manager';
import { computed } from '@ember/object';

export default modal.ModalController.extend({
  opening: function() {
    this.set('model', this.get('model.board'));
    var _this = this;
    _this.set('hierarchy', {loading: true});
    BoardHierarchy.load_with_button_set(this.get('model')).then(function(hierarchy) {
      _this.set('hierarchy', hierarchy);
    }, function(err) {
      _this.set('hierarchy', {error: true});
    });
  },
  images_with_license: computed('model.buttons', 'model.grid', function() {
    return this.get('model.local_images_with_license');
  }),
  sounds_with_license: computed('model.buttons', 'model.grid', function() {
    return this.get('model.local_sounds_with_license');
  }),
  language: computed('model.locale', function() {
    return i18n.readable_language(this.get('model.locale'));
  }),
  multiple_locales: computed('model.locales', function() {
    return (this.get('model.locales') || []).length > 1;
  }),
  languages: computed('model.locales', function() {
    return (this.get('model.locales') || []).map(function(l) { return i18n.readable_language(l); }).join(', ');
  }),
  actions: {
    close: function() {
      modal.close();
    },
    show_licenses: function() {
      this.set('showing_licenses', true);
    },
    boardStats: function() {
      modal.open('board-stats', {board: this.get('model')});
    },
    renameBoard: function() {
      modal.open('rename-board', {board: this.get('model')});
    },
    delete: function(decision) {
      modal.open('confirm-delete-board', {board: this.get('model'), redirect: true});
    },
    button_set_words: function() {
      modal.open('button-set', {board: this.get('model'), button_set: this.get('model.button_set')});
    },
    translate: function() {
      modal.open('translation-select', {board: this.get('model'), button_set: this.get('model.button_set')});
    },
    swap_images: function() {
      modal.open('swap-images', {board: this.get('model'), button_set: this.get('model.button_set')});
    },
    privacy: function() {
      modal.open('modals/board-privacy', {board: this.get('model'), button_set: this.get('model.button_set')});
    },
    categorize: function() {
      modal.open('modals/tag-board', {board: this.get('model'), user: app_state.get('currentUser')});
    },
    batch_recording: function() {
      var _this = this;
      modal.open('batch-recording', {user: app_state.get('currentUser'), board: this.get('model')}).then(function() {
        _this.get('model').reload().then(function() {
          _this.get('model').load_button_set(true);
          editManager.process_for_displaying();
        });
      });
    }
  }
});
