import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';
import capabilities from 'frontend/utils/capabilities';

/*
 * templates/user/preferences.hbs shows its three Premium Voices buttons only when
 * premium_voices_supported is true; it follows capabilities.tts.premium_voices_supported(),
 * which is false on the web.
 */
module('Unit | Controller | user/preferences premium_voices_supported', function(hooks) {
  setupTest(hooks);

  hooks.afterEach(function() {
    restoreStubs();
  });

  test('false when the capability is unavailable (web)', function(assert) {
    stub(capabilities.tts, 'premium_voices_supported', function() { return false; });
    const controller = this.owner.factoryFor('controller:user/preferences').create();
    assert.false(controller.get('premium_voices_supported'));
  });

  test('true when the capability is available (installed app)', function(assert) {
    stub(capabilities.tts, 'premium_voices_supported', function() { return true; });
    const controller = this.owner.factoryFor('controller:user/preferences').create();
    assert.true(controller.get('premium_voices_supported'));
  });
});
