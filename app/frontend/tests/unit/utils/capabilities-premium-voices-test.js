import { module, test } from 'qunit';
import capabilities from 'frontend/utils/capabilities';

/*
 * Premium voices download through the native bridge only (capabilities.tts.tts_exec uses
 * window.cordova.exec or window.extra_tts). On the web neither exists, so the Premium Voices
 * buttons are hidden there.
 */
module('Unit | Utility | capabilities premium_voices_supported', function(hooks) {
  const KEYS = ['cordova', 'extra_tts'];
  let saved;
  hooks.beforeEach(function() {
    saved = KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(window, k)]);
    KEYS.forEach((k) => { delete window[k]; });
  });
  hooks.afterEach(function() {
    KEYS.forEach((k) => { delete window[k]; });
    saved.forEach(([k, d]) => { if (d) { Object.defineProperty(window, k, d); } });
  });

  test('false on the web, with no native bridge', function(assert) {
    assert.false(capabilities.tts.premium_voices_supported());
  });

  test('true in the Cordova app', function(assert) {
    window.cordova = { exec: function() {} };
    assert.true(capabilities.tts.premium_voices_supported());
  });

  test('false with a cordova object that has no exec', function(assert) {
    window.cordova = {};
    assert.false(capabilities.tts.premium_voices_supported());
  });

  test('true in the desktop app', function(assert) {
    window.extra_tts = {};
    assert.true(capabilities.tts.premium_voices_supported());
  });
});
