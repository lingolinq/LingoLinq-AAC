import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed, action } from '@ember/object';
import RSVP from 'rsvp';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import { copy_or_reuse_as_home } from '../utils/board-copy';
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
  board: null,
  view: 'modern',
  mark: null,
  busy: false,
  // Injectable so a test can observe the calls; the real ones in the app.
  copyAsHome: copy_or_reuse_as_home,
  preloadImages: preload_board_images,

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
  boardName: computed('board.name', function() {
    return this.get('board.name') || '';
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
    return who.then(function(user) {
      target = user;
      return _this.copyAsHome(_this.get('board'), user, appState.get('label_locale'));
    }).then(function(home) {
      // Finished like the picker's "Pick this Board" (components/board-preview-overlay.js#_finishPickForHome):
      // preload the new home board's images (best effort), and sync when online with auto-sync on.
      return RSVP.resolve(_this.preloadImages(home)).then(null, function() {}).then(function() {
        var persistence = _this.get('persistence');
        if(persistence && persistence.get('online') && persistence.get('auto_sync')) {
          persistence.sync('self', null, null, 'home_board_changed').then(null, function() { });
        }
        return home;
      });
    }).then(function(home) {
      _this._endTrial();
      if(forOther) {
        modal.success(i18n.t('board_set_as_home', "Great! This is now the user's home board!"), true);
        after_pick_for_other(_this.get('router'), home.get('key'), target.get('user_name'), appState.get('effective_view_user'));
        return;
      }
      appState.home_in_speak_mode({ user: me, force_board_state: { id: home.get('id'), key: home.get('key') } });
    }, function(err) {
      modal.error((typeof err === 'string' && err) ? err : i18n.t('set_as_home_failed', "Home board update failed unexpectedly"));
    }).finally(function() {
      if(!_this.isDestroyed && !_this.isDestroying) { _this.set('busy', false); }
    });
  }),

  // Modern passes the board page's own `try_back_to_picker` (it also closes that page's options menu).
  onExit: null,
  exit: action(function() {
    if(typeof this.get('onExit') === 'function') { return this.get('onExit')(); }
    this._endTrial();
    this.get('router').transitionTo('board-picker');
  })
});
