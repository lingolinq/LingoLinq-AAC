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
 */
module('Unit | Component | login-form device_login_flags', function() {
  test('an installed app is trusted without asking, as before', function(assert) {
    var data = { long_token: false };
    device_login_flags(data, { installed_app: true, browserless: true });
    assert.true(data.long_token);
    assert.true(data.browserless);
  });

  test('a Home Screen web app keeps the form\'s choice, so it is asked like the browser', function(assert) {
    var data = { long_token: false };
    device_login_flags(data, { installed_app: false, browserless: true });
    assert.false(data.long_token, 'not forced to trusted');
    assert.true(data.browserless, 'still reported as browserless');
  });

  test('a browser tab is unchanged', function(assert) {
    var data = { long_token: false };
    device_login_flags(data, { installed_app: false, browserless: false });
    assert.deepEqual(data, { long_token: false });
  });
});
