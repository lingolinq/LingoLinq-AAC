import * as QUnit from 'qunit';

// The opt-in fetch probe's delay: `?probeDelay=<ms>` (ember test --query "probeDelay=1500"), 0 when off.
// tests/test-helper.js delays every Ember Data fetch flush by it; tests/helpers/index.js waits past it at
// teardown, so a delayed flush still runs before the store is destroyed.
let cached = null;
export function fetchProbeDelay() {
  if (cached === null) {
    const search = (typeof window !== 'undefined' && window.location && window.location.search) || '';
    const match = /[?&]probeDelay=(\d+)/.exec(search);
    cached = match ? parseInt(match[1], 10) : 0;
  }
  return cached;
}

// Whether TIMING-dependent harness findings fail the test or are only reported. They depend on when
// late work from an earlier test lands. Without the flag (a plain local run) they are only reported;
// the Ember shard jobs, CI's required Ember run, pass `?timingStrict=1`, and the fetch probe implies
// it, so those runs fail on them. Covers: an Ember Data fetch still queued
// at teardown (tests/helpers/index.js) and a read or write on a destroyed service
// (tests/helpers/leak-check.js). Stubs and DOM left behind always fail: usually by the test that left
// them, but late work can leave one during a later test, which the failure log line says.
// A test can force either mode for itself with `QUnit.config.current.timingStrict = true` (or false);
// the harness self-tests do. It is read from the running test, so it never reaches the next one.
export function parseTimingStrict(search) {
  return /[?&]timingStrict=1(&|$)/.test(search || '');
}
// The run's own mode, without a test's override. tests/test-helper.js logs it as `[timing-strict] on|off`
// when the run starts, and the Ember shard jobs fail if they do not see `on`.
let strictCached = null;
export function timingStrictForRun() {
  if (strictCached === null) {
    const search = (typeof window !== 'undefined' && window.location && window.location.search) || '';
    strictCached = parseTimingStrict(search) || fetchProbeDelay() > 0;
  }
  return strictCached;
}
export function timingStrict() {
  const current = QUnit.config && QUnit.config.current;
  if (current && typeof current.timingStrict === 'boolean') { return current.timingStrict; }
  return timingStrictForRun();
}
