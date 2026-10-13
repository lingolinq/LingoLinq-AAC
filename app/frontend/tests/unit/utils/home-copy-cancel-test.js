import { module, test } from 'qunit';
import RSVP from 'rsvp';
import LingoLinq from 'frontend/app';
import persistence from 'frontend/utils/persistence';
import editManager from 'frontend/utils/edit_manager';
import { copy_or_reuse_as_home, discard_cancelled_copy } from 'frontend/utils/board-copy';

/* CANCELLING A HOME-BOARD COPY (requested 2026-10-11). The copy runs as a server job; the HOME
 * BOARD is set by the client only after it finishes (edit_manager.js#copy_board, the as_home branch
 * of done_callback; the job itself, User#copy_board_links, never touches it). So a cancel that skips
 * that save leaves the home board as it was. The boards the job created are then deleted (chosen by
 * Traci 2026-10-11), but ONLY ones this copy made: listed in the job's new_board_ids, owned by this
 * user, created after the copy started, and not their home board. A copy they ALREADY had (the reuse
 * path) is never deleted. Callers that pass no cancel check keep the old path untouched. */
function fake_board(attrs) {
  return {
    attrs: attrs,
    get: function(key) { return attrs[key]; },
    set: function(key, v) { attrs[key] = v; }
  };
}
function fake_user(user_name) {
  return {
    preferences: {},
    saves: 0,
    get: function(key) {
      if (key === 'user_name') { return user_name; }
      if (key === 'preferences.home_board') { return this.preferences.home_board; }
      if (key === 'preferences.home_board.key') { return this.preferences.home_board && this.preferences.home_board.key; }
      if (key === 'preferences.preferred_symbols') { return null; }
      return null;
    },
    set: function(key, value) { if (key === 'preferences.home_board') { this.preferences.home_board = value; } return value; },
    save: function() { this.saves++; return RSVP.resolve(this); }
  };
}

