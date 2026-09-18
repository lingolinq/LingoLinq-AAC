import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';

/* The user's button_text_position preference (top / bottom / none / text_only) must be
   honoured by EVERY prediction panel, not just the side rail.
   There are three: the in-bar group beside the sentence, the below-speak-bar strip, and the
   vertical rail. DOM order in a tile is image-then-label, so `top` is expressed as
   `column-reverse`. The rules existed only for the rail, so the below-bar strip carried the
   class with nothing acting on it and the in-bar group did not even carry the class. */
QUnit.module('Integration | prediction text position', function(hooks) {
  setupRenderingTest(hooks);

  async function tiles(pos) {
    await render(hbs`
      <div class="md-shell md-shell--board-detail md-board-detail--dark">
        <span class="md-board-detail-sentence-bar__prediction-group {{this.pos}}">
          <button type="button" class="md-board-detail-sentence-bar__prediction" data-t="bar">
            <img class="md-board-detail-sentence-bar__prediction-img" data-t="bar-img" src="/images/square.svg" alt="">
            <span class="md-board-detail-sentence-bar__prediction-label">you</span>
          </button>
        </span>
        <div class="md-board-detail-prediction-below {{this.pos}}">
          <button type="button" class="md-board-detail-sentence-bar__prediction" data-t="below">
            <img class="md-board-detail-sentence-bar__prediction-img" data-t="below-img" src="/images/square.svg" alt="">
            <span class="md-board-detail-sentence-bar__prediction-label">you</span>
          </button>
        </div>
        <div class="md-board-detail-prediction-rail {{this.pos}}">
          <button type="button" class="md-board-detail-sentence-bar__prediction" data-t="rail">
            <img class="md-board-detail-sentence-bar__prediction-img" data-t="rail-img" src="/images/square.svg" alt="">
            <span class="md-board-detail-sentence-bar__prediction-label">you</span>
          </button>
        </div>
      </div>
    `);
    const at = function(sel) { return window.getComputedStyle(document.querySelector(sel)); };
    return {
      bar: at('[data-t="bar"]'), below: at('[data-t="below"]'), rail: at('[data-t="rail"]'),
      barImg: at('[data-t="bar-img"]'), belowImg: at('[data-t="below-img"]'), railImg: at('[data-t="rail-img"]')
    };
  }

  QUnit.test('text-pos TOP puts the label above the symbol in every panel', async function(assert) {
    assert.expect(3);
    this.set('pos', 'md-board-detail-grid--text-pos-top');
    const s = await tiles();
    assert.strictEqual(s.bar.flexDirection, 'column-reverse', `in-bar group, got ${s.bar.flexDirection}`);
    assert.strictEqual(s.below.flexDirection, 'column-reverse', `below-bar strip, got ${s.below.flexDirection}`);
    assert.strictEqual(s.rail.flexDirection, 'column-reverse', `side rail, got ${s.rail.flexDirection}`);
  });

  QUnit.test('text-pos BOTTOM puts the label below the symbol in every panel', async function(assert) {
    assert.expect(3);
    this.set('pos', 'md-board-detail-grid--text-pos-bottom');
    const s = await tiles();
    assert.strictEqual(s.bar.flexDirection, 'column', `in-bar group, got ${s.bar.flexDirection}`);
    assert.strictEqual(s.below.flexDirection, 'column', `below-bar strip, got ${s.below.flexDirection}`);
    assert.strictEqual(s.rail.flexDirection, 'column', `side rail, got ${s.rail.flexDirection}`);
  });

  QUnit.test('text-pos TEXT_ONLY hides the symbol in every panel', async function(assert) {
    assert.expect(3);
    this.set('pos', 'md-board-detail-grid--text-pos-text_only');
    const s = await tiles();
    assert.strictEqual(s.barImg.display, 'none', `in-bar group, got ${s.barImg.display}`);
    assert.strictEqual(s.belowImg.display, 'none', `below-bar strip, got ${s.belowImg.display}`);
    assert.strictEqual(s.railImg.display, 'none', `side rail, got ${s.railImg.display}`);
  });

  /* overflow:hidden on the rail/below-bar label zeroes the flex min-size, so a
     flex:1 image can shrink the word to nothing. flex-shrink:0 is what keeps
     "need" visible next to its symbol. Mutation: remove flex-shrink from the
     prediction-label rules. */
  QUnit.test('prediction labels do not shrink away when a symbol is present', async function(assert) {
    assert.expect(3);
    this.set('pos', 'md-board-detail-grid--text-pos-top');
    await tiles();
    const shrink = function(sel) {
      return window.getComputedStyle(document.querySelector(sel)).flexShrink;
    };
    assert.strictEqual(shrink('.md-board-detail-sentence-bar__prediction-group .md-board-detail-sentence-bar__prediction-label'), '0',
      'in-bar label');
    assert.strictEqual(shrink('.md-board-detail-prediction-below .md-board-detail-sentence-bar__prediction-label'), '0',
      'below-bar label');
    assert.strictEqual(shrink('.md-board-detail-prediction-rail .md-board-detail-sentence-bar__prediction-label'), '0',
      'rail label');
  });

  QUnit.test('sentence-chip labels do not shrink away when a symbol is present', async function(assert) {
    assert.expect(1);
    await render(hbs`
      <button type="button" class="md-board-detail-sentence-bar__chip">
        <img class="md-board-detail-sentence-bar__chip-img" src="/images/square.svg" alt="">
        <span class="md-board-detail-sentence-bar__chip-label">lot</span>
      </button>
    `);
    const shrink = window.getComputedStyle(
      document.querySelector('.md-board-detail-sentence-bar__chip-label')
    ).flexShrink;
    assert.strictEqual(shrink, '0', 'chip label');
  });

  /* Dense boards size each rail tile to one short card (~40px on Vocal Flair 94).
     The label is flex-shrink:0; the img is flex:1 1 0. If the img also has
     min-height:0, leftover is 0 and the symbol vanishes. Mutation: set the
     rail/below-bar img min-height back to 0. */
  QUnit.test('a short rail tile keeps both the symbol and the word', async function(assert) {
    assert.expect(4);
    this.set('pos', 'md-board-detail-grid--text-pos-top');
    await render(hbs`
      <div class="md-shell md-shell--board-detail md-shell--wordpred-side-rail">
        <div class="md-board-detail-prediction-rail {{this.pos}}" style="height: 40px; width: 56px;">
          <button type="button" class="md-board-detail-sentence-bar__prediction">
            <img class="md-board-detail-sentence-bar__prediction-img" src="/images/logo.png" alt="">
            <span class="md-board-detail-sentence-bar__prediction-label">need</span>
          </button>
        </div>
      </div>
    `);
    const img = document.querySelector('.md-board-detail-prediction-rail .md-board-detail-sentence-bar__prediction-img');
    const lab = document.querySelector('.md-board-detail-prediction-rail .md-board-detail-sentence-bar__prediction-label');
    assert.strictEqual(window.getComputedStyle(img).minHeight, '16px',
      `img min-height is ${window.getComputedStyle(img).minHeight}`);
    assert.strictEqual(window.getComputedStyle(img).flexShrink, '0', 'symbol will not shrink away');
    assert.ok(img.getBoundingClientRect().height > 0, `symbol height ${img.getBoundingClientRect().height}`);
    assert.ok(lab.getBoundingClientRect().height > 0, `label height ${lab.getBoundingClientRect().height}`);
  });
});
