import { module, test } from 'qunit';
import Service from '@ember/service';
import { computed } from '@ember/object';
import { setupTest } from '../../helpers';

/* THE AUTO-OPEN HANDOFF MUST ARM THE BOARD-PICKER TOUR, AND ONLY ON FINISH.
 *
 * There are two handoffs to /board-picker and they were asymmetric. The manual first-time
 * finish (`onPickBoard`, guided-tour.js:1119) sets `appState.board_picker_tour_pending` before
 * transitioning, which `_consumePendingBoardPickerTour` (:471) reads to auto-open the
 * board-picker tour. The post-registration auto-open handoff (`_startHomeAutoOpen`, :790) only
 * transitioned — so a newly-registered user, the one who actually takes that path, landed on
 * the picker with no tour at all.
 *
 * COMPLETE ONLY, deliberately. `afterComplete` is bound to BOTH `complete` and `cancel`
 * (:1233-1234) because a new user must reach the picker however the tour ends. Arming inside it
 * would also open a tour for someone who SKIPPED the home tour — the "second, unrequested tour"
 * the comment at :1098-1103 records as a past defect. So the arming is bound to `complete` only,
 * like `firstTimeNavGuarded` (:1244).
 */
module('Unit | Component | guided-tour board-picker arming', function(hooks) {
  setupTest(hooks);

  // Minimal stand-in for the ember-shepherd service: records the handlers the component binds
  // so the test can fire `complete` and `cancel` independently.
  function fakeTourService(handlers) {
    return Service.extend({
      isActive: false,
      tourObject: null,
      init() {
        this._super(...arguments);
        this.set('tourObject', {
          steps: [],
          on: function(evt, fn) { (handlers[evt] = handlers[evt] || []).push(fn); }
        });
      },
      addSteps() { return Promise.resolve(); },
      start() {},
      cancel() {}
    });
  }

  function build(context, handlers) {
    context.owner.unregister('service:tour');
    context.owner.register('service:tour', fakeTourService(handlers));
    var appState = context.owner.lookup('service:app-state');
    // init() consumes the auto-open signal itself; clear it so this test drives _startTour
    // directly rather than racing the component's own auto-open path.
    appState.set('auto_open_home_tour', false);
    // `tourBuilder` is a computed (guided-tour.js:307) and cannot be overridden at create(),
    // so the stub is a subclass that redefines it — a builder returning no steps, since this
    // test is about the handlers bound after addSteps resolves, not about step content.
    var Subject = context.owner.factoryFor('component:guided-tour').class.extend({
      tourBuilder: computed(function() { return function() { return []; }; })
    });
    context.owner.register('component:guided-tour-arm-subject', Subject);
    var component = context.owner.factoryFor('component:guided-tour-arm-subject').create();
    return { component: component, appState: appState };
  }

  function fire(handlers, evt) {
    (handlers[evt] || []).forEach(function(fn) { fn(); });
  }

  test('finishing the auto-open tour arms the board-picker tour', async function(assert) {
    var handlers = {};
    var t = build(this, handlers);
    t.appState.set('board_picker_tour_pending', false);
    t.component._startTour({ afterComplete: function() {}, armBoardPickerTour: true });
    await new Promise(function(r) { setTimeout(r, 0); });
    fire(handlers, 'complete');
    assert.true(t.appState.get('board_picker_tour_pending'));
    t.component.destroy();
  });

  test('skipping the auto-open tour does NOT arm it', async function(assert) {
    var handlers = {};
    var t = build(this, handlers);
    t.appState.set('board_picker_tour_pending', false);
    t.component._startTour({ afterComplete: function() {}, armBoardPickerTour: true });
    await new Promise(function(r) { setTimeout(r, 0); });
    fire(handlers, 'cancel');
    assert.notOk(t.appState.get('board_picker_tour_pending'));
    t.component.destroy();
  });
});
