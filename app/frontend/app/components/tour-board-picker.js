import Component from '@ember/component';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import modal from '../utils/modal';
import { assignVocalFlair84AsHome } from '../utils/assign-vocal-flair-home';

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

  /*
   * The user the board pick is FOR.
   *
   * Reads `appState.setup_user` FIRST: the standalone picker resolves
   * `?user_id=<supervisee>` into it (controllers/board-picker#_resolve_setup_user),
   * and the pick path already honors it — board-preview-overlay.js:266 is
   * `app_state.get('setup_user') || app_state.get('currentUser')`. Reading
   * currentUser alone would send a supervisor's "Assign a Home Board For Me" to
   * their OWN account while "Pick this Board" went to the supervisee.
   *
   * A computed rather than an init-time snapshot, because this modal stays
   * mounted across a board-preview overlay and across communicator switches,
   * both of which can move the target user.
   */
  setup_user: computed('appState.setup_user', 'appState.currentUser', function() {
    return this.get('appState.setup_user') || this.get('appState.currentUser');
  }),

  willDestroy: function() {
    /*
     * Disarm only what THIS modal armed. routes/board-picker.js owns the same
     * flag for a whole route visit (activate -> true, deactivate -> false), and
     * the tour opens on top of that route. Clearing unconditionally would strand
     * the picker behind us with card taps routing to Speak Mode instead of the
     * preview, with no way to re-arm short of leaving and re-entering the route.
     */
    if (!this._tour_flag_preexisting) {
      this.set('appState.tour_board_picker_active', false);
    }
    this._super.apply(this, arguments);
  },

  /*
   * ONE init. There used to be two `init` keys in this object literal — the
   * first held the flag-arming below. In a JS object literal the LAST key wins,
   * so the first never ran, and the flag was never armed. Merged 2026-08-11;
   * keep it single.
   */
  init() {
    this._super(...arguments);
    var self = this;

    /*
     * Mark the board-picker tour flow as active while this modal is open. A
     * board "Preview" opened from here (the overlay stacks ON TOP of this modal,
     * which stays mounted) reads the flag to switch to the "Pick this Board" CTA
     * (board-preview.js#tour_pick), and board-icon.js:416 uses it to open the
     * preview rather than navigating the user away to Speak Mode.
     */
    this._tour_flag_preexisting = !!this.get('appState.tour_board_picker_active');
    this.set('appState.tour_board_picker_active', true);

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
      assignVocalFlair84AsHome(user, {
        locale: _this.get('appState.label_locale'),
        onSuccess: function() {
          if (_this.get('persistence') && _this.get('persistence').get('online') && _this.get('persistence').get('auto_sync')) {
            _this.get('persistence').sync('self', null, null, 'home_board_changed').then(null, function() { });
          }
          modal.close();
          _this.get('appState').return_to_index();
        }
      }).catch(function() {
        _this.set('assigning_home_board', false);
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
