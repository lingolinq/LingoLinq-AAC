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
}
