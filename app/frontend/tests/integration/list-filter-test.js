import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, fillIn, click } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';

/*
 * <ListFilter> (components/list-filter.hbs, 2026-10-01): the caseload's filter box, extracted so
 * the Rooms page uses the same control. The caseload now renders through it too, so this pins the
 * markup both depend on: named search landmark and input, placeholder, input and clear callbacks,
 * and a Clear button only while there is text.
 */
QUnit.module('Integration | Component | list-filter', function(hooks) {
  setupRenderingTest(hooks);

  QUnit.test('names the search and the field, and reports typing', async function(assert) {
    var typed = [];
    this.set('value', '');
    this.set('onInput', function(e) { typed.push(e.target.value); });
    this.set('onClear', function() {});
    await render(hbs`<ListFilter @value={{this.value}} @label="Filter rooms" @placeholder="Filter rooms by name" @onInput={{this.onInput}} @onClear={{this.onClear}} />`);
    assert.dom('[role="search"]').hasAttribute('aria-label', 'Filter rooms', 'the landmark is named');
    assert.dom('input[type="search"]').hasAttribute('aria-label', 'Filter rooms');
    assert.dom('input[type="search"]').hasAttribute('placeholder', 'Filter rooms by name');
    assert.dom('.md-caseload__filter-clear').doesNotExist('no Clear button while empty');
    await fillIn('input[type="search"]', 'speech');
    assert.deepEqual(typed, ['speech'], 'onInput gets the input event');
  });

  QUnit.test('shows Clear while there is text, and calls onClear', async function(assert) {
    var cleared = 0;
    this.set('value', 'speech');
    this.set('onInput', function() {});
    this.set('onClear', function() { cleared++; });
    await render(hbs`<ListFilter @value={{this.value}} @label="Filter rooms" @placeholder="x" @onInput={{this.onInput}} @onClear={{this.onClear}} />`);
    assert.dom('input[type="search"]').hasValue('speech');
    await click('.md-caseload__filter-clear');
    assert.strictEqual(cleared, 1);
  });
});
