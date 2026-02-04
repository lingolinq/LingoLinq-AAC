import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modalUtil from '../utils/modal';
import BoardHierarchy from '../utils/board_hierarchy';
import RSVP from 'rsvp';
import { later as runLater } from '@ember/runloop';

/**
 * Confirm Delete Board Modal Component
 *
 * Converted from confirm-delete-board template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  store: service('store'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modal = this.get('modal');
    const template = 'confirm-delete-board';
    const options = (modal && modal.getSettingsFor && modal.getSettingsFor(template)) ||
                    (modal && modal.settingsFor && modal.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('hierarchy', null);
    this.set('deleting', false);
    this.set('error', false);
    this.set('delete_downstream', !!options.orphans);
  },

  using_user_names: computed('model.board.using_user_names', function() {
    return (this.get('model.board.using_user_names') || []).join(', ');
  }),

  deleting_boards_count: computed(
    'model.orphans',
    'model.board.children',
    'model.board.downstream_board_ids',
    'hierarchy',
    'hierarchy.selected_board_ids',
    'delete_downstream',
    function() {
      if (this.get('model.orphans')) {
        return this.get('model.board.children.length');
      }
      const board = this.get('model.board');
      let other_board_ids = board.downstream_board_ids;
      const hierarchy = this.get('hierarchy');
      if (hierarchy && hierarchy.selected_board_ids) {
        other_board_ids = hierarchy.selected_board_ids();
      }
      return other_board_ids ? other_board_ids.length : 0;
    }
  ),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      const component = this;
      this.get('modal').setComponent(component);
      const model = this.get('model');
      this.set('hierarchy', null);
      this.set('deleting', false);
      this.set('error', false);
      this.set('delete_downstream', !!model.orphans);
      if (model.board && !model.orphans) {
        model.board.reload();
        this.set('hierarchy', { loading: true });
        BoardHierarchy.load_with_button_set(model.board, {
          deselect_on_different: true,
          prevent_keyboard: true,
          prevent_different: true
        }).then((hierarchy) => {
          this.set('hierarchy', hierarchy);
        }, () => {
          this.set('hierarchy', { error: true });
        });
      }
    },
    closing() {
      // Closing lifecycle
    },
    setDeleteDownstream(checked) {
      this.set('delete_downstream', checked);
    },
    deleteBoard(decision) {
      const board = this.get('model.board');
      this.set('deleting', { deleting: true });
      const load_promises = [];
      let other_board_ids = [];
      if (this.get('delete_downstream')) {
        if (this.get('model.orphans')) {
          other_board_ids = (this.get('model.board.children') || []).map(function(b) { return b.board; });
        } else {
          other_board_ids = board.downstream_board_ids;
          const hierarchy = this.get('hierarchy');
          if (hierarchy && !hierarchy.error && hierarchy.selected_board_ids) {
            other_board_ids = hierarchy.selected_board_ids();
          }
        }
      }
      let save = RSVP.resolve();
      const deleted_ids = [];
      if (!this.get('model.orphans')) {
        try {
          board.deleteRecord();
          save = board.save();
          deleted_ids.push(board.id);
        } catch (e) {
          // If on the board page, may barf when deleting the current board
        }
      }

      const other_defers = [];
      const _this = this;
      const next_defer = () => {
        const d = other_defers.shift();
        if (d) { d.start_delete(); }
      };
      other_board_ids.forEach((id) => {
        const defer = RSVP.defer();
        defer.start_delete = () => {
          let find = RSVP.resolve(id);
          if (typeof id === 'string') {
            if (deleted_ids.indexOf(id) === -1) {
              try {
                find = _this.store.findRecord('board', id);
              } catch (e) {
                defer.reject({ error: 'find_error', e: e });
                return;
              }
            } else {
              defer.resolve(id);
              return;
            }
          }
          find.then((b) => {
            if (board.orphan || b.user_name === board.user_name) {
              runLater(() => {
                if (_this.get('deleting')) {
                  _this.set('deleting', { deleting: true, board_key: b.key });
                }
                b.deleteRecord();
                deleted_ids.push(b.id);
                b.save().then(() => {
                  defer.resolve(b);
                }, (err) => { defer.reject(err); });
              });
            }
          }, (err) => { defer.reject(err); });
        };
        defer.promise.then(() => {
          next_defer();
        }, () => {
          next_defer();
        });
        other_defers.push(defer);
      });

      const wait_for_deletes = save.then(function() {
        return RSVP.all_wait(other_defers.map(function(d) { return d.promise; }));
      });

      const concurrent_deletes = 5;
      for (let idx = 0; idx < concurrent_deletes; idx++) {
        next_defer();
      }

      wait_for_deletes.then(() => {
        if (_this.get('model.redirect')) {
          _this.appState.return_to_index();
        }
        modalUtil.close({ update: true });
      }, () => {
        _this.set('deleting', false);
        _this.set('error', true);
      });
    }
  }
});
