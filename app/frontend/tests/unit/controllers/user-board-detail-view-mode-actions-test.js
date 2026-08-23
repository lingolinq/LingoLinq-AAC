import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';

/*
 * Gates for "Set as Home" and "Make a Copy" in VIEW mode.
 *
 * Both actions already existed but rendered only inside the left edit panel,
 * which is wrapped in {{#if this.edit_mode}} (board-detail.hbs:121 -> :130).
 * The journey that needs them most -- a supporter evaluating a vocabulary they
 * do NOT own -- cannot enter edit mode without first being prompted to copy, so
 * two independent usability reviews concluded the actions did not exist. It is
 * not cosmetic: a board only works offline once copied and set as home.
 *
 * The gates are deliberately NOT can_edit_or_copy_board, which short-circuits
 * to true on edit permission and would therefore offer "Make a Copy" on a board
 * the owner is not permitted to copy. That case is the third test below.
 */
module('Unit | Controller | user/board-detail view-mode actions', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.controller = this.owner.factoryFor('controller:user/board-detail').create();
  });

  hooks.afterEach(function() {
    if(this.controller) {
      this.controller.destroy();
      this.controller = null;
    }
  });

  function board(attrs) {
    return EmberObject.create(attrs || {});
  }

  test('a signed-out visitor is offered neither', function(assert) {
    this.controller.set('app_state', EmberObject.create({ sessionUser: null }));
    this.controller.set('model', board({}));
    assert.false(!!this.controller.get('can_set_as_home'), 'no home board without an account');
    assert.false(!!this.controller.get('can_copy_board'), 'no copy without an account');
  });

  test('a signed-in visitor on someone else\'s copyable board is offered both', function(assert) {
    this.controller.set('app_state', EmberObject.create({ sessionUser: EmberObject.create({ id: '1_1' }) }));
    // no permissions.edit -- this is the evaluate-a-public-vocabulary case
    this.controller.set('model', board({ permissions: { edit: false } }));
    assert.true(!!this.controller.get('can_set_as_home'), 'can set a board they do not own as home');
    assert.true(!!this.controller.get('can_copy_board'), 'can copy it');
  });

  test('an owner is NOT offered a copy of an uncopyable board', function(assert) {
    this.controller.set('app_state', EmberObject.create({ sessionUser: EmberObject.create({ id: '1_1' }) }));
    this.controller.set('model', board({ permissions: { edit: true }, uncopyable: true }));
    assert.true(!!this.controller.get('can_edit_or_copy_board'),
      'can_edit_or_copy_board is true here -- which is exactly why it must not gate the copy button');
    assert.false(!!this.controller.get('can_copy_board'), 'copy is withheld on an uncopyable board');
  });

  test('a for-sale board cannot be copied', function(assert) {
    this.controller.set('app_state', EmberObject.create({ sessionUser: EmberObject.create({ id: '1_1' }) }));
    this.controller.set('model', board({ for_sale: true }));
    assert.false(!!this.controller.get('can_copy_board'), 'copy is withheld on a for-sale board');
    assert.true(!!this.controller.get('can_set_as_home'), 'but it can still be set as home');
  });

  /*
   * Guards the exact wiring the template depends on. This test earned its keep
   * immediately: the first version of the view-mode button sent "copy_board",
   * a name that does not exist on this controller (the copy action is
   * `make_a_copy`; `copy_board` is a method on the APPLICATION controller that
   * `make_a_copy` delegates to). Template-lint and eslint both pass on a
   * ctrlAction naming a non-existent action -- it simply does nothing at
   * runtime, which is the same silent-dead-control failure this whole change
   * exists to fix.
   */
  test('the actions the view-mode buttons send both exist', function(assert) {
    assert.strictEqual(typeof this.controller.actions.set_as_home, 'function', 'set_as_home');
    assert.strictEqual(typeof this.controller.actions.make_a_copy, 'function', 'make_a_copy');
  });
});
