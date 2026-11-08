import { module, test } from 'qunit';
import { device_login_flags } from 'frontend/components/login-form';

/* WHICH SIGN-INS ARE TRUSTED WITHOUT ASKING (2026-11-05, offline app shell review round 3).
 *
 * The sign-in sends `long_token` (the "Trust this Device" choice). When the server's answer is not a
 * long token, the app asks "Trust this Device" or "This is a Shared Device" (components/login-form.js
 * handle_auth, login.device). An installed app (Cordova, Electron) is always trusted, as before. A web
 * app opened from an iPad Home Screen (navigator.standalone, utils/capabilities.js `browserless`) used
 * to be trusted the same way, so a shared classroom iPad never asked, and the offline app shell kept
 * the last person's session on it. It now asks, like the browser.
 *
 * 2026-11-07 (Scot's decision, approved by Traci): it asks only where the offline app shell is on
 * (window.offline_shell_enabled), since the old auto-trust is only unsafe with the shell. Where the
 * shell is off or not set, a Home Screen web app is trusted as before, so a dedicated AAC iPad is not
 * asked a question it could answer "Shared" by mistake. The Home Screen case below was rewritten for
 * that change of specification.
 */
var SHELL_ON = { offline_shell_enabled: true };
var SHELL_OFF = { offline_shell_enabled: false };
module('Unit | Component | login-form device_login_flags', function() {
  test('an installed app is trusted without asking, as before', function(assert) {
    var data = { long_token: false };
    device_login_flags(data, { installed_app: true, browserless: true });
    assert.true(data.long_token);
    assert.true(data.browserless);
  });

  test('with the offline shell on, a Home Screen web app keeps the form\'s choice, so it is asked like the browser', function(assert) {
    var data = { long_token: false };
    device_login_flags(data, { installed_app: false, browserless: true }, SHELL_ON);
    assert.false(data.long_token, 'not forced to trusted');
    assert.true(data.browserless, 'still reported as browserless');
  });

  test('with the offline shell off, a Home Screen web app is trusted without asking, as before the shell', function(assert) {
    var data = { long_token: false };
    device_login_flags(data, { installed_app: false, browserless: true }, SHELL_OFF);
    assert.true(data.long_token);
    assert.true(data.browserless);
  });

  test('with the offline shell not set (ember serve), a Home Screen web app is trusted without asking', function(assert) {
    var data = { long_token: false };
    device_login_flags(data, { installed_app: false, browserless: true }, {});
    assert.true(data.long_token);
    assert.true(data.browserless);
  });

  test('an installed app is trusted with the shell on too', function(assert) {
    var data = { long_token: false };
    device_login_flags(data, { installed_app: true, browserless: true }, SHELL_ON);
    assert.true(data.long_token);
  });

  test('a browser tab is unchanged with the shell on', function(assert) {
    var data = { long_token: false };
    device_login_flags(data, { installed_app: false, browserless: false }, SHELL_ON);
    assert.deepEqual(data, { long_token: false });
  });

  test('a browser tab is unchanged with the shell off', function(assert) {
    var data = { long_token: false };
    device_login_flags(data, { installed_app: false, browserless: false }, SHELL_OFF);
    assert.deepEqual(data, { long_token: false });
  });
});
