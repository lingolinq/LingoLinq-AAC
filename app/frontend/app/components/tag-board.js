import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import i18n from '../utils/i18n';
import modalUtil from '../utils/modal';

/**
 * Tag Board Modal Component
 *
 * Converted from modals/tag-board template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/tag-board';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('tag', '');
    this.set('downstream', false);
    this.set('status', null);
    this.set('pickedBoardId', null);
  },

  boardChoicesList: computed('model.boardChoices', function() {
    var c = this.get('model.boardChoices');
    if (!c || !c.forEach) { return []; }
    return c;
  }),

  boardForTag: computed('model.board', 'pickedBoardId', 'model.boardChoices', function() {
    var b = this.get('model.board');
    if (b) { return b; }
    var id = this.get('pickedBoardId');
    if (!id) { return null; }
    var boards = this.get('model.boardChoices');
    if (!boards || !boards.forEach) { return null; }
    var found = null;
    boards.forEach(function(brd) {
      if (brd && brd.get && brd.get('id') === id) { found = brd; }
    });
    return found;
  }),

  not_ready: computed('tag', 'model.board', 'pickedBoardId', function() {
    if (!this.get('tag') || !this.get('tag').trim()) { return true; }
    if (!this.get('model.board') && !this.get('pickedBoardId')) { return true; }
    return false;
  }),

  _return_to_details: function() {
    var board = this.get('model.board');
    if (board) {
      runLater(function() { modalUtil.open('board-details', { board: board }); }, 200);
    }
  },

  actions: {
    close() {
      this.get('modal').close();
      this._return_to_details();
    },
    opening() {
      this.get('modal').setComponent(this);
      this.set('status', null);
      this.set('pickedBoardId', null);
      const user = this.get('model.user');
      if (user && !user.get('board_tags')) {
        user.reload();
      }
    },
    closing() {},
    nothing() {},
    choose(tagName) {
      this.set('tag', tagName);
    },
    pickBoard(event) {
      this.set('pickedBoardId', event && event.target ? event.target.value : null);
    },
    update() {
      const downstream = !!this.get('downstream');
      const _this = this;
      const board = this.get('boardForTag');
      if (!board) {
        this.set('status', { error: true });
        return;
      }
      this.set('status', { loading: true });
      this.get('model.user').tag_board(board, this.get('tag'), false, downstream).then(function() {
        _this.set('status', null);
        _this.get('modal').close();
        _this._return_to_details();
      }, function() {
        _this.set('status', { error: true });
      });
    }
  }
});
