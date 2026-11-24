import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { record_trust_choice } from 'frontend/utils/trust_choice';

/* The person's own Trust/Shared answer carries the time of the choice (utils/trust_choice.js); the server counts it
 * as the owner's choice only when that stamp is fresh (app/models/user.rb process_device). */
module('Unit | Utility | trust choice', function() {
  test('a Trust answer sets the value and stamps the time of the choice in seconds', function(assert) {
    var user = EmberObject.create({ preferences: { device: {} } });
    record_trust_choice(user, true, 1700000000123);
    assert.true(user.get('preferences.device.long_token'));
    assert.strictEqual(user.get('preferences.device.long_token_chosen_at'), 1700000000);
  });

  test('a Shared answer is stamped too, so the server clears the owner choice', function(assert) {
    var user = EmberObject.create({ preferences: { device: { long_token: true } } });
    record_trust_choice(user, false, 1700000000000);
    assert.false(user.get('preferences.device.long_token'));
    assert.strictEqual(user.get('preferences.device.long_token_chosen_at'), 1700000000);
  });
});
