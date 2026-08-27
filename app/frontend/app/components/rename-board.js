import { later as runLater } from '@ember/runloop';
import Component from '@ember/component';
import { inject as service } from '@ember/service';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import modal from '../utils/modal';
import { computed } from '@ember/object';
import boardsPageListCache from '../utils/boards_page_list_cache';

export default Component.extend({
  modal: service('modal'),
  router: service('router'),
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

    const modalService = this.get('modal');
    const template = 'rename-board';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
    this.set('status', null);
    this.set('old_key_value', '');
    this.set('new_key_value', '');
  },

  old_key: computed('model.board.key', function() {
    return (this.get('model.board.key') || '').split(/\//)[1];
  }),
  not_ready: computed('old_key', 'old_key_value', 'new_key_value', function() {
    return this.get('old_key') !== this.get('old_key_value') || !this.get('new_key_value');
  }),

  _return_to_details: function() {
    var board = this.get('model.board');
    if(board) {
      runLater(function() {
        modal.open('board-details', { board: board });
      }, 200);
    }
  },

  actions: {
    close() {
      this.get('modal').close();
      this._return_to_details();
    },
    opening() {},
    closing() {},
    nothing() {},
    rename() {
      if (this.get('old_key') === this.get('old_key_value') && this.get('new_key_value')) {
        var _this = this;
        _this.set('status', { renaming: true });
        var user_name = _this.get('model.board.user_name');
        persistence.ajax('/api/v1/boards/' + _this.get('model.board.id') + '/rename', {
          type: 'POST',
          data: {
            old_key: user_name + '/' + _this.get('old_key_value'),
            new_key: user_name + '/' + LingoLinq.clean_path(_this.get('new_key_value'))
          }
        }).then(function(res) {
          var modalSvc = _this.get('modal');
          /* The Boards-page Mine snapshot stores each tile's `key`, and the boards page
             skips its background re-query entirely while a fresh snapshot exists (see
             controllers/user/index#generate_or_append_to_list). A rename CHANGES the key,
             so without this the tile keeps the old one and clicking it 404s for up to the
             snapshot TTL — on this device and after a hard refresh, not just in-session.

             clearSnapshots(), not clear(userId): an existing Board record carries
             `user_name` but not reliably a `for_user_id`, and snapshots are keyed by id,
             so there is no owner id to target here. A rename is rare; one re-query per
             user on this device is the right price for not serving a dead link. */
          try { boardsPageListCache.clearSnapshots(); } catch(e) { /* non-critical */ }
          modalSvc.close();
          // Reload the board model so Board Details shows updated key
          var board = _this.get('model.board');
          if(board && board.reload) {
            board.reload().then(function() {
              _this._return_to_details();
            }, function() {
              _this._return_to_details();
            });
          } else {
            _this._return_to_details();
          }
        }, function() {
          _this.set('status', { error: true });
        });
      }
    }
  }
});
