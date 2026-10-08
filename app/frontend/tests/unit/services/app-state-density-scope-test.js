import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import modal from 'frontend/utils/modal';

/* `sync_density_scope` (services/app-state.js) puts `body.ll-density-compressed` on the page
 * only while the `compressed_view` flag AND the session user's own preference are on, and takes
 * it off again on sign-out. Exercised on the REAL service, because the observer's dependent keys
 * are the whole point: it must react to the preference, to the flags arriving, and to the
 * session user going away. */
module('Unit | Service | app-state density scope', function(hooks) {
  setupTest(hooks);

  function user(prefs, flags) {
    return EmberObject.create({
      id: 'u1',
      preferences: prefs,
      feature_flags: flags,
      reload: function() { return RSVP.resolve(this); }
    });
  }

  function compressed() {
    return document.body.classList.contains('ll-density-compressed');
  }

  hooks.beforeEach(function() {
    // Same reason as app-state-effective-view-test.js: setting users on the real service wakes
    // observers that raise flash messages, which throw outside a rendered app.
    this._modal = { flash: modal.flash, warning: modal.warning, notice: modal.notice,
                    error: modal.error, success: modal.success };
    modal.flash = function() { };
    modal.warning = function() { };
    modal.notice = function() { return RSVP.resolve(); };
    modal.error = function() { };
    modal.success = function() { };
    this.svc = this.owner.lookup('service:app-state');
  });

  hooks.afterEach(function() {
    Object.assign(modal, this._modal);
    document.body.classList.remove('ll-density-compressed');
  });

  test('compresses only with the flag and the preference both on', function(assert) {
    var u = user({ compressed_view: true }, { compressed_view: true });
    this.svc.setProperties({ currentUser: u, sessionUser: u });
    assert.true(compressed(), 'flag and preference on');

    u.set('preferences.compressed_view', false);
    assert.false(compressed(), 'turning the preference off removes the class');

    u.set('preferences.compressed_view', true);
    assert.true(compressed(), 'and turning it back on restores it');

    u.set('feature_flags', {});
    assert.false(compressed(), 'losing the flag removes the class');
  });

  test('never compresses without the flag', function(assert) {
    var u = user({ compressed_view: true }, {});
    this.svc.setProperties({ currentUser: u, sessionUser: u });
    assert.false(compressed(), 'preference alone is not enough');
  });

  test('signing out removes the class', function(assert) {
    var u = user({ compressed_view: true }, { compressed_view: true });
    this.svc.setProperties({ currentUser: u, sessionUser: u });
    assert.true(compressed(), 'on while signed in');
    this.svc.setProperties({ currentUser: null, sessionUser: null });
    assert.false(compressed(), 'off once there is no session user');
  });
});
