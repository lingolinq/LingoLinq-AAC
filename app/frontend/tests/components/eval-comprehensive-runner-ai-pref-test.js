import {
  describe,
  it,
  itAsync,
  expect,
  beforeEach,
  stub
} from 'frontend/tests/helpers/jasmine';
import 'frontend/tests/helpers/ember_helper';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import persistence from '../../utils/persistence';
import article50Gate from '../../utils/article50_gate';

// AI eval narration follows the SLP's own AI setting (the person using the tool)
// as well as the feature flag, so an SLP with AI off is not shown an AI button
// the server will refuse.
function appStateFor(flagOn, prefs) {
  var user = EmberObject.create({ preferences: prefs });
  return {
    currentUser: user, sessionUser: user,
    feature_flags: { comprehensive_eval_ai: flagOn },
    get: function(key) {
      if(key === 'feature_flags.comprehensive_eval_ai') { return flagOn; }
      if(key === 'currentUser' || key === 'sessionUser') { return user; }
      return null;
    }
  };
}

describe('EvalComprehensiveRunner AI setting', 'component:eval-comprehensive-runner', function() {
  var testOwner;

  beforeEach(function() {
    testOwner = this.owner;
  });

  it('hides AI narration when the SLP never turned AI features on', function() {
    var c = testOwner.factoryFor('component:eval-comprehensive-runner').create();
    c.set('appState', appStateFor(true, {}));
    expect(c.get('aiFlagEnabled')).toEqual(false);
  });

  it('offers AI narration when the flag is on and the SLP turned AI features on', function() {
    var c = testOwner.factoryFor('component:eval-comprehensive-runner').create();
    c.set('appState', appStateFor(true, { ai_features_enabled: true }));
    expect(c.get('aiFlagEnabled')).toEqual(true);
  });

  // The signed-in SLP, whose setting the server checks (@api_user), not
  // app-state's currentUser when that points at another account.
  function twoUserState(slpPrefs, otherPrefs) {
    var slp = EmberObject.create({ preferences: slpPrefs });
    var other = EmberObject.create({ preferences: otherPrefs });
    return {
      sessionUser: slp, currentUser: other,
      feature_flags: { comprehensive_eval_ai: true },
      get: function(key) {
        if(key === 'feature_flags.comprehensive_eval_ai') { return true; }
        if(key === 'sessionUser') { return slp; }
        if(key === 'currentUser') { return other; }
        return null;
      }
    };
  }

  it('follows the signed-in SLP when the SLP turned AI on and the other account did not', function() {
    var c = testOwner.factoryFor('component:eval-comprehensive-runner').create();
    c.set('appState', twoUserState({ ai_features_enabled: true }, {}));
    expect(c.get('aiFlagEnabled')).toEqual(true);
  });

  it('follows the signed-in SLP when the other account turned AI on and the SLP did not', function() {
    var c = testOwner.factoryFor('component:eval-comprehensive-runner').create();
    c.set('appState', twoUserState({}, { ai_features_enabled: true }));
    expect(c.get('aiFlagEnabled')).toEqual(false);
  });

  it('hides AI narration when the flag is off', function() {
    var c = testOwner.factoryFor('component:eval-comprehensive-runner').create();
    c.set('appState', appStateFor(false, { ai_features_enabled: true }));
    expect(c.get('aiFlagEnabled')).toEqual(false);
  });
});

// The server refuses narration with a raw error string when the SLP's AI
// setting is off; the runner shows translated text instead of that string.
describe('EvalComprehensiveRunner AI narration errors', 'component:eval-comprehensive-runner', function() {
  var testOwner;

  beforeEach(function() {
    testOwner = this.owner;
    stub(persistence, 'get', function(key) {
      if(key === 'online') { return true; }
      return null;
    });
    stub(article50Gate, 'presentBlockingGate', function() { return RSVP.resolve(); });
  });

  async function narrateWithError(err) {
    stub(persistence, 'ajax', function() { return RSVP.reject(err); });
    var c = testOwner.factoryFor('component:eval-comprehensive-runner').create();
    c.set('appState', appStateFor(true, { ai_features_enabled: true }));
    c.set('session', EmberObject.create({ toLogPayload: function() { return { data: {} }; } }));
    var fn = (c.actions && c.actions.generateAiNarrative) || c.generateAiNarrative;
    fn.call(c);
    await new RSVP.Promise(function(resolve) { setTimeout(resolve, 20); });
    return c;
  }

  itAsync('shows translated text when the server says AI narration is not enabled', async function() {
    var c = await narrateWithError({ error: 'comprehensive_eval_ai feature not enabled' });
    expect(c.get('aiBusy')).toEqual(false);
    expect(c.get('aiError')).toEqual("AI narration is turned off for your account. You can turn it on in Preferences under AI Features.");
  });

  itAsync('shows the general failure text for any other error, never the raw server string', async function() {
    var c = await narrateWithError({ error: 'some other server error' });
    expect(c.get('aiError')).toEqual("AI narration failed. Please try again.");
  });
});
