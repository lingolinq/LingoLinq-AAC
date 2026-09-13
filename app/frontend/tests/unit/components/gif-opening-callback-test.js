import { setupTest } from 'frontend/tests/helpers';
import * as QUnit from 'qunit';

/*
 * ModalDialog reads `@opening` during its OWN didRender, and a child's didRender
 * runs BEFORE the parent component's didInsertElement. A modal that assigns
 * onOpening in didInsertElement therefore hands ModalDialog `undefined` and its
 * opening() never runs.
 *
 * For the GIF modal that was not cosmetic: opening() is what seeds `search` from
 * stashes `working_vocalization` and kicks off searchGifs(). With it unreachable the
 * modal always opened titled `GIF Search for ""` with "No results", regardless of
 * what was in the speak bar.
 *
 * Asserting on init alone (no render) is deliberate: it pins the ordering property
 * that actually broke, and cannot be satisfied by anything that happens later.
 * See tests/integration/modal-opening-callback-test.js for the general finding.
 */
QUnit.module('Unit | Component | gif opening callback', function(hooks) {
  setupTest(hooks);

  QUnit.test('onOpening is assigned during init, before any render', function(assert) {
    const comp = this.owner.factoryFor('component:gif').create();
    assert.strictEqual(typeof comp.onOpening, 'function', 'onOpening is a function after init');
    assert.strictEqual(typeof comp.onClose, 'function', 'onClose is a function after init');
    assert.strictEqual(typeof comp.onClosing, 'function', 'onClosing is a function after init');
  });
});
