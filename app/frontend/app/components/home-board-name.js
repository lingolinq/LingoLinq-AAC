import Component from '@ember/component';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

/* THE HOME BOARD'S NAME, as text, for a menu row: Modern's account rail (components/account-rail.hbs)
 * and Basic's rail (components/dashboard/classic-rail.hbs, classic-view.hbs). Requested 2026-11-08
 * for Modern ("the home board needs to show the board name, not the board id") and 2026-11-09 for
 * Basic ("change the board's key from showing to the board's name"); one unit so the rails cannot
 * drift.
 *
 * `preferences.home_board` holds only id, key, locale and level, so the name comes from the board
 * record, read the way the dashboard reads it (components/dashboard/authenticated-view.js
 * `_findSpeakBoard`): peeked from the store by id, else by key.
 *
 * LOCAL STORE ONLY, NEVER A FETCH (decided 2026-11-09 after the red-team review). Fetching a board
 * just to label a row downloaded the whole board, cached it and its images for offline use, and
 * listed it in Recent boards, for every communicator a supervisor browsed in Modern. So the row
 * shows the name of a board that is already loaded (the person's own home board normally is), and
 * otherwise the key's slug (`board-key-name`), as before. `_boards` is the store's live board list,
 * so a board that loads later names the row then; the name is read through the record, so a rename
 * reaches it too.
 *
 * `tagName: ''`: the text sits inside the caller's own label span, with no wrapper element. */
export default Component.extend({
  tagName: '',
  store: service('store'),

  _boards: computed(function() {
    var store = this.get('store');
    return (store && store.peekAll) ? store.peekAll('board') : [];
  }),
  homeBoardRecord: computed('_boards.[]', 'user.preferences.home_board.{id,key}', function() {
    var target = this.get('user.preferences.home_board');
    var store = this.get('store');
    if(!store || !target || !target.key) { return null; }
    var rec = null;
    try { rec = target.id ? store.peekRecord('board', target.id) : null; } catch(e) { rec = null; }
    if(!rec) {
      rec = (this.get('_boards') || []).find(function(b) { return b.get('key') === target.key; }) || null;
    }
    return rec;
  }),
  homeBoardName: computed('homeBoardRecord.name', function() {
    var rec = this.get('homeBoardRecord');
    return (rec && rec.get('name')) || null;
  })
});
