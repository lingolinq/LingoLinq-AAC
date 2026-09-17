import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';
import EmberObject from '@ember/object';

/*
 * Core boards keep three in-grid word-prediction slots (vocalization
 * `:suggestion`) in the white Connectors band. `update_suggestion_button`
 * dresses each slot as the current guess — label becomes the word, image
 * becomes that word's symbol.
 *
 * hide_label ("Hide the label when the picture is shown") is an authored
 * picture-only setting. On a slot it hides the PREDICTED word, so the cell
 * shows a symbol with no text — the unlabeled wilted flower between "a" and
 * "should". The rail already forces the word to stay visible under
 * text-pos-none; these slots must do the same.
 *
 * FALSIFICATION: drop `(not btn.suggestion_slot)` from the hide-label
 * bindings in board-detail-grid.hbs. The slot test goes red; the ordinary
 * hide_label control stays green.
 */
QUnit.module('Integration | board-detail-grid prediction slot label', function(hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function() {
    this.set('board', EmberObject.create({ id: '1_1', key: 'someone/board' }));
  });

  QUnit.test('a prediction slot still shows the word when hide_label is set', async function(assert) {
    assert.expect(3);
    this.set('ordered', [[{
      id: 's1',
      label: 'need',
      image_url: '/images/square.svg',
      hide_label: true,
      suggestion_slot: true
    }]]);
    await render(hbs`<BoardDetailGrid @board={{this.board}} @orderedButtons={{this.ordered}} />`);

    const card = document.querySelector('.md-board-detail-symbol-card--suggestion-slot');
    const label = document.querySelector('.md-board-detail-symbol-card__label');
    assert.ok(card, 'slot class is on the card');
    assert.strictEqual(label && label.textContent.trim(), 'need');
    assert.notStrictEqual(window.getComputedStyle(label).display, 'none',
      'predicted word stays visible');
  });

  QUnit.test('authored hide_label still hides the word on a normal button', async function(assert) {
    assert.expect(2);
    this.set('ordered', [[{
      id: 'n1',
      label: 'need',
      image_url: '/images/square.svg',
      hide_label: true
    }]]);
    await render(hbs`<BoardDetailGrid @board={{this.board}} @orderedButtons={{this.ordered}} />`);

    const label = document.querySelector('.md-board-detail-symbol-card__label');
    assert.strictEqual(label && label.textContent.trim(), 'need');
    assert.strictEqual(window.getComputedStyle(label).display, 'none',
      'picture-only vocabulary buttons keep hide_label');
  });

  QUnit.test('a prediction slot with a resolved symbol shows the picture', async function(assert) {
    assert.expect(2);
    this.set('ordered', [[{
      id: 's1',
      label: 'can',
      image_url: '/images/logo.png',
      suggestion_slot: true,
      text_symbol: false
    }]]);
    await render(hbs`<BoardDetailGrid @board={{this.board}} @orderedButtons={{this.ordered}} />`);

    const img = document.querySelector('.md-board-detail-symbol-card img.symbol');
    assert.ok(img, 'slot renders the paired symbol');
    assert.ok((img.getAttribute('src') || '').indexOf('logo.png') !== -1, img && img.getAttribute('src'));
  });
});
