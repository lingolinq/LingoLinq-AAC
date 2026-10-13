import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import EmberObject from '@ember/object';
import { tourBuilderFor, tourKeyFor } from 'frontend/utils/tours/registry';
import { buildHomeSteps } from 'frontend/utils/tours/home';

/* AN SLP'S TOUR IS THE HOME PAGE TOUR (requested 2026-10-12: "on an slp user, start their tour on the
   home page instead. make it no more than 4 steps. remove the tour on their caseload page").
   An SLP is a supporter (`supporter_role`). */
module('Unit | Utility | tours | supporter home tour', function(hooks) {
  setupTest(hooks);

  test('the caseload page has no tour', function(assert) {
    assert.strictEqual(tourBuilderFor('caseload', 'gentle'), null, 'no builder (Gentle)');
    assert.strictEqual(tourBuilderFor('caseload', 'focused'), null, 'no builder (Focused)');
    assert.strictEqual(tourKeyFor('caseload', 'gentle'), null, 'no completion key');
  });

  test('a supporter\'s home tour is at most 4 steps and offers no board choices', function(assert) {
    assert.expect(5);
    var grid = document.createElement('div');
    grid.className = 'md-grid--dashboard';
    grid.style.height = '10px';
    var nav = document.createElement('div');
    nav.className = 'md-pillnav';
    nav.style.height = '10px';
    document.body.appendChild(grid);
    document.body.appendChild(nav);
    try {
      var steps = buildHomeSteps('gentle', { supporter: true });
      var ids = steps.map(function(s) { return s.id; });
      assert.deepEqual(ids, ['home_tour_welcome', 'home_tour_t_cards', 'home_tour_t_nav', 'home_tour_done'], 'welcome, cards, navigation, finish');
      assert.notOk(/choose my board|start speaking/i.test(steps[0].text), 'the welcome offers no "choose my board" or "start speaking"');
      var communicator = buildHomeSteps('gentle', {}).map(function(s) { return s.id; });
      assert.notStrictEqual(communicator.indexOf('home_tour_skip_handoff'), -1, 'a communicator keeps the board off-ramp');

      var menu = buildHomeSteps('gentle', { supporter: true, menu: true, onPickBoard: null });
      var done = menu[menu.length - 1];
      assert.strictEqual(done.id, 'home_tour_done', 'the replay menu ends on the done step');
      assert.notOk(done.buttons.some(function(b) { return /board picker/i.test(b.text); }), 'with no board-picker link');
    } finally {
      grid.remove();
      nav.remove();
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
