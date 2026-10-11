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
