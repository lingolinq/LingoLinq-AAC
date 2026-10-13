import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, click } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';

/*
 * The Categorize panel's Coming Soon page (requested 2026-09-28).
 *
 * `board_category_grouping` is out of every flag list while the feature is in progress
 * (lib/feature_flags.rb), so on the edit page the Categorize button opens THIS instead of the
 * grouping controls. Two things would fail silently and are pinned here: the page rendering
 * none of its pitch (a lookup or template error leaves the dark panel empty), and the one
 * way out not closing the panel, which would strand the editor over their board.
 */
QUnit.module('Integration | Component | board-categorize-coming-soon', function(hooks) {
  setupRenderingTest(hooks);

  QUnit.test('pitches the feature: a coming-soon badge, a heading and six features', async function(assert) {
    this.set('done', function() {});
    await render(hbs`<BoardCategorizeComingSoon @onDone={{this.done}} />`);
    assert.dom('.md-categorize-soon__badge').exists();
    assert.dom('h2.md-categorize-soon__title').exists();
    assert.dom('.md-categorize-soon__feature').exists({ count: 6 });
    assert.dom('.md-categorize-soon__feature h3').exists({ count: 6 });
  });

  QUnit.test('offers no grouping controls', async function(assert) {
    this.set('done', function() {});
    await render(hbs`<BoardCategorizeComingSoon @onDone={{this.done}} />`);
    assert.dom('input').doesNotExist('no switch or checkbox can turn grouping on from here');
    assert.dom('.md-board-category-order__list').doesNotExist();
  });

  QUnit.test('its button closes the panel', async function(assert) {
    var calls = 0;
    this.set('done', function() { calls++; });
    await render(hbs`<BoardCategorizeComingSoon @onDone={{this.done}} />`);
    await click('.md-categorize-soon__done');
    assert.strictEqual(calls, 1);
  });
});
