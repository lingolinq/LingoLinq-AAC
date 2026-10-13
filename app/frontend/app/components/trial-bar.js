import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed, action } from '@ember/object';
import RSVP from 'rsvp';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import { copy_or_reuse_as_home, discard_cancelled_copy } from '../utils/board-copy';
import { saveHomeBoard } from '../utils/home_board';
import { basic_try_for, clear_basic_try, after_pick_for_other } from '../utils/board_picker_landing';
import { preload_board_images } from '../utils/board_preview_warmer';

/**
 * THE TRIAL BAR (2026-10-12). Requested: "Trying a board shows a trial bar, and 'Use this board' opens
 * Speak Mode on it (whether in basic or modern view) - basic should open speak mode in basic view,
 * modern should open speak mode in modern view". Decided the same day:
 *   - "Try this Board" never changes the home board; "Use this board" makes it the home board.
 *   - The bar reads "Trying: <board name>", with "Use this board" and "Exit" (back to the picker).
 *   - Basic browses the tried board in normal mode; Modern's board page is always the speaking page,
 *     so its trial is that page with this bar on top.
 *
 * WHO THE BOARD IS FOR rides on the trial marker, because the picker forgets its user once left: the
 * signed-in user, or the communicator an SLP opened the picker for. For yourself, "Use" opens Speak
 * Mode on your new home board through app-state#home_in_speak_mode, which already opens the right
 * board page for the view (transitionToBoardForCurrentUiStyle). For a communicator it finishes as
 * "Pick this Board" does for someone else (utils/board_picker_landing.js#after_pick_for_other), since
 * the supporter is not the one who speaks.
 *
 * `view` is 'basic' or 'modern'. Modern passes `mark` (the board page's try_origin_board, already
 * scoped to the board on screen); Basic reads its own marker for the board on screen.
 */
