import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';
import { computed } from '@ember/object';
import { schedule } from '@ember/runloop';
import { getOwner } from '@ember/application';
import modal from '../utils/modal';

export default Component.extend({
  tagName: '',
  appState: service('app-state'),
  app_state: alias('appState'),

  /* Whose home board "Help me Choose" is about to pick. This card is rendered
     with @user (dashboard/authenticated-view.hbs), which is the communicator a
     supporter is viewing — not necessarily the signed-in account. The
     board-picker keys its supervisor flow off this as a `user_id` query param
     (controllers/board-picker#_resolve_setup_user); null on your own account, so
     Ember drops the param and the picker runs its self flow. Global id, not
     user_name — the picker compares the param against `setup_user.id`. */
  homeBoardPickerUserId: computed('user.id', 'appState.currentUser.id', function() {
    var card_user_id = this.get('user.id');
    if(!card_user_id || card_user_id === this.get('appState.currentUser.id')) { return null; }
    return card_user_id;
  }),

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

    var owner = getOwner(this);
    var c = owner && owner.lookup('controller:user/index');
    this.set('boardsCtrl', c);
    this.primeBoardsController();
  },

  didInsertElement() {
    this._super(...arguments);
    if (!this.get('boardsCtrl')) {
      var owner = getOwner(this);
      var c = owner && owner.lookup('controller:user/index');
      if (c) {
        this.set('boardsCtrl', c);
      }
    }
    if (this.get('isActive')) {
      this.syncBoardsControllerModel();
    }
  },

  didReceiveAttrs() {
    this._super(...arguments);
    if (this.get('isActive')) {
      schedule('afterRender', this, this.syncBoardsControllerModel);
    }
  },

  boardsController() {
    return this.get('boardsCtrl') || (getOwner(this) && getOwner(this).lookup('controller:user/index'));
  },

  primeBoardsController() {
    var user = this.get('user');
    var c = this.boardsController();
    if (!user || !this.get('isActive') || !c) {
      return;
    }
    c.set('model', user);
    c.set('parent_object', null);
    try {
      c.update_selected();
    } catch (e) { /* offline observer may no-op */ }
  },

  syncBoardsControllerModel() {
    var user = this.get('user');
    var c = this.boardsController();
    if (!user || !this.get('isActive') || !c) {
      return;
    }
    var prevId = c.get('model.id');
    c.set('model', user);
    c.set('parent_object', null);
    if (prevId !== user.get('id')) {
      c.set('filterString', '');
      c.set('filterStringDebounced', '');
      c.set('boards_display_limit', null);
      c.set('show_all_boards', false);
    }
    try {
      c.update_selected();
    } catch (e) { /* noop */ }
    if (typeof user.reload === 'function') {
      user.reload().then(
        function() {
          c.update_selected();
          try {
            c.reload_logs();
            c.load_badges();
            c.load_goals();
          } catch (e) { /* noop */ }
        },
        function() {
          c.update_selected();
        }
      );
    }
  },

  actions: {
    recordNoteEmbed(type) {
      var c = this.boardsController();
      var u = c && c.get('model');
      if (!u) {
        return;
      }
      this.get('appState').check_for_needing_purchase().then(
        function() {
          modal.open('record-note', { note_type: type, user: u }).then(
            function() {
              try {
                if (c && c.reload_logs) {
                  c.reload_logs();
                }
              } catch (e) { /* noop */ }
            }.bind(this),
            function() { }
          );
        }.bind(this),
        function() {
          modal.open('record-note', { note_type: type, user: u });
        }
      );
    }
  }
});
