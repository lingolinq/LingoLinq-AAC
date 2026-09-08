import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject, { computed } from '@ember/object';
import RSVP from 'rsvp';
import { waitUntil } from '@ember/test-helpers';
import BoardIndexController from 'frontend/controllers/board/index';
import word_suggestions from 'frontend/utils/word_suggestions';

/* The classic board-alt speak page builds its own word-prediction board id list
 * (the `board_ids:` entry in `updateSuggestions`, controllers/board/index.js) instead of
 * calling word_suggestions.lookup_board_ids, and it
 * built that list from `currentUser`. Under "Model for", `currentUser` is the SUPERVISOR:
 * set_speak_mode_user's keep_as_self branch nulls `speakModeUser` (services/app-state.js:2333), so
 * the guard at :2608 is false and the `currentUser := speakModeUser` assignment at :2609 never
 * fires, while `referenced_user` is the communicator (services/app-state.js:3946-3957).
 *
 * The list is not inert. On THIS page its only live read is the load_button_set loop at
 * utils/word_suggestions.js:840 (the vocab collectors at :1075/:1108 iterate `button_sets`, which
 * this caller does not pass). That loop stamps a symbol onto the suggestion (:807
 * `original_image`); `complete_word` then copies that url onto the utterance button
 * (the `complete_word` action in controllers/board/index.js) and speaks it. With the AI predictor on (the default), the
 * first lookup of a tuple misses -- the stamp lands after `lookup` resolves and `merge_suggestions`
 * has already copied by value -- but `last_result` aliases the stamped array, so the memo-hit
 * branch serves it on the next lookup of the same tuple. See board/index.js:199 for the trace.
 *
 * Two deliberate choices about HOW this is tested, both of which caught a defect:
 *
 * 1. These drive the real `updateSuggestions` observer, not an extracted helper. A test that
 *    called a helper would stay green if the observer stopped calling it.
 * 2. They assert the EXACT list with deepEqual, not membership. A membership assertion
 *    ("contains the communicator's board, not the supervisor's") is satisfied by
 *    `['kiddo home', ...anything]`, so it cannot reject an extra entry — and the shared
 *    lookup_board_ids shape, which re-introduces the supervisor's home board here via
 *    `root_board_state` (word_suggestions.js:1448), is exactly an extra entry. deepEqual rejects
 *    any list of the wrong length, contents or ORDER.
 *
 * SCOPE — this fix covers the home-board entry only. Two residues remain on this same path:
 *   - `temporary_root_board_state` can itself be a supervisor-owned board: on the top-nav
 *     "Model for" branch set_speak_mode_user persists `currentBoardState` as the session root
 *     (services/app-state.js:2362-2364). The last test in this file CHARACTERISES that residual
 *     rather than leaving it as prose.
 *   - `app_state.refresh_suggestions` (services/app-state.js:3295) calls the shared
 *     `lookup_board_ids` directly and so still pushes `root_board_state`. Not tested here: it is
 *     not reachable through this controller. Note it reaches the SAME symbol-stamping path this
 *     file is about (`button_sets` branch, word_suggestions.js:830), but its home-board id already
 *     resolves through `referenced_user` (word_suggestions.js:1429), so it is not an instance of
 *     THIS bug.
 * Both belong to app-state, not to this controller; see the task log.
 */
