import { module, test } from 'qunit';
import modal_paging from 'frontend/utils/modal_paging';

/* Builds a real scrolling box in the DOM. These assertions are about LAYOUT, so a stubbed
   object with hand-set scrollHeight/clientHeight would pass against a helper that reads the
   wrong properties entirely -- the bug this file exists to catch. */
function scroller(opts) {
  opts = opts || {};
  const outer = document.createElement('div');
  outer.style.cssText = 'overflow-y: auto; height: ' + (opts.height || 100) + 'px; width: 50px;';
  const inner = document.createElement('div');
  inner.style.cssText = 'height: ' + (opts.content || 500) + 'px;';
  const leaf = document.createElement('span');
  inner.appendChild(leaf);
  outer.appendChild(inner);
  document.getElementById('ember-testing').appendChild(outer);
  return { outer: outer, inner: inner, leaf: leaf };
}

module('Unit | Utility | modal paging', function(hooks) {
  hooks.afterEach(function() {
    const root = document.getElementById('ember-testing');
    while (root && root.firstChild) { root.removeChild(root.firstChild); }
  });

  test('container_for finds the nearest ancestor that actually scrolls', function(assert) {
    const box = scroller({ height: 100, content: 500 });
    assert.strictEqual(modal_paging.container_for(box.leaf), box.outer,
      'walks up past the non-scrolling inner div to the overflow:auto ancestor');
  });

  test('container_for SKIPS an overflow:auto box whose content fits', function(assert) {
    /* The whole point of the `scrollHeight > clientHeight` term. Without it the helper
       returns a container that cannot move, the rail renders, and a scanning user stops on
       two buttons that do nothing. */
    const box = scroller({ height: 300, content: 50 });
    const found = modal_paging.container_for(box.leaf);
    /* NOT `strictEqual(found, null)`. The walk continues to document.body, and the QUnit
       test container is itself a scrolling ancestor, so null is only reachable by accident
       of how full the harness happens to be. The falsifiable claim is that the box which
       CANNOT scroll was skipped; dropping the `scrollHeight > clientHeight` term makes this
       go red. */
    assert.notStrictEqual(found, box.outer,
      'declaring overflow:auto is not enough — it must have somewhere to scroll');
    assert.false(modal_paging.state_for(box.outer).needed,
      'and the same box reports no paging needed');
  });

  test('state_for reports needed/at_top/at_bottom from real geometry', function(assert) {
    const box = scroller({ height: 100, content: 500 });
    let state = modal_paging.state_for(box.outer);
    assert.true(state.needed, 'a 500px child in a 100px box needs paging');
    assert.true(state.at_top, 'starts at the top');
    assert.false(state.at_bottom, 'and not at the bottom');

    box.outer.scrollTop = box.outer.scrollHeight;
    state = modal_paging.state_for(box.outer);
    assert.false(state.at_top, 'no longer at the top once scrolled');
    assert.true(state.at_bottom, 'and reports the bottom after a full scroll');
  });

  test('state_for on a null box is not needed, and is both ends at once', function(assert) {
    const state = modal_paging.state_for(null);
    assert.false(state.needed, 'nothing to page');
    /* Split rather than `at_top && at_bottom`: one combined assertion cannot say WHICH end
       regressed, and qunit/no-assert-logical-expression rejects it. */
    assert.true(state.at_top, 'reports the top');
    assert.true(state.at_bottom, 'and the bottom, so a caller gating on either end gates both');
  });

  test('page moves by one screen less an overlap, and stops at each end', function(assert) {
    const box = scroller({ height: 100, content: 500 });
    const expected = box.outer.clientHeight - 24;

    modal_paging.page(box.outer, 'down');
    assert.strictEqual(box.outer.scrollTop, expected,
      'one page down is clientHeight - 24, not a full clientHeight');

    modal_paging.page(box.outer, 'up');
    assert.strictEqual(box.outer.scrollTop, 0, 'and back up again');

    /* These two assert the OBSERVABLE end behaviour, not a clamp in the helper. The DOM
       clamps scrollTop on assignment, so an in-helper Math.min/max is invisible to any test
       -- verified by mutation: deleting it left all 7 green, so it was deleted instead.
       What these still catch is a wrong direction sign or a step that overshoots the API. */
    modal_paging.page(box.outer, 'up');
    assert.strictEqual(box.outer.scrollTop, 0, 'up at the top does not go negative');

    for (let i = 0; i < 20; i++) { modal_paging.page(box.outer, 'down'); }
    const max = box.outer.scrollHeight - box.outer.clientHeight;
    assert.strictEqual(box.outer.scrollTop, max, 'down stops at the last screen');
  });

  test('page uses the 40px floor when the scrollport is tiny', function(assert) {
    /* clientHeight - 24 would be 6px here, which reads as nothing happening. */
    const box = scroller({ height: 30, content: 400 });
    modal_paging.page(box.outer, 'down');
    assert.strictEqual(box.outer.scrollTop, 40, 'floors at 40px rather than a 6px nudge');
  });

  test('page on a null box does not throw', function(assert) {
    modal_paging.page(null, 'down');
    assert.ok(true, 'a closed modal calling page after teardown is a no-op');
  });
});
