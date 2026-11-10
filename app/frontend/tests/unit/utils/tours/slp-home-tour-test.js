import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import EmberObject from '@ember/object';
import { buildHomeSteps } from 'frontend/utils/tours/home';
import { buildClassicHomeSteps } from 'frontend/utils/tours/classic-home';

/* THE SLP TOUR (tour redesign, 2026-10-12): "4 or 5 steps per role ... SLPs: favorites, caseload, Model,
   dashboards." Five steps on the home page in both views (Traci, 2026-10-12: "5 steps with a welcome"):
   a welcome, then one spotlight per topic, the last one finishing the tour. An SLP is a supporter
   (`supporter_role`). */
module('Unit | Utility | tours | SLP home tour', function(hooks) {
  setupTest(hooks);
  var added = [];
  function put(html) {
    var d = document.createElement('div'); d.innerHTML = html; var el = d.firstElementChild;
    el.style.minHeight = '20px'; el.style.minWidth = '20px'; document.body.appendChild(el); added.push(el);
    return el;
  }
  hooks.afterEach(function() { added.forEach(function(e) { e.remove(); }); added = []; });
  function modernPage(opts) {
    opts = opts || {};
    put('<nav class="md-pillnav"><a data-tour-pill="caseload">Caseload</a><a data-tour-pill="boards">Boards</a></nav>');
    put('<a class="md-card md-card--caseload">My Caseload</a>');
    if (opts.attention !== false) { put('<section class="md-card md-card--attention">Communicators Need Attention</section>'); }
    put('<section class="md-card md-card--rooms">Rooms</section>');
  }
  var MODERN_IDS = ['home_tour_welcome', 'home_tour_slp_boards', 'home_tour_slp_caseload', 'home_tour_slp_model', 'home_tour_slp_dashboards'];
  function target(step) { var e = step.attachTo.element; return typeof e === 'function' ? e() : e; }

  test('Modern: welcome, favorites, caseload, Model, dashboards', function(assert) {
    modernPage();
    var steps = buildHomeSteps('gentle', { supporter: true });
    assert.deepEqual(steps.map(function(s) { return s.id; }), MODERN_IDS);
    assert.strictEqual(target(steps[1]), document.querySelector('[data-tour-pill="boards"]'), 'favorites: the Boards pill');
    assert.strictEqual(target(steps[2]), document.querySelector('.md-card--caseload'), 'caseload: the My Caseload card');
    assert.strictEqual(target(steps[3]), document.querySelector('[data-tour-pill="caseload"]'), 'Model: the way to Caseload, where Model is');
    assert.true(/Model/.test(steps[3].text), 'names Model');
    assert.strictEqual(target(steps[4]), document.querySelector('.md-card--attention'), 'dashboards: the attention card');
    assert.strictEqual(steps[4].buttons[steps[4].buttons.length - 1].text, 'Got it', 'the last spotlight finishes the tour');
  });

  test('Modern: the dashboards step falls back to Rooms, and Focused gets its skin', function(assert) {
    modernPage({ attention: false });
    var steps = buildHomeSteps('focused', { supporter: true });
    assert.strictEqual(target(steps[4]), document.querySelector('.md-card--rooms'), 'Rooms when there is no attention card');
    assert.true(steps.every(function(s) { return s.classes.indexOf('md-tour__step--focused') !== -1; }), 'Focused skin');
  });

  test('Modern replay menu: the same four topics', function(assert) {
    modernPage();
    var steps = buildHomeSteps('gentle', { supporter: true, menu: true });
    assert.deepEqual(steps.map(function(s) { return s.id; }),
      ['home_tour_menu', 'home_tour_slp_boards', 'home_tour_slp_caseload', 'home_tour_slp_model', 'home_tour_slp_dashboards', 'home_tour_done']);
  });

  test('Basic: welcome, boards, caseload, Model, dashboards', async function(assert) {
    put('<nav class="ch-tabs"><button data-tour-tab="main" class="ch-tab is-active">Actions</button>' +
      '<button data-tour-tab="supervisees" class="ch-tab">Communicators</button><button data-tour-tab="boards" class="ch-tab">Boards</button></nav>');
    put('<div class="ch-comm__actions">Model</div>');
    put('<aside class="ch-rail">rail</aside>');
    var clicked = 0;
    document.querySelector('[data-tour-tab="supervisees"]').addEventListener('click', function() { clicked++; });
    var steps = buildClassicHomeSteps({ supporter: true });
    assert.deepEqual(steps.map(function(s) { return s.id; }),
      ['classic_tour_welcome', 'classic_tour_slp_boards', 'classic_tour_slp_caseload', 'classic_tour_slp_model', 'classic_tour_slp_dashboards']);
    assert.strictEqual(target(steps[1]), document.querySelector('[data-tour-tab="boards"]'), 'boards: the Boards tab');
    assert.strictEqual(target(steps[2]), document.querySelector('[data-tour-tab="supervisees"]'), 'caseload: the Communicators tab');
    assert.strictEqual(target(steps[3]), document.querySelector('.ch-comm__actions'), 'Model: a communicator card\'s actions');
    await steps[3].beforeShowPromise();
    assert.strictEqual(clicked, 1, 'the Model step opens the Communicators tab first');
    assert.strictEqual(target(steps[4]), document.querySelector('.ch-rail'), 'dashboards: the side menu');
    assert.strictEqual(steps[4].buttons[1].text, 'Got it', 'the last spotlight finishes the tour');
  });

  test('Basic: every step keeps the runner show hook', async function(assert) {
    assert.expect(6);
    // The runner's default `when.show` is what scrolls the target, paints the
    // progress dots, and clears the centered-step blur (guided-tour.js). Shepherd
    // copies a step's own `when` over that default, even when the value is
    // undefined (shepherd.js Step#_setOptions), and then binds `when.show` onto
    // step.bindings.show. Build through the real component so that merge happens.
    put('<nav class="ch-tabs"><button data-tour-tab="main" class="ch-tab is-active">Actions</button>' +
      '<button data-tour-tab="supervisees" class="ch-tab">Communicators</button><button data-tour-tab="boards" class="ch-tab">Boards</button></nav>');
    put('<div class="ch-comm__actions">Model</div>');
    put('<aside class="ch-rail">rail</aside>');
    try { sessionStorage.removeItem('ll_auto_open_home_tour'); } catch (e) { /* unavailable */ }
    var appState = this.owner.lookup('service:app-state');
    appState.set('auto_open_home_tour', false);
    appState.set('current_route', 'user.home');
    appState.set('currentUser', EmberObject.create({
      supporter_role: true,
      user_name: 'slp',
      preferences: EmberObject.create({ board_view_style: 'classic', dashboard_layout: 'gentle' })
    }));
    var comp = this.owner.factoryFor('component:guided-tour').create();
    try {
      comp._startTour();
      var steps = await new Promise(function(resolve, reject) {
        var started = Date.now();
        function tick() {
          var tour = comp.get('tour');
          var list = tour && tour.tourObject && tour.tourObject.steps;
          if (list && list.length === 5) { resolve(list); return; }
          if (Date.now() - started > 5000) {
            reject(new Error('tour steps did not build, saw ' + (list ? list.length : 0)));
            return;
          }
          setTimeout(tick, 20);
        }
        tick();
      });
      assert.strictEqual(steps.length, 5, 'the Basic SLP tour has five steps');
      steps.forEach(function(step) {
        var show = step.bindings && step.bindings.show;
        var bound = Array.isArray(show) && show.some(function(binding) {
          return typeof binding.handler === 'function';
        });
        assert.true(bound, (step.id || 'step') + ' keeps the show hook');
      });
    } finally {
      try { comp.get('tour').cancel(); } catch (e) { /* tour never started */ }
      comp.destroy();
    }
  });
});
