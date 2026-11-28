import { stub } from 'frontend/tests/helpers/jasmine';

// Shows every moment the app builds through window.moment at a fixed UTC offset (in minutes),
// with "now" pinned to the given instant, so a test checks dates where the UTC date and the
// local date differ, on any machine. Restored by restoreStubs() with the test's other stubs.
export function pinMomentAtOffset(now, offset) {
  var base = window.moment;
  stub(window, 'moment', function(a, b) {
    if(a || b) {
      return base(a, b).utcOffset(offset, true);
    } else {
      return base(now).utcOffset(offset);
    }
  });
}
