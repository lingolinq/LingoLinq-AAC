import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import EmberObject from '@ember/object';
import { tourBuilderFor, tourKeyFor } from 'frontend/utils/tours/registry';
import { buildHomeSteps } from 'frontend/utils/tours/home';

/* AN SLP'S TOUR IS THE HOME PAGE TOUR (requested 2026-10-12: "on an slp user, start their tour on the
   home page instead. ... remove the tour on their caseload page"). Its length changed in the tour
   redesign the same day: five steps, a welcome then favorites, caseload, Model and dashboards (Traci:
   "5 steps with a welcome"; the topics themselves are tested in slp-home-tour-test.js).
   An SLP is a supporter (`supporter_role`). */
module('Unit | Utility | tours | supporter home tour', function(hooks) {
  setupTest(hooks);

  test('the caseload page has no tour', function(assert) {
    assert.strictEqual(tourBuilderFor('caseload', 'gentle'), null, 'no builder (Gentle)');
    assert.strictEqual(tourBuilderFor('caseload', 'focused'), null, 'no builder (Focused)');
    assert.strictEqual(tourKeyFor('caseload', 'gentle'), null, 'no completion key');
  });

  test('a supporter\'s home tour is 5 steps and offers no board choices', function(assert) {
    assert.expect(5);
    var page = document.createElement('div');
    page.innerHTML = '<nav class="md-pillnav"><a data-tour-pill="caseload" style="display:inline-block;height:10px;width:10px"></a>' +
      '<a data-tour-pill="boards" style="display:inline-block;height:10px;width:10px"></a></nav>' +
      '<a class="md-card--caseload" style="display:block;height:10px"></a><section class="md-card--attention" style="height:10px"></section>';
    document.body.appendChild(page);
    try {
      var steps = buildHomeSteps('gentle', { supporter: true });
      var ids = steps.map(function(s) { return s.id; });
      assert.deepEqual(ids, ['home_tour_welcome', 'home_tour_slp_boards', 'home_tour_slp_caseload', 'home_tour_slp_model', 'home_tour_slp_dashboards'], 'welcome, favorites, caseload, Model, dashboards');
      assert.notOk(/choose my board|start speaking/i.test(steps[0].text), 'the welcome offers no "choose my board" or "start speaking"');
      var communicator = buildHomeSteps('gentle', {})[0].text; // the welcome card (2026-10-12 redesign, approved)
      assert.true(communicator.includes('data-tour-action="picker"'), 'a communicator can still go choose a board ("Choose a different board")');

      var menu = buildHomeSteps('gentle', { supporter: true, menu: true, onPickBoard: null });
      var done = menu[menu.length - 1];
      assert.strictEqual(done.id, 'home_tour_done', 'the replay menu ends on the done step');
      assert.notOk(done.buttons.some(function(b) { return /board picker/i.test(b.text); }), 'with no board-picker link');
    } finally {
      page.remove();
    }
  });

  test('the first-login auto-open starts the home tour for a supporter, never the caseload', function(assert) {
    this.owner.setupRouter();
    var appState = this.owner.lookup('service:app-state');
    appState.set('auto_open_home_tour', false);
    appState.set('currentUser', EmberObject.create({ supporter_role: true, user_name: 'slp' }));
    appState.set('current_route', 'user.home');
    var comp = this.owner.factoryFor('component:guided-tour').create();
    var calls = [];
    comp._startSupporterHomeAutoOpen = function() { calls.push('supporter-home'); };
    comp._startHomeAutoOpen = function() { calls.push('communicator-home'); };
    comp._startAutoOpen();
    assert.deepEqual(calls, ['supporter-home'], 'the supporter path');
    assert.false(comp._autoOpenRouteAllowed('caseload', true), 'the caseload page no longer hosts the auto-open');
    assert.true(comp._autoOpenRouteAllowed('user.home', true), 'the home page does');
    comp.destroy();
  });
});
