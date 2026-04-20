import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modalUtil from '../utils/modal';
import editManager from '../utils/edit_manager';
import i18n from '../utils/i18n';

/**
 * Import board from pasted HTML (LingoLinq board speak/edit view).
 * Calls POST /api/v1/boards/from_html with html, optional name, key, locale.
 */
export default Component.extend({
  persistence: service('persistence'),
  router: service('router'),
  appState: service('app-state'),
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    this.set('html', '');
    this.set('name', '');
    this.set('status', null);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
    },
    importFromHtml() {
      var _this = this;
      var html = (this.get('html') || '').trim();
      if(!html) {
        this.set('status', { error: i18n.t('html_required', "Please paste the board HTML.") });
        return;
      }
      this.set('status', { saving: true });

      var payload = {
        html: html,
        name: (this.get('name') || '').trim() || undefined,
        locale: 'en'
      };
      var body = JSON.stringify(payload);

      var persistenceService = this.get('persistence') || window.persistence;
      if(!persistenceService || !persistenceService.ajax) {
        this.set('status', { error: i18n.t('app_not_ready', "App is not ready. Please try again.") });
        return;
      }

      var url = '/api/v1/boards/from_html';
      var req = {
        type: 'POST',
        contentType: 'application/json',
        data: body
      };

      persistenceService.ajax(url, req).then(function(res) {
        var board = res && res.board;
        if(board && board.key) {
          _this.set('status', null);
          modalUtil.close(true);
          editManager.auto_edit(board.id);
          _this.appState.set('referenced_board', { id: board.id, key: board.key });
          var parts = (board.key || '').split('/');
          if (parts.length >= 2) {
            _this.get('router').transitionTo('user.board-detail', parts[0], parts.slice(1).join('/'));
          } else {
            _this.get('router').transitionTo('board', board.key);
          }
        } else {
          _this.set('status', {
            error: (res && res.error) || i18n.t('import_failed', "Import failed")
          });
        }
      }, function(xhr) {
        var msg = i18n.t('import_failed', "Import failed");
        if(xhr && xhr.responseJSON && xhr.responseJSON.error) {
          msg = xhr.responseJSON.error;
        } else if(xhr && xhr.responseText) {
          try {
            var j = JSON.parse(xhr.responseText);
            if(j && j.error) { msg = j.error; }
          } catch(e) {}
        }
        _this.set('status', { error: msg });
      });
    }
  }
});
