import Component from '@ember/component';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

/* THE HOME BOARD'S NAME, as text, for a menu row: Modern's account rail (components/account-rail.hbs)
 * and Basic's rail (components/dashboard/classic-rail.hbs). Requested 2026-11-08 for Modern ("the
 * home board needs to show the board name, not the board id") and 2026-11-09 for Basic ("change the
 * board's key from showing to the board's name"); one unit so the two rails cannot drift.
 *
 * `preferences.home_board` holds only id, key, locale and level, so the name comes from the board
 * record, read the way the dashboard reads it (components/dashboard/authenticated-view.js
 * `_findSpeakBoard`): peeked from the store by id, else by key, and fetched once by key when it is
 * not loaded. Until then, and offline, it shows the key's slug (`board-key-name`), so the row is
 * never blank. The record is its own property and the name is read through it, so renaming the
 * board while the row is up reaches it.
 *
 * `tagName: ''`: the text sits inside the caller's own label span, with no wrapper element. */
export default Component.extend({
  tagName: '',
  store: service('store'),

  _homeBoardTick: 0,
  _findHomeBoard: function() {
    var target = this.get('user.preferences.home_board');
    var store = this.get('store');
    if(!store || !target || !target.key) { return null; }
    var rec = null;
    try { rec = target.id ? store.peekRecord('board', target.id) : null; } catch(e) { rec = null; }
    if(!rec && store.peekAll) {
      rec = store.peekAll('board').find(function(b) { return b.get('key') === target.key; }) || null;
    }
    return rec;
  },
  homeBoardRecord: computed('_homeBoardTick', 'user.preferences.home_board.{id,key}', function() {
    return this._findHomeBoard();
  }),
  homeBoardName: computed('homeBoardRecord.name', 'user.preferences.home_board.name', function() {
    var rec = this.get('homeBoardRecord');
    return (rec && rec.get('name')) || this.get('user.preferences.home_board.name') || null;
  }),
  didReceiveAttrs() {
    this._super(...arguments);
    var _this = this;
    var key = this.get('user.preferences.home_board.key');
    var store = this.get('store');
    if(!key || this._findHomeBoard() || !store || !store.findRecord) { return; }
    this._homeBoardRequested = this._homeBoardRequested || {};
    if(this._homeBoardRequested[key]) { return; }
    this._homeBoardRequested[key] = true;
    store.findRecord('board', key).then(function() {
      if(!_this.isDestroyed && !_this.isDestroying) { _this.incrementProperty('_homeBoardTick'); }
    }, function() { /* offline or gone: the slug stays */ });
  }
});
