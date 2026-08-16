import { module, test } from 'qunit';
import { homePillLabel } from 'frontend/helpers/home-pill-label';

// The primary pill-nav's home pill reads "Dashboard" for supporters and "Home" for
// communicators. This is rendered at FOUR sites (components/user-pill-nav.hbs, and
// the desktop nav, the responsive dropdown option and `activeTabLabel` in
// components/dashboard/authenticated-view.{hbs,js}), which is why the rule lives in
// one helper — these tests are what keep the four from drifting.
module('Unit | Helper | home-pill-label', function() {
  test('supporters get "Dashboard"', function(assert) {
    assert.equal(homePillLabel(true), 'Dashboard');
  });

  test('communicators get "Home"', function(assert) {
    assert.equal(homePillLabel(false), 'Home');
  });

  // `supporter_role` is `preferences.role == 'supporter'`, so a user who has not
  // picked a role yet arrives here as undefined/null. They are communicators for
  // gating purposes (see the `!supporter_role` canonical-gate learning), so they
  // must fall in the "Home" branch, not somewhere undefined.
  test('an unspecified role falls in the communicator branch', function(assert) {
    assert.equal(homePillLabel(undefined), 'Home');
    assert.equal(homePillLabel(null), 'Home');
  });

  // The helper takes the BOOLEAN, not the user record, so the template can write
  // `{{home-pill-label this.appState.currentUser.supporter_role}}` and recompute
  // when the property changes. Passing a record would only recompute on identity
  // change, so a user flipping Account View would keep the stale label.
  test('is driven by the flag, not a user object', function(assert) {
    assert.equal(homePillLabel({ supporter_role: true }), 'Dashboard',
      'a truthy object takes the supporter branch — proving the arg is coerced, ' +
      'so call sites must pass the flag rather than the record');
  });
});
