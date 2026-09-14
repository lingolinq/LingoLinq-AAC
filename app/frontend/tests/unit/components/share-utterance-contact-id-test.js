import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import LingoLinq from 'frontend/app';

// Contact buttons are built with referenced_user.id + 'x' + hash. When the
// Speak Mode user is the session record, id is the literal 'self', so the
// share POST's user_id is selfx{hash} and Utterance#share_with rejects it.
// Mutation: go back to referenced_user.id in the contacts computed.

module('Unit | Component | share-utterance contact id', function(hooks) {
  setupTest(hooks);

  var priorAppState;

  hooks.beforeEach(function() {
    priorAppState = LingoLinq.appState;
    this.owner.register('service:modal', Service.extend({
      getSettingsFor: function() { return { utterance: [] }; }
    }));
    this.owner.register('service:app-state', Service.extend({}));
    this.owner.register('service:store', Service.extend({
      createRecord: function() {
        return EmberObject.create({
          assert_remote_urls: function() {},
          save: function() { return { then: function() { return this; } }; }
        });
      }
    }));
  });

  hooks.afterEach(function() {
    LingoLinq.appState = priorAppState;
  });

  test('contact share id uses global_id when the session user id is self', function(assert) {
    LingoLinq.appState = EmberObject.create({
      referenced_user: EmberObject.create({
        id: 'self',
        _actual_id: '1_42',
        global_id: '1_42',
        contacts: [{ name: 'Dad', image_url: '/a.png', hash: 'abc' }],
        supporter_role: false,
        supervisors: [],
        known_supervisees: []
      }),
      reply_note: null
    });

    var component = this.owner.factoryFor('component:share-utterance').create();
    var contacts = component.get('contacts') || [];
    var custom = contacts.find(function(c) { return c.user_name === 'Dad'; });
    assert.ok(custom, 'profile contact is in the list');
    assert.strictEqual(custom.id, '1_42xabc', 'share target id is global_id x hash, not selfxhash');
  });
});
