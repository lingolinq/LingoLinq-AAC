import Component from '@ember/component';
import { computed } from '@ember/object';
import { reads } from '@ember/object/computed';

/**
 * "Boards on This Device": the boards page's list while offline (components/boards-browser.hbs, Traci 2026-11-16;
 * docs/task-management/2026-11-16_offline-boards-page.md). The same tile markup as the online grid
 * (components/available-boards-section.hbs, `ub-boards-page__board-item` + BoardIcon), so each layout's styles apply,
 * without what needs a server: no drag, no remove, no Set Home mode; a tap opens the board.
 *
 * @param {Array}      boards     — controller.offline_boards (utils/offline_board_list.js device_board_list)
 * @param {Controller} boardsCtrl — the user/index controller (open_board_in_user_view, the home board key, persistence.online)
 */
export default Component.extend({
  tagName: '',

  init() {
    this._super(...arguments);
    var self = this;
    this.onOpen = function(item) {
      var ctrl = self.get('boardsCtrl');
      if(ctrl) { ctrl.send('open_board_in_user_view', item); }
    };
  },

  // Back online, this list stays up until the server list arrives (controllers/user/index.js end_device_view_online),
  // so the status line says "You're offline" only while offline (Traci, 2026-11-21).
  online: reads('boardsCtrl.persistence.online'),

  // Each tile's board record and whether it is the home board. BoardIcon gets the record itself: it unwraps
  // {board} only for a copy cluster (one with `children`, components/board-icon.js set_board_record).
  items: computed('boards.[]', 'boardsCtrl.model.preferences.home_board.key', function() {
    var home = this.get('boardsCtrl.model.preferences.home_board.key');
    var list = this.get('boards');
    if(!list || !list.map) { return []; }
    return list.map(function(board) { return { board: board, home: !!home && board.get('key') === home }; });
  })
});
