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
import aiFeatureGate from '../../utils/ai_feature_gate';

// Every "Generate with AI" entry point is offered for an account that never
// recorded an AI choice, so the person reaches the turn-on step (or a reason)
// instead of the button silently disappearing.
function appStateFor(flags, user) {
  return {
    currentUser: user,
    feature_flags: flags,
    get: function(key) {
      if(key.indexOf('feature_flags.') === 0) { return flags[key.slice('feature_flags.'.length)]; }
      if(key === 'currentUser') { return user; }
      return null;
    }
  };
}

function unsetUser() {
  return EmberObject.create({ preferences: {}, permissions: { view: true, edit: true } });
}

describe('AI generation entry points', 'component:new-board', function() {
  var testOwner;

  beforeEach(function() {
    testOwner = this.owner;
  });

  it('new-board offers Generate with AI for an account with no AI choice', function() {
    var c = testOwner.factoryFor('component:new-board').create();
    c.set('appState', appStateFor({ ai_board_generation: true }, unsetUser()));
    expect(c.get('ai_board_generation_offered')).toEqual(true);
  });

  it('new-board does not offer it when the feature is not available', function() {
    var c = testOwner.factoryFor('component:new-board').create();
    c.set('appState', appStateFor({ ai_board_generation: false }, unsetUser()));
    expect(c.get('ai_board_generation_offered')).toEqual(false);
  });

  it('create-board-new offers Generate with AI for an account with no AI choice', function() {
    var c = testOwner.factoryFor('component:create-board-new').create();
    c.set('appState', appStateFor({ ai_board_generation: true }, unsetUser()));
    expect(c.get('ai_board_generation_offered')).toEqual(true);
  });

  it('focus-words offers AI focus words for an account with no AI choice, with the turn-on step', function() {
    var c = testOwner.factoryFor('component:focus-words').create();
    c.set('appState', appStateFor({ ai_board_generation: true, focus_word_highlighting: true }, unsetUser()));
    expect(c.get('ai_focus_generation_offered')).toEqual(true);
    expect(c.get('ai_focus_entry')).toEqual('needs_opt_in');
  });

  it('focus-words does not offer AI focus words to an EU under-16 account when the feature is not available', function() {
    var c = testOwner.factoryFor('component:focus-words').create();
    var user = EmberObject.create({ preferences: {}, eu_under_16: true, permissions: { view: true, edit: true } });
    c.set('appState', appStateFor({ ai_board_generation: false, focus_word_highlighting: true }, user));
    expect(c.get('ai_focus_generation_offered')).toEqual(false);
  });

  it('focus-words shows a reason when the signed-in person cannot change the setting', function() {
    var c = testOwner.factoryFor('component:focus-words').create();
    var user = EmberObject.create({ preferences: {}, permissions: { view: true } });
    c.set('appState', appStateFor({ ai_board_generation: true, focus_word_highlighting: true }, user));
    expect(c.get('ai_focus_generation_offered')).toEqual(true);
    expect(c.get('ai_focus_entry')).toEqual('no_permission');
  });
});

describe('focus-words inline AI turn-on', 'component:focus-words', function() {
  var testOwner;

  beforeEach(function() {
    testOwner = this.owner;
    stub(persistence, 'get', function(key) {
      if(key === 'online') { return true; }
      return null;
    });
  });

  function savingUser(saveResult) {
    var u = EmberObject.create({ preferences: {}, permissions: { view: true, edit: true }, saves: 0, rolledBack: 0 });
    u.save = function() { u.set('saves', u.get('saves') + 1); return saveResult(); };
    u.rollbackAttributes = function() { u.set('rolledBack', u.get('rolledBack') + 1); u.set('preferences', {}); };
    return u;
  }

  function speakState(sessionUser, communicator) {
    return {
      sessionUser: sessionUser,
      currentUser: communicator,
      feature_flags: { ai_board_generation: true, focus_word_highlighting: true },
      get: function(key) {
        if(key.indexOf('feature_flags.') === 0) { return this.feature_flags[key.slice('feature_flags.'.length)]; }
        if(key === 'sessionUser') { return sessionUser; }
        if(key === 'currentUser') { return communicator; }
        return null;
      }
    };
  }

  function enable(c) {
    var fn = (c.actions && c.actions.enable_ai_focus_words) || c.enable_ai_focus_words;
    return fn.call(c);
  }

  itAsync('turns AI on for the signed-in person, not the communicator being spoken for', async function() {
    var supporter = savingUser(function() { return RSVP.resolve(); });
    var communicator = savingUser(function() { return RSVP.resolve(); });
    var c = testOwner.factoryFor('component:focus-words').create();
    c.set('appState', speakState(supporter, communicator));
    await enable(c);
    expect(supporter.get('saves')).toEqual(1);
    expect(aiFeatureGate.prefExplicitlyEnabled(supporter, 'ai_board_generation')).toEqual(true);
    expect(communicator.get('saves')).toEqual(0);
    expect(communicator.get('preferences')).toEqual({});
  });

  itAsync('switches to Generate once the save succeeds', async function() {
    var user = savingUser(function() { return RSVP.resolve(); });
    var c = testOwner.factoryFor('component:focus-words').create();
    c.set('appState', speakState(user, user));
    expect(c.get('ai_focus_needs_opt_in')).toEqual(true);
    await enable(c);
    expect(c.get('ai_focus_opt_in_saving')).toEqual(false);
    expect(c.get('ai_focus_opt_in_error')).toEqual(null);
    expect(c.get('ai_focus_generation_enabled')).toEqual(true);
  });

  itAsync('rolls the preference back and shows an error when the save fails', async function() {
    var user = savingUser(function() { return RSVP.reject({ error: 'nope' }); });
    var c = testOwner.factoryFor('component:focus-words').create();
    c.set('appState', speakState(user, user));
    await enable(c);
    expect(user.get('rolledBack')).toEqual(1);
    expect(aiFeatureGate.prefExplicitlyEnabled(user, 'ai_board_generation')).toEqual(false);
    expect(c.get('ai_focus_opt_in_saving')).toEqual(false);
    expect(!!c.get('ai_focus_opt_in_error')).toEqual(true);
    expect(c.get('ai_focus_generation_enabled')).toEqual(false);
  });
});

describe('EnableAiFeaturesComponent permission reason', 'component:enable-ai-features', function() {
  var testOwner;

  beforeEach(function() {
    testOwner = this.owner;
  });

  it('marks a permission block so the modal can give the reason', function() {
    var c = testOwner.factoryFor('component:enable-ai-features').create();
    c.set('model', { blocked: true, blockedReason: 'permission', triggeredPref: 'ai_board_generation' });
    expect(c.get('blocked')).toEqual(true);
    expect(c.get('blockedPermission')).toEqual(true);
    expect(c.get('blockedCoppa')).toEqual(false);
  });
});
