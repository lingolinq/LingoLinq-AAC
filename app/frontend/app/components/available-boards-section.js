import Component from '@ember/component';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';

/**
 * Available Boards grid (Mine folders, filter, DnD) — used on user/boards and dashboard.
 * Pass boardsCtrl (controller:user/index) and optional filterInputId for duplicate IDs.
 */
export default Component.extend({
  tagName: '',

  appState: service('app-state'),
  modal: service('modal'),
  store: service('store'),

  /** @type {string} id attribute for filter input (avoid duplicate ids on dashboard embed). */
  filterInputId: 'ub-boards-filter-input',

  /** id for drag hint when the grid should reference it (omit when drilled into a folder). */
  boardGridAriaDescribedby: computed(
    'boardsCtrl.mine_selected',
    'boardsCtrl.model.permissions.edit',
    'boardsCtrl.mineFoldersEnabled',
    'boardsCtrl.mineTagFolderDrillIn',
    'filterInputId',
    function() {
      var c = this.get('boardsCtrl');
      if (!c || !c.get('mine_selected') || !c.get('model.permissions.edit') || !c.get('mineFoldersEnabled')) {
        return null;
      }
      if (c.get('mineTagFolderDrillIn')) {
        return null;
      }
      var fid = this.get('filterInputId') || 'ub-boards-filter-input';
      return fid + '-mine-drag-hint';
    }
  ),

  dragBoardId: null,
  dragSourceTag: null,

  actions: {
    folderDragOver(tag, event) {
      if (event && event.preventDefault) { event.preventDefault(); }
      if (event && event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
    },
    folderDragEnter(tag, event) {
      if (event && event.preventDefault) { event.preventDefault(); }
      var el = event && event.currentTarget;
      if (el && el.classList) { el.classList.add('ub-boards-page__tag-folder--dropping'); }
    },
    folderDragLeave(tag, event) {
      var el = event && event.currentTarget;
      if (el && el.classList) { el.classList.remove('ub-boards-page__tag-folder--dropping'); }
    },
    folderDrop(tag, event) {
      if (event && event.preventDefault) { event.preventDefault(); }
      var el = event && event.currentTarget;
      if (el && el.classList) { el.classList.remove('ub-boards-page__tag-folder--dropping'); }
      var raw = event && event.dataTransfer ? event.dataTransfer.getData('text/plain') : '';
      var parts = (raw || '').split('|');
      var boardId = parts[0];
      var sourceTag = parts[1] || '';
      var ctrl = this.get('boardsCtrl');
      var user = ctrl && ctrl.get('model');
      if (!user || !boardId) { return; }
      var store = this.get('store');
      var modalSvc = this.get('modal');
      if (!store) { return; }
      store.findRecord('board', boardId).then(function(board) {
        if (sourceTag && sourceTag !== tag) {
          return user.tag_board(board, sourceTag, true, false).then(function() {
            return user.tag_board(board, tag, false, false);
          });
        }
        return user.tag_board(board, tag, false, false);
      }).catch(function() {
        modalSvc.error(i18n.t('folder_tag_failed', "Could not update folder for this board."));
      });
    },
    boardDragStart(board, event) {
      var ctrl = this.get('boardsCtrl');
      var tag = ctrl && ctrl.get('mineTagFolderDrillIn');
      var gid = board && board.get ? board.get('id') : '';
      if (event && event.dataTransfer && gid) {
        event.dataTransfer.setData('text/plain', gid + '|' + (tag || ''));
        event.dataTransfer.effectAllowed = 'copyMove';
      }
    },
    openTagBoardModal() {
      var ctrl = this.get('boardsCtrl');
      if (!ctrl) { return; }
      this.get('modal').open('modals/tag-board', {
        user: ctrl.get('model'),
        board: null,
        boardChoices: ctrl.get('model.my_boards')
      });
    }
  }
});
