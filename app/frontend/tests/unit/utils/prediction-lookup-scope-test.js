import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import word_suggestions from 'frontend/utils/word_suggestions';

/* `lookup_board_ids` (word_suggestions.js:1348-1424) decides WHICH boards a prediction lookup
   searches. Everything downstream -- admission, the scope stamp, the symbol walk -- operates on
   the list it returns, so an id that does not belong to the speaking communicator is a leak that
   no admission rule can catch: the set admitted for such an id is genuinely the set covering that
   board, and the admission rule cannot know the id itself is foreign.

   Two ways another person's board reaches the list today, both traced in
   docs/task-management/2026-09-05-buttonset-cross-communicator-scope.md:

   1. `:1401` and `:1403` read the user. They read `currentUser` until the change this file
      ships with; that route is CLOSED and test 1 below is the green guard on it, not a red one.
      It mattered because under "Model for", `set_speak_mode_user`'s
      `keep_as_self` branch nulls `speakModeUser` (app-state.js:2333), so the
      `currentUser := speakModeUser` assignment in `set_current_user` never fires and
      `currentUser` stays the SUPERVISOR -- while `referenced_user` (app-state.js:3946-3956) is
      the communicator, and the utterance is logged against the communicator
      (services/stashes.js:801-805).

   2. `:1419` reads `temporary_root_board_state`. STILL OPEN — test 2 is red on it. Switching communicator from the in-session
      speak menu passes `jump_home = false` (controllers/application.js:1177), which takes
      `set_speak_mode_user`'s final else branch (app-state.js:2358-2365) and persists the board
      the supervisor is CURRENTLY on -- the previous communicator's -- into that stash. Already
      being in speak mode, the `toggle_speak_mode()` guard at :2359 does not fire, so :1799,
      the line that normally nulls the stash, never runs. The stash is a single global slot
      (`stashes.js:57`, prefix 'lingolinqStash-'), not namespaced per user.

   Neither needs two communicators to share a board record. */

/* Answers only the keys lookup_board_ids reads. `referenced_user` and `currentUser` are modelled
   SEPARATELY so a fix that keeps reading `currentUser` cannot pass, and one that reads
   `referenced_user` cannot pass by accident either -- under speak-as they are the same person and
   the third test pins that case. */
function app_state_stub(opts) {
  var user_for = function(prefs) {
    if(!prefs) { return null; }
    return EmberObject.create({
      get: function(key) {
        if(key === 'preferences.sidebar_boards') { return prefs.sidebar_boards || []; }
        if(key === 'preferences.sync_starred_boards') { return !!prefs.sync_starred_boards; }
        if(key === 'stats.starred_board_refs') { return prefs.starred_board_refs || []; }
        if(key === 'preferences.home_board.id') { return prefs.home_board_id || null; }
        if(key === 'global_id' || key === 'id') { return prefs.global_id || null; }
        return null;
      }
    });
  };
  var current = user_for(opts.current_user);
  var referenced = user_for(opts.referenced_user);
  /* Delegates by PREFIX rather than matching literal path strings. The real service is a plain
     Ember Service with real path-get, so `get('referenced_user.preferences.sidebar_boards')` and
     `get('referenced_user').get('preferences.sidebar_boards')` are equivalent there. A stub that
     answered only the literal forms this file happens to use would fail a CORRECT fix written the
     other way -- an under-permissive stub produces false reds, which is the harder failure to
     diagnose. */
  return EmberObject.create({
    get: function(key) {
      if(key === 'currentUser') { return current; }
      if(key === 'referenced_user') { return referenced; }
      if(key === 'currentBoardState.id') { return opts.current_board_id || null; }
      if(key === 'sidebar_boards') { return opts.app_sidebar_boards || []; }
      if(key === 'speak_mode') { return true; }
      if(key === 'modeling_for_user') {
        return (opts.current_user || {}).global_id !== (opts.referenced_user || {}).global_id;
      }
      if(key.indexOf('currentUser.') === 0) {
        return current && current.get(key.slice('currentUser.'.length));
      }
      if(key.indexOf('referenced_user.') === 0) {
        return referenced && referenced.get(key.slice('referenced_user.'.length));
      }
      return null;
    }
  });
}

