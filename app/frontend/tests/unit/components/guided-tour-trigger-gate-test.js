import { module, test } from 'qunit';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import { computed } from '@ember/object';
import { setupTest } from '../../helpers';

/* THE isCommunicator GATE IS FOR THE HOME TRIGGER ONLY.
 *
 * guided-tour.hbs renders the "Take a tour" button when `showTrigger` is true. The 2026-10-13
 * request hid that button (and the login auto-open) for non-communicators. But the board-edit
 * (@editHost) and speak-mode (@speakHost) instances host their OWN tours for whoever is
 * editing/speaking (usually a supporter), so the communicator gate must not hide those — a single
 * isCommunicator gate on the shared trigger template wrongly removed the board-edit tour from
 * supporters entirely (board-detail.hbs:302). This pins showTrigger. */
module('Unit | Component | guided-tour trigger gate', function(hooks) {
  setupTest(hooks);

  function build(context, supporter, args) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: EmberObject.create({ supporter_role: supporter }),
      auto_open_home_tour: false
    }));
    // tourBuilder is a computed that reads the route; override it so create() does not depend on a
    // real route (this test is only about the role/host gate, not tour content).
    var Subject = context.owner.factoryFor('component:guided-tour').class.extend({
      tourBuilder: computed(function() { return function() { return []; }; })
    });
    context.owner.register('component:guided-tour-gate-subject', Subject);
    return context.owner.factoryFor('component:guided-tour-gate-subject').create(args || {});
  }

  test('home trigger (no host) is hidden for a supporter', function(assert) {
    var c = build(this, true, {});
    assert.false(c.get('showTrigger'), 'a supporter does not see the home Take a tour button');
    c.destroy();
  });

  test('home trigger (no host) shows for a communicator', function(assert) {
    var c = build(this, false, {});
    assert.true(c.get('showTrigger'), 'a communicator sees the home Take a tour button');
    c.destroy();
  });

  test('board-edit host trigger shows for a supporter (its primary audience)', function(assert) {
    var c = build(this, true, { editHost: true });
    assert.true(c.get('showTrigger'), 'the edit tour trigger is not hidden by the communicator gate');
    c.destroy();
  });

  test('speak-mode host trigger is not gated by the communicator role', function(assert) {
    var c = build(this, true, { speakHost: true });
    assert.true(c.get('showTrigger'), 'the speak host runner is not hidden by the communicator gate');
    c.destroy();
  });
});
