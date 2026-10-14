/* Restore page-global stubs (modal.error, $.realAjax, window.confirm, ...) even when a test
 * times out.
 *
 * A try/finally is not enough on its own. When an async test exceeds QUnit's testTimeout,
 * QUnit abandons it: the awaiting function never resumes, its finally never runs, and the
 * stub stays installed for the rest of the suite. That is how a hung system-settings
 * save-error test failed "modal flash - should properly render error flash" in the same CI
 * runs. QUnit does still run afterEach after a timeout, so pending restores run there too.
 *
 * Call it AFTER setupTest(hooks): QUnit runs a module's afterEach hooks in reverse
 * registration order, so this one then runs before the test context (and its services) is
 * torn down.
 *
 * Each restore is idempotent and bound to the test that registered it, so a finally that
 * resumes late can never undo a later test's stubs.
 *
 *   var trackRestore = setupRestoreOnTeardown(hooks);
 *   ...
 *   var restore = trackRestore(function() { modal.error = originalError; });
 *   try { ... } finally { restore(); }
 */
export function setupRestoreOnTeardown(hooks) {
  var pending = [];
  hooks.afterEach(function() {
    var restores = pending;
    pending = [];
    restores.forEach(function(restore) { restore(); });
  });
  return function trackRestore(restoreFn) {
    var done = false;
    var restore = function() {
      if (done) { return; }
      done = true;
      restoreFn();
    };
    pending.push(restore);
    return restore;
  };
}
