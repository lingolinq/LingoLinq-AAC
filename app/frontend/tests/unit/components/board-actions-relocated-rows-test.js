import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';

/*
 * Board Ideas · Button Stash · Set as Home Board, relocated 2026-08-24 from the
 * board-detail edit panel's "Board Actions" group into this modal.
 *
 * Why this file exists at all: `suggestions` and `open_button_stash` had NO other
 * render site anywhere in the app. Deleting the panel rows without rehoming them
 * would have made Button Stash unreachable from every surface — the same failure
 * the Board Actions modal was built to undo, where a board-detail redesign moved
 * nine actions onto an edit-mode-only surface and four ended up with no route.
 *
 * A ctrlAction naming a handler that does not exist passes eslint AND
 * template-lint and simply does nothing when clicked. So the load-bearing
 * assertion here is the dull one: the three handlers exist on THIS component.
 */
module('Unit | Component | board-actions relocated rows', function(hooks) {
  setupTest(hooks);

  function build(owner, opts) {
    opts = opts || {};
    const component = owner.factoryFor('component:board-actions').create();
    component.set('appState', EmberObject.create({
      currentUser: opts.currentUser || null,
      referenced_user: opts.referenced_user || null
    }));
    component.set('model', { board: opts.board || null });
    return component;
  }

  function userWithHome(key) {
    return EmberObject.create({ preferences: { home_board: key ? { key: key } : {} } });
  }

  hooks.afterEach(function() {
    if (this.component) { this.component.destroy(); this.component = null; }
  });

  test('all three relocated handlers exist on the component', function(assert) {
    assert.expect(3);
    this.component = build(this.owner, {});
    ['suggestions', 'open_button_stash', 'set_as_home'].forEach((name) => {
      assert.strictEqual(typeof this.component.actions[name], 'function',
        `${name} is wired — the rows send it, and a missing handler fails silently`);
    });
  });

  test('the edit-requiring rows are gated on edit permission', function(assert) {
    this.component = build(this.owner, { board: { key: 'bob/kb', permissions: { edit: false } } });
    assert.true(this.component.get('cannot_edit'), 'Board Ideas and Button Stash disable without edit rights');

    this.component.set('model', { board: { key: 'bob/kb', permissions: { edit: true } } });
    assert.false(this.component.get('cannot_edit'), 'and enable with them');
  });

  /* Set as Home is deliberately NOT gated on cannot_edit: setting a board as your
     home board needs no edit permission on it (User#process_home_board authorizes
     on `view`), which is the entire point of picking a public vocabulary. */
  test('Set as Home is offered without edit permission', function(assert) {
    this.component = build(this.owner, {
      currentUser: userWithHome('bob/other'),
      board: { key: 'someone/public-vocab', permissions: { edit: false } }
    });
    assert.true(this.component.get('cannot_edit'), 'no edit rights on this board');
    assert.true(this.component.get('can_set_as_home'), 'but it can still become your home board');
  });

  test('Set as Home is withheld when the board is already home', function(assert) {
    this.component = build(this.owner, {
      currentUser: userWithHome('bob/kb'),
      board: { key: 'bob/kb' }
    });
    assert.true(this.component.get('is_subject_home_board'));
    assert.false(this.component.get('can_set_as_home'), 'setting it again is a no-op');
  });

  /* The comparison that bites: a user with no home board has `home_board.key`
     undefined, and `undefined === undefined` would report EVERY board as
     already-home and withhold the row from exactly the people who have not set
     one. Both sides must be non-empty. */
  test('a user with NO home board is still offered the row', function(assert) {
    this.component = build(this.owner, {
      currentUser: userWithHome(null),
      board: { key: 'bob/kb' }
    });
    assert.false(this.component.get('is_subject_home_board'), 'empty must not match empty');
    assert.true(this.component.get('can_set_as_home'));
  });

  test('a board with no key is never treated as home', function(assert) {
    this.component = build(this.owner, { currentUser: userWithHome('bob/kb'), board: {} });
    assert.false(this.component.get('is_subject_home_board'));
  });

  test('the subject is referenced_user, not the signed-in supporter', function(assert) {
    // Supporter's own home board is bob/kb; the communicator being viewed has a
    // different one. The row must stay — it would be set for the communicator.
    this.component = build(this.owner, {
      currentUser: userWithHome('bob/kb'),
      referenced_user: userWithHome('amy/core'),
      board: { key: 'bob/kb' }
    });
    assert.false(this.component.get('is_subject_home_board'),
      "the supporter's own home board is irrelevant to the communicator being viewed");
    assert.true(this.component.get('can_set_as_home'));
  });

  test('a signed-out visitor is offered nothing', function(assert) {
    this.component = build(this.owner, { board: { key: 'bob/kb' } });
    assert.false(this.component.get('can_set_as_home'));
  });

  /* Reads a board that exposes `get()` (an Ember-Data record) as well as the
     plain object the modal is usually handed, because both shapes reach here. */
  test('the home comparison works on an Ember-Data style board too', function(assert) {
    this.component = build(this.owner, {
      currentUser: userWithHome('bob/kb'),
      board: EmberObject.create({ key: 'bob/kb' })
    });
    assert.true(this.component.get('is_subject_home_board'), 'reads key via get()');
  });
});
