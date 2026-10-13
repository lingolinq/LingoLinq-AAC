import { module, test } from 'qunit';
import { parseTimingStrict } from 'frontend/tests/helpers/fetch-probe';

/*
 * The Ember shard jobs switch timing-strict mode on with `?timingStrict=1` (.github/workflows/ci.yml).
 * If this parse stopped matching, both timing checks would quietly become log-only in every run;
 * the shard step also fails when the run does not log `[timing-strict] on`.
 */
module('Unit | Helper | timingStrict query parsing', function() {
  test('turns on for timingStrict=1 anywhere in the query', function(assert) {
    assert.true(parseTimingStrict('?timingStrict=1'));
    assert.true(parseTimingStrict('?pool=include&timingStrict=1'));
    assert.true(parseTimingStrict('?timingStrict=1&pool=exclude'));
  });

  test('stays off for anything else', function(assert) {
    assert.false(parseTimingStrict(''));
    assert.false(parseTimingStrict(undefined));
    assert.false(parseTimingStrict('?pool=include'));
    assert.false(parseTimingStrict('?timingStrict=0'));
    assert.false(parseTimingStrict('?timingStrict=10'));
    assert.false(parseTimingStrict('?notTimingStrict=1'));
  });
});
