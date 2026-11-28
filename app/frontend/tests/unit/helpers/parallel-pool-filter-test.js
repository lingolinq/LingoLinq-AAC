import QUnit, { module, test } from 'qunit';
import { poolFilter, poolSelection } from 'frontend/tests/helpers/parallel-pool-filter';
import parallelPool from 'frontend/tests/parallel-pool';

// QUnit 2.24's regexFilter: `/re/flags`, optionally negated with a leading `!`.
function selects(filterValue, fullName) {
  const parsed = /^(!?)\/([\w\W]*)\/(i?$)/.exec(filterValue);
  const matched = new RegExp(parsed[2], parsed[3]).test(fullName);
  return matched !== !!parsed[1];
}

module('Unit | Helper | parallel-pool-filter', function() {
  const names = ['Unit | Route | terms (index + bento)', 'Buttonset', 'a.b {x} [y] \\z/'];
  const tests = names.map((n) => n + ': does a thing').concat([
    'Buttonset extras: shares a prefix only',
    'buttonset: differs only in case',
    'Unit | Route | terms: shorter name',
    'aXb {x} [y] \\z/: regex-special lookalike',
  ]);

  test('include and exclude split every test exactly once', function(assert) {
    assert.expect(tests.length + 1);
    const include = poolFilter(names, false);
    const exclude = poolFilter(names, true);
    tests.forEach((name) => {
      assert.notStrictEqual(selects(include, name), selects(exclude, name), name);
    });
    assert.deepEqual(tests.filter((name) => selects(include, name)), names.map((n) => n + ': does a thing'),
      'include selects exactly the listed modules, case-sensitively');
  });

  test('the selection comes only from ?pool=', function(assert) {
    assert.strictEqual(poolSelection('', names), null, 'no parameter: the run is untouched');
    assert.strictEqual(poolSelection('?hidepassed', names), null);
    assert.strictEqual(poolSelection('?pool=include', names), poolFilter(names, false));
    assert.strictEqual(poolSelection('?filter=x&pool=exclude', names), poolFilter(names, true));
    assert.throws(() => poolSelection('?pool=all', names), /Unknown \?pool= value/);
  });

  test('the committed pool list is well formed', function(assert) {
    assert.expect(2);
    assert.ok(parallelPool.length > 0, 'lists at least one module');
    assert.strictEqual(new Set(parallelPool).size, parallelPool.length, 'no module is listed twice');
  });

  // The filter matches `<listed name>: ` at the start of a test's full name. A listed name that
  // is not a real module, or a real module named `<listed name>: <more>`, would pull unlisted
  // (unproven) tests into the pool; a stale name would silently drop a module to main.
  test('every listed name is exactly one registered module, and no other module extends it', function(assert) {
    const registered = QUnit.config.modules.map((m) => m.name);
    assert.expect(parallelPool.length * 2);
    parallelPool.forEach((name) => {
      assert.strictEqual(registered.filter((r) => r === name).length, 1, 'registered exactly once: ' + name);
      assert.deepEqual(registered.filter((r) => r.indexOf(name + ': ') === 0), [],
        'no unlisted module whose name starts with "' + name + ': "');
    });
  });
});
