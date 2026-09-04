import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, click } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';

/*
 * Opt-in up/down scroll controls inside the BoundSelect listbox.
 *
 * Added for the registration date-of-birth YEAR picker, whose list is long enough to
 * scroll. An AAC user driving the page by switch or eye gaze has no mouse wheel and
 * cannot drag a scrollbar, so a scrolling listbox is unreachable past its first screen
 * of options. These buttons give that scroll a hit target.
 *
 * Opt-in (`@scroll_buttons`) rather than automatic: every other BoundSelect in the app
 * shares this component, and most of their lists are short enough that two extra rows
 * would be pure clutter.
 *
 * The tests force overflow with an inline max-height rather than relying on app.scss,
 * so a stylesheet that does not load in the test environment cannot make a real
 * scrolling assertion pass or fail for the wrong reason.
 */
QUnit.module('Integration | Component | bound-select scroll buttons', function(hooks) {
  setupRenderingTest(hooks);

  function many_years() {
    var years = [];
    for(var y = 2020; y >= 1960; y--) { years.push({ id: '' + y, name: '' + y }); }
    return years;
  }

  function constrain(list) {
    // Force a scrolling box regardless of whether the app stylesheet is present.
    list.style.maxHeight = '60px';
    list.style.overflowY = 'auto';
  }

  QUnit.test('without the flag, no scroll controls are rendered', async function(assert) {
    this.set('content', many_years());
    this.set('selection', '');
    await render(hbs`<BoundSelect @content={{this.content}} @selection={{this.selection}} />`);
    await click('.bound-select__trigger');
    assert.ok(document.querySelector('.bound-select__list'), 'the list is open');
    assert.strictEqual(document.querySelectorAll('.bound-select__scroll-btn').length, 0,
      'every other dropdown in the app is unchanged');
  });

  QUnit.test('with the flag, an up and a down control render inside the list', async function(assert) {
    this.set('content', many_years());
    this.set('selection', '');
    await render(hbs`<BoundSelect @content={{this.content}} @selection={{this.selection}} @scroll_buttons={{true}} />`);
    await click('.bound-select__trigger');
    var up = document.querySelector('.bound-select__scroll--up .bound-select__scroll-btn');
    var down = document.querySelector('.bound-select__scroll--down .bound-select__scroll-btn');
    assert.ok(up, 'an up control');
    assert.ok(down, 'a down control');
    // They are chrome, not choices: a screen reader walking the listbox must not
    // announce them as two extra years.
    assert.strictEqual(up.closest('li').getAttribute('role'), 'presentation', 'up row is presentational');
    assert.strictEqual(down.closest('li').getAttribute('role'), 'presentation', 'down row is presentational');
  });

  /* Three clicks (trigger, down, up) against QUnit's 15s default is not enough budget.
     Measured on 2026-09-03: a single `click()` on this component costs ~5-6s to reach
     `settled()` -- 5011ms for the TRIGGER alone, with no scroll controls involved -- so
     the cost is the app's own test-environment startup (the IndexedDB layer boots during
     the run), not anything these controls do. Raising the budget for the one test that
     needs three clicks, rather than weakening what it asserts. */
  QUnit.test('the down control scrolls the list, and the up control brings it back', async function(assert) {
    assert.timeout(30000);
    this.set('content', many_years());
    this.set('selection', '');
    await render(hbs`<BoundSelect @content={{this.content}} @selection={{this.selection}} @scroll_buttons={{true}} />`);
    await click('.bound-select__trigger');
    var list = document.querySelector('.bound-select__list');
    constrain(list);
    assert.strictEqual(list.scrollTop, 0, 'starts at the top');

    await click('.bound-select__scroll--down .bound-select__scroll-btn');
    var after_down = list.scrollTop;
    assert.true(after_down > 0, 'the down control scrolled the list');

    await click('.bound-select__scroll--up .bound-select__scroll-btn');
    assert.true(list.scrollTop < after_down, 'the up control scrolled it back');
  });

  QUnit.test('scrolling neither closes the list nor picks a year', async function(assert) {
    var chosen = null;
    this.set('content', many_years());
    this.set('selection', '');
    this.set('onChange', function(val) { chosen = val; });
    await render(hbs`<BoundSelect @content={{this.content}} @selection={{this.selection}} @action={{this.onChange}} @scroll_buttons={{true}} />`);
    await click('.bound-select__trigger');
    constrain(document.querySelector('.bound-select__list'));
    await click('.bound-select__scroll--down .bound-select__scroll-btn');
    assert.ok(document.querySelector('.bound-select__list'), 'the list is still open');
    assert.strictEqual(chosen, null, 'no year was selected by scrolling');
  });
});
