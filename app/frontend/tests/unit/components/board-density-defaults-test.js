import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* Pins the board-card density defaults introduced 2026-08-16 and the orphan-cluster
 * visibility flag alongside them.
 *
 * These are one-line properties, which is exactly why they are worth a test: both
 * pages now OPEN in compact density, so a silent flip back (or a divergence between
 * the two surfaces, which share their compact styling) changes what every user sees
 * on load with nothing else to catch it.
 *
 * `showOrphanClusters: false` is a deliberate trade-off, not a cleanup: the synthetic
 * "Orphan Boards id:…" rows are hidden on the Boards page, and the boards clustered
 * under them have no other entry point there. It is a named flag precisely so the
 * decision stays visible and reversible — this test keeps the default honest.
 */
module('Unit | Component | board card density defaults', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.owner.register('service:app-state', Service.extend({}));
    this.owner.register('service:modal', Service.extend({}));
    this.owner.register('service:persistence', Service.extend({}));
    this.owner.register('service:router', Service.extend({}));
  });

  test('board-picker opens COMPACT', function(assert) {
    var picker = this.owner.factoryFor('component:board-picker').create();

    assert.strictEqual(picker.get('compact_boards'), true, 'compact_boards defaults to true');
  });

  test('board-picker set_compact_boards asserts the named state, and coerces', function(assert) {
    var picker = this.owner.factoryFor('component:board-picker').create();

    picker.actions.set_compact_boards.call(picker, false);
    assert.strictEqual(picker.get('compact_boards'), false, 'set to detailed');

    picker.actions.set_compact_boards.call(picker, true);
    assert.strictEqual(picker.get('compact_boards'), true, 'set back to compact');

    // The segmented control asserts a state rather than toggling, so a repeat press
    // of the active option must be a no-op, not a flip.
    picker.actions.set_compact_boards.call(picker, true);
    assert.strictEqual(picker.get('compact_boards'), true, 're-asserting is a no-op');
  });

  test('available-boards-section opens COMPACT, matching the picker', function(assert) {
    var section = this.owner.factoryFor('component:available-boards-section').create();

    assert.strictEqual(section.get('compactBoards'), true, 'compactBoards defaults to true');
  });

  test('available-boards-section setCompactBoards flips density', function(assert) {
    var section = this.owner.factoryFor('component:available-boards-section').create();

    section.actions.setCompactBoards.call(section, false);
    assert.strictEqual(section.get('compactBoards'), false, 'set to detailed');

    section.actions.setCompactBoards.call(section, true);
    assert.strictEqual(section.get('compactBoards'), true, 'set back to compact');
  });

  test('orphan cluster rows are hidden by default, and the flag is what restores them', function(assert) {
    var section = this.owner.factoryFor('component:available-boards-section').create();

    assert.strictEqual(section.get('showOrphanClusters'), false, 'hidden by default');

    section.set('showOrphanClusters', true);
    assert.strictEqual(section.get('showOrphanClusters'), true, 'restorable by flag');
  });
});
