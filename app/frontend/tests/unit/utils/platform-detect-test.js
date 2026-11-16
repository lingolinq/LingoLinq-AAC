import { module, test } from 'qunit';
import { detect_platform } from 'frontend/utils/platform_detect';
import capabilities from 'frontend/utils/capabilities';

/* Platform detection that the suite can reach (#1201, PR #1268).
 *
 * utils/capabilities.js worked out the platform once, when the module loaded, so no test could show that an iPad
 * announcing itself as a Mac is treated as a mobile device: taking the iPad check out of that code left every test
 * green. The block now lives in detect_platform, called with the browser's navigator and window, and these tests
 * call it with made-up ones. `mobile` decides how many requests a sync runs at once, touch handling, the sign-in
 * overlay and autofocus.
 */
module('Unit | Utility | platform detect', function() {
  var MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  function detect(nav, win, start) {
    var found = Object.assign({}, start);
    detect_platform(found, nav, win || {});
    return found;
  }

  test('an iPad that announces itself as a Mac is a mobile device', function(assert) {
    var ipad = detect({ userAgent: MAC, maxTouchPoints: 5 });
    assert.true(ipad.mobile, 'mobile');
    assert.strictEqual(ipad.system, 'Mac', 'system still says Mac (#1201: needs a device check before it changes)');
    assert.strictEqual(ipad.browser, 'Safari');
  });

  test('a Mac is not a mobile device', function(assert) {
    var mac = detect({ userAgent: MAC, maxTouchPoints: 0 });
    assert.false(mac.mobile);
    assert.strictEqual(mac.system, 'Mac');
    assert.strictEqual(mac.readable_device_name, 'Safari for Mac');
  });

  test('an iPad or iPhone that says so is iOS and mobile', function(assert) {
    var ipad = detect({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1', appVersion: '5.0 (iPad; CPU OS 16_6 like Mac OS X)' });
    assert.deepEqual([ipad.mobile, ipad.system, ipad.browser, ipad.ios_version, ipad.system_version], [true, 'iOS', 'Safari', 16, 16]);
    var app = detect({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15', appVersion: '' }, {}, { installed_app: true });
    assert.deepEqual([app.mobile, app.system, app.browser], [true, 'iOS', 'App'], 'the installed app');
  });

  test('Android is mobile, in the browser and in the installed app', function(assert) {
    var agent = 'Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
    var chrome = detect({ userAgent: agent });
    assert.deepEqual([chrome.mobile, chrome.system, chrome.browser, chrome.system_version], [true, 'Android', 'Chrome', '14']);
    var app = detect({ userAgent: agent }, {}, { installed_app: true });
    assert.deepEqual([app.mobile, app.browser], [true, 'App']);
  });

  test('Windows and other desktops are not mobile', function(assert) {
    var windows = detect({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', maxTouchPoints: 10 });
    assert.deepEqual([windows.mobile, windows.system, windows.browser], [false, 'Windows', 'Chrome'], 'a Windows touch screen');
    var other = detect({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0' });
    assert.deepEqual([other.mobile, other.system, other.browser], [false, 'Desktop', 'Firefox']);
  });

  test('a name the device already has is kept', function(assert) {
    var named = detect({ userAgent: MAC }, {}, { readable_device_name: 'Classroom iPad 3' });
    assert.strictEqual(named.readable_device_name, 'Classroom iPad 3');
  });

  test('the running app has been through the detection', function(assert) {
    // Nothing else sets `mobile`; without the call in utils/capabilities.js it is undefined.
    assert.strictEqual(typeof capabilities.mobile, 'boolean');
  });
});
