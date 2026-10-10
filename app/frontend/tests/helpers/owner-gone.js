import { set_owner_gone_listener } from 'frontend/utils/live_service';

// A self-test that tears an owner down on purpose expects its guard to skip that work. While it
// runs, count those skips here instead of in the harness listener (tests/test-helper.js), which
// reports every skip as late work that an earlier test did not wait for. Call restore() in a
// finally block or an afterEach so the harness listener is back for the next test; a second call
// does nothing.
export function recordOwnerGoneSkips() {
  let count = 0;
  let restored = false;
  const previous = set_owner_gone_listener(function() { count++; });
  return {
    get count() { return count; },
    restore() {
      if (restored) { return; }
      restored = true;
      set_owner_gone_listener(previous);
    }
  };
}
