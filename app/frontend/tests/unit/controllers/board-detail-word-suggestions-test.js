import { module, test } from 'qunit';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';

/* The edit sidebar's Word Prediction switch (user/board-detail.js#toggle_word_suggestions) writes the same
   preference as the Predict control, so it saves only that key too (utils/preference_save.js): a device
   holding an old copy of the account must not write its other preferences back (Scot's review of #1141). */
module('Unit | Controller | user/board-detail: word suggestions switch', function(hooks) {
  setupTest(hooks);

  test('flips word_suggestions and saves only that key', function(assert) {
    var saves = [];
    var user = EmberObject.extend({
      save: function(options) { saves.push(options); return RSVP.resolve(this); }
    }).create({ preferences: { word_suggestions: false, ai_features_enabled: true, device: {} } });
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({ referenced_user: user, currentUser: user }));
    var controller = this.owner.lookup('controller:user/board-detail');
    controller.send('toggle_word_suggestions');
    assert.true(user.get('preferences.word_suggestions'));
    assert.deepEqual(saves, [{ adapterOptions: { preference_keys: ['word_suggestions'] } }]);
  });
});