module('Unit | Controller | board/index prediction board scope', function(hooks) {
  setupTest(hooks);

  function svc(values) {
    return EmberObject.create(Object.assign({
      addObserver: function() {}, removeObserver: function() {}
    }, values || {}));
  }

  hooks.beforeEach(function() {
    this.captured = [];
    this.original_lookup = word_suggestions.lookup_with_ai;
    word_suggestions.lookup_with_ai = (options) => {
      this.captured.push(options);
      return RSVP.resolve([]);
    };
  });

  hooks.afterEach(function() {
    word_suggestions.lookup_with_ai = this.original_lookup;
    if(this.controller) { this.controller.destroy(); this.controller = null; }
  });

  /* Ids are GLOBAL ids and keys are paths — `home_board` carries both (lib/json_api/user.rb:76-77),
     and this line reads `.id`. Matching the repo's fixture shape (tests/utils/app_state-test.js:84)
     keeps the test from asserting on key-shaped values the real property never holds. */
  var SUP_HOME = { id: '1_101', key: 'sup/home' };
  var KIDDO_HOME = { id: '1_202', key: 'kiddo/home' };
  var SESSION_ROOT = { id: '1_303', key: 'kiddo/current' };
  // Deliberately distinct from every other fixture id. As the supervisor's home board it would
  // DE-DUPE inside lookup_board_ids (word_suggestions.js:1379), hiding a delegation behind an
  // identical list -- which is exactly how an earlier version of this file made a false claim.
  var OTHER_ROOT = { id: '1_909', key: 'sup/other-root' };

  /* `referenced_user` is DERIVED here, never assigned. Production computes it
     (services/app-state.js:3946-3957) from `modeling_for_user` AND `referenced_speak_mode_user`,
     and `modeling_for_user` is itself a computed (services/app-state.js:1233-1235) over
     `speak_mode`, `currentUser` and `referenced_speak_mode_user`. A fixture that assigns
     `referenced_user` directly can express states production cannot reach -- a communicator
     referenced while modelling is OFF -- and the diagnosis this file exists to pin rests on that
     computed. So these tests set only what `set_speak_mode_user` sets
     (`referenced_speak_mode_user`, services/app-state.js:2339) and let `referenced_user` fall out.
     Both mirrors are deliberately literal re-statements rather than simplifications:
     `modeling_for_user` turns on an ID COMPARISON, so two fixtures sharing an id are NOT
     modelling, and the `modeling_for_self` disjunct is kept because it is the one way
     `modeling_for_user` is true while `speak_mode` is false. */
  const AppStateStub = EmberObject.extend({
    speak_mode: true,
    eval_mode: false,
    label_locale: 'en',
    modeling_for_self: false,
    /* `currentUser.id` / `referenced_speak_mode_user.id` are declared here but NOT in the
       production computed, which lists only the bare objects (services/app-state.js:1233). That
       is the one deliberate divergence: the fixtures swap whole user objects and never mutate an
       id, so the extra keys cannot change when the bare ones do not, and declaring them keeps
       ember/require-computed-property-dependencies quiet instead of adding a new lint warning. */
    modeling_for_user: computed('speak_mode', 'currentUser', 'currentUser.id',
                                'referenced_speak_mode_user', 'referenced_speak_mode_user.id',
                                'modeling_for_self', function() {
      var res = this.get('speak_mode') && this.get('currentUser') &&
        this.get('referenced_speak_mode_user') &&
        this.get('currentUser.id') != this.get('referenced_speak_mode_user.id');
      return !!(res || this.get('modeling_for_self'));
    }),
    referenced_user: computed('modeling_for_user', 'currentUser', 'referenced_speak_mode_user',
                              function() {
      var user = this.get('currentUser');
      if(this.get('modeling_for_user') && this.get('referenced_speak_mode_user')) {
        user = this.get('referenced_speak_mode_user');
      }
      return user;
    })
  });

  /* `modelling` false is the ordinary case: no `referenced_speak_mode_user`, so `referenced_user`
     resolves to `currentUser` (services/app-state.js:3951) and both users collapse to one. */
  function build(opts) {
    opts = opts || {};
    var supervisor = EmberObject.create({
      id: 'sup-1',
      preferences: {
        word_suggestions: opts.supervisor_pref !== false,
        home_board: SUP_HOME
      }
    });
    var communicator = EmberObject.create({
      id: 'kiddo-1',
      preferences: {
        word_suggestions: opts.communicator_pref !== false,
        home_board: KIDDO_HOME
      }
    });
    return BoardIndexController.create({
      appState: AppStateStub.create({
        button_list: [],
        currentUser: supervisor,
        referenced_speak_mode_user: opts.modelling ? communicator : null
      }),
      model: EmberObject.create({ locale: 'en', name: 'Quick Core', translations: null }),
      stashes: svc({
        temporary_root_board_state: opts.session_root || SESSION_ROOT,
        // This line must never read root_board_state. Production holds the supervisor's home
        // board here on the top-nav path (app-state.js:1435 -> :1714 -> :1726); the fixture uses
        // a DISTINCT id so that delegating to the shared lookup_board_ids -- which pushes it at
        // word_suggestions.js:1448 -- shows up as a visible third entry in BOTH tests instead of
        // being swallowed by de-duplication.
        root_board_state: OTHER_ROOT
      }),
      persistence: svc(),
      router: svc()
    });
  }

  function delay(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }

  /* MUST exceed the 200ms of the inner `runLater` at controllers/board/index.js:235-237, and that
     coupling is load-bearing rather than a comfort margin: it keeps each test's own timers inside
     its own lifetime, so a straggler cannot be charged to whichever test runs NEXT.
     This used to be the ONLY thing standing between that timer and a "calling set on destroyed
     object" failure, because `set_suggestions` was unguarded. It no longer is -- the guard added
     in `set_suggestions` (controllers/board/index.js:101) now makes the late write a no-op, and
     tests/unit/controllers/board-index-suggestions-destroy-test.js covers that directly. The
     window is kept anyway so this module drains its own work rather than leaning on that guard.
     If that 200ms ever changes, this must change with it. */
  const QUIET_MS = 300;

  /* Deliberately NOT `settled()`, and this module is a worked example of why #0.10's
     "passes in isolation" tell can mislead.

     `settled()` waits for GLOBAL quiescence -- every pending Ember runloop timer in the whole
     app, not just this controller's. Measured here with `getSettledState()`: at +300ms, long
     after this observer's own timers have fired (`runLater(fn)` at 0ms and `runLater(fn, 200)`,
     controllers/board/index.js:181 and :235), `hasPendingTimers` was STILL true -- with zero
     pending requests, zero waiters, zero transitions -- and only cleared at ~2000ms. That timer
     is not ours; booting the real app-state service schedules `runLater(find_user, 2000)` on a
     failed user fetch (services/app-state.js:604), and neighbouring modules schedule their own.
     Under `--filter` those modules never run, so the wait is ~2s and invisible. In the FULL suite
     enough of them overlap that `hasPendingTimers` never goes false inside QUnit's 15s cap, and
     all four tests here HUNG -- deterministically, with an empty browser log.

     None of that is this module's business. It needs exactly one thing to have happened: the
     observer's outer `runLater` fired and called the stubbed `lookup_with_ai`. Waiting on that
     condition directly is immune to whatever other modules leave pending. */
  function speak(controller, captured) {
    controller.appState.set('button_list', [{ label: 'i' }]);
    /* `button_list` and `button_list.[]` are separate dependent keys, so the observer runs more
       than once and both firings schedule `runLater(fn, 0)` in the SAME runloop. Waiting only for
       the first capture would silently weaken assert_every_lookup, which quantifies over every
       captured call -- so hold a short quiet window afterwards to let the rest land. */
    return waitUntil(function() { return captured.length > 0; }, { timeout: 3000 })
      .then(function() { return delay(QUIET_MS); });
  }

  /* The gate case: the lookup is SUPPRESSED, so there is no condition to wait for. A bounded
     real-time window is the only option; 400ms is well past the observer's own 0ms scheduling
     and far below anything that would look like a hang. */
  function speak_expecting_silence(controller) {
    controller.appState.set('button_list', [{ label: 'i' }]);
    return delay(QUIET_MS + 100);
  }

  /* One deepEqual over every captured call: `button_list` and `button_list.[]` are separate
     dependent keys, so the observer runs more than once, and one correctly-scoped call is no use
     if another leaks. `.slice()` per row keeps the failure diff readable — repeating one array
     reference serializes as `[object Object]`. The length assertion must come first: an empty
     capture makes `deepEqual([], [])` vacuously green. */
  function assert_every_lookup(assert, captured, expected) {
    assert.true(captured.length > 0, 'the observer ran the lookup at least once');
    assert.deepEqual(
      captured.map(function(o) { return (o || {}).board_ids; }),
      captured.map(function() { return expected.slice(); }),
      `every lookup searched exactly ${JSON.stringify(expected)}`
    );
  }

  test('while modelling, the lookup searches the COMMUNICATOR home board, not the supervisor\'s', async function(assert) {
    assert.expect(2);
    this.controller = build({ modelling: true });
    await speak(this.controller, this.captured);

    assert_every_lookup(assert, this.captured, [KIDDO_HOME.id, SESSION_ROOT.id]);
  });

  test('when referenced_user and currentUser are the same user, the list is [own home, session root]', async function(assert) {
    // The control: not modelling, so the change must be a no-op. deepEqual also rejects an ADDED
    // entry, so the rejected "just delegate to lookup_board_ids" shape fails here too -- it would
    // append root_board_state (word_suggestions.js:1448).
    assert.expect(2);
    this.controller = build({ modelling: false });
    await speak(this.controller, this.captured);

    assert_every_lookup(assert, this.captured, [SUP_HOME.id, SESSION_ROOT.id]);
  });

  /* The gate at board/index.js:165 decides WHETHER to look up, and it reads `referenced_user` too. The fix's
     comment argues its own correctness from that gate, so the gate's user source has to be
     observable here — with `word_suggestions: true` on both fixtures it is not, and reverting
     :159 to `currentUser` leaves every other test in this file green. */
  test('the on/off gate follows the communicator, not the supervisor', async function(assert) {
    assert.expect(2);
    this.controller = build({ modelling: true, supervisor_pref: false, communicator_pref: true });
    await speak(this.controller, this.captured);
    assert.true(this.captured.length > 0,
      'the communicator has prediction ON, so it runs even though the supervisor has it OFF');

    this.controller.destroy();
    this.captured = [];
    this.controller = build({ modelling: true, supervisor_pref: true, communicator_pref: false });
    await speak_expecting_silence(this.controller);
    assert.strictEqual(this.captured.length, 0,
      'the communicator has it OFF, so it stays off even though the supervisor has it ON');
  });

  /* CHARACTERISATION of a KNOWN RESIDUAL, not a guard on desired behaviour. The tests above
     fixture entry 2 as the COMMUNICATOR's board -- which is the assumption production VIOLATES on
     the top-nav "Model for" path: that path passes jump_home FALSE
     (controllers/application.js:1177), so set_speak_mode_user falls to its else branch
     (services/app-state.js:2358) and :2364 persists `currentBoardState` -- wherever the SUPERVISOR
     happened to be, their own home board included.
     This pins exactly what the shipped fix does and does not do: entry 1 follows the communicator,
     entry 2 is still whatever the stash holds. Without it the file only ever exercises the
     favourable fixture, and the SCOPE note above stays an unchecked prose claim.
     WHEN entry 2 is fixed, this test must be UPDATED to expect the communicator's board -- it is
     deliberately written so that fixing the residual turns it red rather than leaving it silently
     asserting stale behaviour. */
  test('KNOWN RESIDUAL: a supervisor-owned session root is still searched while modelling', async function(assert) {
    assert.expect(2);
    this.controller = build({ modelling: true, session_root: SUP_HOME });
    await speak(this.controller, this.captured);

    assert_every_lookup(assert, this.captured, [KIDDO_HOME.id, SUP_HOME.id]);
  });
});
