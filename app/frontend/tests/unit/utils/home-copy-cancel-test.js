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
  var original_store, had_store, original_copy, original_force_reload;
  hooks.beforeEach(function() {
    // A store of this module's own, swapped in for the global and swapped back after. Whatever
    // LingoLinq.store holds here belongs to an earlier test's app, which is torn down by now;
    // stubbing findRecord on it read and wrote a destroyed service (the leak check added in #1118).
    had_store = Object.prototype.hasOwnProperty.call(LingoLinq, 'store');
    original_store = LingoLinq.store;
    LingoLinq.store = {};
    original_copy = editManager.copy_board;
    original_force_reload = persistence.force_reload;
    // No existing copy: the lookup 404s.
    LingoLinq.store.findRecord = function() { return RSVP.reject({ status: 404 }); };
  });
  hooks.afterEach(function() {
    editManager.copy_board = original_copy;
    persistence.force_reload = original_force_reload;
    if (had_store) { LingoLinq.store = original_store; } else { delete LingoLinq.store; }
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
      '1_95': rec('1_95', { user_name: 'example', key: 'example/unreported', copy_id: '1_90', created: at, buttons: [{ load_board: { id: '1_96', key: 'example/older' } }, { load_board: { id: '1_97', key: 'lingolinq/theirs' } }] }),
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
      '1_91': rec('1_91', { user_name: 'example', key: 'example/quick-core-24-food', copy_id: '1_90', created: new Date('2026-10-11T10:00:20Z') }),
      '1_92': rec('1_92', { user_name: 'lingolinq', key: 'lingolinq/food', created: new Date('2026-10-11T10:00:20Z') }),
      '1_93': rec('1_93', { user_name: 'example', key: 'example/old', created: new Date('2026-01-01T00:00:00Z') }),
      '1_1': rec('1_1', { user_name: 'example', key: 'example/home', created: new Date('2026-10-11T10:00:30Z') })
    };
    LingoLinq.store.findRecord = function(type, id) { return recs[id] ? RSVP.resolve(recs[id]) : RSVP.reject({ status: 404 }); };
    await discard_cancelled_copy(['1_90', '1_91', '1_92', '1_93', '1_1', '1_99'], user, started);
    assert.deepEqual(deleted.sort(), ['1_90', '1_91'], "only this copy's own new boards; never someone else's, an older board, or their home board");
  });

  /* LINEAGE (Scot's review of #1141, 2026-10-14; rated High on 2026-10-15). Owner, home and age were the only
     checks, and the link walk followed every link, so a recent board of the user's own that a copy still linked to
     (a disabled link is not copied, so the copy keeps pointing at the real board) was deleted with the copy. Every
     board the copy job makes carries the root's id as its copy_id (app/services/board_set_copier.rb, phase 1 and the
     relink phase); the root's own copy_id is its id, which the API leaves out (lib/json_api/board.rb). */
  test('discard_cancelled_copy leaves a recent board of theirs that the copy links to but did not make', async function(assert) {
    var user = fake_user('example');
    var started = new Date('2026-10-11T10:00:00Z');
    var deleted = [];
    function rec(id, attrs) {
      return { id: id, get: function(k) { return attrs[k]; }, deleteRecord: function() { deleted.push(id); }, save: function() { return RSVP.resolve(this); } };
    }
    var at = new Date('2026-10-11T10:00:10Z');
    var root = rec('1_90', { user_name: 'example', key: 'example/top', created: at, buttons: [{ load_board: { id: '1_91', key: 'example/top-food' } }, { load_board: { id: '1_80', key: 'example/my-own' } }] });
    var recs = {
      '1_90': root,
      '1_91': rec('1_91', { user_name: 'example', key: 'example/top-food', copy_id: '1_90', created: at, buttons: [{ load_board: { id: '1_81', key: 'example/other-copy' } }] }),
      // Theirs, made a moment before the copy started: no copy_id at all.
      '1_80': rec('1_80', { user_name: 'example', key: 'example/my-own', created: new Date('2026-10-11T09:59:30Z') }),
      // Theirs, from a DIFFERENT copy made in the same minute.
      '1_81': rec('1_81', { user_name: 'example', key: 'example/other-copy', copy_id: '1_70', created: at })
    };
    LingoLinq.store.findRecord = function(type, id) { return recs[id] ? RSVP.resolve(recs[id]) : RSVP.reject({ status: 404 }); };
    await discard_cancelled_copy(['1_90', '1_91', '1_80'], user, started, root);
    assert.deepEqual(deleted.sort(), ['1_90', '1_91'], "only the copy's root and the boards it made; their own board and another copy's board stay");
  });

  test('discard_cancelled_copy keeps the age check, and does not walk through a board the copy did not make', async function(assert) {
    var user = fake_user('example');
    var started = new Date('2026-10-11T10:00:00Z');
    var deleted = [];
    function rec(id, attrs) {
      return { id: id, get: function(k) { return attrs[k]; }, deleteRecord: function() { deleted.push(id); }, save: function() { return RSVP.resolve(this); } };
    }
    var at = new Date('2026-10-11T10:00:10Z');
    var root = rec('1_90', { user_name: 'example', key: 'example/top', created: at, buttons: [{ load_board: { id: '1_93', key: 'example/old-same-copy' } }, { load_board: { id: '1_80', key: 'example/my-own' } }] });
    var recs = {
      '1_90': root,
      // copy_id matches, but made long before this copy: the age check still keeps it.
      '1_93': rec('1_93', { user_name: 'example', key: 'example/old-same-copy', copy_id: '1_90', created: new Date('2026-01-01T00:00:00Z') }),
      // Theirs, not made by the copy; it links on to a board that WOULD pass every check.
      '1_80': rec('1_80', { user_name: 'example', key: 'example/my-own', created: at, buttons: [{ load_board: { id: '1_94', key: 'example/behind-mine' } }] }),
      '1_94': rec('1_94', { user_name: 'example', key: 'example/behind-mine', copy_id: '1_90', created: at })
    };
    LingoLinq.store.findRecord = function(type, id) { return recs[id] ? RSVP.resolve(recs[id]) : RSVP.reject({ status: 404 }); };
    await discard_cancelled_copy(['1_90'], user, started, root);
    assert.deepEqual(deleted.sort(), ['1_90'], 'an old board stays, and nothing is reached through their own board');
  });

  test('discard_cancelled_copy takes the root from the job report when the root record is not given', async function(assert) {
    var user = fake_user('example');
    var started = new Date('2026-10-11T10:00:00Z');
    var deleted = [];
    function rec(id, attrs) {
      return { id: id, get: function(k) { return attrs[k]; }, deleteRecord: function() { deleted.push(id); }, save: function() { return RSVP.resolve(this); } };
    }
    var at = new Date('2026-10-11T10:00:10Z');
    var recs = {
      '1_90': rec('1_90', { user_name: 'example', key: 'example/top', created: at, buttons: [{ load_board: { id: '1_91', key: 'example/top-food' } }] }),
      '1_91': rec('1_91', { user_name: 'example', key: 'example/top-food', copy_id: '1_90', created: at, buttons: [{ load_board: { id: '1_80', key: 'example/my-own' } }] }),
      '1_80': rec('1_80', { user_name: 'example', key: 'example/my-own', created: at })
    };
    LingoLinq.store.findRecord = function(type, id) { return recs[id] ? RSVP.resolve(recs[id]) : RSVP.reject({ status: 404 }); };
    await discard_cancelled_copy(['1_90'], user, started);
    assert.deepEqual(deleted.sort(), ['1_90', '1_91'], 'the first reported id is the root');
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
      '1_91': rec('1_91', { user_name: 'example', key: 'example/top-food', copy_id: '1_90', created: new Date('2026-10-11T10:00:20Z') }),
      '1_96': rec('1_96', { user_name: 'example', key: 'example/older', created: new Date('2026-10-11T09:20:00Z') })
    };
    LingoLinq.store.findRecord = function(type, id) { return recs[id] ? RSVP.resolve(recs[id]) : RSVP.reject({ status: 404 }); };
    await discard_cancelled_copy(['1_90'], user, deviceSaysNow, root);
    assert.deepEqual(deleted.sort(), ['1_90', '1_91'], 'the copy is removed; a board made 40 minutes earlier stays');
  });

  /* SIGNED OUT MID-COPY (adversary review of #1141, 2026-10-15). An SPA logout (auth_spa_transition) clears
     `home_copy_pending`, so the trial bar's copy looked superseded, and its clean-up then ran with whoever signed
     in next: their token, deleting by the first user's name. The copy now notes who was signed in when it
     started (session.user_id, services/session.js) and treats a different signed-in user as a cancel that
     removes nothing. */
  module('a different person signed in before the copy finished', function(inner) {
    var had_session, original_session;
    inner.beforeEach(function() {
      had_session = Object.prototype.hasOwnProperty.call(LingoLinq, 'session');
      original_session = LingoLinq.session;
      LingoLinq.session = { user_id: '1_1' };
    });
    inner.afterEach(function() {
      if (had_session) { LingoLinq.session = original_session; } else { delete LingoLinq.session; }
    });
    function rec(deleted, id, attrs) {
      return { id: id, get: function(k) { return attrs[k]; }, deleteRecord: function() { deleted.push(id); }, save: function() { return RSVP.resolve(this); } };
    }

    test('the home save is skipped and the copy is handed back with who started it', async function(assert) {
      var user = fake_user('example');
      var made = fake_board({ key: 'example/quick-core-24', id: '1_90', new_board_ids: ['1_90', '1_91'] });
      var asked = [];
      editManager.copy_board = function(b, decision, u, mp, lib, owner, disconnect, opts) {
        LingoLinq.session.user_id = '1_2'; // logged out, and someone else signed in
        asked.push(opts.skip_home());
        return RSVP.resolve(made);
      };
      var err;
      await copy_or_reuse_as_home(original, user, null, { isCancelled: function() { return false; } }).catch(function(e) { err = e; });
      assert.deepEqual(asked, [true], 'no home board is saved as the next person');
      assert.true((err || {}).cancelled);
      assert.strictEqual(err.session_user_id, '1_1');
    });

    test('discard_cancelled_copy removes nothing once someone else is signed in', async function(assert) {
      var user = fake_user('example');
      var deleted = [];
      var at = new Date('2026-10-11T10:00:10Z');
      var root = rec(deleted, '1_90', { user_name: 'example', key: 'example/top', created: at });
      LingoLinq.store.findRecord = function() { return RSVP.resolve(root); };
      LingoLinq.session.user_id = '1_2';
      await discard_cancelled_copy(['1_90'], user, new Date('2026-10-11T10:00:00Z'), root, '1_1');
      assert.deepEqual(deleted, [], "nothing is deleted with the next person's session");
    });

    test('signed out with nobody signed in yet counts as someone else', async function(assert) {
      var user = fake_user('example');
      var deleted = [];
      var root = rec(deleted, '1_90', { user_name: 'example', key: 'example/top', created: new Date('2026-10-11T10:00:10Z') });
      LingoLinq.store.findRecord = function() { return RSVP.resolve(root); };
      LingoLinq.session.user_id = null;
      await discard_cancelled_copy(['1_90'], user, new Date('2026-10-11T10:00:00Z'), root, '1_1');
      assert.deepEqual(deleted, []);
    });

    test('a sign-in that lands while a board is being looked up stops that delete', async function(assert) {
      var user = fake_user('example');
      var deleted = [];
      var root = rec(deleted, '1_90', { user_name: 'example', key: 'example/top', created: new Date('2026-10-11T10:00:10Z') });
      LingoLinq.store.findRecord = function() {
        LingoLinq.session.user_id = '1_2'; // someone else signs in while the lookup is in flight
        return RSVP.resolve(root);
      };
      await discard_cancelled_copy(['1_90'], user, new Date('2026-10-11T10:00:00Z'), root, '1_1');
      assert.deepEqual(deleted, [], 'nothing is deleted with the next person\'s session');
    });

    test('a sign-in between two deletes stops the rest of the walk', async function(assert) {
      var user = fake_user('example');
      var deleted = [];
      var at = new Date('2026-10-11T10:00:10Z');
      var root = rec(deleted, '1_90', { user_name: 'example', key: 'example/top', created: at, buttons: [{ load_board: { id: '1_91', key: 'example/top-food' } }] });
      root.save = function() { LingoLinq.session.user_id = '1_2'; return RSVP.resolve(this); }; // signs in after the first delete
      var recs = {
        '1_90': root,
        '1_91': rec(deleted, '1_91', { user_name: 'example', key: 'example/top-food', copy_id: '1_90', created: at })
      };
      var lookups = [];
      LingoLinq.store.findRecord = function(type, id) { lookups.push(id); return recs[id] ? RSVP.resolve(recs[id]) : RSVP.reject({ status: 404 }); };
      await discard_cancelled_copy(['1_90'], user, new Date('2026-10-11T10:00:00Z'), root, '1_1');
      assert.deepEqual(deleted, ['1_90'], 'only the delete made before the sign-in');
      assert.deepEqual(lookups, ['1_90'], "the next board is not even looked up with the next person's session");
    });

    test('discard_cancelled_copy still removes the copy when the same person is signed in', async function(assert) {
      var user = fake_user('example');
      var deleted = [];
      var at = new Date('2026-10-11T10:00:10Z');
      var root = rec(deleted, '1_90', { user_name: 'example', key: 'example/top', created: at });
      LingoLinq.store.findRecord = function() { return RSVP.resolve(root); };
      await discard_cancelled_copy(['1_90'], user, new Date('2026-10-11T10:00:00Z'), root, '1_1');
      assert.deepEqual(deleted, ['1_90']);
    });
  });
});
