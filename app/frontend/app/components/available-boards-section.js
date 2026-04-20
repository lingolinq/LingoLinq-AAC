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
  persistence: service('persistence'),
  store: service('store'),

  /** @type {string} id attribute for filter input (avoid duplicate ids on dashboard embed). */
  filterInputId: 'ub-boards-filter-input',

  editingFolderName: false,
  editFolderNameValue: '',
  confirmingFolderDelete: false,
  folderFilterString: '',

  filteredFolderSummaries: computed(
    'boardsCtrl.mineTagFolderSummaries.[]',
    'folderFilterString',
    function() {
      var summaries = this.get('boardsCtrl.mineTagFolderSummaries') || [];
      var filter = (this.get('folderFilterString') || '').trim();
      if (!filter) { return summaries; }
      var re = null;
      try { re = new RegExp(filter, 'i'); } catch (e) { return summaries; }
      var ctrl = this.get('boardsCtrl');
      return summaries.filter(function(folder) {
        if (folder.tag.match(re)) { return true; }
        var map = ctrl && ctrl.get('model.board_tag_map');
        if (!map) { return false; }
        var ids = map[folder.tag] || [];
        return ids.some(function(gid) {
          var b = ctrl._findMineBoardByGlobalId && ctrl._findMineBoardByGlobalId(gid);
          if (!b) { return false; }
          var name = b.get ? b.get('name') : (b.name || '');
          var key = b.get ? b.get('key') : (b.key || '');
          return (name && name.match(re)) || (key && key.match(re));
        });
      });
    }
  ),

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
      if (event && event.stopPropagation) { event.stopPropagation(); }
      var el = event && event.currentTarget;
      if (el && el.classList) {
        el.classList.remove('ub-boards-page__tag-folder--dropping');
      }
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
      }).then(function() {
        // Force board list to recompute and update filtered results
        if (ctrl) {
          ctrl.notifyPropertyChange('model.board_tag_map');
          ctrl.notifyPropertyChange('board_list');
          var bl = ctrl.get('board_list');
          if (bl) {
            ctrl.set('last_filtered_results_key', bl.filtered_results_key);
            ctrl.set('filtered_results', bl.filtered_results);
          }
        }
        // Ember re-renders the folder list after the API call updates the model.
        // Wait for the next render cycle, then find the fresh DOM element and animate it.
        setTimeout(function() {
          var folders = document.querySelectorAll('.ub-boards-page__tag-folder');
          var freshEl = null;
          folders.forEach(function(f) {
            var nameEl = f.querySelector('.ub-boards-page__tag-folder-name');
            if (nameEl && nameEl.textContent.trim() === tag) {
              freshEl = f;
            }
          });
          if (freshEl) {
            freshEl.classList.add('ub-boards-page__tag-folder--animating');
            setTimeout(function() {
              freshEl.classList.remove('ub-boards-page__tag-folder--animating');
            }, 1500);
          }
          // Keep hover disabled for 5 seconds after drop animation
          var strip = document.querySelector('.ub-boards-page__folder-strip');
          if (strip) { strip.classList.add('ub-boards-page__folder-strip--no-hover'); }
          setTimeout(function() {
            if (strip) { strip.classList.remove('ub-boards-page__folder-strip--no-hover'); }
          }, 5000);
        }, 100);
      }).catch(function() {
        modalSvc.error(i18n.t('folder_tag_failed', "Could not update folder for this board."));
      });
    },
    boardDragStart(board, event) {
      var strip = document.querySelector('.ub-boards-page__folder-strip');
      if (strip) { strip.classList.add('ub-boards-page__folder-strip--no-hover'); }
      var ctrl = this.get('boardsCtrl');
      var tag = ctrl && ctrl.get('mineTagFolderDrillIn');
      var gid = board && board.get ? board.get('id') : '';
      if (event && event.dataTransfer && gid) {
        event.dataTransfer.setData('text/plain', gid + '|' + (tag || ''));
        event.dataTransfer.effectAllowed = 'copyMove';
      }
    },
    updateFolderFilter(event) {
      this.set('folderFilterString', event.target.value || '');
    },
    clearFolderFilter() {
      this.set('folderFilterString', '');
    },
    emptyFolderDragOver(event) {
      if (event && event.preventDefault) { event.preventDefault(); }
      if (event && event.dataTransfer) { event.dataTransfer.dropEffect = 'copy'; }
    },
    emptyFolderDrop(event) {
      if (event && event.preventDefault) { event.preventDefault(); }
      var raw = event && event.dataTransfer ? event.dataTransfer.getData('text/plain') : '';
      var parts = (raw || '').split('|');
      var boardId = parts[0];
      var ctrl = this.get('boardsCtrl');
      if (!ctrl || !boardId) { return; }
      var store = this.get('store');
      var modalSvc = this.get('modal');
      if (!store) { return; }
      store.findRecord('board', boardId).then(function(board) {
        modalSvc.open('modals/tag-board', {
          user: ctrl.get('model'),
          board: board,
          boardChoices: ctrl.get('model.my_boards'),
          skipReturnToDetails: true
        });
      });
    },
    openTagBoardModal() {
      var ctrl = this.get('boardsCtrl');
      if (!ctrl) { return; }
      this.get('modal').open('modals/tag-board', {
        user: ctrl.get('model'),
        board: null,
        boardChoices: ctrl.get('model.my_boards')
      });
    },
    startFolderRename() {
      var ctrl = this.get('boardsCtrl');
      var currentName = ctrl && ctrl.get('mineTagFolderDrillIn');
      this.set('editFolderNameValue', currentName || '');
      this.set('editingFolderName', true);
      setTimeout(function() {
        var input = document.querySelector('.ub-boards-page__folder-rename-input');
        if (input) { input.focus(); input.select(); }
      }, 50);
    },
    cancelFolderRename() {
      this.set('editingFolderName', false);
      this.set('editFolderNameValue', '');
    },
    saveFolderRename() {
      var _this = this;
      var ctrl = this.get('boardsCtrl');
      var user = ctrl && ctrl.get('model');
      var oldName = ctrl && ctrl.get('mineTagFolderDrillIn');
      var newName = (this.get('editFolderNameValue') || '').trim();
      if (!newName || !user || !oldName || newName === oldName) {
        this.set('editingFolderName', false);
        return;
      }

      // Single API call to rename the folder key on the server
      this.get('persistence').ajax('/api/v1/users/' + user.get('id') + '/board_tags/rename', {
        type: 'POST',
        data: { old_tag: oldName, new_tag: newName }
      }).then(function(res) {
        if (res && res.board_tag_map) {
          user.set('board_tag_map', res.board_tag_map);
        }
        if (res && res.board_tags) {
          user.set('board_tags', res.board_tags);
        }
        _this.set('editingFolderName', false);
        _this.set('editFolderNameValue', '');
        ctrl.set('mineTagFolderDrillIn', newName);

        ctrl.notifyPropertyChange('model.board_tag_map');
        ctrl.notifyPropertyChange('model.board_tags');
        ctrl.notifyPropertyChange('board_list');
        var bl = ctrl.get('board_list');
        if (bl) {
          ctrl.set('last_filtered_results_key', bl.filtered_results_key);
          ctrl.set('filtered_results', bl.filtered_results);
        }
      }, function(err) {
        console.error('Folder rename failed:', err);
        _this.set('editingFolderName', false);
      });
    },
    startDeleteFolder(event) {
      var btn = event && event.target;
      if (btn) {
        var rect = btn.getBoundingClientRect();
        var top = rect.bottom + 8;
        document.documentElement.style.setProperty('--delete-folder-top', top + 'px');
      }
      this.set('confirmingFolderDelete', true);
    },
    cancelDeleteFolder() {
      this.set('confirmingFolderDelete', false);
    },
    confirmDeleteFolder() {
      var _this = this;
      var ctrl = this.get('boardsCtrl');
      var user = ctrl && ctrl.get('model');
      var tag = ctrl && ctrl.get('mineTagFolderDrillIn');
      if (!user || !tag) { return; }

      this.get('persistence').ajax('/api/v1/users/' + user.get('id') + '/board_tags/delete', {
        type: 'POST',
        data: { tag: tag }
      }).then(function(res) {
        if (res && res.board_tag_map) {
          user.set('board_tag_map', res.board_tag_map);
        }
        if (res && res.board_tags) {
          user.set('board_tags', res.board_tags);
        }
        _this.set('confirmingFolderDelete', false);
        ctrl.set('mineTagFolderDrillIn', null);
        ctrl.set('show_all_boards', false);
        ctrl.set('boards_display_limit', null);
        ctrl.notifyPropertyChange('model.board_tag_map');
        ctrl.notifyPropertyChange('model.board_tags');
        ctrl.notifyPropertyChange('board_list');
        var bl = ctrl.get('board_list');
        if (bl) {
          ctrl.set('last_filtered_results_key', bl.filtered_results_key);
          ctrl.set('filtered_results', bl.filtered_results);
        }
      }, function(err) {
        console.error('Folder delete failed:', err);
        _this.set('confirmingFolderDelete', false);
      });
    },
    exitMineFolderTag() {
      var ctrl = this.get('boardsCtrl');
      if (!ctrl) { return; }
      ctrl.set('mineTagFolderDrillIn', null);
      ctrl.set('show_all_boards', false);
      ctrl.set('boards_display_limit', null);
      var bl = ctrl.get('board_list');
      if (bl) {
        ctrl.set('last_filtered_results_key', bl.filtered_results_key);
        ctrl.set('filtered_results', bl.filtered_results);
      }
    }
  }
});
