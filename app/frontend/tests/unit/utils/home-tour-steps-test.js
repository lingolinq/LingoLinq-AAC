import { module, test } from 'qunit';
import { buildHomeSteps } from 'frontend/utils/tours/home';

/* THE MODERN SUPPORTER (SLP) HOME TOUR IS FIVE STEPS (tour redesign, 2026-10-12: "SLPs: favorites,
 * caseload, Model, dashboards"; Traci: "5 steps with a welcome"). It was four (2026-10-11): welcome, the
 * cards, the navigation, finish. Now: welcome, then one spotlight per topic, the last finishing the tour.
 * The replay menu (returning users) covers the same four topics. Target choice per topic is tested in
 * tests/unit/utils/tours/slp-home-tour-test.js.
 */
module('Unit | Utility | home tour steps', function(hooks) {
  var fixture;
  hooks.beforeEach(function() {
    fixture = document.createElement('div');
    fixture.innerHTML =
      '<nav class="md-pillnav" style="width:300px;height:40px">' +
      '<a data-tour-pill="caseload" style="display:inline-block;width:60px;height:30px">Caseload</a>' +
      '<a data-tour-pill="boards" style="display:inline-block;width:60px;height:30px">Boards</a></nav>' +
      '<a class="md-card md-card--caseload" style="display:block;width:300px;height:50px">My Caseload</a>' +
      '<section class="md-card md-card--attention" style="display:block;width:300px;height:100px">Attention</section>';
    (document.querySelector('#ember-testing') || document.body).appendChild(fixture);
  });
  hooks.afterEach(function() { if (fixture && fixture.parentNode) { fixture.parentNode.removeChild(fixture); } });

  function ids(steps) { return steps.map(function(s) { return s.id; }); }

  test('first-time tour: welcome, favorites, caseload, Model, dashboards', function(assert) {
    var steps = buildHomeSteps('gentle', { supporter: true });
    assert.deepEqual(ids(steps),
      ['home_tour_welcome', 'home_tour_slp_boards', 'home_tour_slp_caseload', 'home_tour_slp_model', 'home_tour_slp_dashboards']);
  });

  test('replay menu: the same four topics', function(assert) {
    var steps = buildHomeSteps('gentle', { menu: true, supporter: true });
    assert.deepEqual(ids(steps),
      ['home_tour_menu', 'home_tour_slp_boards', 'home_tour_slp_caseload', 'home_tour_slp_model', 'home_tour_slp_dashboards', 'home_tour_done']);
  });
});
