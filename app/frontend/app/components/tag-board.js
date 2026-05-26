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

  /* Plain {id, name} objects for the modern-select dropdown — the
     component reads `.id` and `.name` directly (not via Ember-Data
     getters), so we materialize a flat list from the underlying
     board records here. */
  boardChoicesList: computed('model.boardChoices', function() {
    var c = this.get('model.boardChoices');
    if (!c || !c.forEach) { return []; }
    var out = [];
    c.forEach(function(brd) {
      if (!brd) { return; }
      var id = brd.get ? brd.get('id') : brd.id;
      var name = brd.get ? brd.get('name') : brd.name;
      if (id == null) { return; }
      out.push({ id: id, name: name || id });
    });
    return out;
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

  matchingTag: computed('tag', 'model.user.board_tags', function() {
    var tag = (this.get('tag') || '').trim().toLowerCase();
    if (!tag) { return null; }
    var tags = this.get('model.user.board_tags') || [];
    var match = null;
    tags.forEach(function(t) {
      if ((t || '').toLowerCase() === tag) { match = t; }
    });
    return match;
  }),

  not_ready: computed('tag', 'model.board', 'pickedBoardId', function() {
    if (!this.get('tag') || !this.get('tag').trim()) { return true; }
    if (!this.get('model.board') && !this.get('pickedBoardId')) { return true; }
    return false;
  }),

  _return_to_details: function() {
    if (this.get('model.skipReturnToDetails')) { return; }
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
      this.set('tag', '');
      this.set('status', null);
      this.set('pickedBoardId', null);
      const modalService = this.get('modal');
      const template = 'modals/tag-board';
      const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                      (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                      this.get('model') || {};
      this.set('model', options);
      const user = this.get('model.user');
      if (user && !user.get('board_tags')) {
        user.reload();
      }
      setTimeout(function() {
        var input = document.getElementById('category');
        if (input) { input.focus(); }
      }, 300);
    },
    closing() {},
    nothing() {},
    choose(tagName) {
      this.set('tag', tagName);
    },
    /* Modern-select hands the chosen item's id directly (no event
       object), so we accept the raw id. Keeps the same downstream
       behavior — boardForTag computed depends on pickedBoardId. */
    pickBoard(boardId) {
      this.set('pickedBoardId', boardId || null);
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
      var tagName = this.get('matchingTag') || this.get('tag');
      this.get('model.user').tag_board(board, tagName, false, downstream).then(function() {
        _this.set('status', null);
        _this.get('modal').close();
        _this._return_to_details();
      }, function() {
        _this.set('status', { error: true });
      });
    }
  }
});
