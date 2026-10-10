import { module, test } from 'qunit';
import { buildClassicHomeSteps } from 'frontend/utils/tours/classic-home';

/* THE BASIC HOME TOUR TOURS THE ACTIONS TAB, WHATEVER TAB IT STARTED ON (2026-10-02, adversarial
 * review, requested: "fix the basic home tour"). Started on the Communicators tab, its Reports step
 * spotlit the first `.ch-tile--reports` on screen -- a communicator card's Reports link
 * (classic-view.hbs) -- and the Speak and Extras steps were dropped because their tiles were not
 * rendered. The tour now switches to the Actions tab as it begins, and each Actions-tab step is
 * skipped at show time if its target is not there.
 *
 * RETARGETED 2026-10-09: the per-card Speak/Reports/Extras steps became ONE step on the Actions
 * grid, so these assertions moved from `classic_tour_reports` to `classic_tour_cards`. The
 * guarantees are unchanged -- switch to Actions, never spotlight something on another tab, skip
 * when absent -- and one is ADDED, because the new selector carries a collision the old one did
 * not: `.ch-grid` also matches the Extras drawer, which is why the step excludes
 * `.ch-grid--extras`.
 */
module('Unit | Utility | tours classic-home Actions tab', function(hooks) {
  var root;
  hooks.beforeEach(function() {
    root = document.createElement('div');
    root.innerHTML =
      '<div class="ch-rail__identity" style="display:block;width:100px;height:40px"></div>' +
      '<div class="ch-rail__list" style="display:block;width:100px;height:40px"></div>' +
      '<nav class="ch-tabs" style="display:block;width:300px;height:40px">' +
      '  <button type="button" class="ch-tab" data-tour-tab="main" style="width:60px;height:30px">Actions</button>' +
      '  <button type="button" class="ch-tab is-active" style="width:60px;height:30px">Communicators</button>' +
      '</nav>' +
      '<a class="ch-tile ch-tile--reports" id="card-reports" style="display:block;width:80px;height:30px">Reports</a>';
    document.body.appendChild(root);
  });
  hooks.afterEach(function() { root.parentNode.removeChild(root); });

  function step(steps, id) { return steps.find(function(s) { return s.id === id; }); }

  test('started on Communicators: the cards step never spotlights a communicator card', function(assert) {
    assert.expect(3);
    var steps = buildClassicHomeSteps();
    var cards = step(steps, 'classic_tour_cards');
    assert.ok(cards, 'the cards step is kept for when the Actions tab shows');
    var target = typeof cards.attachTo.element === 'function' ? cards.attachTo.element() : cards.attachTo.element;
    assert.notStrictEqual(target, document.getElementById('card-reports'), 'not the communicator card link');
    assert.false(cards.showOn(), 'skipped while the Actions grid is not on screen');
  });

  test('the cards step never spotlights the Extras drawer', function(assert) {
    assert.expect(2);
    // The drawer also carries `.ch-grid`, and is LATER in the DOM, so a bare `.ch-grid`
    // selector would match it once it is open.
    root.insertAdjacentHTML('beforeend',
      '<div class="ch-grid ch-grid--extras" id="drawer" style="display:block;width:300px;height:40px"></div>');
    var steps = buildClassicHomeSteps();
    var cards = step(steps, 'classic_tour_cards');
    assert.false(cards.showOn(), 'an open drawer alone does not make the step show');
    var target = typeof cards.attachTo.element === 'function' ? cards.attachTo.element() : cards.attachTo.element;
    assert.notStrictEqual(target, document.getElementById('drawer'), 'not the drawer');
  });

  test('the first interior step switches to the Actions tab', async function(assert) {
    assert.expect(1);
    var clicked = 0;
    root.querySelector('[data-tour-tab="main"]').addEventListener('click', function() { clicked++; });
    var steps = buildClassicHomeSteps();
    await steps[1].beforeShowPromise();
    assert.strictEqual(clicked, 1, 'Actions tab clicked once');
  });

  test('already on Actions: no click, and the tile step shows', async function(assert) {
    assert.expect(2);
    var actions = root.querySelector('[data-tour-tab="main"]');
    actions.classList.add('is-active');
    root.insertAdjacentHTML('beforeend', '<div class="ch-grid" id="actions-grid" style="display:block;width:300px;height:80px"><button class="ch-tile ch-tile--big ch-tile--reports" style="display:block;width:80px;height:30px">Reports</button></div>');
    var clicked = 0;
    actions.addEventListener('click', function() { clicked++; });
    var steps = buildClassicHomeSteps();
    await steps[1].beforeShowPromise();
    assert.strictEqual(clicked, 0, 'no tab click');
    assert.true(step(steps, 'classic_tour_cards').showOn(), 'the Actions grid is spotlit');
  });
});
