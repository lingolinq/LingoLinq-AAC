import {
  describe,
  it,
  expect
} from 'frontend/tests/helpers/jasmine';
import ai_word_predictor from '../../utils/ai_word_predictor';

// AI word prediction is allowed only when both the signed-in person (the
// account words_controller.rb#predict checks) and the current user (whose
// taps are sent) allow it. Outside speak mode they are the same person.
function person(flags, prefs) {
  return {
    get: function(key) {
      if(key === 'feature_flags') { return flags; }
      if(key === 'preferences') { return prefs; }
      return null;
    },
    feature_flags: flags,
    preferences: prefs
  };
}

function state(signedIn, current) {
  return {
    get: function(key) {
      if(key === 'feature_flags.ai_word_prediction') { return true; }
      if(key === 'sessionUser') { return signedIn; }
      if(key === 'currentUser') { return current; }
      return null;
    }
  };
}

var on = { ai_features_enabled: true, ai_word_prediction: true };
var flags = { ai_word_prediction: true };

describe('ai_word_predictor needs both the signed-in person and the current user', function() {
  it('is on when both turned it on', function() {
    expect(ai_word_predictor.is_enabled(state(person(flags, on), person(flags, on)))).toEqual(true);
  });

  it('is off when the current user turned it off, though the signed-in person has it on', function() {
    expect(ai_word_predictor.is_enabled(state(person(flags, on), person(flags, { ai_features_enabled: false })))).toEqual(false);
  });

  it('is off when the signed-in person never turned it on, though the current user did', function() {
    expect(ai_word_predictor.is_enabled(state(person(flags, {}), person(flags, on)))).toEqual(false);
  });

  it('is off when the signed-in person lacks the flag, though app state has it', function() {
    expect(ai_word_predictor.is_enabled(state(person({}, on), person(flags, on)))).toEqual(false);
  });

  it('is off when no one is signed in', function() {
    expect(ai_word_predictor.is_enabled(state(null, person(flags, on)))).toEqual(false);
  });

  it('is on for one person who turned it on, outside speak mode', function() {
    var p = person(flags, on);
    expect(ai_word_predictor.is_enabled(state(p, p))).toEqual(true);
  });
});
