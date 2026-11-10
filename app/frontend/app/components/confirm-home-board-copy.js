import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';
import { copy_or_reuse_as_home, can_cancel_home_copy, discard_cancelled_copy } from '../utils/board-copy';
import backend_user_id from '../utils/backend_user_id';

/* SETTING SOMEONE ELSE'S BOARD AS THE HOME BOARD, FROM THE BOARDS PAGE (requested 2026-10-11).
 * Opened by components/available-boards-section.js when its "Set Home Board" mode is on and the
 * board clicked does not belong to the page's user. One dialog, four stages:
 *   ask     -- the board is not theirs; copy it to finish setting it as home?
 *   copying -- "Copying and setting your home board..." while copy_or_reuse_as_home runs (the same
 *              helper as the picker's "Pick this Board": copies the board and its links, sets the
 *              copy as home, or reuses a confirmed copy they already have). No copy-board modal.
 *              The message changes every 30 seconds so a long copy never looks stuck, and Cancel
 *              stops it (requested 2026-10-11): the home board is left as it was, and the boards
 *              this copy made are removed once the server job finishes (`cancelling`, then
 *              `cancelled`). See utils/board-copy.js#copy_or_reuse_as_home and
 *              #discard_cancelled_copy.
 *   done    -- offer to open the new home board.
 *   error   -- what went wrong.
 * `model`: { board, user, copyAsHome?, onDone(home), onOpenBoard(home), onNotNow(home) }. The dialog
 * cannot be closed while copying, so the copy is never abandoned half-way from here.
 * A board the user OWNS is set as home by the caller first, and the dialog opens straight at `done`
 * (`stage: 'done', home, copied: false`) to ask whether to open it. At `done`, Not now (or closing
 * the dialog any other way) calls onNotNow, which follows the board to the top of My Boards.
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  tagName: '',
  stage: 'ask',
  home: null,
  error: null,
  copied: true,
  progressStep: 0,
  progressInterval: 30000,
  cancelRequested: false,
  // After this long the dialog can be closed: the copy (or the clean-up after a cancel) runs in
  // utils/edit_manager.js and utils/board-copy.js, not here, so it carries on (adversary review, 2026-10-13).
  slowAfter: 120000,
  waitedLong: false,

  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          evt.preventDefault();
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    if (!this.get('model')) {
      var modalService = this.get('modal');
      var template = 'confirm-home-board-copy';
      var options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) || {};
      this.set('model', options);
    }
    var m = this.get('model') || {};
    if (m.stage) { this.set('stage', m.stage); }
    if (m.home) { this.set('home', m.home); }
    if (m.copied === false) { this.set('copied', false); }
    this.onClose = function() { self.send('close'); };
  },

  boardName: computed('model.board', function() {
    var b = this.get('model.board');
    return (b && (b.get ? (b.get('name') || b.get('key')) : (b.name || b.key))) || '';
  }),
  // The session user is keyed 'self', the page's user by global id (utils/backend_user_id.js).
  forSomeoneElse: computed('model.user', 'appState.currentUser.id', function() {
    var u = this.get('model.user');
    var me = backend_user_id(this.get('appState.currentUser'));
    return !!(u && me && backend_user_id(u) !== me);
  }),
  userName: computed('model.user.user_name', function() { return this.get('model.user.user_name') || ''; }),
  isAsk: computed('stage', function() { return this.get('stage') === 'ask'; }),
  isCopying: computed('stage', function() { return this.get('stage') === 'copying'; }),
  isDone: computed('stage', function() { return this.get('stage') === 'done'; }),
  isError: computed('stage', function() { return this.get('stage') === 'error'; }),
  isCancelling: computed('stage', function() { return this.get('stage') === 'cancelling'; }),
  isCancelled: computed('stage', function() { return this.get('stage') === 'cancelled'; }),
  // Copying or cleaning up after a cancel: the dialog cannot be closed until that settles, or until it
  // has taken unusually long (`waitedLong`), when it says so and offers Close.
  isWorking: computed('stage', function() { return ['copying', 'cancelling'].indexOf(this.get('stage')) !== -1; }),
  isBusy: computed('isWorking', 'waitedLong', function() { return this.get('isWorking') && !this.get('waitedLong'); }),
  canCancel: computed('model.board', 'model.user', function() {
    return can_cancel_home_copy(this.get('model.board'), this.get('model.user'));
  }),
  progressMessage: computed('progressStep', function() {
    var step = this.get('progressStep');
    if (step === 0) { return i18n.t('set_home_copy_progress', "Copying the board and setting the home board..."); }
    if (step === 1) { return i18n.t('set_home_copy_progress_30', "Still copying. Boards with many linked pages take a little longer..."); }
    if (step === 2) { return i18n.t('set_home_copy_progress_60', "Still working on it, copying the linked pages..."); }
    // From 90 seconds on, alternate so the text keeps changing while they wait.
    return step % 2 ?
      i18n.t('set_home_copy_progress_long_a', "Still working. Large board sets can take a few minutes...") :
      i18n.t('set_home_copy_progress_long_b', "Still copying. Thanks for waiting...");
  }),

  // One 30-second step of the progress message (the timer calls this; tests call it directly).
  tick() {
    if (this.isDestroyed || this.isDestroying || this.get('stage') !== 'copying') { return; }
    this.set('progressStep', this.get('progressStep') + 1);
  },
  _startTicking() {
    var self = this;
    self._stopTicking();
    self._ticker = window.setInterval(function() { self.tick(); }, self.get('progressInterval'));
  },
  _stopTicking() {
    if (this._ticker) { window.clearInterval(this._ticker); this._ticker = null; }
  },
  _startSlowTimer() {
    var self = this;
    self._stopSlowTimer();
    self._slow = window.setTimeout(function() { if (!self.isDestroyed && !self.isDestroying) { self.set('waitedLong', true); } }, self.get('slowAfter'));
  },
  _stopSlowTimer() {
    if (this._slow) { window.clearTimeout(this._slow); this._slow = null; }
  },
  willDestroy() {
    this._stopTicking();
    this._stopSlowTimer();
    this._super(...arguments);
  },

  actions: {
    close() {
      if (this.get('isBusy')) { return; }
      var model = this.get('model') || {};
      var home = this.get('home');
      this.get('modal').close();
      if (this.get('stage') === 'done' && home && model.onNotNow) { model.onNotNow(home); }
    },
    confirm() {
      var self = this;
      var model = self.get('model') || {};
      var copy = model.copyAsHome || copy_or_reuse_as_home;
      var discard = model.discardCopy || function(ids, root, startedFor) { return discard_cancelled_copy(ids, model.user, startedAt, root, startedFor); };
      var startedAt = new Date();
      self.set('stage', 'copying');
      self.set('progressStep', 0);
      self.set('cancelRequested', false);
      self.set('waitedLong', false);
      self._startTicking();
      self._startSlowTimer();
      copy(model.board, model.user, null, { isCancelled: function() { return self.get('cancelRequested'); } }).then(function(home) {
        self._stopTicking();
        if (self.isDestroyed || self.isDestroying) { return; }
        self.set('home', home);
        self.set('stage', 'done');
        if (model.onDone) { model.onDone(home); }
      }, function(err) {
        self._stopTicking();
        if (err && err.cancelled) {
          // Home board untouched; remove what this copy made, then say so.
          var finish = function() { if (!self.isDestroyed && !self.isDestroying) { self.set('stage', 'cancelled'); } };
          if (err.new_board_ids && err.new_board_ids.length) { discard(err.new_board_ids, err.board, err.session_user_id).then(finish, finish); } else { finish(); }
          return;
        }
        if (self.isDestroyed || self.isDestroying) { return; }
        // Failed after Cancel: what it made could not be identified, so nothing was removed. Say so
        // rather than "Cancelled" (adversary review, 2026-10-13).
        if (self.get('cancelRequested')) {
          self.set('error', i18n.t('set_home_copy_cancel_failed', "The copy stopped with an error, so some copied boards may still be in My Boards. Your home board wasn't changed."));
          self.set('stage', 'error');
          return;
        }
        self.set('error', (typeof err === 'string' && err) ? err : i18n.t('set_as_home_failed', "Home board update failed unexpectedly"));
        self.set('stage', 'error');
      });
    },
    // Stop the copy. The server job runs to its end; the home board is then NOT set and what it made
    // is removed (see `confirm`), so the dialog waits in `cancelling` until that is done.
    cancelCopy() {
      if (this.get('stage') !== 'copying' || !this.get('canCancel')) { return; }
      this._stopTicking();
      this.set('cancelRequested', true);
      this.set('stage', 'cancelling');
    },
    openBoard() {
      var model = this.get('model') || {};
      var home = this.get('home');
      if (model.onOpenBoard && home) { model.onOpenBoard(home); }
      this.get('modal').close();
    }
  }
});
