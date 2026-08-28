import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';
import editManager from 'frontend/utils/edit_manager';

/* AN UNDO ENTRY IS THE WHOLE EDITABLE STATE, NOT JUST THE BUTTONS.
 *
 * Moving a button between categories used to be a RECOLOUR, so it landed on the button and
 * rode the undo stack like any other paint. It is now an assignment recorded on the board
 * (`category_layout`), which is a board ATTRIBUTE — invisible to a history entry that only
 * carries `ordered_buttons`. Without this, Undo after a category move would silently do
 * nothing, or worse, revert an unrelated earlier edit instead.
 *
 * The layout rides ON the state object rather than in a parallel stack because `save_state`
 * pushes CONDITIONALLY (its dedupe branches skip the push), so a second stack could not be
 * kept aligned. One object cannot desynchronise from itself.
 */
module('Unit | Utility | edit_manager category layout undo', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.prior_controller = editManager.controller;
    this.prior_app_state = editManager._services.app_state;
    /* update_color_key_id runs on every undo/redo and reads through here. */
    editManager._services.app_state = EmberObject.create({});
    editManager.set('history', []);
    editManager.set('future', []);
    editManager.lastChange = {};
  });

  hooks.afterEach(function() {
    editManager.controller = this.prior_controller;
    editManager._services.app_state = this.prior_app_state;
    editManager.set('history', []);
    editManager.set('future', []);
    editManager.lastChange = {};
  });

  /* No buttons: clone_state's per-button work is not what is under test here, and a real
     Button needs a real board. The empty grid still exercises the state SHAPE, which is
     what changed. */
  function wire(layout) {
    var model = EmberObject.create({ category_layout: layout });
    var controller = EmberObject.create({ ordered_buttons: [], model: model });
    editManager.controller = controller;
    return controller;
  }

  test('undo restores the layout as it was BEFORE the change', function(assert) {
    var c = wire({ order: ['people', 'actions'] });
    editManager.save_state({ mode: 'category_layout' });
    c.get('model').set('category_layout', { order: ['actions', 'people'] });

    editManager.undo();

    assert.deepEqual(c.get('model.category_layout'), { order: ['people', 'actions' ] },
      'the pre-change order is back');
  });

  test('redo re-applies it (POSITIVE CONTROL for the round trip)', function(assert) {
    var c = wire({ order: ['people', 'actions'] });
    editManager.save_state({ mode: 'category_layout' });
    c.get('model').set('category_layout', { order: ['actions', 'people'] });
    editManager.undo();
    assert.deepEqual(c.get('model.category_layout'), { order: ['people', 'actions'] },
      'PRECONDITION: undo went back, so redo has somewhere to return from');

    editManager.redo();

    assert.deepEqual(c.get('model.category_layout'), { order: ['actions', 'people'] },
      'redo returns to the changed order');
  });

  test('the buttons half of the state is still applied (POSITIVE CONTROL)', function(assert) {
    var c = wire({ order: ['people'] });
    var original_grid = c.get('ordered_buttons');
    editManager.save_state({ mode: 'category_layout' });
    var snapshot = editManager.get('history')[0];
    assert.ok(snapshot, 'PRECONDITION: an entry was pushed');
    assert.notStrictEqual(snapshot, original_grid,
      'PRECONDITION: the snapshot is its own grid, so identity below means something');

    /* A DIFFERENT empty grid, not a populated one: cloning a real button needs
       `editManager.Button`, which is wired at app boot and absent from a unit test. The
       identity check is what proves the assignment, and it does not need contents. */
    c.set('ordered_buttons', []);
    editManager.undo();

    assert.strictEqual(c.get('ordered_buttons'), snapshot,
      'undo still assigns the entry itself, so the pre-existing undo path is intact');
  });

  /* A board nobody has curated has NO category_layout. Restoring `null` or `{}` onto it
     would register in `changedAttributes()` and make an untouched board read as dirty,
     which is what `edit_session_has_changes` uses to decide whether leaving needs a
     confirm — so an undo would start prompting about work that does not exist. */
  test('an absent layout is restored as absent, not as an empty object', function(assert) {
    var c = wire(undefined);
    editManager.save_state({ mode: 'category_layout' });
    c.get('model').set('category_layout', { buttons: { '72': 'yes' } });

    editManager.undo();

    assert.strictEqual(c.get('model.category_layout'), undefined,
      'still undefined — not {} and not null');
  });

  /* An entry that did not come from clone_state carries no layout at all. Treating that as
     "no layout" would write undefined over a live one — data loss on the strength of a
     missing property. */
  test('an entry with no layout snapshot leaves the live layout alone', function(assert) {
    var c = wire({ order: ['people'] });
    editManager.set('history', [[]]);

    editManager.undo();

    assert.deepEqual(c.get('model.category_layout'), { order: ['people'] },
      'untouched');
  });

  /* The snapshot must be detached: a later edit to the live layout must not reach back and
     rewrite history. */
  test('the snapshot is a copy, not a reference to the live layout', function(assert) {
    var c = wire({ buttons: { '72': 'yes' } });
    editManager.save_state({ mode: 'category_layout' });

    // mutate the live object in place, the way a careless writer would
    c.get('model.category_layout').buttons['72'] = 'actions';
    editManager.undo();

    assert.deepEqual(c.get('model.category_layout'), { buttons: { '72': 'yes' } },
      'history kept its own copy');
  });
});
