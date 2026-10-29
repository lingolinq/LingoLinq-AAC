import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { setupTest } from 'frontend/tests/helpers';

/* #1063: while a handed-back child has no parent consent, the server stores AI preferences as
 * off (User#process_params) and marks the account `school_handoff_ai_blocked`
 * (lib/json_api/user.rb). The preferences page must refuse a turn-on with a visible reason
 * rather than let the save come back off with no explanation.
 */
module('Unit | Controller | user/preferences school hand-back AI block', function(hooks) {
  setupTest(hooks);

  var AI_KEYS = ['ai_features_enabled', 'ai_board_generation', 'ai_word_prediction', 'ai_board_suggestions', 'ai_symbol_search'];

  function aiPrefs(on) {
    var prefs = {};
    AI_KEYS.forEach(function(k) { prefs[k] = on; });
    return prefs;
  }

  function controllerFor(owner, attrs) {
    var controller = owner.lookup('controller:user/preferences');
    var model = EmberObject.create(Object.assign({
      id: '1_1063',
      preferences: Object.assign({ device: {}, progress: {} }, aiPrefs(false))
    }, attrs || {}));
    controller.set('model', model);
    controller.set('pending_preferences', Object.assign({ device: { voice: {} } }, aiPrefs(false)));
    controller.set('original_preferences', Object.assign({ device: { voice: {} } }, aiPrefs(false)));
    controller.set('handoffAiRefused', false);
    return controller;
  }

  function clickEvent(checked) {
    var ev = { prevented: false, target: { checked: checked } };
    ev.preventDefault = function() { ev.prevented = true; };
    ev.stopPropagation = function() {};
    return ev;
  }

  test('the page knows the account is blocked', function(assert) {
    assert.true(controllerFor(this.owner, { school_handoff_ai_blocked: true }).get('schoolHandoffAiBlocked'));
    assert.false(controllerFor(this.owner, {}).get('schoolHandoffAiBlocked'), 'an unblocked account is not');
  });

  test('the EU rule keeps its own consent step when both apply, as on the server', function(assert) {
    var controller = controllerFor(this.owner, { school_handoff_ai_blocked: true, eu_under_16: true });
    assert.true(controller.get('euAiConsentRequired'));
    assert.false(controller.get('schoolHandoffAiBlocked'));
  });

  test('turning AI on is refused with a visible reason', function(assert) {
    var controller = controllerFor(this.owner, { school_handoff_ai_blocked: true });
    var ev = clickEvent(true);
    controller.send('ai_feature_click', 'ai_features_enabled', ev);
    assert.true(ev.prevented, 'the checkbox does not tick');
    assert.false(controller.get('pending_preferences.ai_features_enabled'), 'nothing to save as on');
    assert.true(controller.get('handoffAiRefused'), 'the refusal message shows');
  });

  test('turning a stale "on" off still works while blocked, with no refusal', function(assert) {
    var controller = controllerFor(this.owner, { school_handoff_ai_blocked: true });
    controller.set('pending_preferences.ai_features_enabled', true);
    var ev = clickEvent(false);
    controller.send('ai_feature_click', 'ai_features_enabled', ev);
    assert.false(ev.prevented, 'the checkbox unticks normally');
    assert.false(controller.get('pending_preferences.ai_features_enabled'));
    assert.false(controller.get('handoffAiRefused'));
  });

  test('turning AI on still works for an account that is not blocked', function(assert) {
    var controller = controllerFor(this.owner, {});
    var ev = clickEvent(true);
    controller.send('ai_feature_click', 'ai_features_enabled', ev);
    assert.false(ev.prevented);
    assert.true(controller.get('pending_preferences.ai_features_enabled'));
    assert.false(controller.get('handoffAiRefused'));
  });

  test('opening the page clears an earlier refusal message', function(assert) {
    var route = this.owner.lookup('route:user/preferences');
    var noop = function() {};
    var controller = EmberObject.create({
      handoffAiRefused: true,
      setup: noop, check_core_words: noop, check_voices_available: noop, set_auto_sync: noop, check_calibration: noop
    });
    route.setupController(controller, EmberObject.create());
    assert.false(controller.get('handoffAiRefused'));
  });

  test('saving a blocked account sends the AI preferences as off', function(assert) {
    assert.expect(1 + AI_KEYS.length);
    var saved = null;
    var controller = controllerFor(this.owner, {
      school_handoff_ai_blocked: true,
      save: function() {
        saved = Object.assign({}, this.get('preferences'));
        // Left pending: the assertions are about what the save sends, not what follows it.
        return new Promise(function() {});
      }
    });
    // A stale "on" in the form, e.g. one loaded before the hand-back.
    AI_KEYS.forEach(function(k) { controller.set('pending_preferences.' + k, true); });
    controller.send('savePreferences', true);
    assert.ok(saved, 'the save ran');
    AI_KEYS.forEach(function(k) {
      assert.false((saved || {})[k], k + ' is sent as off');
    });
  });
});
