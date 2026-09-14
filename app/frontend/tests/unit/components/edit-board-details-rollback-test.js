import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';

/* `runClosing` folds the edited board name back into `model.translations`. It did so by
 * MUTATING the translations object in place and then re-setting the same reference:
 *
 *     const trans = this.get('model.translations');
 *     trans.board_name[locale] = this.get('model.name');
 *     this.set('model.translations', trans);
 *
 * `translations` is `attr('raw')` (models/board.js:194) and the raw transform is pure
 * pass-through (transforms/raw.js -- `deserialize(serialized) { return serialized; }`), so
 * Ember Data holds THE SAME OBJECT the payload arrived in. Mutating it in place therefore
 * mutates the pristine copy too, and `rollbackAttributes()` restores an object that already
 * carries the edit -- discarding an edit leaves the board renamed.
 *
 * Online this was masked by the refetch. It became user-visible on the OFFLINE discard path,
 * where there is no refetch to paper over it.
 *
 * These assertions are about object IDENTITY rather than Ember Data internals, because
 * identity is the actual mechanism: clone before writing and the pristine copy survives.
 * models/board.js:516 already uses `Object.assign({}, ...)` on this same field for this
 * reason -- the fix matches an idiom the model already relies on.
 */
module('Unit | Component | edit-board-details discard leaves the rename behind', function(hooks) {
  setupTest(hooks);

  function build(owner, translations) {
    var model = EmberObject.create({
      translations: translations,
      locale: 'en',
      name: 'New Name',
      home_board: false,
      visibility_setting: {}
    });
    /* The model must be assigned AFTER construction. `init` (components/edit-board-details.js:42-48)
       resolves its model from the modal service and OVERWRITES whatever was passed to
       `create({model: ...})`; under the test harness the modal service is stubbed, so a model
       handed to `create` is silently discarded and `runClosing` never sees the translations
       being asserted on. That made the first draft of this test hollow -- it passed the
       no-mutation assertion for the wrong reason, because the block under test never ran. */
    var component = owner.factoryFor('component:edit-board-details').create();
    component.set('model', model);
    return { model: model, component: component };
  }

  hooks.afterEach(function() {
    if(this.component && !this.component.isDestroyed) { this.component.destroy(); }
    this.component = null;
  });

  test('runClosing does not mutate the translations object it was given', function(assert) {
    var pristine = { board_name: { en: 'Old Name' } };
    var built = build(this.owner, pristine);
    this.component = built.component;

    built.component.runClosing();

    /* THE BUG. Pre-fix this reads 'New Name': the object Ember Data still treats as the
       last-saved value has been overwritten, so there is nothing left to roll back to. */
    assert.strictEqual(pristine.board_name.en, 'Old Name',
      'the object handed in is untouched, so the pristine copy can still be restored');
  });

  test('runClosing sets a NEW translations object rather than the same reference', function(assert) {
    var pristine = { board_name: { en: 'Old Name' } };
    var built = build(this.owner, pristine);
    this.component = built.component;

    built.component.runClosing();

    assert.notStrictEqual(built.model.get('translations'), pristine,
      'a distinct object is set, so Ember Data records a real attribute change');
  });

  test('other locales and other translation keys survive', function(assert) {
    /* The fixture in the tests above is one key and one locale, so an implementation that
       REPLACES translations with `{board_name: {[locale]: name}}` satisfies every assertion
       while destroying every other locale's board name and every per-button translation.
       `translations` holds per-button entries as siblings of `board_name`
       (models/board.js:516 reads `translations[button_id]`), and `board_name` is itself a
       locale map (components/board-icon.js:176). Both losses need to be observable. */
    var pristine = {
      board_name: { en: 'Old Name', es: 'Nombre Viejo' },
      'btn-1': { es: { label: 'hola' } }
    };
    var built = build(this.owner, pristine);
    this.component = built.component;

    built.component.runClosing();
    var out = built.model.get('translations');

    assert.strictEqual(out.board_name.es, 'Nombre Viejo', 'a sibling locale survives the copy');
    assert.deepEqual(out['btn-1'], { es: { label: 'hola' } }, 'per-button translations survive');
    assert.strictEqual(pristine['btn-1'].es.label, 'hola', 'and the pristine sibling is untouched');
    assert.strictEqual(out.board_name.en, 'New Name', 'while the rename still lands');
  });

  test('the rename is still applied', function(assert) {
    /* The control. Cloning without writing would satisfy both tests above while silently
       dropping the user's rename -- a worse bug than the one being fixed. */
    var pristine = { board_name: { en: 'Old Name' } };
    var built = build(this.owner, pristine);
    this.component = built.component;

    built.component.runClosing();

    assert.strictEqual(built.model.get('translations').board_name.en, 'New Name',
      'the edited name is written to the new object');
  });
});
