/*
 * Side-effect module: sets QUnit.config.filter for a CI shard (`?pool=include|exclude`).
 *
 * It must be imported by tests/test-helper.js BEFORE any test module. QUnit decides whether a
 * test is selected when the test is registered (qunit.js Test constructor, `valid: this.valid()`),
 * and ES imports run before the importing file's body, so a filter set in test-helper's own body
 * misses the test modules it imports explicitly: they were selected in both shards.
 */
import * as QUnit from 'qunit';
import parallelPool from '../parallel-pool';
import { poolSelection } from './parallel-pool-filter';

const poolFilter = poolSelection(window.location.search, parallelPool);
if (poolFilter) {
  QUnit.config.filter = poolFilter;
  // Completeness evidence for CI, so a shard can prove it ran everything it selected without a
  // full run to compare against: `selected` is what QUnit will run in this shard, `registered`
  // every test registered (selected or not). ci.yml checks selected == the shard's `# tests`,
  // and ci-shard-compare.py checks both shards saw the same registered total and that their
  // selections add up to it.
  QUnit.on('runStart', function(details) {
    const registered = QUnit.config.modules.reduce((sum, mod) => sum + mod.tests.length, 0);
    console.log('[SHARD] selected=' + details.testCounts.total + ' registered=' + registered);
  });
}
