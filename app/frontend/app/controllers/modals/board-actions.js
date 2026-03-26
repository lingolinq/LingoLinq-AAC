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
    return !this || !this.model || !this.model.board || !this.model.board.permissions || !this.model.board.permissions.edit;
  }

  get cannot_categorize() {
    return !this || !this.appState || !this.appState.currentUser;
  }

  @action
  privacy() {
    if(!this || !this.model || !this.model.board) { return; }
    modal.open('modals/board-privacy', {board: this.model.board, button_set: this.model.board.button_set});
  }

  @action
  categorize() {
    if(!this || !this.model || !this.model.board || !this.appState) { return; }
    modal.open('modals/tag-board', {board: this.model.board, user: this.appState.currentUser});
  }

  @action
  langs() {
    if(!this || !this.model || !this.model.board) { return; }
    modal.open('modals/slice-locales', {board: this.model.board, button_set: this.model.board.button_set});
  }

  @action
  translate() {
    if(!this || !this.model || !this.model.board) { return; }
    modal.open('translation-select', {board: this.model.board, button_set: this.model.board.button_set});
  }

  @action
  swap_images() {
    if(!this || !this.model || !this.model.board) { return; }
    modal.open('swap-images', {board: this.model.board, button_set: this.model.board.button_set});
  }

  @action
  download() {
    var _this = this;
    if(!_this || !_this.model || !_this.model.board || !_this.appState) { return; }
    _this.appState.assert_source().then(function() {
      if(!_this.model || !_this.model.board) { return; }
      var brd = _this.model.board;
      var linked = brd.get && brd.get('linked_boards');
      var has_links = !!(linked && linked.length > 0);
      var board_id = (brd.get && (brd.get('key') || brd.get('id'))) || brd.id;
      modal.open('download-board', {type: 'obf', has_links: has_links, id: board_id});
    }, function() { });
  }

  @action
  batch_recording() {
    var _this = this;
    if(!_this || !_this.model || !_this.model.board || !_this.appState) { return; }
    modal.open('batch-recording', {user: _this.appState.currentUser, board: _this.model.board}).then(function() {
      if(!_this.model) { return; }
      _this.model.reload().then(function() {
        if(_this.model) {
          _this.model.load_button_set(true);
          editManager.process_for_displaying();
        }
      });
    });
  }

  @action
  delete() {
    if(!this || !this.model || !this.model.board) { return; }
    modal.open('confirm-delete-board', {board: this.model.board, redirect: true});
  }
}
