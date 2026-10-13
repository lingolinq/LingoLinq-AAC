import { module, test } from 'qunit';
import { buildHomeSteps } from 'frontend/utils/tours/home';

/* THE MODERN HOME TOUR IS FOUR STEPS (requested 2026-10-11: "the home page tour needs to be reduced
 * to 4 steps total"; areas chosen: the dashboard cards, then the navigation). It walked one step per
 * toolbar button, account-menu item, nav pill and card (~25). Now: welcome, the cards, the
 * navigation, finish. The replay menu (returning users) covers the same two areas.
 * The off-chain "skip the tour" step stays appended last; it is never in the Next chain or the dots.
 */
module('Unit | Utility | home tour steps', function(hooks) {
  var fixture;
  hooks.beforeEach(function() {
    fixture = document.createElement('div');
    fixture.innerHTML =
      '<div id="inner_header" style="width:400px;height:40px">toolbar</div>' +
      '<button id="identity_button" style="width:40px;height:40px">me</button>' +
      '<nav class="md-pillnav" style="width:300px;height:40px"><a data-tour-pill>Dashboard</a><a data-tour-pill>Boards</a></nav>' +
      '<div class="md-grid--dashboard" style="width:300px;height:200px"><div class="md-card--speak-focused" style="height:50px">speak</div></div>';
    (document.querySelector('#ember-testing') || document.body).appendChild(fixture);
  });
  hooks.afterEach(function() { if (fixture && fixture.parentNode) { fixture.parentNode.removeChild(fixture); } });

  function ids(steps) { return steps.map(function(s) { return s.id; }); }

  test('first-time tour: welcome, cards, navigation, finish', function(assert) {
    var steps = buildHomeSteps('gentle', { supporter: true }); // a supporter's tour since the 2026-10-12 redesign (approved)
    assert.deepEqual(ids(steps).filter(function(id) { return id !== 'home_tour_skip_handoff'; }),
      ['home_tour_welcome', 'home_tour_t_cards', 'home_tour_t_nav', 'home_tour_done']);
  });

  test('the navigation step names the pills on screen', function(assert) {
    var nav = buildHomeSteps('gentle', { supporter: true }).find(function(s) { return s.id === 'home_tour_t_nav'; });
    assert.notStrictEqual(nav.text.indexOf('Dashboard and Boards'), -1, nav.text);
  });

  test('replay menu: the same two areas', function(assert) {
    var steps = buildHomeSteps('gentle', { menu: true, supporter: true });
    assert.deepEqual(ids(steps), ['home_tour_menu', 'home_tour_t_cards', 'home_tour_t_nav', 'home_tour_done']);
  });
});
