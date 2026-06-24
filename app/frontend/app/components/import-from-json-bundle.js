import Component from '@ember/component';
import EmberObject from '@ember/object';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import modalUtil from '../utils/modal';
import editManager from '../utils/edit_manager';
import i18n from '../utils/i18n';

/**
 * Import a linked board set from a JSON bundle (CoughDrop/LingoLinq API export).
 * Uploads the file to remote storage, then POST /api/v1/boards/from_json_bundle?url=...
 */
export default Component.extend({
  persistence: service('persistence'),
  router: service('router'),
  appState: service('app-state'),
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };

    this.set('status', null);
    this.set('fileName', null);
  },

  coughdropExportScriptUrl: computed(function() {
    if(typeof window === 'undefined') {
      return '';
    }
    return window.location.origin + '/migration/coughdrop-export.js';
  }),

  coughdropExportBookmarkletHref: computed('coughdropExportScriptUrl', function() {
    var scriptUrl = this.get('coughdropExportScriptUrl');
    if(!scriptUrl) {
      return '#';
    }
    var loader = "void(function(){var s=document.createElement('script');s.src=" + JSON.stringify(scriptUrl) + ";(document.body||document.documentElement).appendChild(s);})()";
    return 'javascript:' + loader;
  }),

  coughdropExportBookmarkletInstallerUrl: computed(function() {
    if(typeof window === 'undefined') {
      return '';
    }
    return window.location.origin + '/migration/coughdrop-bookmarklet.html';
  }),

  normalizeBookmarkletUrl(url) {
    if(!url || typeof url !== 'string') {
      return url;
    }
    return url.replace(/^unsafe:/i, '');
  },

  fileInputElement(event) {
    if(event && event.target && event.target.files) {
      return event.target;
    }
    if(typeof document !== 'undefined') {
      return document.getElementById('import_json_bundle_file');
    }
    return null;
  },

  navigateToImportedBoard(board) {
    if(!board || !board.key) { return; }
    modalUtil.close(true);
    editManager.auto_edit(board.id);
    this.appState.set('referenced_board', { id: board.id, key: board.key });
    var parts = (board.key || '').split('/');
    if(parts.length >= 2) {
      this.get('router').transitionTo('user.board-detail', parts[0], parts.slice(1).join('/'));
    } else {
      this.get('router').transitionTo('board', board.key);
    }
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
    },
    fileSelected(event) {
      var input = this.fileInputElement(event);
      var file = input && input.files && input.files[0];
      if(!file) { return; }
      this.set('fileName', file.name);
      this.set('status', null);
      this.set('selectedFile', file);
    },
    preventBookmarkletClick(event) {
      event.preventDefault();
      modalUtil.notice(i18n.t('coughdrop_export_drag_help', "Drag this button to your bookmarks bar. Do not click it here — use it on CoughDrop while viewing your home board."));
    },
    dragBookmarklet(event) {
      var href = this.normalizeBookmarkletUrl(this.get('coughdropExportBookmarkletHref'));
      if(!href || href === '#' || !event || !event.dataTransfer) {
        return;
      }
      event.dataTransfer.setData('text/uri-list', href);
      event.dataTransfer.setData('text/plain', href);
    },
    openBookmarkletInstaller() {
      var url = this.get('coughdropExportBookmarkletInstallerUrl');
      if(url) {
        window.open(url, '_blank', 'noopener');
      }
    },
    copyCoughdropExportBookmarklet() {
      var href = this.normalizeBookmarkletUrl(this.get('coughdropExportBookmarkletHref'));
      if(!href || href === '#') {
        return;
      }
      if(navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(href).then(function() {
          modalUtil.notice(i18n.t('coughdrop_export_copied', "Bookmark link copied. Create a new bookmark and paste the copied text as the web address."));
        }, function() {
          modalUtil.error(i18n.t('coughdrop_export_copy_failed', "Could not copy to the clipboard."));
        });
      } else {
        modalUtil.notice(i18n.t('coughdrop_export_drag_help', "Drag this button to your bookmarks bar. Do not click it here — use it on CoughDrop while viewing your home board."));
      }
    },
    importFromJsonBundle() {
      var _this = this;
      var file = this.get('selectedFile');
      if(!file) {
        var input = this.fileInputElement();
        file = input && input.files && input.files[0];
      }
      if(!file) {
        this.set('status', { error: i18n.t('json_bundle_required', "Please choose a JSON bundle file.") });
        return;
      }

      var cg = window.cg;
      if(!cg || !cg.upload_for_processing) {
        this.set('status', { error: i18n.t('app_not_ready', "App is not ready. Please try again.") });
        return;
      }

      var reader = new FileReader();
      reader.onload = function(loadEvent) {
        try {
          var bundle = JSON.parse(loadEvent.target.result);
          if(!bundle || !Array.isArray(bundle.boards) || bundle.boards.length === 0) {
            _this.set('status', { error: i18n.t('invalid_json_bundle', "The selected file is not a valid JSON bundle.") });
            return;
          }
        } catch(e) {
          _this.set('status', { error: i18n.t('invalid_json_bundle', "The selected file is not valid JSON.") });
          return;
        }

        _this.set('status', { saving: true });
        var progressor = EmberObject.create();
        modalUtil.close(true);
        modalUtil.open('importing-boards', progressor);

        cg.upload_for_processing(file, '/api/v1/boards/from_json_bundle', {}, progressor, {
          blob: file
        }).then(function(boards) {
          if(boards && boards.error) {
            modalUtil.close();
            if(boards.error.protected) {
              modalUtil.error(i18n.t('protected_import_failed', "Board Import Failed: Protected Materials cannot be imported"));
            } else {
              modalUtil.error(boards.error.message || i18n.t('import_failed', "Import failed"));
            }
            return;
          }

          var first = boards && boards[0];
          var board = first && (first.board || first);
          if(board && board.key) {
            _this.navigateToImportedBoard(board);
          } else if(modalUtil.is_open('importing-boards')) {
            modalUtil.close();
            modalUtil.notice(i18n.t('boards_imported', "Board(s) successfully imported!"));
          }
        }, function() {
          if(modalUtil.is_open('importing-boards')) {
            modalUtil.close();
          }
          modalUtil.error(i18n.t('upload_failed', "Upload failed"));
        });
      };
      reader.onerror = function() {
        _this.set('status', { error: i18n.t('invalid_json_bundle', "The selected file is not valid JSON.") });
      };
      reader.readAsText(file);
    }
  }
});
