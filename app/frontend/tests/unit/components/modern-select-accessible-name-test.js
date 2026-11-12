import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';

/* ModernSelect's trigger names its value (components/modern-select.js `accessibleName`, 2026-11-09).
 * `aria-label` replaces a button's text, so a bare `@ariaLabel` hid the selection from screen
 * readers; it is now "<label>, <current choice or placeholder>". Every ModernSelect in the app takes
 * this, so it is pinned here (senior-dev review 2026-11-10). */
module('Unit | Component | modern-select accessible name', function(hooks) {
  setupTest(hooks);

  function select(context, attrs) {
    return context.owner.factoryFor('component:modern-select').create(attrs);
  }
  var CONTENT = [{ id: 'a', name: "Apples" }, { id: 'b', name: "Bananas" }];

  test('label and the current choice', function(assert) {
    assert.strictEqual(select(this, { ariaLabel: "Fruit", content: CONTENT, selection: 'b' }).get('accessibleName'), "Fruit, Bananas");
  });

  test('label and the placeholder when nothing is chosen', function(assert) {
    assert.strictEqual(select(this, { ariaLabel: "Fruit", content: CONTENT, selection: null, placeholder: "Pick one" }).get('accessibleName'), "Fruit, Pick one");
  });

  test('no @ariaLabel: no aria-label, so the button text (the choice) names it, as before', function(assert) {
    assert.strictEqual(select(this, { ariaLabel: '', content: CONTENT, selection: 'a' }).get('accessibleName'), null);
  });
});
