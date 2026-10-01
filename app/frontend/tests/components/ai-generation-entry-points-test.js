import {
  describe,
  it,
  expect,
  beforeEach
} from 'frontend/tests/helpers/jasmine';
import 'frontend/tests/helpers/ember_helper';
import EmberObject from '@ember/object';

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
