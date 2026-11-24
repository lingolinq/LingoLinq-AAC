import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';
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

/* These read the service's feature_flags computed, not resolve_feature_flags alone.
 * Putting the old union back at app-state.js, or dropping domain_settings from its
 * dependent keys, fails the two cases below. */
module('Unit | Service | app-state feature flags computed', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.svc = this.owner.lookup('service:app-state');
    this.priorWindow = window.enabled_frontend_features;
    this.priorUser = this.svc.get('currentUser');
    this.priorDomain = this.svc.get('domain_settings');
  });

  hooks.afterEach(function() {
    window.enabled_frontend_features = this.priorWindow;
    this.svc.set('currentUser', this.priorUser);
    this.svc.set('domain_settings', this.priorDomain);
  });

  test('a signed-in user with no flags does not gain goals from the window list', function(assert) {
    window.enabled_frontend_features = ['goals'];
    this.svc.set('currentUser', EmberObject.create({ feature_flags: {} }));

    assert.strictEqual(this.svc.get('feature_flags.goals'), undefined);
    assert.deepEqual(this.svc.get('feature_flags'), {});
  });

  test('a logged-out user\'s flags change when domain_settings is replaced', function(assert) {
    window.enabled_frontend_features = ['emergency_boards'];
    this.svc.set('currentUser', null);
    this.svc.set('domain_settings', { enabled_frontend_features: ['google_sso'] });

    assert.deepEqual(this.svc.get('feature_flags'), { google_sso: true });

    this.svc.set('domain_settings', { enabled_frontend_features: ['goals'] });

    assert.deepEqual(this.svc.get('feature_flags'), { goals: true });
  });
});
