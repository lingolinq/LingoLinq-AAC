import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed, action } from '@ember/object';
import RSVP from 'rsvp';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import { copy_or_reuse_as_home } from '../utils/board-copy';
import { basic_try_for, clear_basic_try } from '../utils/board_picker_landing';

/**
 * "SET AS HOME BOARD" ON THE BASIC BOARD PAGE AFTER A "TRY" (2026-09-30).
 *
 * The board picker's "Try this Board" opens the board on the Basic board page in normal mode
 * (utils/board_picker_landing.js) and records which board and for whom. This button, in the Basic
 * board header (templates/application.hbs), makes that board the home board of THAT user: the
 * communicator when an SLP opened the picker for them, not the SLP. It does what "Pick this Board"
 * does (utils/board-copy.js#copy_or_reuse_as_home), then opens the new home board.
 *
 * Shown only on the tried board, and only in normal mode: not in speak mode (a communicator's
 * session) and not in edit mode.
 */
export default Component.extend({
  tagName: '',
  appState: service('app-state'),
  store: service('store'),
  router: service('router'),
  board: null,
  busy: false,
  // Injectable so a test can observe the call; the real one in the app.
  copyAsHome: copy_or_reuse_as_home,

  mark: computed('appState.basic_try_home', 'appState.currentBoardState.key', function() {
    return basic_try_for(this.get('appState'), this.get('appState.currentBoardState.key'));
  }),
  shown: computed('mark', 'appState.speak_mode', 'appState.edit_mode', function() {
    return !!this.get('mark') && !this.get('appState.speak_mode') && !this.get('appState.edit_mode');
  }),
  // For someone other than the signed-in user: the label names them.
  forUserName: computed('mark', 'appState.currentUser.id', function() {
    var mark = this.get('mark');
    if(!mark || !mark.user_id || mark.user_id === this.get('appState.currentUser.id')) { return null; }
    return mark.user_name;
  }),

  setAsHome: action(function() {
    var _this = this;
    var appState = this.get('appState');
    var mark = this.get('mark');
    if(!mark || this.get('busy')) { return RSVP.resolve(); }
    var me = appState.get('currentUser');
    var who = (!mark.user_id || (me && mark.user_id === me.get('id'))) ? RSVP.resolve(me) : this.get('store').findRecord('user', mark.user_id);
    this.set('busy', true);
    return who.then(function(user) {
      return _this.copyAsHome(_this.get('board'), user, appState.get('label_locale'));
    }).then(function(home) {
      clear_basic_try(appState);
      modal.success(i18n.t('board_set_as_home', "Great! This is now the user's home board!"), true);
      _this.get('router').transitionTo('board', home.get('key'));
    }, function(err) {
      modal.error((typeof err === 'string' && err) ? err : i18n.t('set_as_home_failed', "Home board update failed unexpectedly"));
    }).finally(function() {
      if(!_this.isDestroyed && !_this.isDestroying) { _this.set('busy', false); }
    });
  })
});
