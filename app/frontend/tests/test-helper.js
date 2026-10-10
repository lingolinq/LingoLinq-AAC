import Application from '../app';
import config from '../config/environment';
import * as QUnit from 'qunit';
import { setApplication } from '@ember/test-helpers';
import { setup } from 'qunit-dom';
import { start } from 'ember-qunit';
import { isTesting } from '@ember/debug';
// First of the local imports: CI shard selection must be in place before any test module registers.
import './helpers/apply-parallel-pool';
// Fails a test that leaves state behind for later tests, or uses state an earlier test left behind.
import './helpers/leak-check';
import { set_owner_gone_listener } from 'frontend/utils/live_service';

QUnit.config.testTimeout = 15000;

// A deferred-work guard (owner_gone in app/utils/live_service.js) skips work whose app was torn down:
// an earlier test scheduled it and did not wait. Skipping keeps it out of the current test, but it
// must not be silent: each skip is logged with the test running when it fired (the Ember shard jobs
// copy these lines into the job summary), and a browser console run ends with a count (testem does
// not print console output from outside a test). Reported, not failed: when the late work lands
// depends on timing.
const ownerGoneSkips = [];
set_owner_gone_listener(function() {
  const current = QUnit.config.current;
  const name = current ? `${current.module.name}: ${current.testName}` : '(between tests)';
  ownerGoneSkips.push(name);
  // eslint-disable-next-line no-console
  console.warn(`[owner-gone] late work from an earlier test was skipped while running: ${name}`);
});
QUnit.done(function() {
  // eslint-disable-next-line no-console
  console.warn(`[owner-gone] ${ownerGoneSkips.length} piece(s) of late work skipped after their app was torn down`);
});
// Keep passed-test rows out of the QUnit reporter. With ~3,300 tests the rows reached 65k+
// DOM nodes and every later test slowed with them (per-test floor ~40 ms -> ~1.5 s in CI;
// suite 46.9 -> 20.3 min with this set). Failed tests are still listed.
QUnit.config.hidepassed = true;

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
  const loadFailures = [];
  testMods.forEach(function(mod) {
    try {
      req(mod);
      loaded++;
    } catch (e) {
      failed++;
      loadFailures.push(mod + ': ' + e.message);
      console.warn('[TEST] Failed to load', mod, e.message);
    }
  });
  if (failed > 0) {
    console.warn('[TEST] Pre-loaded', loaded, 'modules,', failed, 'failed');
  }
  // A test module that throws while loading registers none of its tests, so it dropped out of
  // every run while CI stayed green. This always-registered test turns that into a failure that
  // names the module.
  QUnit.module('Test loading', function() {
    QUnit.test('every test module loads', function(assert) {
      assert.deepEqual(loadFailures, [], 'test modules that failed to load (none of their tests ran)');
    });
  });
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
import 'frontend/tests/unit/controllers/user-board-detail-display-prefs-dirty-test';
import 'frontend/tests/unit/controllers/user-board-detail-cancel-edit-clean-test';
import 'frontend/tests/unit/controllers/user-board-detail-display-prefs-snapshot-test';
import 'frontend/tests/unit/components/copy-board-hierarchy-test';
import 'frontend/tests/unit/controllers/user-board-detail-image-cache-test';
import 'frontend/tests/unit/utils/board-detail-cache-test';
import 'frontend/tests/unit/utils/board-prefetch-planner-test';
import 'frontend/tests/unit/utils/loading-overlay-cache-test';
import 'frontend/tests/unit/utils/persistence-json-payload-cache-test';
import 'frontend/tests/unit/utils/raw-events-test';
import 'frontend/tests/unit/models/board-reload-if-lite-test';
import 'frontend/tests/unit/models/buttonset-cache-fallback-test';
import 'frontend/tests/unit/components/share-board-guard-test';
import 'frontend/tests/unit/utils/special_vocalization-test';
import 'frontend/tests/unit/components/bound-select-search-test';
import 'frontend/tests/unit/components/button-set-action-vocalization-test';
import 'frontend/tests/unit/components/board-icon-pick-behavior-test';
import 'frontend/tests/unit/components/board-density-defaults-test';
import 'frontend/tests/unit/components/boards-layout-toggle-test';
import 'frontend/tests/unit/components/view-switcher-availability-test';
import 'frontend/tests/unit/components/classic-view-extras-scroll-test';
import 'frontend/tests/unit/utils/tours-registry-classic-test';
import 'frontend/tests/unit/components/classic-view-observer-kick-test';
import 'frontend/tests/unit/controllers/application-try-new-style-test';
import 'frontend/tests/unit/helpers/break-on-separators-test';
import 'frontend/tests/unit/helpers/letter-stagger-test';
import 'frontend/tests/unit/utils/dashboard-sections-test';
import 'frontend/tests/unit/utils/session-user-wait-test';
import 'frontend/tests/unit/routes/setup-retired-test';
import 'frontend/tests/unit/routes/board-cold-boot-view-test';
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
