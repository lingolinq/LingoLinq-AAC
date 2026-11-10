import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';
import speecher from 'frontend/utils/speecher';
import i18n from 'frontend/utils/i18n';
import capabilities from 'frontend/utils/capabilities';

/*
 * Premium voices download through the native bridge only, so the Voice & Output modal shows its
 * Premium Voices button only where capabilities.tts.premium_voices_supported() is true (the
 * installed apps), not on the web.
 */
QUnit.module('Integration | voice-output Premium Voices button', function(hooks) {
  setupRenderingTest(hooks);

  // Set and restore speecher.voices directly. With stub() the second test here rendered no
  // voice picker when run after the first (it passed alone); the cause was not traced.
  let savedVoices;
  hooks.beforeEach(function() {
    savedVoices = speecher.get('voices');
    speecher.set('voices', [{ name: 'Test Voice', lang: 'en-US', voiceURI: 'test-voice' }]);
  });
  hooks.afterEach(function() {
    restoreStubs();
    speecher.set('voices', savedVoices);
  });

  function premiumButtons(root) {
    const label = i18n.t('premium_voices', "Premium Voices");
    return Array.from(root.querySelectorAll('button')).filter((b) => b.textContent.trim() === label);
  }

  QUnit.test('hidden on the web', async function(assert) {
    stub(capabilities.tts, 'premium_voices_supported', function() { return false; });
    await render(hbs`<VoiceOutput />`);
    assert.dom('#vo-voice-uri').exists('the voice picker still renders');
    assert.strictEqual(premiumButtons(this.element).length, 0, 'no Premium Voices button');
  });

  QUnit.test('shown in the installed app', async function(assert) {
    stub(capabilities.tts, 'premium_voices_supported', function() { return true; });
    await render(hbs`<VoiceOutput />`);
    assert.dom('#vo-voice-uri').exists('the voice picker renders');
    assert.strictEqual(premiumButtons(this.element).length, 1, 'one Premium Voices button');
  });
});
