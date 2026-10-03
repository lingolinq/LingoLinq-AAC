import { module, test } from 'qunit';
import { compressedViewActive } from 'frontend/utils/compressed_view_state';

/* Compressed View is on only when BOTH the feature flag and the user's own preference say so,
 * and only for an exact `true`: a garbage or string value must never compress the page. */
module('Unit | Utility | compressed_view_state', function() {
  test('is active only when the flag is on and the preference is exactly true', function(assert) {
    assert.true(compressedViewActive(true, true), 'flag on, preference on');
    assert.false(compressedViewActive(false, true), 'flag off wins over the preference');
    assert.false(compressedViewActive(undefined, true), 'an unread flag is off');
    assert.false(compressedViewActive(true, false), 'preference off');
    assert.false(compressedViewActive(true, undefined), 'an absent preference is off');
    assert.false(compressedViewActive(true, 'true'), 'a string is not a preference of true');
  });
});