module('Unit | Utility | cancelling a home board copy', function(hooks) {
  var original_find, original_copy, created_store, original_force_reload;
  hooks.beforeEach(function() {
    created_store = !LingoLinq.store;
    if (created_store) { LingoLinq.store = {}; }
    original_find = LingoLinq.store.findRecord;
    original_copy = editManager.copy_board;
    original_force_reload = persistence.force_reload;
    // No existing copy: the lookup 404s.
    LingoLinq.store.findRecord = function() { return RSVP.reject({ status: 404 }); };
  });
  hooks.afterEach(function() {
    editManager.copy_board = original_copy;
    persistence.force_reload = original_force_reload;
    if (created_store) { delete LingoLinq.store; } else { LingoLinq.store.findRecord = original_find; }
  });

  var original = fake_board({ key: 'lingolinq/quick-core-24', id: '1_5' });

  test('not cancelled: copy_board sets the home board itself, at its usual moment', async function(assert) {
    var user = fake_user('example');
    var made = fake_board({ key: 'example/quick-core-24', id: '1_90', new_board_ids: ['1_90', '1_91'] });
    var calls = [];
    // Stands in for copy_board: it asks skip_home() right where it would save the home board.
    editManager.copy_board = function(b, decision, u, mp, lib, owner, disconnect, opts) {
      calls.push([decision, opts.skip_home()]);
      return RSVP.resolve(made);
    };
    var home = await copy_or_reuse_as_home(original, user, null, { isCancelled: function() { return false; } });
    assert.deepEqual(calls, [['links_copy_as_home', false]], 'same decision as before; told not to skip the home save');
    assert.strictEqual(home, made);
  });

  test('cancelled before the home save: it is skipped, and the new boards are handed back to remove', async function(assert) {
    var user = fake_user('example');
    var made = fake_board({ key: 'example/quick-core-24', id: '1_90', new_board_ids: ['1_90', '1_91'] });
    var asked = [];
    editManager.copy_board = function(b, decision, u, mp, lib, owner, disconnect, opts) {
      asked.push(opts.skip_home());
      return RSVP.resolve(made);
    };
    var err;
    await copy_or_reuse_as_home(original, user, null, { isCancelled: function() { return true; } }).catch(function(e) { err = e; });
    assert.deepEqual(asked, [true], 'copy_board is told to skip the home save');
    assert.true((err || {}).cancelled, 'rejects as cancelled');
    assert.strictEqual(err.board, made);
    assert.deepEqual(err.new_board_ids, ['1_90', '1_91']);
  });

  test('Cancel pressed AFTER the home save: it stands, and nothing is deleted', async function(assert) {
    var user = fake_user('example');
    var made = fake_board({ key: 'example/quick-core-24', id: '1_90', new_board_ids: ['1_90'] });
    var cancelled = false;
    editManager.copy_board = function(b, decision, u, mp, lib, owner, disconnect, opts) {
      opts.skip_home(); // asked while not cancelled: home saved
      cancelled = true; // then Cancel is pressed before the promise settles
      return RSVP.resolve(made);
    };
    var home = await copy_or_reuse_as_home(original, user, null, { isCancelled: function() { return cancelled; } });
    assert.strictEqual(home, made, 'resolves as set, so the page never deletes its home board');
  });

  test('cancelled when they ALREADY had a copy: nothing to delete, home not changed', async function(assert) {
    var user = fake_user('example');
    var existing = fake_board({ key: 'example/quick-core-24', id: '1_70', parent_board_id: '1_5' });
    LingoLinq.store.findRecord = function() { return RSVP.resolve(existing); };
    var err;
    await copy_or_reuse_as_home(original, user, null, { isCancelled: function() { return true; } }).catch(function(e) { err = e; });
    assert.true((err || {}).cancelled);
    assert.strictEqual(err.board, undefined, 'their existing copy is never offered for deletion');
    assert.strictEqual(user.saves, 0);
  });

  test('without a cancel check the old path is unchanged (picker, Basic try-home)', async function(assert) {
    var user = fake_user('example');
    var decisions = [];
    editManager.copy_board = function(b, decision) { decisions.push(decision); return RSVP.resolve(fake_board({ key: 'example/x' })); };
    await copy_or_reuse_as_home(original, user, null);
    assert.deepEqual(decisions, ['links_copy_as_home']);
  });

  test("discard_cancelled_copy also follows links to copies the job didn't report", async function(assert) {
    // Seen live 2026-10-11: the job reports new_board_ids from the source's STORED downstream list,
    // which can be stale; it copied a linked board that list lacked, and that copy was left behind.
    var user = fake_user('example');
    var started = new Date('2026-10-11T10:00:00Z');
    var deleted = [];
    function rec(id, attrs) {
      return { id: id, get: function(k) { return attrs[k]; }, deleteRecord: function() { deleted.push(id); }, save: function() { return RSVP.resolve(this); } };
    }
    var at = new Date('2026-10-11T10:00:10Z');
    var recs = {
      '1_90': rec('1_90', { user_name: 'example', key: 'example/top', created: at, buttons: [{ load_board: { id: '1_95', key: 'example/unreported' } }] }),
      '1_95': rec('1_95', { user_name: 'example', key: 'example/unreported', created: at, buttons: [{ load_board: { id: '1_96', key: 'example/older' } }, { load_board: { id: '1_97', key: 'lingolinq/theirs' } }] }),
      '1_96': rec('1_96', { user_name: 'example', key: 'example/older', created: new Date('2026-01-01T00:00:00Z') }),
      '1_97': rec('1_97', { user_name: 'lingolinq', key: 'lingolinq/theirs', created: at })
    };
    LingoLinq.store.findRecord = function(type, id) { return recs[id] ? RSVP.resolve(recs[id]) : RSVP.reject({ status: 404 }); };
    await discard_cancelled_copy(['1_90'], user, started);
    assert.deepEqual(deleted.sort(), ['1_90', '1_95'], 'the unreported copy goes too; an older board and someone else\'s board stay');
  });

  test('discard_cancelled_copy deletes only boards this copy made', async function(assert) {
    var user = fake_user('example');
    user.preferences.home_board = { key: 'example/home', id: '1_1' };
    var started = new Date('2026-10-11T10:00:00Z');
    var deleted = [];
    function rec(id, attrs) {
      return { id: id, get: function(k) { return attrs[k]; }, deleteRecord: function() { deleted.push(id); }, save: function() { return RSVP.resolve(this); } };
    }
    var recs = {
      '1_90': rec('1_90', { user_name: 'example', key: 'example/quick-core-24', created: new Date('2026-10-11T10:00:05Z') }),
      '1_91': rec('1_91', { user_name: 'example', key: 'example/quick-core-24-food', created: new Date('2026-10-11T10:00:20Z') }),
      '1_92': rec('1_92', { user_name: 'lingolinq', key: 'lingolinq/food', created: new Date('2026-10-11T10:00:20Z') }),
      '1_93': rec('1_93', { user_name: 'example', key: 'example/old', created: new Date('2026-01-01T00:00:00Z') }),
      '1_1': rec('1_1', { user_name: 'example', key: 'example/home', created: new Date('2026-10-11T10:00:30Z') })
    };
    LingoLinq.store.findRecord = function(type, id) { return recs[id] ? RSVP.resolve(recs[id]) : RSVP.reject({ status: 404 }); };
    await discard_cancelled_copy(['1_90', '1_91', '1_92', '1_93', '1_1', '1_99'], user, started);
    assert.deepEqual(deleted.sort(), ['1_90', '1_91'], "only this copy's own new boards; never someone else's, an older board, or their home board");
  });

  /* DEVICE CLOCK (adversary review, 2026-10-13). The age check compared this device's clock with the
     server's `created`, so a device running ahead removed nothing (yet said it had), and one running far
     behind let the link walk reach older boards. The cutoff now comes from the cancelled copy's own
     `created`, which is server time, when it is known. */
  test('discard_cancelled_copy dates its cutoff from the copy itself, not this device\'s clock', async function(assert) {
    var user = fake_user('example');
    var deviceSaysNow = new Date('2026-10-11T10:30:00Z'); // device clock 30 minutes ahead
    var deleted = [];
    function rec(id, attrs) {
      return { id: id, get: function(k) { return attrs[k]; }, deleteRecord: function() { deleted.push(id); }, save: function() { return RSVP.resolve(this); } };
    }
    var root = rec('1_90', { user_name: 'example', key: 'example/top', created: new Date('2026-10-11T10:00:05Z'), buttons: [{ load_board: { id: '1_91', key: 'example/top-food' } }, { load_board: { id: '1_96', key: 'example/older' } }] });
    var recs = {
      '1_90': root,
      '1_91': rec('1_91', { user_name: 'example', key: 'example/top-food', created: new Date('2026-10-11T10:00:20Z') }),
      '1_96': rec('1_96', { user_name: 'example', key: 'example/older', created: new Date('2026-10-11T09:20:00Z') })
    };
    LingoLinq.store.findRecord = function(type, id) { return recs[id] ? RSVP.resolve(recs[id]) : RSVP.reject({ status: 404 }); };
    await discard_cancelled_copy(['1_90'], user, deviceSaysNow, root);
    assert.deepEqual(deleted.sort(), ['1_90', '1_91'], 'the copy is removed; a board made 40 minutes earlier stays');
  });
});
