import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';
import Controller from '@ember/controller';
import * as QUnit from 'qunit';

/* SIGNED-OUT NAVBAR: SIGN IN GOES STRAIGHT TO THE LOGIN PAGE (requested 2026-10-02). On desktop the
 * "Sign In" button opened a menu (Sign In / Register / Basic Access), so reaching the login page took
 * two clicks. It is now a link to /login. Register stays on screen as "Try Free"; Basic Access moves
 * into the top links (and the mobile drawer), still behind the `emergency_boards` feature flag.
 */
QUnit.module('Integration | Component | app-navbar signed-out Sign In', function(hooks) {
  setupRenderingTest(hooks);

  function stubs(owner, emergency) {
    owner.setupRouter();
    owner.unregister('controller:application');
    owner.register('controller:application', Controller.extend({ isSessionAuthenticated: false }));
    owner.unregister('service:app-state');
    owner.register('service:app-state', Service.extend({
      installed_app: false, embedded: false, no_linky: false, current_route: 'index',
      domain_settings: { full_domain: true }, feature_flags: { emergency_boards: emergency }
    }));
  }

  QUnit.test('Sign In is a link to the login page, with no menu behind it', async function(assert) {
    stubs(this.owner, true);
    await render(hbs`<AppNavbar />`);
    var signIn = this.element.querySelector('#identity_button');
    assert.ok(signIn, 'the Sign In button is there');
    assert.strictEqual(signIn.tagName, 'A');
    assert.strictEqual(signIn.getAttribute('href'), '/login', 'it goes straight to /login');
    assert.notOk(signIn.hasAttribute('data-toggle'), 'it no longer toggles a dropdown');
    assert.notOk(this.element.querySelector('#identity .dropdown-menu'), 'there is no Sign In menu');
  });

  QUnit.test('Basic Access is a top link when emergency boards are on, and absent when off', async function(assert) {
    stubs(this.owner, true);
    await render(hbs`<AppNavbar />`);
    var top = [...this.element.querySelectorAll('.la-topbar-nav a')].map(function(a) { return a.getAttribute('href'); });
    assert.notStrictEqual(top.indexOf('/offline-boards'), -1, 'in the top links');
    stubs(this.owner, false);
    await render(hbs`<AppNavbar />`);
    top = [...this.element.querySelectorAll('.la-topbar-nav a')].map(function(a) { return a.getAttribute('href'); });
    assert.strictEqual(top.indexOf('/offline-boards'), -1, 'not without the flag');
  });
});
