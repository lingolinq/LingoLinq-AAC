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

  test('_prediction_panel_targeted only trusts a LIVE dwell linger', function(assert) {
    assert.expect(4);
    const rail = document.createElement('div');
    rail.className = 'md-board-detail-prediction-rail qa-pred-fixture';
    const tile = document.createElement('button');
    tile.className = 'md-board-detail-sentence-bar__prediction';
    rail.appendChild(tile);
    document.body.appendChild(rail);

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
      rail.remove();
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

  test('_prediction_panel_targeted covers the IN-BAR group, which is a descendant of the scanned row', function(assert) {
    assert.expect(2);
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
      assert.ok(controller._prediction_panel_targeted(),
        'scanning the header row counts as targeting the in-bar predictions it contains');

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
    } finally {
      controller.destroy();
    }
  });
});
