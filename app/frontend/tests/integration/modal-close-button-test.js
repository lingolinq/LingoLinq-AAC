import { setupTest } from 'frontend/tests/helpers';
import * as QUnit from 'qunit';

/*
 * The two app-wide modal defects, as fast deterministic contracts.
 *
 * These deliberately do NOT render <ModalDialog>. Doing so costs 8-27s per test
 * (jQuery height math, a runLater focus pass, the stretch observer — all
 * test-waiter tracked) and blew QUnit's global 15s ceiling under full-suite
 * load. The real click-path proof lives in the browser instead:
 * `node scripts/modal-audit-qa.mjs` drives Chromium through the actual app.
 * What is left here is the precise root-cause contract each defect violates,
 * which is what a fast CI signal should assert.
 *
 * See docs/task-management/2026-08-10-modal-scroll-and-close-app-wide.md.
 */

/*
 * Defect 1 — the X close button.
 *
 * 258 close buttons app-wide bind `{{on "click" (this.ctrlAction "close")}}`, a
 * factory defined in init(). modeling-intro instead bound
 * `{{on "click" this.onClose}}` — a bare property it assigned in
 * didInsertElement, i.e. AFTER the template installs the modifier. The modifier
 * captured `undefined` and threw
 * `Cannot read properties of undefined (reading 'bind')` at install, leaving the
 * X dead (Escape and backdrop still closed, because modal-dialog falls back to
 * modal.close() when @action is undefined).
 *
 * The contract: these handlers must exist on a freshly constructed component,
 * before any render. Assigning them in didInsertElement fails this.
 */
QUnit.module('Unit | modal close handlers are bound before render', function(hooks) {
  setupTest(hooks);

  /*
   * beta-feedback-modal is the third case, found by scripts/modal-audit-qa.mjs
   * and worse than the other two: its handlers are passed as ARGUMENTS to a
   * child (`<BetaFeedbackPanel @onClose={{this.onClose}} .../>`) which gates the
   * button on `{{#if @onClose}}`, so an undefined handler meant the close button
   * was never RENDERED — and @onCancel / @onSubmitSuccess were dead as well.
   */
  /* caseload-guide was the first case found and is no longer in the list because
     the component was deleted with the caseload guided tour. */
  ['modeling-intro', 'beta-feedback-modal', 'speak-mode-intro'].forEach(function(name) {
    QUnit.test(name + ' exposes its handlers at construction', function(assert) {
      var component = this.owner.factoryFor('component:' + name).create();

      assert.strictEqual(typeof component.onClose, 'function',
        'onClose must be a function before render — the {{on}} modifier binds it during render');
      assert.strictEqual(typeof component.onOpening, 'function',
        'onOpening is passed as @opening and read by modal-dialog didRender');
      assert.strictEqual(typeof component.onClosing, 'function',
        'onClosing is passed as @closing');

      component.destroy();
    });
  });
});

/*
 * Defect 2 — modal scrolling.
 *
 * Bootstrap 3 gates the rule that makes a modal viewport scrollable behind
 * `body.modal-open` (bower_components/bootstrap/dist/css/bootstrap.css):
 *
 *   .modal-open        { overflow: hidden }   :5866  locks the page behind
 *   .modal             { overflow: hidden }   :5877  the modal viewport
 *   .modal-open .modal { overflow-y: auto }   :5896  makes it scrollable
 *
 * Bootstrap's own JS adds that class. This app renders the markup itself
 * (modal-dialog.hbs) and never set it, so `.modal` kept `overflow: hidden` and
 * no modal could scroll its content.
 *
 * Two tests because the fix is a chain: the service must set the class, AND the
 * class must actually unlock scrolling. Either half can pass while the feature
 * stays broken.
 */
QUnit.module('Unit | modal scroll lock', function(hooks) {
  setupTest(hooks);

  hooks.afterEach(function() {
    document.body.classList.remove('modal-open');
  });

  /*
   * Drives _syncBodyModalOpen off the service's own state rather than calling
   * open()/close(). Those schedule unguarded runLater work, and awaiting
   * settled() to flush it also waits on unrelated app-wide async — 11s in
   * practice, close enough to QUnit's 15s ceiling to fail under load.
   *
   * That open() and close() actually CALL this is proven end-to-end in a real
   * browser by scripts/modal-audit-qa.mjs, which asserts body.modal-open for
   * every modal it opens.
   */
  QUnit.test('the body class is derived from the open state', function(assert) {
    var svc = this.owner.lookup('service:modal');

    svc.set('currentTemplate', null);
    svc._syncBodyModalOpen();
    assert.false(document.body.classList.contains('modal-open'),
      'no modal open -> no class, so the page behind scrolls normally');

    svc.set('currentTemplate', 'modals/caseload-guide');
    svc._syncBodyModalOpen();
    assert.true(document.body.classList.contains('modal-open'),
      'modal open -> class set, which is what unlocks .modal scrolling');

    svc.set('currentTemplate', null);
    svc._syncBodyModalOpen();
    assert.false(document.body.classList.contains('modal-open'),
      'derived, not counted — it cannot drift out of sync with isOpen()');
  });

  QUnit.test('modal-open on <body> is what unlocks .modal scrolling', function(assert) {
    // Both assertions live inside a try/finally, so state the count explicitly —
    // otherwise a throw between them would pass as a silent zero-assertion test.
    assert.expect(2);
    // Plain detached-then-attached markup rather than a rendered component: the
    // rule under test is vendor CSS keyed purely on class names, so the whole
    // render pipeline is cost with no coverage.
    var el = document.createElement('div');
    el.className = 'modal';
    document.body.appendChild(el);

    try {
      document.body.classList.remove('modal-open');
      assert.strictEqual(getComputedStyle(el).overflowY, 'hidden',
        'without the class, bootstrap keeps the viewport unscrollable — the original bug');

      document.body.classList.add('modal-open');
      assert.notStrictEqual(getComputedStyle(el).overflowY, 'hidden',
        'with the class, tall content becomes reachable');
    } finally {
      el.remove();
    }
  });
});