/* The stash as it exists TODAY: a bare board state with no record of whose board it is
   (app-state.js:2364 persists `currentBoardState` verbatim). A fix that adds attribution at the
   write site must therefore FAIL CLOSED on an unattributed value -- which is also the right
   behaviour for values already in localStorage from before such a change. */
function stashes_stub(opts) {
  return EmberObject.create({
    get: function(key) {
      if(key === 'temporary_root_board_state') { return opts.temporary_root || null; }
      if(key === 'temporary_root_board_state.id') { return (opts.temporary_root || {}).id || null; }
      if(key === 'root_board_state') { return opts.root || null; }
      if(key === 'root_board_state.id') { return (opts.root || {}).id || null; }
      return null;
    }
  });
}

module('Unit | Utility | prediction lookup ids are scoped to the speaking user', function() {

  /* GREEN, and it is the guard on the change this file ships with. It was RED when written:
     `currentUser` is the supervisor under "Model for", so the supervisor's own home board -- and
     their sidebar and starred boards -- were searched on B's behalf and stamped into B's scope
     bucket. Reverting either `:1401` or `:1403` to `currentUser` turns it red again, and a
     PARTIAL revert of just one of them is caught too: the three assertions cover the home board
     (`:1401`) and the sidebar/starred reads (`:1403`) separately. */
  test('the supervisor\'s own boards are not searched while modelling for a communicator', function(assert) {
    const appState = app_state_stub({
      current_user: {
        global_id: 'supervisor-1',
        home_board_id: 'supervisor-home',
        sidebar_boards: [{ key: 'supervisor/sidebar' }],
        sync_starred_boards: true,
        starred_board_refs: [{ id: 'supervisor-starred' }]
      },
      referenced_user: { global_id: 'b-user', home_board_id: 'b-home' },
      current_board_id: 'b-home'
    });

    const ids = word_suggestions.lookup_board_ids(appState, null);

    assert.strictEqual(ids.indexOf('supervisor-home'), -1,
      'the supervisor\'s home board is not searched for the communicator (got: ' + ids.join(',') + ')');
    assert.strictEqual(ids.indexOf('supervisor-starred'), -1,
      'the supervisor\'s starred boards are not searched for the communicator');
    assert.strictEqual(ids.indexOf('supervisor/sidebar'), -1,
      'the supervisor\'s sidebar boards are not searched for the communicator');
  });

  /* KNOWN BROKEN — test.todo, so the suite stays green and flips to a failure the moment someone
     fixes it. Deferred unit: scoping `currentBoardState.id` and the two stash roots, which is a
     separate change from the `referenced_user` substitution this file ships with (see
     docs/task-management/2026-09-05-buttonset-cross-communicator-scope.md, "STILL OPEN").

     The in-session speak-menu switch, modelled as the traced flow ACTUALLY leaves things —
     not as a convenient fixture. `set_speak_mode_user`'s else branch (app-state.js:2358-2365) does
     not navigate: the supervisor stays on communicator A's board. So after the switch to B, ALL
     THREE of these hold at once, and `tests/utils/app_state-test.js:1633-1638` asserts exactly
     this state for the real function:
       - `currentBoardState.id` is still A's board (:1638 asserts 'trains-1', the pre-switch board)
       - `temporary_root_board_state` is A's board (:1634)
       - `root_board_state` is stale — null on this path (:1633), and A's home when modelling was
         entered via the jump path first (app-state.js:1913 -> :1995 -> :1726)
     An earlier version of this test set the current board to B's home, which the flow never
     produces; it therefore could not see that `:1402` pushes the foreign board unguarded. */
  test.todo('a previous communicator\'s boards are not searched after an in-session switch', function(assert) {
    const appState = app_state_stub({
      current_user: { global_id: 'b-user', home_board_id: 'b-home' },
      referenced_user: { global_id: 'b-user', home_board_id: 'b-home' },
      current_board_id: 'a-board'
    });
    /* In the real flow the temporary root IS the board on screen, so these two ids coincide.
       They are given DISTINCT values here on purpose: with one shared id no assertion can tell
       which push site produced it, and deleting :1409 would leave the test red for the other
       reason and look pinned when it is not. */
    const stashes = stashes_stub({
      temporary_root: { id: 'a-temp-board', key: 'studenta/temp' },
      root: { id: 'a-home', key: 'studenta/root' }
    });

    const ids = word_suggestions.lookup_board_ids(appState, stashes);

    assert.strictEqual(ids.indexOf('a-board'), -1,
      'the board still on screen (:1402) does not carry the previous communicator into the new one\'s search (got: ' + ids.join(',') + ')');
    assert.strictEqual(ids.indexOf('a-temp-board'), -1,
      'nor does the temporary root left behind by the switch (:1419)');
    assert.strictEqual(ids.indexOf('a-home'), -1,
      'nor does the stale root_board_state (:1420) — it leaks identically and by the same route');
  });

  /* MUST STAY GREEN. Split into two positives, each with a SINGLE source for the id it asserts.
     An earlier single test gave the communicator `home_board_id: 'b-home'` AND
     `root_board_state: {id: 'b-home'}`, so `b-home` reached the list from BOTH :1401 and :1420
     and one assertion could not tell them apart. The consequence was not theoretical: dropping
     :1401, :1414 and :1419 outright left the whole file green. Every id asserted in the GREEN
     guards below is now reachable by exactly one route; the todo test above achieves the same by
     giving its three leaked ids distinct values. */
  test('the communicator\'s own home board is searched — from the user, with no stash present', function(assert) {
    const appState = app_state_stub({
      current_user: { global_id: 'b-user', home_board_id: 'b-home' },
      referenced_user: { global_id: 'b-user', home_board_id: 'b-home' },
      current_board_id: 'b-sub-board'
    });

    /* No stashes at all, and the home board differs from the board they are on, so :1401 is the
       only line that can supply it. */
    const ids = word_suggestions.lookup_board_ids(appState, null);

    assert.notStrictEqual(ids.indexOf('b-home'), -1, 'the communicator\'s home board is searched');
    assert.notStrictEqual(ids.indexOf('b-sub-board'), -1, 'the board they are on is searched');
  });

  /* MUST STAY GREEN. `root_board_state` is how the communicator's own home board reaches the
     lookup under modelling (app-state.js:1913 -> :1995 -> :1726), so it must survive any guard
     placed on the stash reads. Its id is deliberately unlike every other id in the fixture. */
  test('the communicator\'s own root_board_state is searched', function(assert) {
    const appState = app_state_stub({
      current_user: { global_id: 'b-user', home_board_id: 'b-home' },
      referenced_user: { global_id: 'b-user', home_board_id: 'b-home' },
      current_board_id: 'b-sub-board'
    });
    const stashes = stashes_stub({ root: { id: 'b-modelled-root', key: 'studentb/root' } });

    const ids = word_suggestions.lookup_board_ids(appState, stashes);

    assert.notStrictEqual(ids.indexOf('b-modelled-root'), -1,
      'the root the communicator was placed on when modelling began is searched');
  });

  /* MUST STAY GREEN. The sidebar reaches the list by TWO routes -- `preferences.sidebar_boards`
     off the user (:1406) and `appState.sidebar_boards` (:1414), which itself resolves through
     from `referenced_user` (app-state.js:3844-3846). Both are given distinct ids so neither can
     stand in for the other, and so a fix that deletes the redundant user-side block in favour of
     :1414 is not failed for the wrong reason. */
  test('the communicator\'s sidebar and starred boards are searched, by both routes', function(assert) {
    const appState = app_state_stub({
      current_user: { global_id: 'b-user', home_board_id: 'b-home' },
      referenced_user: {
        global_id: 'b-user',
        home_board_id: 'b-home',
        sidebar_boards: [{ key: 'studentb/keyboard' }],
        sync_starred_boards: true,
        starred_board_refs: [{ id: 'b-starred' }]
      },
      app_sidebar_boards: [{ id: 'b-app-sidebar' }],
      current_board_id: 'b-sub-board'
    });

    const ids = word_suggestions.lookup_board_ids(appState, null);

    assert.notStrictEqual(ids.indexOf('b-app-sidebar'), -1,
      'the resolved sidebar boards are searched (:1414)');
    assert.notStrictEqual(ids.indexOf('studentb/keyboard'), -1,
      'the sidebar boards named in the communicator\'s own preferences are searched');
    assert.notStrictEqual(ids.indexOf('b-starred'), -1, 'their starred boards are searched');
  });
});
