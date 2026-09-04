import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, click } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';

QUnit.module('Integration | Component | bound-select search template', function(hooks) {
  setupRenderingTest(hooks);

  QUnit.test('a letter keydown on the rendered search input is not preventDefaulted', async function(assert) {
    this.set('content', [{ id: '1', name: 'January' }, { id: '2', name: 'June' }]);
    this.set('selection', '');
    await render(hbs`
      <BoundSelect
        @content={{this.content}}
        @selection={{this.selection}}
        @searchable={{true}}
        @grid={{true}}
        @search_placeholder="Search months"
      />
    `);
    await click('.bound-select__trigger');
    var input = document.querySelector('.bound-select__search-input');
    assert.ok(input, 'search input is in the open listbox');
    var ev = new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true });
    input.dispatchEvent(ev);
    assert.false(ev.defaultPrevented,
      'wiring the search input through ctrlAction would preventDefault and block typing');
  });
});
