import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';

/*
 * Does `@opening={{this.onOpening}}` actually reach modal-dialog?
 *
 * modal-dialog reads it in didRender, once, behind an `already_opened` latch:
 *
 *   if(!this.get('already_opened')) {
 *     this.set('already_opened', true);
 *     var opening = this.get('opening');
 *     if (opening && typeof opening === 'function') { opening(); }
 *
 * modal-dialog is a CHILD of the modal component, and child didRender runs
 * BEFORE parent didInsertElement. A component that assigns onOpening in
 * didInsertElement therefore has `undefined` there.
 *
 * The large majority of modal components still assign it in didInsertElement;
 * only a handful use init(). The
 * opening() bodies are not all trivial (up to 46 lines in modeling-ideas), so
 * this is worth establishing empirically.
 *
 * Spying on ModalDialog rather than on each modal component: it is the single
 * consumer of @opening, so one spy covers every caller and records the fact
 * that matters — what `opening` WAS when didRender read it.
 *
 * See docs/task-management/2026-08-11-modal-opening-callback.md.
 */
QUnit.module('Integration | modal @opening callback', function(hooks) {
  setupRenderingTest(hooks);

  function spyOnModalDialog(owner) {
    const Base = owner.factoryFor('component:modal-dialog').class;
    const seen = { didRenders: 0, openingTypes: [], marker: false };
    owner.unregister('component:modal-dialog');
    owner.register('component:modal-dialog', Base.extend({
      _isAuditSpy: true,
      didRender() {
        seen.didRenders++;
        seen.openingTypes.push(typeof this.get('opening'));
        this._super(...arguments);
      }
    }));
    // Guard the instrument before trusting its readings: a silently-ignored
    // re-registration would report "never fired" for everything, which is
    // exactly the false negative the first version of this test produced.
    seen.marker = !!owner.factoryFor('component:modal-dialog').class.prototype._isAuditSpy;
    return seen;
  }

  /* speak-mode-intro is the init-based specimen (components/speak-mode-intro.js:35-37
     assign onClose/onOpening/onClosing inside init()). It replaced caseload-guide,
     which was the original specimen and has since been deleted along with the
     guided tour it hosted. */
  QUnit.test('init-based component: modal-dialog receives a real callback', async function(assert) {
    const seen = spyOnModalDialog(this.owner);
    await render(hbs`<SpeakModeIntro />`);

    assert.true(seen.marker, 'SPY CHECK: the modal-dialog override is what rendered');
    assert.ok(seen.didRenders > 0, 'SPY CHECK: modal-dialog didRender ran at all');
    assert.strictEqual(seen.openingTypes[0], 'function',
      'assigned in init(), so it exists by the time modal-dialog reads @opening');
  });

  /*
   * KNOWN BROKEN — QUnit.todo, so the suite stays green and flips to a failure
   * the moment someone fixes it.
   *
   * cloud-extras is the measured failure case:
   * `didRenders=2 types=[undefined,undefined]` — undefined on BOTH renders,
   * including the one after didInsertElement had already assigned it, because
   * `this.onOpening = fn` is a plain assignment that notifies nothing, so the
   * argument binding never invalidates and never re-reads.
   *
   * That rules out the attractive one-line fix: removing modal-dialog's
   * `already_opened` latch would NOT help, because the value never arrives at
   * all. The assignment has to move to init(), per component.
   *
   * A 98-file sweep doing exactly that was written and REVERTED on 2026-08-12:
   * it woke ~25-30 lifecycle bodies dormant since the 5.12 migration, causing
   * recursion on /create-board, a speak-mode PIN gate that disabled itself on a
   * backdrop tap, and Escape committing button edits. Doing this safely needs a
   * per-component audit behind a feature flag, or a channel change in
   * modal-dialog (`@owner={{this}}`) rather than 121 pasted blocks.
   */
  QUnit.todo('didInsertElement-based component receives undefined (KNOWN, unfixed)', async function(assert) {
    const seen = spyOnModalDialog(this.owner);
    await render(hbs`<CloudExtras />`);

    assert.true(seen.marker, 'SPY CHECK: the modal-dialog override is what rendered');
    assert.ok(seen.didRenders > 0, 'SPY CHECK: modal-dialog didRender ran at all');
    assert.strictEqual(seen.openingTypes[0], 'function',
      'should be a function; is undefined until cloud-extras assigns in init()');
  });

  /*
   * NOT covered here: the invariant that no component both assigns onOpening in
   * init() AND calls opening() itself in didInsertElement — which would fire it
   * twice per open, re-running data loads and state resets. 20 components use
   * that workaround and were deliberately left on it.
   *
   * That invariant is structural (which lifecycle hook contains which
   * statement) and cannot be read from a compiled class at runtime, so it is
   * checked by source analysis in the task log rather than faked here. See
   * docs/task-management/2026-08-11-modal-opening-callback.md.
   */
});
