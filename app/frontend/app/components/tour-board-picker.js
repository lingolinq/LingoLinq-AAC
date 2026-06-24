import Component from '@ember/component';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import LingoLinq from '../app';
import modal from '../utils/modal';

// Final step of the board-picker guided tour, rendered as an almost full-screen
// modal: a LIVE, interactive board-picker so the user can actually assign, create,
// or browse/pick a board. The two action buttons mirror controllers/board-picker
// (assign_default_home_board / create_new_board); the create one additionally
// sets `appState.from_tour_board_picker` so the create-board-new page knows the
// user arrived from this tour modal. Browsing/picking a board is handled by the
// embedded {{board-picker}} component (→ board-icon → board-preview) as usual.
export default Component.extend({
  tagName: '',
  modalService: service('modal'),
  appState: service('app-state'),
  router: service('router'),
  persistence: service('persistence'),
  assigning_home_board: false,

  // The user the board pick is FOR — the signed-in user (mirrors the standalone
  // board-picker route's setupController, which sets setup_user = currentUser).
  setup_user: null,

  init: function() {
    this._super(...arguments);
    this.set('setup_user', this.get('appState.currentUser'));
    // Mark the board-picker tour flow as active for as long as this modal is
    // open. A board "Preview" opened from here (the board-preview overlay stacks
    // ON TOP of this modal, which stays mounted) reads this flag to switch to the
    // "Pick this Board" CTA and to return here on close (board-preview.js /
    // board-preview-overlay.js). Cleared in willDestroy (the modal truly closing).
    this.set('appState.tour_board_picker_active', true);
  },

  willDestroy: function() {
    this.set('appState.tour_board_picker_active', false);
    this._super.apply(this, arguments);
  },
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
  },


  actions: {
    opening: function() {},
    closing: function() {},
    close: function() {
      modal.close();
    },
    // Mirrors controllers/board-picker#assign_default_home_board: find the public
    // "Vocal Flair 84" catalog board, set it as this user's home board, sync, and
    // return to the dashboard (closing the modal on the way).
    assign_default_home_board: function() {
      var _this = this;
      var user = this.get('setup_user');
      if (!user || !user.save) {
        modal.error(i18n.t('set_as_home_failed', "Home board update failed unexpectedly"));
        return;
      }
      this.set('assigning_home_board', true);
      LingoLinq.store.query('board', { q: 'Vocal Flair 84', public: true, per_page: 10 }).then(function(results) {
        var list = (results && results.slice) ? results.slice() : (results || []);
        var pick = function(re) {
          for (var i = 0; i < list.length; i++) {
            if (re.test((list[i].get('key') || ''))) { return list[i]; }
          }
          return null;
        };
        var board = pick(/(^|\/)vocal-flair-84$/) || pick(/vocal-flair-84/) || list[0];
        if (!board) {
          _this.set('assigning_home_board', false);
          modal.error(i18n.t('home_board_assign_not_found', "We couldn't find the recommended home board. Please pick one below."));
          return;
        }
        user.set('preferences.home_board', {
          id: board.get('id'),
          key: board.get('key'),
          locale: _this.get('appState.label_locale')
        });
        user.save().then(function() {
          if (_this.get('persistence') && _this.get('persistence').get('online') && _this.get('persistence').get('auto_sync')) {
            _this.get('persistence').sync('self', null, null, 'home_board_changed').then(null, function() { });
          }
          modal.close();
          _this.get('appState').return_to_index();
        }, function() {
          _this.set('assigning_home_board', false);
          modal.error(i18n.t('set_as_home_failed', "Home board update failed unexpectedly"));
        });
      }, function() {
        _this.set('assigning_home_board', false);
        modal.error(i18n.t('home_board_assign_not_found', "We couldn't find the recommended home board. Please pick one below."));
      });
    },
    // Mirrors controllers/board-picker#create_new_board, PLUS sets the from-tour
    // flag so create-board-new knows the user came from this tour modal.
    create_new_board: function() {
      var _this = this;
      this.set('appState.from_tour_board_picker', true);
      var go = function() {
        modal.close();
        _this.get('router').transitionTo('create-board-new');
      };
      var appState = this.get('appState');
      if (appState && appState.check_for_needing_purchase) {
        appState.check_for_needing_purchase().then(go, go);
      } else {
        go();
      }
    }
  },

  didInsertElement() {
  this._super(...arguments);
  var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
},

});
