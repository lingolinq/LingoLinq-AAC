import Service from '@ember/service';
import { computed } from '@ember/object';

/**
 * Copy Progress Service
 *
 * State for a board copy that the user sent to the background by clicking
 * outside the "Copying Board" modal. The modal itself is destroyed at that
 * point (the modal service only ever renders one modal, and every route
 * transition clears it), so the "still copying / all done" surface has to live
 * outside the modal slot: `<CopyProgressDrawer />` renders this state from
 * application.hbs, which survives route transitions.
 *
 * This service holds state only — the actual copy keeps running inside the
 * promise chain started by components/copying-board.js, which reports back here
 * when it settles, and the navigation offered by the finished card is performed
 * by the drawer component.
 *
 * Nothing here auto-dismisses. The finished card offers a choice ("Open Board"
 * or "Dismiss"), and a notice that disappears on its own is one the user can
 * miss or fail to reach in time — so every result state waits to be answered.
 */
export default Service.extend({
  // 'copying' | 'done' | 'error' | null (nothing to show)
  status: null,
  // Key of the SOURCE board, shown while status == 'copying'
  board_key: null,
  // Headline for the result card, shown while status == 'done' | 'error'
  message: null,
  // {id, key, for_editing} for the finished copy — what "Open Board" opens.
  // Null on the error path: there is nothing to open.
  copy: null,

  // 0-100 when the copy has reached a phase the SERVER reports progress for, null while it
  // has not. Deliberately nullable rather than defaulting to 0: a board copy runs in two
  // phases and only the second has a Progress record (see edit_manager#copy_board), so a
  // number here means "measured", and null means "running, but no measurement exists yet".
  // The surfaces render an indeterminate bar for null rather than inventing a figure.
  percent: null,

  // Identifies the current copy job. A job only gets to write its result if it
  // still owns the drawer, so a second copy started while the first one is
  // minimized can't be reported under the wrong board.
  token: null,
  _next_token: 1,

  is_copying: computed('status', function() {
    return this.get('status') === 'copying';
  }),

  is_done: computed('status', function() {
    return this.get('status') === 'done';
  }),

  /**
   * Send a running copy to the background drawer.
   * @param {object} opts - {board_key}
   * @returns {number} token to pass back to complete()/fail()
   */
  minimize(opts) {
    opts = opts || {};
    const token = this.get('_next_token');
    this.set('_next_token', token + 1);
    this.set('token', token);
    this.set('message', null);
    this.set('copy', null);
    this.set('board_key', opts.board_key || null);
    this.set('percent', opts.percent == null ? null : opts.percent);
    this.set('status', 'copying');
    return token;
  },

  /**
   * Report measured progress for a backgrounded copy.
   * @param {number} token - from minimize()
   * @param {number} percent - 0-100, or null to fall back to the indeterminate bar
   */
  progress(token, percent) {
    if (!this._owns(token)) { return; }
    /* Only while copying: a late poll landing after complete()/fail() must not drag the
       result card back to a progress bar. */
    if (this.get('status') !== 'copying') { return; }
    this.set('percent', percent == null ? null : percent);
  },

  /**
   * Report a backgrounded copy as finished — the drawer is replaced in place by
   * the result card.
   * @param {number} token - from minimize()
   * @param {string} message - headline
   * @param {object} copy - {id, key, for_editing} of the new board
   */
  complete(token, message, copy) {
    if (!this._owns(token)) { return; }
    this.set('message', message);
    this.set('percent', null);
    this.set('copy', copy || null);
    this.set('status', 'done');
  },

  /**
   * Report a backgrounded copy as failed.
   */
  fail(token, message) {
    if (!this._owns(token)) { return; }
    this.set('message', message);
    this.set('percent', null);
    this.set('copy', null);
    this.set('status', 'error');
  },

  /**
   * Clear the drawer/card. Called by the user's Dismiss button and by the drawer
   * once it has acted on "Open Board" (both pass no token).
   */
  dismiss(token) {
    if (token != null && !this._owns(token)) { return; }
    this.set('status', null);
    this.set('message', null);
    this.set('board_key', null);
    this.set('percent', null);
    this.set('copy', null);
    this.set('token', null);
  },

  _owns(token) {
    return token != null && this.get('token') === token;
  }
});
