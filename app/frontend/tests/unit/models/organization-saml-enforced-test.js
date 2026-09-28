import { module, test } from 'qunit';
import { setupTest } from '../../helpers';

// The org settings page binds its "require external authentication" checkbox
// to model.saml_enforced (templates/organization/settings.hbs). The stock
// RESTSerializer (serializers/application.js) only sends declared attrs, so
// the value must be declared on the model to load from and save to the server.
module('Unit | Model | organization saml_enforced', function(hooks) {
  setupTest(hooks);

  test('saml_enforced is included when the record is serialized', function(assert) {
    var store = this.owner.lookup('service:store');
    var org = store.createRecord('organization', {name: 'Test Org'});
    org.set('saml_enforced', true);
    var json = org.serialize();
    assert.true(json.saml_enforced, 'checked value is sent');
    org.set('saml_enforced', false);
    json = org.serialize();
    assert.false(json.saml_enforced, 'unchecked value is sent');
  });

  // A record loaded from the org list has no saml_enforced (the list payload has no
  // edit block, lib/json_api/organization.rb). Saving it before the full reload lands
  // must send null, which the server skips, not false, which would turn enforcement off.
  test('saml_enforced is sent as null when it was never loaded', function(assert) {
    var store = this.owner.lookup('service:store');
    var org = store.createRecord('organization', {name: 'Test Org'});
    var json = org.serialize();
    assert.strictEqual(json.saml_enforced, null, 'unloaded value is not sent as false');
  });
});
