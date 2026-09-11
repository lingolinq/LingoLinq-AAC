import { setupTest } from 'frontend/tests/helpers';
import * as QUnit from 'qunit';

/*
 * Hold Thought parks a sentence via stashes#remember, which PUSHES -- newest lands at
 * the END of `remembered_vocalizations`. utils/_stashes.js:436 says so outright:
 * "this array is PUSHED, so newest is at the END -- speak-menu.js reverses it for
 * display".
 *
 * speak-menu.js#opening builds two lists from that same array. The `saved` branch
 * honours the ordering with `.slice().reverse()` (:416) and a comment explaining that
 * without it the shortcut "permanently surfaced the user's very first saved phrase and
 * never any of the later ones" (:410-414).
 *
 * `parked` (:396) reads the same array with `.slice(0, 2)` and NO reverse, so it shows
 * the OLDEST two. Once a user has parked twice, every later Hold Thought lands at the
 * end and can never enter the window -- the thought is parked but permanently invisible.
 * Worse, re-parking an existing sentence MOVES it to the end (_stashes.js:438-442),
 * so repeating a held thought actively removes it from view.
 *
 * Asserted as an exact ordered pair, not membership: the weakest state that would
 * satisfy a "contains 'third'" assertion is a list that happens to include it while
 * still being ordered wrongly, which is the bug.
 */
QUnit.module('Unit | Component | speak-menu parked ordering', function(hooks) {
  setupTest(hooks);

  var parked_entry = function(sentence) {
    return { sentence: sentence, vocalizations: [{ label: sentence }], stash: true };
  };

  QUnit.test('parked thoughts are ordered newest first', function(assert) {
    const comp = this.owner.factoryFor('component:speak-menu').create();
    // Push order: 'first' is oldest, 'third' is the one just held.
    comp.stashes.set('remembered_vocalizations', [
      parked_entry('first'),
      parked_entry('second'),
      parked_entry('third')
    ]);

    comp.send('opening');

    const sentences = (comp.get('_phrase_parked') || []).map(function(u) { return u.sentence; });
    assert.deepEqual(sentences, ['third', 'second', 'first'],
      'newest first -- matching the `saved` branch treatment. Kept WHOLE here; the 3-row '
      + 'window and the More Thoughts overflow are asserted in speak-menu-held-thoughts-test.');
  });
});
