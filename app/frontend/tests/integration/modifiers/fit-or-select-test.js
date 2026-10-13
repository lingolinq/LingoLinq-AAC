import { module, test } from 'qunit';
import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, settled, waitUntil } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { htmlSafe } from '@ember/template';

/* {{fit-or-select}} marks its element `is-squeezed` while the `.ch-tabs` strip inside it needs
 * more width than it has, and clears the mark when there is room again (2026-10-02). The strip
 * stays measurable while squeezed, so it can switch back without a guess at the width. */
module('Integration | Modifier | fit-or-select', function(hooks) {
  setupRenderingTest(hooks);

  test('squeezed while the tabs overflow, cleared when they fit', async function(assert) {
    this.set('w', htmlSafe('width: 300px'));
    await render(hbs`<div id="fit" style={{this.w}} {{fit-or-select}}><nav class="ch-tabs" style="display: flex;"><span style="flex: 0 0 500px;">tabs</span></nav><details class="md-pillnav-dropdown md-pillnav-dropdown--fit"></details></div>`);
    var el = this.element.querySelector('#fit');
    await waitUntil(function() { return el.classList.contains('is-squeezed'); }, { timeout: 2000 }).catch(function() {});
    assert.true(el.classList.contains('is-squeezed'), '300px of room for 500px of tabs');
    this.set('w', htmlSafe('width: 800px'));
    await settled();
    await waitUntil(function() { return !el.classList.contains('is-squeezed'); }, { timeout: 2000 }).catch(function() {});
    assert.false(el.classList.contains('is-squeezed'), '800px: the tabs fit again');
  });
});