export default Component.extend({
  tagName: '',
  appState: service('app-state'),
  store: service('store'),
  router: service('router'),
  persistence: service('persistence'),
  stashes: service('stashes'),
  board: null,
  view: 'modern',
  mark: null,
  busy: false,
  // Injectable so a test can observe the calls; the real ones in the app.
  copyAsHome: copy_or_reuse_as_home,
  preloadImages: preload_board_images,
  saveHome: saveHomeBoard,
  discardCopy: discard_cancelled_copy,

  trial: computed('view', 'mark', 'appState.basic_try_home', 'appState.currentBoardState.key', function() {
    if(this.get('view') === 'basic') {
      return basic_try_for(this.get('appState'), this.get('appState.currentBoardState.key'));
    }
    return this.get('mark') || null;
  }),
  // Basic: browsing only, so not in Speak Mode (where "Use" has taken it) and not while editing.
  shown: computed('trial', 'view', 'appState.speak_mode', 'appState.edit_mode', function() {
    if(!this.get('trial')) { return false; }
    if(this.get('view') === 'basic') { return !this.get('appState.speak_mode') && !this.get('appState.edit_mode'); }
    return true;
  }),
  // The TRIED board's name: the bar also shows on its folders (2026-10-13), where `board` is the folder.
  boardName: computed('board.name', 'trial.name', function() {
    return this.get('trial.name') || this.get('board.name') || '';
  }),
  forUserName: computed('trial', 'appState.currentUser.id', function() {
    var trial = this.get('trial');
    if(!trial || !trial.user_id || trial.user_id === this.get('appState.currentUser.id')) { return null; }
    return trial.user_name;
  }),

  _endTrial: function() {
    var appState = this.get('appState');
    clear_basic_try(appState);
    appState.set('board_detail_try_origin', null);
  },

  use: action(function() {
    var _this = this;
    var appState = this.get('appState');
    var trial = this.get('trial');
    if(!trial || this.get('busy')) { return RSVP.resolve(); }
    var me = appState.get('currentUser');
    var forOther = !!this.get('forUserName');
    var who = forOther ? this.get('store').findRecord('user', trial.user_id) : RSVP.resolve(me);
    this.set('busy', true);
    var target = null;
    // Adopt the TRIED board, never a folder of it that happens to be on screen (2026-10-13).
    var board = this.get('board');
    var tried = (trial.key && board && board.get && board.get('key') !== trial.key) ? this.get('store').findRecord('board', trial.key) : RSVP.resolve(board);
    var locale = appState.get('label_locale');
    // Finished like the picker's "Pick this Board" (components/board-preview-overlay.js#_finishPickForHome):
    // preload the new home board's images (best effort), and sync when online with auto-sync on.
    var finishPick = function(home) {
      return RSVP.resolve(_this.preloadImages(home)).then(null, function() {}).then(function() {
        var persistence = _this.get('persistence');
        if(persistence && persistence.get('online') && persistence.get('auto_sync')) {
          persistence.sync('self', null, null, 'home_board_changed').then(null, function() { });
        }
        return home;
      });
    };
    return who.then(function(user) {
      target = user;
      return tried;
    }).then(function(b) {
      if(forOther) {
        // For a communicator: as "Pick this Board" does, once their copy is made.
        return _this.copyAsHome(b, target, locale).then(finishPick).then(function(home) {
          _this._endTrial();
          modal.success(i18n.t('board_set_as_home', "Great! This is now the user's home board!"), true);
          after_pick_for_other(_this.get('router'), home.get('key'), target.get('user_name'), appState.get('effective_view_user'));
        });
      }
      /* For yourself, RIGHT AWAY (requested 2026-10-13), and TRUE when said (final review, 2026-10-13): the tried
         board is SAVED as the home board first (utils/home_board.js#saveHomeBoard, confirmed against what the
         server stored), then the message shows and Speak Mode opens on it. Their own copy is made in the
         background and replaces it when done (copy_or_reuse_as_home saves the copy); if the app is closed
         meanwhile, the tried board is still their home board, as they were told.
         A NEWER CHOICE WINS: the copy runs with `isCancelled`, which says yes once `home_copy_pending` names
         another board (another Use in the meantime), so a superseded copy skips its home save and the boards it
         made are removed (utils/board-copy.js#discard_cancelled_copy). (An organization's home board cannot be
         cancelled, utils/board-copy.js#can_cancel_home_copy, so that rare case keeps the old behaviour.)
         When the copy lands, this Speak Mode session's home (`root_board_state`, which Speak Mode entry set to
         the tried board) follows it. */
      var name = (b && b.get && (b.get('name') || b.get('key'))) || '';
      var spot = { id: b.get('id'), key: b.get('key') };
      return RSVP.resolve(_this.saveHome(me, b, locale)).then(function() {
        _this._endTrial();
        appState.set('home_copy_pending', spot);
        modal.success(i18n.t('trial_bar_now_home', "%{board} is now your home board.", { board: name }));
        appState.home_in_speak_mode({ user: me, force_board_state: spot });
        var startedAt = new Date();
        var superseded = function() { var p = appState.get('home_copy_pending'); return !p || p.key !== spot.key; };
        return _this.copyAsHome(b, me, locale, { isCancelled: superseded }).then(finishPick).then(function(home) {
          if(!superseded()) { appState.set('home_copy_pending', null); }
          var stashes = _this.get('stashes');
          var root = stashes && stashes.get('root_board_state');
          if(home && root && root.key === spot.key) { stashes.persist('root_board_state', { id: home.get('id'), key: home.get('key') }); }
        }, function(err) {
          if(err && err.cancelled) {
            var ids = err.new_board_ids || [];
            return ids.length ? RSVP.resolve(_this.discardCopy(ids, me, startedAt, err.board)).then(null, function() {}) : null;
          }
          if(!superseded()) { appState.set('home_copy_pending', null); }
          modal.error(i18n.t('trial_bar_copy_failed', "%{board} is your home board, but your own copy of it couldn't be made. You can copy it later from Boards.", { board: name }));
        });
      });
    }).then(null, function(err) {
      modal.error((typeof err === 'string' && err) ? err : i18n.t('set_as_home_failed', "Home board update failed unexpectedly"));
    }).finally(function() {
      if(!_this.isDestroyed && !_this.isDestroying) { _this.set('busy', false); }
    });
  }),

  // Modern passes the board page's own `try_back_to_picker` (it also closes that page's options menu).
  onExit: null,
  // Ends the trial and goes to the home page (2026-10-13). Modern passes `onClose`, the board page's own
  // Exit Boards (controllers/user/board-detail.js#exit_to_home), which asks for the Speak Mode PIN when set.
  close: action(function() {
    if(typeof this.get('onClose') === 'function') { return this.get('onClose')(); }
    this._endTrial();
    this.get('router').transitionTo('index');
  }),

  exit: action(function() {
    if(typeof this.get('onExit') === 'function') { return this.get('onExit')(); }
    this._endTrial();
    this.get('appState').set('board_picker_restore', true); // the picker returns to its place (components/board-picker.js)
    this.get('router').transitionTo('board-picker');
  })
});
