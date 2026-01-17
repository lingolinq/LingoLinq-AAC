import BoardHierarchy from '../utils/board_hierarchy';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import app_state from '../utils/app_state';
import editManager from '../utils/edit_manager';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  appState: service('app-state'),
  modal: service(),

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
      this.modal.close();
    },
    show_licenses: function() {
      this.set('showing_licenses', true);
    },
    boardStats: function() {
      this.modal.open('board-stats', {board: this.get('model')});
    },
    renameBoard: function() {
      this.modal.open('rename-board', {board: this.get('model')});
    },
    delete: function(decision) {
      this.modal.open('confirm-delete-board', {board: this.get('model'), redirect: true});
    },
    button_set_words: function() {
      this.modal.open('button-set', {board: this.get('model'), button_set: this.get('model.button_set')});
    },
    translate: function() {
      this.modal.open('translation-select', {board: this.get('model'), button_set: this.get('model.button_set')});
    },
    swap_images: function() {
      this.modal.open('swap-images', {board: this.get('model'), button_set: this.get('model.button_set')});
    },
    privacy: function() {
      this.modal.open('modals/board-privacy', {board: this.get('model'), button_set: this.get('model.button_set')});
    },
    categorize: function() {
      this.modal.open('modals/tag-board', {board: this.get('model'), user: this.appState.get('currentUser')});
    },
    batch_recording: function() {
      var _this = this;
      this.modal.open('batch-recording', {user: this.appState.get('currentUser'), board: this.get('model')}).then(function() {
        _this.get('model').reload().then(function() {
          _this.get('model').load_button_set(true);
          editManager.process_for_displaying();
        });
      });
    }
  }
});
