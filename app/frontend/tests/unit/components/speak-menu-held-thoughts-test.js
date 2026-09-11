import { setupTest } from 'frontend/tests/helpers';
import * as QUnit from 'qunit';

/*
 * Held thoughts belong to the ACTIONS section, not to the Phrases library.
 *
 * Hold Thought parks a sentence and closes the menu, so the only way back to it is the
 * next time the menu opens. Previously the parked entries were concatenated into
 * `all_phrases` and therefore sat behind the "Show My Phrases" expander, which
 * `opening()` re-collapses on every open -- a held thought was two activations away and
 * visually filed under someone else's saved-phrase library. They are not a library: a
 * held thought exists in one slot, is saved nowhere, and is lost if it is not picked up.
 *
 * The two most recent are shown inline; "More Thoughts" reveals the rest IN PLACE. It
 * deliberately does NOT hand off to the Phrases modal, which was the first design: that
 * modal renders only `category_phrases`, which filters on `u.category === cat`
 * (components/phrases.js:124), while held thoughts are pushed into its list with no
 * `category` at all (`:67-72`; the comment at `:147-150` says so). They appear in none of
 * its tabs, so the hand-off led to an empty list.
 */
QUnit.module('Unit | Component | speak-menu held thoughts', function(hooks) {
  setupTest(hooks);

  var entry = function(sentence, stash) {
    return { sentence: sentence, vocalizations: [{ label: sentence }], stash: stash };
  };
  var sentences = function(list) {
    return (list || []).map(function(u) { return u.sentence; });
  };

  /* Both halves are asserted because either alone is satisfiable by a broken state:
     exposing `heldThoughts` while STILL concatenating parked into `all_phrases` would
     render the rows twice, and removing them from `all_phrases` without exposing
     `heldThoughts` would lose them entirely. */
  QUnit.test('held thoughts are exposed outside the Phrases library', function(assert) {
    const comp = this.owner.factoryFor('component:speak-menu').create();
    comp.stashes.set('remembered_vocalizations', [
      entry('saved one', false),
      entry('held one', true)
    ]);

    comp.send('opening');

    assert.deepEqual(sentences(comp.get('heldThoughts')), ['held one'],
      'held thoughts are available without expanding the phrase library');

    // Even fully expanded, the library is saved phrases only.
    comp.set('phrases_expanded', true);
    assert.deepEqual(sentences(comp.get('all_phrases')), ['saved one'],
      'the phrase library no longer carries held thoughts');
  });

  /* The window is asserted as an exact ordered pair rather than a length, because a list
     that is correctly 2 long but ordered oldest-first is the exact bug that made a
     just-parked thought invisible. */
  QUnit.test('shows the 2 most recent, and offers More Thoughts beyond that', function(assert) {
    const comp = this.owner.factoryFor('component:speak-menu').create();
    comp.stashes.set('remembered_vocalizations', [
      entry('oldest', true),
      entry('third', true),
      entry('second', true),
      entry('newest', true)
    ]);

    comp.send('opening');

    assert.deepEqual(sentences(comp.get('heldThoughts')), ['newest', 'second'],
      'the two most recent, newest first -- the older two fall outside the window');
    assert.true(comp.get('heldThoughtsOverflow'),
      'a third held thought turns on More Thoughts');
  });

  QUnit.test('More Thoughts expands the list in place, and collapses again', function(assert) {
    const comp = this.owner.factoryFor('component:speak-menu').create();
    comp.stashes.set('remembered_vocalizations', [
      entry('oldest', true),
      entry('third', true),
      entry('second', true),
      entry('newest', true)
    ]);

    comp.send('opening');
    assert.strictEqual((comp.get('heldThoughts') || []).length, 2, 'collapsed on open');

    comp.send('more_thoughts');
    assert.deepEqual(sentences(comp.get('heldThoughts')),
      ['newest', 'second', 'third', 'oldest'],
      'expanding reveals the whole list, still newest first');
    assert.true(comp.get('heldThoughtsOverflow'),
      'the control stays available while expanded, so the list can be collapsed again');

    comp.send('more_thoughts');
    assert.strictEqual((comp.get('heldThoughts') || []).length, 2,
      'the same control collapses it -- it is a disclosure, not a one-way reveal');
  });

  QUnit.test('expansion does not survive re-opening the menu', function(assert) {
    const comp = this.owner.factoryFor('component:speak-menu').create();
    comp.stashes.set('remembered_vocalizations', [
      entry('a', true), entry('b', true), entry('c', true), entry('d', true)
    ]);

    comp.send('opening');
    comp.send('more_thoughts');
    assert.strictEqual((comp.get('heldThoughts') || []).length, 4, 'expanded');

    // Re-opening collapses, like the phrase library above it -- a leftover expansion
    // would push the sections below out of reach on a short screen.
    comp.send('opening');
    assert.strictEqual((comp.get('heldThoughts') || []).length, 2,
      'collapsed again on the next open');
  });

  QUnit.test('no More Thoughts control when everything already fits', function(assert) {
    const comp = this.owner.factoryFor('component:speak-menu').create();
    comp.stashes.set('remembered_vocalizations', [
      entry('a', true),
      entry('b', true)
    ]);

    comp.send('opening');

    assert.strictEqual((comp.get('heldThoughts') || []).length, 2, 'both are shown');
    assert.false(comp.get('heldThoughtsOverflow'),
      'exactly two is not overflow -- an offer to see "more" with nothing more behind it '
      + 'is a dead end, and costs a scanning user a whole cycle to discover that');
  });
});
