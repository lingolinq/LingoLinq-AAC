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
});
