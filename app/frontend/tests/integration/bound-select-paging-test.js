import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, click, fillIn } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';

/*
 * Opt-in PAGING for the listbox (`@paged`), used by the registration year picker.
 *
 * This replaced scroll-by-pixels, which was broken two ways at once -- measured in a real
 * browser on 2026-09-03, 4-column year grid, 358px scrollport:
 *
 *   after 0 clicks: visible 2026..2015, OCCLUDED 2014..2007
 *   after 1 click : visible 2010..1995, OCCLUDED 2014..2011 and 1994..1987
 *
 * The sticky up/down controls sat INSIDE the scrollport, so rows slid underneath them and
 * were never readable at rest; and the step (round(358*0.8) = 286px) was larger than the
 * un-occluded band (~254px), so a whole row of years was skipped on every click. 2014-2011
 * could not be reached at all.
 *
 * Sticky controls inside a scroll container cannot be fixed by tuning the step -- content
 * always slides under them. Paging removes the scrollport entirely: a page renders only
 * what fits, so nothing can hide behind anything.
 *
 * THE CONTRACT, in the words it was reported in: the last item on a page and the first item
 * on the next must be consecutive -- no year skipped, none repeated.
 */
QUnit.module('Integration | Component | bound-select paging', function(hooks) {
  setupRenderingTest(hooks);

  function years(from, to) {
    var out = [];
    for (var y = from; y >= to; y--) { out.push({ id: '' + y, name: '' + y }); }
    return out;
  }

  function rendered() {
    return [...document.querySelectorAll('.bound-select__option')].map(o => o.textContent.trim());
  }

  QUnit.test('CONTROL: without the flag every option renders and there is no pager', async function(assert) {
    this.set('content', years(2026, 2000));
    this.set('selection', '');
    await render(hbs`<BoundSelect @content={{this.content}} @selection={{this.selection}} />`);
    await click('.bound-select__trigger');
    assert.strictEqual(rendered().length, 27, 'every other dropdown in the app is unchanged');
    assert.strictEqual(document.querySelectorAll('.bound-select__pager-btn').length, 0, 'and grows no controls');
  });

  QUnit.test('a page renders only its own items, with a control at each end', async function(assert) {
    this.set('content', years(2026, 1960));
    this.set('selection', '');
    await render(hbs`<BoundSelect @content={{this.content}} @selection={{this.selection}} @paged={{true}} @pageSize={{12}} />`);
    await click('.bound-select__trigger');
    assert.deepEqual(rendered(), ['2026','2025','2024','2023','2022','2021','2020','2019','2018','2017','2016','2015'],
      'exactly one page, so nothing is off-screen or behind a control');
    var prev = document.querySelector('.bound-select__pager--prev .bound-select__pager-btn');
    var next = document.querySelector('.bound-select__pager--next .bound-select__pager-btn');
    assert.ok(prev && next, 'both controls render');
    assert.strictEqual(prev.closest('li').getAttribute('role'), 'presentation', 'prev row is presentational');
    assert.strictEqual(next.closest('li').getAttribute('role'), 'presentation', 'next row is presentational');
  });

  QUnit.test('THE CONTRACT: the next page starts one after the previous page ended', async function(assert) {
    assert.timeout(30000);
    this.set('content', years(2026, 1960));
    this.set('selection', '');
    await render(hbs`<BoundSelect @content={{this.content}} @selection={{this.selection}} @paged={{true}} @pageSize={{12}} />`);
    await click('.bound-select__trigger');

    for (var page = 0; page < 3; page++) {
      var before = rendered();
      var last = parseInt(before[before.length - 1], 10);
      await click('.bound-select__pager--next .bound-select__pager-btn');
      var after = rendered();
      var first = parseInt(after[0], 10);
      assert.strictEqual(first, last - 1,
        'page ' + page + ' ended at ' + last + ', so the next page must start at ' + (last - 1) +
        ' -- it started at ' + first);
    }
  });

  QUnit.test('going back lands on exactly the page you left', async function(assert) {
    assert.timeout(30000);
    this.set('content', years(2026, 1960));
    this.set('selection', '');
    await render(hbs`<BoundSelect @content={{this.content}} @selection={{this.selection}} @paged={{true}} @pageSize={{12}} />`);
    await click('.bound-select__trigger');
    var first_page = rendered();
    await click('.bound-select__pager--next .bound-select__pager-btn');
    await click('.bound-select__pager--prev .bound-select__pager-btn');
    assert.deepEqual(rendered(), first_page, 'back is the exact inverse of forward');
  });

  QUnit.test('the controls are disabled at the ends rather than silently doing nothing', async function(assert) {
    this.set('content', years(2026, 2015)); // exactly one page of 12
    this.set('selection', '');
    await render(hbs`<BoundSelect @content={{this.content}} @selection={{this.selection}} @paged={{true}} @pageSize={{12}} />`);
    await click('.bound-select__trigger');
    assert.true(document.querySelector('.bound-select__pager--prev .bound-select__pager-btn').disabled,
      'nothing before the first page');
    assert.true(document.querySelector('.bound-select__pager--next .bound-select__pager-btn').disabled,
      'and nothing after the only page');
  });

  QUnit.test('paging neither closes the list nor picks a year', async function(assert) {
    var chosen = null;
    this.set('content', years(2026, 1960));
    this.set('selection', '');
    this.set('onChange', function(val) { chosen = val; });
    await render(hbs`<BoundSelect @content={{this.content}} @selection={{this.selection}} @action={{this.onChange}} @paged={{true}} @pageSize={{12}} />`);
    await click('.bound-select__trigger');
    await click('.bound-select__pager--next .bound-select__pager-btn');
    assert.ok(document.querySelector('.bound-select__list'), 'the list is still open');
    assert.strictEqual(chosen, null, 'no year was selected by paging');
  });

  QUnit.test('searching returns to the first page of the filtered set', async function(assert) {
    assert.timeout(30000);
    this.set('content', years(2026, 1960));
    this.set('selection', '');
    await render(hbs`<BoundSelect @content={{this.content}} @selection={{this.selection}} @paged={{true}} @pageSize={{12}} @searchable={{true}} />`);
    await click('.bound-select__trigger');
    await click('.bound-select__pager--next .bound-select__pager-btn');
    await fillIn('.bound-select__search-input', '199');
    var shown = rendered();
    assert.strictEqual(shown[0], '1999',
      'a search shows its own first page, not whatever page number was left over');
  });
});
