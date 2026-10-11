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
// late work from an earlier test lands, so in the required build-and-test run (no flag) they are
// reported and never fail an unrelated test; the Ember shard jobs pass `?timingStrict=1`, and the fetch
// probe implies it, so those non-required runs fail on them. Covers: an Ember Data fetch still queued
// at teardown (tests/helpers/index.js) and a read or write on a destroyed service
// (tests/helpers/leak-check.js). Stubs and DOM left behind are deterministic and always fail.
let strictCached = null;
export function timingStrict() {
  if (strictCached === null) {
    const search = (typeof window !== 'undefined' && window.location && window.location.search) || '';
    strictCached = /[?&]timingStrict=1(&|$)/.test(search) || fetchProbeDelay() > 0;
  }
  return strictCached;
}
