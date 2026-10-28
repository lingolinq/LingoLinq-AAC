import { set_owner_gone_listener } from 'frontend/utils/live_service';

// A self-test that tears an owner down on purpose expects its guard to skip that work. While it
// runs, count the skips for THAT owner here instead of in the harness listener (tests/test-helper.js),
// which reports every skip as late work that an earlier test did not wait for. A skip for any other
// owner (late work from an earlier test landing in this window) is passed on to the harness listener,
// so it is still reported and never changes this test's count. Call restore() in a finally block or an
// afterEach so the harness listener is back for the next test; a second call does nothing.
export function recordOwnerGoneSkips(owner) {
  let count = 0;
  let restored = false;
  const previous = set_owner_gone_listener(function(skipped) {
    if (skipped === owner) { count++; } else if (previous) { previous(skipped); }
  });
  return {
    get count() { return count; },
    restore() {
      if (restored) { return; }
      restored = true;
      set_owner_gone_listener(previous);
    }
  };
}
