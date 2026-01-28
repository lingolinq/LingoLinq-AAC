import modal from '../../utils/modal';
import { inject as service } from '@ember/service';
import utterance from '../../utils/utterance';
import RSVP from 'rsvp';
import { action } from '@ember/object';
import LingoLinq from '../../app';
import editManager from '../../utils/edit_manager';

export default class BoardActionsController extends modal.ModalController {
  @service('app-state') appState;
  
  opening() {
  }

  get cannot_edit() {
    return !this.model.board.permissions.edit;
  }

  get cannot_categorize() {
    return !this.appState.currentUser;
  }

  @action
  privacy() {
    modal.open('modals/board-privacy', {board: this.model.board, button_set: this.model.board.button_set});
  }

  @action
  categorize() {
    modal.open('modals/tag-board', {board: this.model.board, user: this.appState.currentUser});
  }

  @action
  langs() {
    modal.open('modals/slice-locales', {board: this.model.board, button_set: this.model.board.button_set});
  }

  @action
  translate() {
    modal.open('translation-select', {board: this.model.board, button_set: this.model.board.button_set});
  }

  @action
  swap_images() {
    modal.open('swap-images', {board: this.model.board, button_set: this.model.board.button_set});
  }

  @action
  download() {
    var _this = this;
    this.appState.assert_source().then(function() {
      var has_links = _this.model.board.linked_boards.length > 0;
      modal.open('download-board', {type: 'obf', has_links: has_links, id: _this.model.board.id});
    }, function() { });
  }

  @action
  batch_recording() {
    var _this = this;
    modal.open('batch-recording', {user: this.appState.currentUser, board: this.model.board}).then(function() {
      _this.model.reload().then(function() {
        _this.model.load_button_set(true);
        editManager.process_for_displaying();
      });
    });
  }

  @action
  delete() {
    modal.open('confirm-delete-board', {board: this.model.board, redirect: true});
  }
}
