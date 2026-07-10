import { module, test } from 'qunit';
import { setupTest } from '../../helpers';

// Regression: Ember 5 {{on}} does not bind classic component methods; the
// visibility toggle must route through ctrlAction + actions so click handlers
// keep the component as `this` (see password-field.js, LEARNINGS.md).
module('Unit | Component | password-field', function(hooks) {
  setupTest(hooks);

  test('togglePasswordVisibility flips showPassword via ctrlAction handler', function(assert) {
    var component = this.owner.factoryFor('component:password-field').create();

    assert.false(component.get('showPassword'), 'starts hidden');
    assert.strictEqual(component.get('inputType'), 'password');

    var toggle = component.ctrlAction('togglePasswordVisibility');
    toggle();
    assert.true(component.get('showPassword'), 'first click reveals password');
    assert.strictEqual(component.get('inputType'), 'text');

    toggle();
    assert.false(component.get('showPassword'), 'second click hides password again');
    assert.strictEqual(component.get('inputType'), 'password');
  });
});
