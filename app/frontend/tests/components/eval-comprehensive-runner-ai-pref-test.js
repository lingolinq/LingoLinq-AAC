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
  var user = EmberObject.create({ preferences: prefs, feature_flags: { comprehensive_eval_ai: flagOn } });
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
    var slp = EmberObject.create({ preferences: slpPrefs, feature_flags: { comprehensive_eval_ai: true } });
    var other = EmberObject.create({ preferences: otherPrefs, feature_flags: { comprehensive_eval_ai: true } });
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

  it('says the SLP\'s own AI setting is off when the feature is available but not turned on', function() {
    var c = testOwner.factoryFor('component:eval-comprehensive-runner').create();
    c.set('appState', appStateFor(true, {}));
    expect(c.get('aiSettingOff')).toEqual(true);
  });

  it('does not blame the SLP\'s setting when the feature itself is not available', function() {
    var c = testOwner.factoryFor('component:eval-comprehensive-runner').create();
    c.set('appState', appStateFor(false, {}));
    expect(c.get('aiSettingOff')).toEqual(false);
  });

  it('does not show the setting-off message once AI narration is on', function() {
    var c = testOwner.factoryFor('component:eval-comprehensive-runner').create();
    c.set('appState', appStateFor(true, { ai_features_enabled: true }));
    expect(c.get('aiSettingOff')).toEqual(false);
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

  itAsync('shows neutral translated text when the server says AI narration is not available', async function() {
    var c = await narrateWithError({ fakeXHR: { status: 400 }, message: 'error', result: 'comprehensive_eval_ai feature not enabled' });
    expect(c.get('aiBusy')).toEqual(false);
    expect(c.get('aiError')).toEqual("AI narration is not available for this account right now.");
  });

  itAsync('shows the neutral text for the same reply sent as a 200 body (ApplicationCache clients)', async function() {
    var c = await narrateWithError({ fakeXHR: { status: 200 }, message: 'error', result: { error: 'comprehensive_eval_ai feature not enabled', status: 400 } });
    expect(c.get('aiError')).toEqual("AI narration is not available for this account right now.");
  });

  itAsync('shows the general failure text for any other error, never the raw server string', async function() {
    var c = await narrateWithError({ fakeXHR: { status: 500 }, message: 'error', result: 'some other server error' });
    expect(c.get('aiError')).toEqual("AI narration failed. Please try again.");
  });
});

// The flag, like the setting, is the signed-in SLP's (the server checks
// @api_user), not app state's, which is the current user's.
describe('EvalComprehensiveRunner AI flag follows the signed-in SLP', 'component:eval-comprehensive-runner', function() {
  var testOwner;

  beforeEach(function() {
    testOwner = this.owner;
  });

  function flagState(slpFlags, appFlags, slpPrefs) {
    var slp = EmberObject.create({ preferences: slpPrefs || {}, feature_flags: slpFlags });
    return {
      sessionUser: slp, currentUser: slp,
      feature_flags: appFlags,
      get: function(key) {
        if(key.indexOf('feature_flags.') === 0) { return (appFlags || {})[key.slice('feature_flags.'.length)]; }
        if(key === 'sessionUser' || key === 'currentUser') { return slp; }
        return null;
      }
    };
  }

  it('offers narration when the SLP has the flag and setting, though app state lacks the flag', function() {
    var c = testOwner.factoryFor('component:eval-comprehensive-runner').create();
    c.set('appState', flagState({ comprehensive_eval_ai: true }, {}, { ai_features_enabled: true }));
    expect(c.get('aiFlagEnabled')).toEqual(true);
  });

  it('hides narration, without blaming the setting, when only app state has the flag', function() {
    var c = testOwner.factoryFor('component:eval-comprehensive-runner').create();
    c.set('appState', flagState({}, { comprehensive_eval_ai: true }, {}));
    expect(c.get('aiFlagEnabled')).toEqual(false);
    expect(c.get('aiSettingOff')).toEqual(false);
  });

  it('says the setting is off when the SLP has the flag but not the setting, though app state lacks the flag', function() {
    var c = testOwner.factoryFor('component:eval-comprehensive-runner').create();
    c.set('appState', flagState({ comprehensive_eval_ai: true }, {}, {}));
    expect(c.get('aiSettingOff')).toEqual(true);
  });
});
