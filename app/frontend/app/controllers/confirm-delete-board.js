import modal from '../utils/modal';
import RSVP from 'rsvp';
import BoardHierarchy from '../utils/board_hierarchy';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { later as runLater } from '@ember/runloop';

export default class ConfirmDeleteBoardController extends modal.ModalController {
  @service('app-state') appState;
  @service store;

  @tracked hierarchy = null;
  @tracked delete_downstream = false;
  @tracked deleting = false;
  @tracked error = false;

  opening() {
    this.hierarchy = null;
    this.deleting = false;
    this.error = false;
    if(this.model.board && !this.model.orphans) {
      this.model.board.reload();
      this.hierarchy = {loading: true};
      BoardHierarchy.load_with_button_set(this.model.board, {deselect_on_different: true, prevent_keyboard: true, prevent_different: true}).then((hierarchy) => {
        this.hierarchy = hierarchy;
      }, (err) => {
        this.hierarchy = {error: true};
      });
    }
    this.delete_downstream = !!this.model.orphans;
  }

  get using_user_names() {
    return (this.model.board.using_user_names || []).join(', ');
  }

  get deleting_boards_count() {
    if(this.model.orphans) {
      return this.model.board.children.length;
    }
    var board = this.model.board;
    // TODO: this will need to work differently for shallow copies
    var other_board_ids = board.downstream_board_ids;
    if(this.hierarchy && this.hierarchy.selected_board_ids) {
      other_board_ids = this.hierarchy.selected_board_ids();
    }
    return other_board_ids.length;
  }

  @action
  deleteBoard(decision) {
    var board = this.model.board;
    this.deleting = {deleting: true};
    var load_promises = [];
    var other_board_ids = [];
    if(this.delete_downstream) {
      if(this.model.orphans) {
        other_board_ids = (this.model.board.children || []).map(function(b) { return b.board; });
      } else {
        other_board_ids = board.downstream_board_ids;
        if(this.hierarchy && !this.hierarchy.error && this.hierarchy.selected_board_ids) {
          other_board_ids = this.hierarchy.selected_board_ids();
        }  
      }  
    }
    var save = RSVP.resolve();
    var deleted_ids = [];
    if(!this.model.orphans) {
      try {
        board.deleteRecord();
        save = board.save();
        deleted_ids.push(board.id);
      } catch(e) {
        // TODO: if on the board page, it may barf when deleting the current board
      }
    }

    var other_defers = [];
    var next_defer = () => {
      var d = other_defers.shift();
      if(d) { d.start_delete(); }
    };
    other_board_ids.forEach((id) => {
      var defer = RSVP.defer();
      defer.start_delete = () => {
        var find = RSVP.resolve(id);
        if(typeof id == 'string') {
          if(deleted_ids.indexOf(id) == -1) {
            try {
              find = this.store.findRecord('board', id);
            } catch(e) {
              defer.reject({error: 'find_error', e: e});
              return;
            }
          } else {
            defer.resolve(id);
            return;
          }
        }
        find.then((b) => {
          if(board.orphan || b.user_name == board.user_name) {
            runLater(() => {
              if(this.deleting) {
                this.deleting = {deleting: true, board_key: b.key};
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

    var wait_for_deletes = save.then(function() {
      return RSVP.all_wait(other_defers.map(function(d) { return d.promise; }));
    });

    var concurrent_deletes = 5;
    for(var idx = 0; idx < concurrent_deletes; idx ++) {
      next_defer();
    }

    wait_for_deletes.then(() => {
      if(this.model.redirect) {
        this.appState.return_to_index();
      }
      modal.close({update: true});
    }, () => {
      this.deleting = false;
      this.error = true;
    });
  }
}
