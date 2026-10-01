import {
  describe,
  it,
  expect,
  beforeEach
} from 'frontend/tests/helpers/jasmine';
import 'frontend/tests/helpers/ember_helper';
import EmberObject from '@ember/object';

// AI eval narration follows the SLP's own AI setting (the person using the tool)
// as well as the feature flag, so an SLP with AI off is not shown an AI button
// the server will refuse.
function appStateFor(flagOn, prefs) {
  var user = EmberObject.create({ preferences: prefs });
  return {
    currentUser: user,
    feature_flags: { comprehensive_eval_ai: flagOn },
    get: function(key) {
      if(key === 'feature_flags.comprehensive_eval_ai') { return flagOn; }
      if(key === 'currentUser') { return user; }
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

  it('hides AI narration when the flag is off', function() {
    var c = testOwner.factoryFor('component:eval-comprehensive-runner').create();
    c.set('appState', appStateFor(false, { ai_features_enabled: true }));
    expect(c.get('aiFlagEnabled')).toEqual(false);
  });
});
