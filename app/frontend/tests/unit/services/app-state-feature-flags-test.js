import { module, test } from 'qunit';
import { resolve_feature_flags } from 'frontend/services/app-state';

/* The shell used to copy window.enabled_frontend_features onto the user and set each one
 * true, so a flag turned off in System Settings stayed on in the client. A loaded user's
 * feature_flags (FeatureFlags.frontend_flags_for) is the source of truth. The window list
 * and the domain_settings list apply only when nobody is signed in, and an empty domain
 * list means the server turned them off. */
module('Unit | Service | app-state feature flags', function() {
  test('a loaded user keeps the server flags when the window list names more', function(assert) {
    var userFlags = { subscriptions: true };
    var resolved = resolve_feature_flags(userFlags, ['subscriptions', 'goals'], undefined);

    assert.strictEqual(resolved, userFlags);
    assert.strictEqual(resolved.goals, undefined);
  });

  test('an empty user flag object is not filled from the window list', function(assert) {
    var resolved = resolve_feature_flags({}, ['goals', 'google_sso'], undefined);

    assert.deepEqual(resolved, {});
  });

  test('logged out, the domain list replaces the window list', function(assert) {
    var resolved = resolve_feature_flags(null, ['goals', 'google_sso'], ['google_sso']);

    assert.deepEqual(resolved, { google_sso: true });
  });

  test('logged out, an empty domain list stays empty', function(assert) {
    var resolved = resolve_feature_flags(null, ['google_sso'], []);

    assert.deepEqual(resolved, {});
  });

  test('logged out, the window list is the fallback before domain settings arrive', function(assert) {
    var resolved = resolve_feature_flags(null, ['google_sso'], undefined);

    assert.deepEqual(resolved, { google_sso: true });
  });
});
