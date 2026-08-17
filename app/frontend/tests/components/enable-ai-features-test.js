import {
  describe,
  it,
  itAsync,
  expect,
  beforeEach,
  afterEach
} from 'frontend/tests/helpers/jasmine';
import 'frontend/tests/helpers/ember_helper';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import modal from '../../utils/modal';
import persistence from '../../utils/persistence';
import aiFeatureGate from '../../utils/ai_feature_gate';

describe('EnableAiFeaturesComponent', 'component:enable-ai-features', function() {
  var testOwner;
  var originalClose;
  var closedWith;

  beforeEach(function() {
    testOwner = this.owner;
    originalClose = modal.close;
    closedWith = undefined;
    modal.close = function(val) { closedWith = val; };
    persistence.set('online', true);
  });

  afterEach(function() {
    modal.close = originalClose;
  });

  function makeUser(initialPrefs, saveFn) {
    var snapshot = {};
    Object.keys(initialPrefs || {}).forEach(function(k) { snapshot[k] = initialPrefs[k]; });
    var prefs = {};
    Object.keys(snapshot).forEach(function(k) { prefs[k] = snapshot[k]; });
    return EmberObject.create({
      preferences: prefs,
      rollbackAttributes: function() {
        var restored = {};
        Object.keys(snapshot).forEach(function(k) { restored[k] = snapshot[k]; });
        this.set('preferences', restored);
      },
      save: saveFn
    });
  }

  function makeComponent(user) {
    var c = testOwner.factoryFor('component:enable-ai-features').create();
    c.set('model', {
      user: user,
      triggeredPref: 'ai_board_generation'
    });
    return c;
  }

  itAsync('enables only board generation and leaves sibling AI prefs on', async function() {
    var user = makeUser({
      ai_word_prediction: true,
      device: 'ipad'
    }, function() { return RSVP.resolve(); });
    var c = makeComponent(user);
    var fn = (c.actions && c.actions.enable) || c.enable;
    await fn.call(c);
    expect(aiFeatureGate.prefExplicitlyEnabled(user, 'ai_board_generation')).toEqual(true);
    expect(user.get('preferences.ai_word_prediction')).toEqual(true);
    expect(user.get('preferences.device')).toEqual('ipad');
    expect(user.get('preferences.ai_board_suggestions')).toEqual(undefined);
    expect(closedWith && closedWith.saved).toEqual(true);
    expect(closedWith.requested_features.ai_board_generation).toEqual(true);
    expect(closedWith.requested_features.hasOwnProperty('ai_word_prediction')).toEqual(false);
  });

  itAsync('rolls back in-memory prefs when save is rejected', async function() {
    var user = makeUser({}, function() { return RSVP.reject(); });
    var c = makeComponent(user);
    var fn = (c.actions && c.actions.enable) || c.enable;
    await fn.call(c);
    expect(c.get('save_error')).toEqual(true);
    expect(aiFeatureGate.prefExplicitlyEnabled(user, 'ai_board_generation')).toEqual(false);
    expect(closedWith).toEqual(undefined);
  });

  it('rolls back in-memory prefs when cancelled after a failed enable', function() {
    var user = makeUser({}, function() { return RSVP.reject(); });
    var c = makeComponent(user);
    aiFeatureGate.applyAiFeaturePrefs(user, { ai_board_generation: true });
    expect(aiFeatureGate.prefExplicitlyEnabled(user, 'ai_board_generation')).toEqual(true);
    var fn = (c.actions && c.actions.close) || c.close;
    fn.call(c);
    expect(aiFeatureGate.prefExplicitlyEnabled(user, 'ai_board_generation')).toEqual(false);
    expect(closedWith).toEqual(false);
  });
});
