import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import BoardDetailController from 'frontend/controllers/user/board-detail';
import wordSuggestions from 'frontend/utils/word_suggestions';
import buttonTracker from 'frontend/utils/raw_events';
import scanner from 'frontend/utils/scanner';

/* Coverage for the two prediction-panel behaviours that three rounds of adversarial
   review found broken and that no existing harness reaches: the symbol-image memo, and
   the predicate that decides whether a word swap must be withheld from the user.

   Both matter to AAC users specifically — a word that loses its symbol is unreadable to a
   symbol-reliant user, and a swap under a live dwell selects a word they never chose — and
   both were previously verified only by reasoning. The Puppeteer probe
   (scripts/prediction-rail-qa.mjs) covers neither: it hardcodes the side_rail placement and
   never inspects suggestion.image. */

function stubService() {
  return EmberObject.create({
    get: function() { return null; },
    set: function() { return null; },
    addObserver: function() {},
    removeObserver: function() {}
  });
}

function buildController() {
  return BoardDetailController.create({
    app_state: EmberObject.create({}),
    appState: EmberObject.create({}),
    persistence: stubService(),
    stashes: stubService(),
    router: stubService(),
    session: stubService()
  });
}

module('Unit | Controller | user/board-detail prediction hold', function(hooks) {
  let restore = [];
  const patch = (obj, key, value) => {
    restore.push([obj, key, obj[key]]);
    obj[key] = value;
  };
  hooks.afterEach(function() {
    restore.reverse().forEach(([obj, key, value]) => { obj[key] = value; });
    restore = [];
    document.querySelectorAll('.qa-pred-fixture').forEach((n) => n.remove());
  });

  test('a resolved symbol is replayed onto later lookups of the same word', function(assert) {
    assert.expect(3);
    let capturedCallback = null;
    patch(wordSuggestions, 'resolve_word_image', function() { return null; });
    patch(wordSuggestions, 'attach_image_for_label', function(word, ids, cb) { capturedCallback = cb; });

    const controller = buildController();
    controller._find_local_image_for_label = function() { return null; };
    controller._suggestion_lookup_board_ids = function() { return []; };
    controller._republish_suggestion_list = function() {};

    try {
      const first = [{ word: 'hello' }];
      controller._decorate_suggestion_images(first);
      assert.ok(capturedCallback, 'the first lookup requests an image');

      capturedCallback('https://example.test/hello.png');
      assert.strictEqual(first[0].image, 'https://example.test/hello.png', 'the requesting list gets the image');

      /* Every lookup builds FRESH item objects (word_suggestions#merge_suggestions), so this
         is a different object for the same word. Before the memo fix the latch held only
         `true`, so this hit the early return and rendered with no symbol — permanently. */
      const second = [{ word: 'hello' }];
      controller._decorate_suggestion_images(second);
      assert.strictEqual(second[0].image, 'https://example.test/hello.png',
        'a later lookup of the same word keeps the symbol instead of coming back bare');
    } finally {
      controller.destroy();
    }
  });

  test('the symbol memo does not replay a symbol across a different board set', function(assert) {
    assert.expect(3);
    /* attach_image_for_label resolves through the button sets of `lookup_ids`, so the same word
       can legitimately resolve differently per board set — and the memo is cleared only in
       clear_sentence. Keyed on the bare word it would replay board A's symbol onto board B: a
       confidently WRONG symbol, worse for a symbol-reliant user than the missing one it replaced.
       The sibling memo test stubs the board ids to [] for both calls, so it passes either way and
       is not coverage for this. Mutation that fails this: revert the key to the bare word. */
    let calls = 0;
    let capturedCallback = null;
    patch(wordSuggestions, 'resolve_word_image', function() { return null; });
    patch(wordSuggestions, 'attach_image_for_label', function(word, ids, cb) { calls++; capturedCallback = cb; });

    const controller = buildController();
    controller._find_local_image_for_label = function() { return null; };
    controller._republish_suggestion_list = function() {};

    try {
      controller._suggestion_lookup_board_ids = function() { return ['board-a']; };
      const onA = [{ word: 'mom' }];
      controller._decorate_suggestion_images(onA);
      capturedCallback('https://example.test/mom-on-a.png');
      assert.strictEqual(onA[0].image, 'https://example.test/mom-on-a.png', 'resolves on board A');

      controller._suggestion_lookup_board_ids = function() { return ['board-b']; };
      const onB = [{ word: 'mom' }];
      controller._decorate_suggestion_images(onB);
      assert.strictEqual(calls, 2, 'a different board set triggers a fresh lookup');
      assert.notOk(onB[0].image, "and board A's symbol is not replayed onto board B");
    } finally {
      controller.destroy();
    }
  });

  test('_prediction_panel_targeted only trusts a LIVE dwell linger', function(assert) {
    assert.expect(4);
    const tile = railFixture();

    patch(buttonTracker, 'appState', { get: function(k) { return k === 'speak_mode' ? true : null; } });
    patch(buttonTracker, 'dwell_enabled', true);
    patch(buttonTracker, 'dwell_timeout', 1000);
    patch(buttonTracker, 'dwell_selection', 'dwell');
    patch(scanner, 'actively_scanning', function() { return false; });

    const controller = buildController();
    try {
      patch(buttonTracker, 'last_dwell_linger', { dom: tile, updated: (new Date()).getTime() });
      assert.ok(controller._prediction_panel_targeted(), 'a fresh linger over a tile is targeted');

      buttonTracker.last_dwell_linger = { dom: tile, updated: (new Date()).getTime() - 600000 };
      assert.notOk(controller._prediction_panel_targeted(),
        'a stale linger is NOT targeted — last_dwell_linger is sticky by design and never clears in button mode');

      buttonTracker.last_dwell_linger = { dom: tile, updated: (new Date()).getTime() };
      buttonTracker.dwell_enabled = false;
      assert.notOk(controller._prediction_panel_targeted(), 'no dwell configured means not targeted');

      buttonTracker.dwell_enabled = true;
      tile.closest('.md-board-detail-prediction-rail').remove();
      assert.notOk(controller._prediction_panel_targeted(), 'a detached node is not a live target');
    } finally {
      controller.destroy();
    }
  });

  test('the loading cue survives a burst of image republishes', async function(assert) {
    assert.expect(2);
    /* _republish_suggestion_list carries `loading` through and fires once per resolved symbol
       image. The cue observer used to clear and restart its countdown on every `suggestions`
       write, so a lookup whose images resolved faster than the delay reset the timer
       indefinitely and the cue never appeared — on exactly the slow lookups it exists for. */
    const controller = buildController();
    try {
      controller.set('_suggestions_loading_cue_delay', 60);
      controller.set('suggestions', { ready: true, list: [{ word: 'hello' }], loading: true });

      /* Keep republishing THROUGHOUT a window several times the delay, and assert while the
         burst is still going. An earlier version of this test stopped republishing and then
         waited, which let the restarted timer fire and passed against the bug it was meant to
         catch — the failure is "the cue never appears WHILE images keep resolving", so the
         assertion has to land inside that window. */
      const deadline = Date.now() + 300;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 20));
        controller._republish_suggestion_list();
      }
      assert.true(controller.get('suggestions_loading_visible'),
        'the cue appears during a continuous republish burst, not only once it stops');

      controller.set('suggestions', { ready: true, list: [{ word: 'hello' }] });
      await new Promise((r) => setTimeout(r, 20));
      assert.false(controller.get('suggestions_loading_visible'),
        'and retracts once the lookup resolves');
    } finally {
      controller.destroy();
    }
  });

  test('_republish_suggestion_list does not assert ready over a list that has none', function(assert) {
    assert.expect(2);
    /* It runs from an image callback that may belong to a superseded set. `ready` gates the
       in-bar placement, so publishing it early claims the panel is up to date when it is not. */
    const controller = buildController();
    try {
      controller.set('suggestions', { list: [{ word: 'hello' }], loading: true });
      controller._republish_suggestion_list();
      assert.notOk(controller.get('suggestions.ready'), 'ready is not invented');

      controller.set('suggestions', { ready: true, list: [{ word: 'hello' }] });
      controller._republish_suggestion_list();
      assert.true(controller.get('suggestions.ready'), 'but a real ready is carried through');
    } finally {
      controller.destroy();
    }
  });

  function railFixture() {
    /* The rail's DEFAULT is `display: none`; it is shown only via an ancestor shell class
       (.md-shell--wordpred-side-rail, or the <=1024px media rule). The suite loads the real
       stylesheet, so a bare rail appended to <body> is genuinely hidden — and any predicate that
       filters on visibility would then reject it for a reason unrelated to what is under test.
       Wrap it in the shell the app actually renders. */
    const shell = document.createElement('div');
    shell.className = 'md-shell md-shell--board-detail md-shell--wordpred-side-rail qa-pred-fixture';
    const rail = document.createElement('div');
    rail.className = 'md-board-detail-prediction-rail';
    const tile = document.createElement('button');
    tile.className = 'md-board-detail-sentence-bar__prediction';
    rail.appendChild(tile);
    shell.appendChild(rail);
    document.body.appendChild(shell);
    return tile;
  }
  const wordsOf = (list) => (list || []).map((s) => s.word).join(',');

  test('the freeze holds the displayed words while the panel is targeted', async function(assert) {
    assert.expect(2);
    const tile = railFixture();
    patch(scanner, 'actively_scanning', function() { return false; });
    patch(scanner, 'current_element', { dom: [tile] });
    patch(buttonTracker, 'appState', { get: function() { return null; } });
    patch(buttonTracker, 'last_dwell_linger', null);

    const controller = buildController();
    try {
      controller.set('suggestions', { ready: true, list: [{ word: 'A' }] });
      assert.strictEqual(wordsOf(controller.get('prediction_suggestions')), 'A', 'renders the live list when untargeted');

      scanner.actively_scanning = function() { return true; };
      controller.set('suggestions', { ready: true, list: [{ word: 'B' }] });
      assert.strictEqual(wordsOf(controller.get('prediction_suggestions')), 'A',
        'a change arriving while targeted does not move the tile under the user');
    } finally {
      controller.destroy();
    }
  });

  test('after a release, the NEXT freeze snapshots the words that replaced them', async function(assert) {
    assert.expect(4);
    /* The bookkeeping used to record what ARRIVED rather than what RENDERED, and was never
       refreshed on release — so a later freeze snapped the panel back to a set the user had
       never seen, from two changes ago. Selecting one of those speaks it and trains the local
       model through record_selection, so this is not cosmetic. */
    const tile = railFixture();
    patch(scanner, 'actively_scanning', function() { return false; });
    patch(scanner, 'current_element', { dom: [tile] });
    patch(buttonTracker, 'appState', { get: function() { return null; } });
    patch(buttonTracker, 'last_dwell_linger', null);

    const controller = buildController();
    try {
      controller.set('_prediction_hold_standard_ms', 60);
      controller.set('suggestions', { ready: true, list: [{ word: 'A' }] });

      scanner.actively_scanning = function() { return true; };
      controller.set('suggestions', { ready: true, list: [{ word: 'B' }] });
      assert.strictEqual(wordsOf(controller.get('prediction_suggestions')), 'A', 'frozen on A');

      /* TWO writes must land while frozen. With only one, "record on arrival" (the bug) and
         "refresh on release" (the fix) coincide on the same value and the test passes either
         way — verified by reverting the fix and watching an earlier version of this test stay
         green. The divergence needs a second suppressed write. */
      controller.set('suggestions', { ready: true, list: [{ word: 'C' }] });
      assert.strictEqual(wordsOf(controller.get('prediction_suggestions')), 'A', 'still frozen on A');

      await new Promise((r) => setTimeout(r, 260));   // bound elapses, poll releases
      assert.strictEqual(wordsOf(controller.get('prediction_suggestions')), 'C', 'released to the live list, C');

      controller.set('suggestions', { ready: true, list: [{ word: 'D' }] });
      assert.strictEqual(wordsOf(controller.get('prediction_suggestions')), 'C',
        'the next freeze holds C — what was actually on screen — not B, which never rendered');
    } finally {
      controller.destroy();
    }
  });

  test('an UNTARGETED refresh never freezes, once a list is already displayed', function(assert) {
    assert.expect(2);
    /* The sibling test's "untargeted control" cannot fail: on the first write
       _displayed_prediction_list is undefined, so `showing` is falsy and should_freeze is false
       regardless of the targeting term. Removing _prediction_panel_targeted() from the
       conjunction entirely — freezing on EVERY refresh for EVERY user — leaves that test green.
       Priming with a real write first is what makes the targeting term load-bearing.
       Mutation that fails this: drop _prediction_panel_targeted() from should_freeze. */
    const tile = railFixture();
    patch(scanner, 'actively_scanning', function() { return false; });
    patch(scanner, 'current_element', { dom: [tile] });
    patch(buttonTracker, 'appState', { get: function() { return null; } });
    patch(buttonTracker, 'last_dwell_linger', null);

    const controller = buildController();
    try {
      controller.set('suggestions', { ready: true, list: [{ word: 'A' }] });   // primes the field
      controller.set('suggestions', { ready: true, list: [{ word: 'B' }] });
      controller.set('suggestions', { ready: true, list: [{ word: 'C' }] });
      assert.strictEqual(wordsOf(controller.get('prediction_suggestions')), 'C',
        'an untargeted panel always renders the live list');
      assert.notOk(controller.get('_prediction_freeze_list'), 'and never engages a freeze');
    } finally {
      controller.destroy();
    }
  });

  test('_suggestion_swap_max_hold derives the bound from the dwell configuration', function(assert) {
    assert.expect(4);
    /* Collapsing this to a constant 2000 leaves the whole suite green, yet it governs BOTH how
       long a freeze may last and how long a dwell linger counts as live. speak_mode must be true
       or buttonTracker.check() returns null and everything collapses to the standard bound
       silently. dwell_timeout is set explicitly because it is a sticky module singleton with no
       declared default — otherwise case 1 is order-dependent on whatever ran before it. */
    patch(buttonTracker, 'appState', { get: function(k) { return k === 'speak_mode' ? true : null; } });
    patch(buttonTracker, 'dwell_enabled', true);
    patch(buttonTracker, 'dwell_timeout', 1000);
    patch(buttonTracker, 'dwell_selection', 'dwell');

    const controller = buildController();
    try {
      assert.strictEqual(controller._suggestion_swap_max_hold(), 2000, 'auto dwell: the standard bound');

      buttonTracker.dwell_selection = 'button';
      assert.strictEqual(controller._suggestion_swap_max_hold(), 8000,
        'switch-paced dwell never self-completes, so it gets the long bound');

      buttonTracker.dwell_selection = 'dwell';
      buttonTracker.dwell_timeout = 3000;
      assert.strictEqual(controller._suggestion_swap_max_hold(), 6000,
        'a long dwell_duration raises the bound so it always clears the dwell itself');

      /* The guard the code calls load-bearing: dwell_selection is a sticky singleton that
         app-state never resets, so a device where dwell was once on must not hand a non-dwell
         user the long bound. All three cases above run with dwell_enabled true, so without this
         the guard is never exercised. */
      buttonTracker.dwell_enabled = false;
      buttonTracker.dwell_selection = 'button';
      assert.strictEqual(controller._suggestion_swap_max_hold(), 2000,
        'dwell OFF gets the standard bound despite the sticky dwell_selection');
    } finally {
      controller.destroy();
    }
  });

  test('_deduped_suggestions drops repeats, blanks, and survives the constructor trap', function(assert) {
    assert.expect(1);
    /* Both {{#each}}s key on `word`, so a duplicate is a duplicate Glimmer key. Removing the
       de-dupe kills nothing anywhere in the suite. The 'constructor' element pins the documented
       object-map trap (seen['constructor'] is truthy on a bare {}), and the empty-word element
       covers the `!word` term, which a 3-element fixture leaves alive. */
    const controller = buildController();
    try {
      const out = controller._deduped_suggestions([
        { word: 'a' }, { word: 'a' }, { word: 'constructor' }, { word: '' }, { word: 'constructor' }
      ]).map((s) => s.word);
      assert.deepEqual(out, ['a', 'constructor'], 'one of each real word, no blanks');
    } finally {
      controller.destroy();
    }
  });

  test('a clear ENDS an in-flight freeze, for both blank shapes', async function(assert) {
    assert.expect(6);
    /* The proposal for this fix originally specified a test that passes at HEAD with the bug
       present: its first write was untargeted, so no freeze ever engaged and there was nothing
       to release, making both assertions trivially true. The guard below — asserting the freeze
       actually engaged, while STILL targeted — is what makes it a detector. Fourth instance of
       that coincidence-pass pattern on this branch. */
    const tile = railFixture();
    patch(scanner, 'actively_scanning', function() { return false; });
    patch(scanner, 'current_element', { dom: [tile] });
    patch(buttonTracker, 'appState', { get: function() { return null; } });
    patch(buttonTracker, 'last_dwell_linger', null);

    const controller = buildController();
    try {
      // shape 1: the Clear path, which goes via null
      controller.set('suggestions', { ready: true, list: [{ word: 'A' }] });
      scanner.actively_scanning = function() { return true; };
      controller.set('suggestions', { ready: true, list: [{ word: 'B' }] });
      assert.strictEqual(wordsOf(controller.get('prediction_suggestions')), 'A', 'guard: freeze engaged');

      controller.set('suggestions', null);            // still targeted
      assert.strictEqual(wordsOf(controller.get('prediction_suggestions')), '',
        'a clear blanks the rail immediately rather than holding for the bound');
      assert.notOk(controller.get('_prediction_freeze_list'), 'and the freeze is released');

      // shape 2: {ready:true, list:[]} — reachable from an empty sentence, an AI reject and a
      // lookup reject, and missed entirely by a `suggestions === null` predicate
      scanner.actively_scanning = function() { return false; };
      controller.set('suggestions', { ready: true, list: [{ word: 'C' }] });
      scanner.actively_scanning = function() { return true; };
      controller.set('suggestions', { ready: true, list: [{ word: 'D' }] });
      assert.strictEqual(wordsOf(controller.get('prediction_suggestions')), 'C', 'guard: freeze engaged again');

      controller.set('suggestions', { ready: true, list: [] });
      assert.strictEqual(wordsOf(controller.get('prediction_suggestions')), '',
        'an empty result blanks it too, so both placements agree');
      assert.notOk(controller.get('_prediction_freeze_list'), 'and that freeze is released');
    } finally {
      controller.destroy();
    }
  });

  test('a blanking write does not START a freeze', async function(assert) {
    assert.expect(2);
    /* The rail renders from prediction_suggestions while the in-bar group gates on
       suggestions.ready, so freezing a blanking write makes the two disagree and leaves the
       rail offering predictions for a sentence that no longer exists. */
    const tile = railFixture();
    patch(scanner, 'actively_scanning', function() { return false; });
    patch(scanner, 'current_element', { dom: [tile] });
    patch(buttonTracker, 'appState', { get: function() { return null; } });
    patch(buttonTracker, 'last_dwell_linger', null);

    const controller = buildController();
    try {
      controller.set('suggestions', { ready: true, list: [{ word: 'A' }] });
      scanner.actively_scanning = function() { return true; };

      controller.set('suggestions', null);
      assert.strictEqual(wordsOf(controller.get('prediction_suggestions')), '',
        'the panel blanks with the sentence rather than holding its words');
      assert.notOk(controller.get('_prediction_freeze_list'), 'and no freeze was engaged');
    } finally {
      controller.destroy();
    }
  });

  test('_prediction_panel_targeted counts the in-bar TILE, not the row that contains it', function(assert) {
    assert.expect(5);
    /* The scanner sweeps the in-bar prediction buttons into the header row, whose dom IS
       #speak — and the group is a DESCENDANT of it. An ancestor-only `closest` test reported
       "not targeted" for the whole speak_bar placement (and every `auto` user above 1024px). */
    const speakRow = document.createElement('div');
    speakRow.className = 'md-board-detail-sentence-row qa-pred-fixture';
    speakRow.id = 'speak';
    const group = document.createElement('span');
    group.className = 'md-board-detail-sentence-bar__prediction-group';
    group.appendChild(document.createElement('button'));
    speakRow.appendChild(group);
    document.body.appendChild(speakRow);

    patch(buttonTracker, 'appState', { get: function() { return null; } });
    patch(buttonTracker, 'last_dwell_linger', null);
    patch(scanner, 'actively_scanning', function() { return true; });
    patch(scanner, 'current_element', { dom: [speakRow] });

    const controller = buildController();
    try {
      assert.notOk(controller._prediction_panel_targeted(),
        'scanning the HEADER ROW does not count — it contains the group, but it is mostly Home/Back/Clear');

      /* What replaced it: once the user drills in, the scanner's current_element IS the prediction
         button (the header row's children come from a `#speak button:visible` sweep), so the
         ancestor test matches its group. That is where in-bar protection actually lives. */
      const inBarTile = group.querySelector('button');
      scanner.current_element = { dom: [inBarTile] };
      assert.ok(controller._prediction_panel_targeted(),
        'but the drilled-in prediction BUTTON does');

      /* A realistic unrelated scan element: another ROW. Deliberately not document.body —
         body CONTAINS the fixture, so the containment half of the test would match. That is
         not a false positive in practice (scanner.current_element is always a row or a child
         within one, never a document-level ancestor), but it does mean the containment test
         is only sound while that stays true. */
      const otherRow = document.createElement('div');
      otherRow.className = 'md-board-detail-grid__cell qa-pred-fixture';
      document.body.appendChild(otherRow);
      scanner.current_element = { dom: [otherRow] };
      assert.notOk(controller._prediction_panel_targeted(),
        'scanning an unrelated row is not targeting the panel');

      /* The hidden placement must NOT count. `side_rail` is the default and hides the in-bar
         group with CSS while leaving it inside #speak — and the scanner's header row IS #speak,
         so without a visibility filter this reported "targeted" on the header row of every pass.
         display is set inline here on purpose: the predicate is under test, not the cascade.
         Mutation that fails this: drop scanner.is_visible from the descendant branch. */
      /* Visibility is still load-bearing, but it is now asked of the panel the TILE closes up to,
         not of a row that merely contains one. A hidden placement stays in the DOM — side_rail
         hides the in-bar group with CSS — so without the filter a freeze could engage against a
         panel that is not on screen. display is set inline on purpose: the predicate is under
         test, not the cascade. */
      scanner.current_element = { dom: [inBarTile] };
      assert.ok(controller._prediction_panel_targeted(), 'guard: a VISIBLE group still counts');
      group.style.display = 'none';
      assert.notOk(controller._prediction_panel_targeted(),
        'a display:none placement does not count as targeted');
    } finally {
      controller.destroy();
    }
  });

  test('a highlight placed by a post-commit RESTART does not count as targeting', function(assert) {
    assert.expect(2);
    /* complete_word -> pick_elem nulls current_element and calls scanner.start(), which lands on
       elements[0]. With the `scanning_skip_header` preference on and the default side_rail
       placement, elements[0] IS the prediction row — so the highlight sits on the panel without
       the user having navigated there, and the lookup the selection triggered would freeze against
       it. Mutation that fails this: drop the `restart_placed` term. */
    const tile = railFixture();
    const rail = tile.closest('.md-board-detail-prediction-rail');
    patch(buttonTracker, 'appState', { get: function() { return null; } });
    patch(buttonTracker, 'last_dwell_linger', null);
    patch(scanner, 'actively_scanning', function() { return true; });
    patch(scanner, 'current_element', { dom: [rail] });
    patch(scanner, 'started', (new Date()).getTime());
    patch(scanner, 'element_index', 0);

    const controller = buildController();
    try {
      controller._last_prediction_commit_at = scanner.started - 10;   // the restart followed a commit
      assert.notOk(controller._prediction_panel_targeted(),
        'a restart-placed highlight on index 0 is not a reach the user made');

      scanner.element_index = 1;   // the user advanced
      assert.ok(controller._prediction_panel_targeted(),
        'once they navigate, the same row does count');
    } finally {
      controller.destroy();
    }
  });

  test('a dwell linger older than the last committed prediction does not justify a freeze', function(assert) {
    assert.expect(3);
    /* Releasing the freeze when a word is selected is a half-fix: the lookup the selection
       triggers arrives while the same linger is still stamped, so the panel re-freezes on the
       pre-selection list. Requiring the linger to be NEWER than the commit blocks that.
       Mutation that fails this: drop the `stamped <= _last_prediction_commit_at` term. */
    const tile = railFixture();
    patch(scanner, 'actively_scanning', function() { return false; });
    patch(scanner, 'current_element', { dom: [tile] });
    patch(buttonTracker, 'appState', { get: function(k) { return k === 'speak_mode' ? true : null; } });
    patch(buttonTracker, 'dwell_enabled', true);
    patch(buttonTracker, 'dwell_timeout', 1000);
    patch(buttonTracker, 'dwell_selection', 'dwell');

    const controller = buildController();
    try {
      const now = (new Date()).getTime();
      patch(buttonTracker, 'last_dwell_linger', { dom: tile, updated: now });
      assert.ok(controller._prediction_panel_targeted(), 'guard: a fresh linger is targeted');

      controller._last_prediction_commit_at = now + 5;
      assert.notOk(controller._prediction_panel_targeted(),
        'a linger predating the selection cannot re-freeze the panel');

      buttonTracker.last_dwell_linger = { dom: tile, updated: now + 50 };
      assert.ok(controller._prediction_panel_targeted(),
        'but a genuinely new reach after the selection does count again');
    } finally {
      controller.destroy();
    }
  });


  /* A faithful board + rail in the real stylesheet, so getBoundingClientRect returns real
     layout. tests/index.html loads assets/frontend.css, which is what makes this a
     measurement rather than a mock. The shell class is required: the rail is display:none
     by default (app.scss:72751) and only becomes a grid under a wordpred shell (:72905). */
  function boardAndRailFixture(rows, cols, shapeClass, withSidebar) {
    const shell = document.createElement('div');
    shell.className = 'md-shell md-shell--board-detail md-shell--wordpred-side-rail qa-pred-fixture';
    shell.style.cssText = 'width:640px;height:420px;position:absolute;left:-9999px;top:0;';
    const main = document.createElement('div');
    main.className = 'md-board-detail-main';
    const wrap = document.createElement('div');
    wrap.className = 'md-board-detail-grid-sidebar-wrap';
    wrap.style.cssText = 'display:flex;align-items:flex-start;width:640px;height:420px;';
    const fade = document.createElement('div');
    fade.className = 'md-board-detail-grid-fade';
    fade.style.cssText = 'flex:1;min-width:0;';
    const grid = document.createElement('div');
    grid.className = 'md-board-detail-grid board speak ' + (shapeClass || 'md-board-detail-grid--shape-square');
    grid.style.setProperty('--board-rows', String(rows));
    grid.style.setProperty('--board-columns', String(cols));
    grid.style.cssText += ';height:420px;display:grid;grid-template-columns:repeat(' + cols +
      ',minmax(0,1fr));grid-template-rows:repeat(' + rows + ',minmax(0,1fr));';
    for(let i = 0; i < rows * cols; i++) {
      const cell = document.createElement('div');
      cell.className = 'md-board-detail-grid__cell';
      const card = document.createElement('div');
      card.className = 'md-board-detail-symbol-card';
      const label = document.createElement('span');
      label.className = 'md-board-detail-symbol-card__label';
      label.textContent = 'word';
      card.appendChild(label);
      cell.appendChild(card);
      grid.appendChild(cell);
    }
    fade.appendChild(grid);
    const rail = document.createElement('div');
    rail.className = 'md-board-detail-prediction-rail';
    for(let i = 0; i < rows; i++) {
      const tile = document.createElement('button');
      tile.className = 'md-board-detail-sentence-bar__prediction';
      const span = document.createElement('span');
      span.className = 'md-board-detail-sentence-bar__prediction-label';
      span.textContent = 'you';
      tile.appendChild(span);
      rail.appendChild(tile);
    }
    wrap.appendChild(fade);
    wrap.appendChild(rail);
    if(withSidebar) {
      const sidebar = document.createElement('div');
      sidebar.className = 'md-board-detail-inline-sidebar';
      sidebar.style.cssText = 'flex:0 0 auto;width:112px;height:420px;';
      wrap.appendChild(sidebar);
    }
    main.appendChild(wrap);
    shell.appendChild(main);
    document.body.appendChild(shell);
    return { grid, rail, main,
      card: grid.querySelector('.md-board-detail-symbol-card'),
      cell: grid.querySelector('.md-board-detail-grid__cell'),
      tile: rail.querySelector('.md-board-detail-sentence-bar__prediction') };
  }

  /* Real-layout parity. These measure getBoundingClientRect in the browser the suite runs
     in, against the app's own compiled stylesheet (tests/index.html loads
     assets/frontend.css) — so they fail if the CSS and the published vars disagree, which
     is the whole class of bug this rail keeps producing. */
  function measureParity(shape, withSidebar) {
    document.querySelectorAll('.qa-pred-fixture').forEach(function(n) { n.remove(); });
    const f = boardAndRailFixture(4, 5, shape, withSidebar);
    const controller = buildController();
    controller.set('ordered_buttons', Array.from({ length: 4 }, function() {
      return Array.from({ length: 5 }, function() { return {}; });
    }));
    controller._sync_prediction_tile_size();
    const c = f.card.getBoundingClientRect();
    const t = f.tile.getBoundingClientRect();
    return {
      dH: Math.round(t.height - c.height),
      dW: Math.round(t.width - c.width),
      dTop: Math.round(t.top - c.top),
      cardH: Math.round(c.height)
    };
  }

  test('a rail tile is the same box as a board button, in every button shape', function(assert) {
    assert.expect(10);
    ['square', 'tall', 'wide'].forEach(function(shape) {
      const m = measureParity('md-board-detail-grid--shape-' + shape, false);
      assert.strictEqual(m.dH, 0, shape + ': tile height matches the board card');
      assert.strictEqual(m.dW, 0, shape + ': tile width matches the board card');
      assert.strictEqual(m.dTop, 0, shape + ': tile top aligns with the board card');
    });
    /* Guard the guard: `wide` must actually be a SHORTER card than the others, or all
       three assertions above could be passing against a fixture where the shape class
       never applied. */
    assert.ok(measureParity('md-board-detail-grid--shape-wide', false).cardH <
              measureParity('md-board-detail-grid--shape-square', false).cardH,
              'the wide shape really did produce a shorter card');
  });

  test('a rail tile matches the board button whether the sidebar is open or closed', function(assert) {
    assert.expect(7);
    const closed = measureParity('md-board-detail-grid--shape-square', false);
    const open = measureParity('md-board-detail-grid--shape-square', true);
    assert.strictEqual(closed.dH, 0, 'sidebar closed: height matches');
    assert.strictEqual(closed.dW, 0, 'sidebar closed: width matches');
    assert.strictEqual(closed.dTop, 0, 'sidebar closed: top aligns');
    assert.strictEqual(open.dH, 0, 'sidebar open: height matches');
    assert.strictEqual(open.dW, 0, 'sidebar open: width matches');
    assert.strictEqual(open.dTop, 0, 'sidebar open: top aligns');
    /* The board buttons themselves get narrower when the sidebar takes width, so the tile
       must track them rather than hold a fixed size. If these were equal, the fixture never
       actually gave the sidebar any width and the two cases above are the same test twice. */
    assert.strictEqual(open.cardH, closed.cardH, 'row heights are unaffected by the sidebar');
  });

  /* The rail width solver. Arithmetic, not DOM: the point of the closed form is that it
     does NOT need a settled layout, so a test that built one would be testing the wrong
     thing. */
  test('solves a rail width equal to one board button, from ANY current split', function(assert) {
    assert.expect(4);
    const controller = buildController();
    /* Split-invariance is the property the whole fix rests on: the grid is flex:1, so
       fade + rail is one budget however it currently divides. Three different splits of the
       same 500px budget must agree, or the value chases its own tail across ResizeObserver
       passes — the circular-measure bug recorded in LEARNINGS. */
    const a = controller._solve_prediction_rail_width(400, 100, 4, 0, 1);
    const b = controller._solve_prediction_rail_width(450, 50, 4, 0, 1);
    const c = controller._solve_prediction_rail_width(499, 1, 4, 0, 1);
    assert.strictEqual(Math.round(a), 100, 'solved from a 400/100 split');
    assert.strictEqual(Math.round(b), 100, 'same answer from a 450/50 split');
    assert.strictEqual(Math.round(c), 100, 'same answer from a 499/1 split');
    /* A genuine fixed point: leaving the grid 400px over 4 columns gives a 100px cell,
       which is the tile width just solved. */
    assert.strictEqual(Math.round((500 - a) / 4), Math.round(a), 'tile equals the resulting cell');
  });

  test('solves a NARROWER tile for a tall button shape', function(assert) {
    assert.expect(3);
    const controller = buildController();
    /* shape-tall makes the card 66.6667% of its cell (app.scss:80286), so the tile must
       fall by the same ratio. A solver ignoring `ratio` returns 100 here; one using the
       full-column `cols + 1` denominator returns 67. Neither is 71. */
    const square = controller._solve_prediction_rail_width(400, 100, 4, 0, 1);
    const tall = controller._solve_prediction_rail_width(400, 100, 4, 0, 2 / 3);
    assert.strictEqual(Math.round(square), 100, 'square shape fills the column');
    assert.strictEqual(Math.round(tall), 71, 'tall shape tracks the card, not the column');
    assert.ok(tall < square, 'a tall button yields a narrower tile');
  });

  test('is stable on a one-column board, where iterating would oscillate forever', function(assert) {
    assert.expect(2);
    const controller = buildController();
    /* The iterative form has gain -ratio/cols, exactly -1 at cols === 1: a permanent
       period-2 flip. Feeding the closed form its own output returns the same number. */
    const once = controller._solve_prediction_rail_width(400, 100, 1, 0, 1);
    const twice = controller._solve_prediction_rail_width(500 - once, once, 1, 0, 1);
    assert.strictEqual(Math.round(once), 250, 'solved once');
    assert.strictEqual(Math.round(twice), Math.round(once), 're-solving from its own output is a no-op');
  });

  test('returns 0 rather than a bogus width when the board is not measurable', function(assert) {
    assert.expect(3);
    const controller = buildController();
    /* The caller falls back to the measured card width on 0, so a bail must be
       distinguishable from a real answer. */
    assert.strictEqual(controller._solve_prediction_rail_width(0, 100, 4, 0, 1), 0, 'unmeasured grid');
    assert.strictEqual(controller._solve_prediction_rail_width(400, 100, 0, 0, 1), 0, 'no columns');
    assert.strictEqual(controller._solve_prediction_rail_width(400, 100, 4, 0, 0), 0, 'no shape ratio');
  });

});
