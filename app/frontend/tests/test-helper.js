import Application from '../app';
import config from '../config/environment';
import * as QUnit from 'qunit';
import { setApplication } from '@ember/test-helpers';
import { setup } from 'qunit-dom';
import { start } from 'ember-qunit';
import { isTesting } from '@ember/debug';

QUnit.config.testTimeout = 15000;

// Skip deferred readiness in tests so the app boots immediately instead of waiting
// for IndexedDB/lang/extras (which can hang in headless Chromium on WSL2).
if (isTesting()) {
  window.cough_drop_readiness = true;
}

setApplication(Application.create(config.APP));

setup(QUnit.assert);

// Force-load all test modules before start(). The ember-cli-test-loader's loadTests()
// only discovers ~3 modules due to AMD registration timing (test-helper.js executes
// before the remaining test module factories are appended to requirejs.entries).
// Manually requiring each *-test module ensures they execute and register their tests.
//
// See tests/README-test-loader.md for root cause analysis and potential fixes.
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
  if (c.total > 0) {
    console.log('[TEST]', c.passed, 'passed,', c.failed, 'failed,', c.skipped, 'skipped,', c.todo, 'todo |', runEnd.runtime, 'ms');
  }
});

// Explicit imports for new-style QUnit acceptance tests. The requirejs-based
// auto-loader above misses modules due to AMD registration timing on this Ember
// version; importing them here guarantees they're pulled into the bundle and
// their `module()`/`test()` calls fire before `start()` below.
//
// ember/no-test-import-export guards against test files importing each other,
// which double-registers modules. That is not what these are: this is the test
// ENTRY POINT deliberately pulling modules the auto-loader drops, and removing
// any line silently stops that suite running. Disabled for the block, with the
// reason at the site, rather than left as a dozen anonymous baseline rows.
/* eslint-disable ember/no-test-import-export */
import 'frontend/tests/acceptance/board-detail-empty-state-test';
import 'frontend/tests/acceptance/board-lock-test';
import 'frontend/tests/acceptance/lesson_expired_test';
import 'frontend/tests/unit/controllers/board-index-word-prediction-locale-test';
import 'frontend/tests/unit/controllers/copying-board-test';
import 'frontend/tests/unit/controllers/user-board-detail-image-cache-test';
import 'frontend/tests/unit/utils/board-detail-cache-test';
import 'frontend/tests/unit/utils/board-prefetch-planner-test';
import 'frontend/tests/unit/utils/loading-overlay-cache-test';
import 'frontend/tests/unit/utils/persistence-json-payload-cache-test';
import 'frontend/tests/unit/utils/raw-events-test';
import 'frontend/tests/unit/models/board-reload-if-lite-test';
import 'frontend/tests/unit/models/buttonset-cache-fallback-test';
import 'frontend/tests/unit/components/share-board-guard-test';
/* eslint-enable ember/no-test-import-export */

// loadTests: false — we already pre-loaded all test modules above
// setupTestIsolationValidation: enable per-module once tests use ember-qunit setupTest
// and drain async work in afterEach. Legacy jasmine db_wait/waitsFor modules fail
// isolation checks today (~600ms false positives). Opt in via ?testIsolation=1 when debugging leaks.
var _enableTestIsolation = false;
if (typeof window !== 'undefined' && window.location && window.location.search) {
  _enableTestIsolation = window.location.search.indexOf('testIsolation=1') >= 0;
}
start({
  loadTests: false,
  setupTestIsolationValidation: _enableTestIsolation,
  testIsolationValidationDelay: 50
});
