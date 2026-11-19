import {
  describe,
  itAsync,
  expect,
  beforeEach
} from 'frontend/tests/helpers/jasmine';
import 'frontend/tests/helpers/ember_helper';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import i18n from '../../utils/i18n';

// AI data-sharing consent (#1136): the generate-board modal turns the server's
// 403 ai_consent_required into a plain message naming who can fix it, and still
// shows every other server error as before.
describe('generate-board AI data-sharing consent', 'component:generate-board', function() {
  var testOwner;

  beforeEach(function() {
    testOwner = this.owner;
  });

  function appStateFor(route) {
    var user = EmberObject.create({ ai_consent_route: route });
    return { sessionUser: user, currentUser: user, get: function(key) { return (key === 'sessionUser' || key === 'currentUser') ? user : null; } };
  }

  async function generateWithError(err, route) {
    var service = EmberObject.create({ online: true, ajax: function() { return RSVP.reject(err); } });
    var c = testOwner.factoryFor('component:generate-board').create({ persistence: service, appState: appStateFor(route) });
    c.set('prompt', 'a board about the zoo');
    c.send('generateLabels');
    await new RSVP.Promise(function(resolve) { setTimeout(resolve, 20); });
    return c;
  }

  itAsync('says the organization has to turn AI on for a district account', async function() {
    var c = await generateWithError({ fakeXHR: { status: 403 }, result: 'ai_consent_required' }, 'organization');
    expect(c.get('status.error')).toEqual(i18n.t('ai_consent_off_organization', "AI features are off because your organization has not turned them on yet. A manager of the organization needs to turn them on."));
    c.destroy();
  });

  itAsync('says a parent or guardian has to approve for a parent-route account', async function() {
    var c = await generateWithError({ responseJSON: { error: 'ai_consent_required' } }, 'parent');
    expect(c.get('status.error')).toEqual(i18n.t('ai_consent_off_parent', "AI features are off until a parent or guardian approves them for this account."));
    c.destroy();
  });

  itAsync('says AI is off until the person agrees for a self-route account, never the raw code', async function() {
    var c = await generateWithError({ fakeXHR: { responseJSON: { error: 'ai_consent_required' } } }, 'self');
    expect(c.get('status.error').indexOf('AI features are off until you agree')).toEqual(0);
    expect(c.get('status.error').indexOf('ai_consent_required')).toEqual(-1);
    c.destroy();
  });

  itAsync('still shows any other server error as before', async function() {
    var c = await generateWithError({ responseJSON: { error: 'The AI returned an incomplete word list.' } }, 'self');
    expect(c.get('status.error')).toEqual('The AI returned an incomplete word list.');
    c.destroy();
  });
});
