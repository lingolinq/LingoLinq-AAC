import { module, test } from 'qunit';
import paint_view_switch_overlay from 'frontend/utils/view_switch_overlay';

/*
 * Each overlay dismisses itself after its route changes (150 ms later, then two animation frames).
 * It must remove ITS OWN node: it used to remove whatever #ll-pre-reload-overlay was on the page by
 * then, so a late dismissal took down an overlay a later screen (in tests: a later test) had painted.
 */
function fakeRouter() {
  const handlers = [];
  return {
    on(name, fn) { handlers.push(fn); },
    off(name, fn) { const i = handlers.indexOf(fn); if (i >= 0) { handlers.splice(i, 1); } },
    fire() { handlers.slice().forEach((fn) => fn()); },
    listening() { return handlers.length; }
  };
}
const overlays = () => Array.prototype.slice.call(document.querySelectorAll('#ll-pre-reload-overlay'));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Two animation frames and a tick: a dismissal removes its node two frames after it runs.
const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))));
async function waitUntil(condition, limitMs) {
  const deadline = Date.now() + limitMs;
  while (!condition() && Date.now() < deadline) { await wait(20); }
  return condition();
}

module('Unit | Utility | view switch overlay dismissal', function() {
  test('a late dismissal removes only its own overlay', async function(assert) {
    assert.expect(4);
    const first = fakeRouter();
    const second = fakeRouter();
    try {
      paint_view_switch_overlay({ routerSvc: first });
      overlays().forEach((n) => n.remove()); // the first screen's overlay is already gone
      paint_view_switch_overlay({ routerSvc: second });
      const secondNode = overlays()[0];
      assert.ok(secondNode, 'the second overlay is up');
      first.fire(); // the first overlay's route change arrives late
      assert.true(await waitUntil(() => first.listening() === 0, 2000), 'the first overlay\'s dismissal ran (it stopped listening)');
      await frames(); // past the point where that dismissal removes a node
      assert.true(document.body.contains(secondNode), 'the second overlay is still up');
      second.fire(); // positive control: its own route change does remove it
      assert.true(await waitUntil(() => !document.body.contains(secondNode), 2000), 'the second overlay\'s own dismissal removed it');
    } finally {
      second.fire();
      await wait(250);
      overlays().forEach((n) => n.remove());
    }
  });
});
