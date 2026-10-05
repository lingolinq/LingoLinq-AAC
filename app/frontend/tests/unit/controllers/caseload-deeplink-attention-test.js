import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';

/* A CASELOAD DEEP LINK REACHES ITS COMMUNICATOR EVEN WHILE "NEEDS ATTENTION" IS ON
 * (2026-10-01; adversarial review M2). `_applySuperviseeDeepLink` cleared the text filter because
 * a stale filter "made the arrival silently do nothing", but not the Needs attention toggle
 * (`attentionOnly`), which `listedSupervisees` also applies; the controller is a singleton, so the
 * toggle survives navigation. A link to someone who needs no attention then selected a row that
 * never rendered.
 */
module('Unit | Controller | caseload deep link vs Needs attention', function(hooks) {
  setupTest(hooks);

  test('arriving with ?supervisee= turns the Needs attention filter off', function(assert) {
    var controller = this.owner.lookup('controller:caseload');
    controller.set('model', EmberObject.create({ known_supervisees: [{ id: '1_7', user_name: 'aiden_parker' }] }));
    controller.set('attentionOnly', true);
    controller.set('superviseeFilter', 'zzz');
    controller.set('supervisee', 'aiden_parker');
    controller._applySuperviseeDeepLink();
    assert.false(controller.get('attentionOnly'), 'Needs attention off');
    assert.strictEqual(controller.get('superviseeFilter'), '', 'text filter cleared, as before');
    assert.strictEqual(controller.get('selectedSupervisee'), 'aiden_parker', 'their row is selected');
  });

  test('arriving for a communicator who DOES need attention keeps the filter on', function(assert) {
    var controller = this.owner.lookup('controller:caseload');
    controller.set('model', EmberObject.create({ known_supervisees: [{ id: '1_8', user_name: 'bea', org_status: { state: 'hourglass' } }] }));
    controller.set('attentionOnly', true);
    controller.set('supervisee', 'bea');
    controller._applySuperviseeDeepLink();
    assert.true(controller.get('attentionOnly'), 'their row is in the filtered list, so the toggle is left alone');
  });

  test('leaving the caseload turns the filter off (the controller is a singleton)', function(assert) {
    var controller = this.owner.lookup('controller:caseload');
    controller.set('attentionOnly', true);
    this.owner.lookup('route:caseload').resetController(controller, true);
    assert.false(controller.get('attentionOnly'));
  });
});
