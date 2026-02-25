import Application from '../app';
import config from '../config/environment';
import * as QUnit from 'qunit';
import { setApplication } from '@ember/test-helpers';
import { setup } from 'qunit-dom';
import { start } from 'ember-qunit';
import { isTesting } from '@ember/debug';

QUnit.config.testTimeout = 60000;

// Skip deferred readiness in tests so the app boots immediately instead of waiting
// for IndexedDB/lang/extras (which can hang in headless Chromium on WSL2).
if (isTesting()) {
  window.cough_drop_readiness = true;
}

setApplication(Application.create(config.APP));

setup(QUnit.assert);

// Force-load all test modules before start(). The ember-cli-test-loader's loadTests()
// only registers ~3 tests for unknown reasons (loader/context mismatch). Manually
// requiring each *-test module ensures they execute and register their tests.
const req = (typeof window !== 'undefined' && window.requirejs) || (typeof self !== 'undefined' && self.requirejs);
if (req && req.entries && typeof req === 'function') {
  const all = Object.keys(req.entries);
  const testMods = all.filter((n) => n.match(/[-_]test$/));
  let loaded = 0;
  let failed = 0;
  testMods.forEach(function(mod) {
    try {
      req(mod);
      loaded++;
    } catch (e) {
      failed++;
      console.warn('[TEST] Failed to load', mod, e.message);
    }
  });
  if (failed > 0) {
    console.warn('[TEST] Pre-loaded', loaded, 'modules,', failed, 'failed');
  }
}

// Log summary when run completes (browser console; Testem shows "X tests complete" in terminal)
QUnit.on('runEnd', function(runEnd) {
  const c = runEnd.testCounts;
  if (c.failed > 0 || c.total > 100) {
    console.log('[TEST]', c.passed, 'passed,', c.failed, 'failed,', c.skipped, 'skipped,', c.todo, 'todo |', runEnd.runtime, 'ms');
  }
});

// loadTests: false — we already pre-loaded all test modules above
start({ loadTests: false });
