import { module, test } from 'qunit';
import i18n from 'frontend/utils/i18n';
import {
  isAiConsentRefusal,
  aiConsentRefusalMessage,
  aiConsentNarrationMessage
} from 'frontend/utils/article50_gate';

function appStateFor(user) {
  return {
    get: function(key) {
      if(key === 'sessionUser' || key === 'currentUser') { return user; }
      return null;
    }
  };
}

function userWithRoute(route) {
  return { get: function(key) { return key === 'ai_consent_route' ? route : undefined; } };
}

module('Unit | Utility | ai_consent', function() {
  module('isAiConsentRefusal', function() {
    test('recognizes the error string the $.ajax wrapper puts in result', function(assert) {
      assert.true(isAiConsentRefusal({fakeXHR: {status: 403}, result: 'ai_consent_required'}));
    });

    test('recognizes a parsed body in result, fakeXHR.responseJSON and responseJSON', function(assert) {
      assert.true(isAiConsentRefusal({result: {error: 'ai_consent_required', status: 403}}));
      assert.true(isAiConsentRefusal({fakeXHR: {responseJSON: {error: 'ai_consent_required', disclosures_version: 1}}}));
      assert.true(isAiConsentRefusal({responseJSON: {error: 'ai_consent_required'}}));
    });

    test('recognizes a JSON responseText', function(assert) {
      assert.true(isAiConsentRefusal({responseText: '{"error":"ai_consent_required"}'}));
      assert.false(isAiConsentRefusal({responseText: 'not json'}));
    });

    test('does not mistake other refusals or empty values', function(assert) {
      assert.false(isAiConsentRefusal(null));
      assert.false(isAiConsentRefusal({}));
      assert.false(isAiConsentRefusal({result: 'article_50_disclosure_required'}));
      assert.false(isAiConsentRefusal({fakeXHR: {responseJSON: {error: 'comprehensive_eval_ai feature not enabled'}}}));
    });
  });

  module('aiConsentRefusalMessage', function() {
    test('says the organization has to turn AI on for the organization route', function(assert) {
      assert.strictEqual(aiConsentRefusalMessage(appStateFor(userWithRoute('organization'))),
        i18n.t('ai_consent_off_organization', "AI features are off because your organization has not turned them on yet. A manager of the organization needs to turn them on."));
      assert.true(/organization/i.test(aiConsentRefusalMessage(appStateFor(userWithRoute('organization')))));
    });

    test('says a parent or guardian has to approve for the parent route', function(assert) {
      assert.true(/parent or guardian/.test(aiConsentRefusalMessage(appStateFor(userWithRoute('parent')))));
    });

    test('says AI is off until the person agrees for the self route', function(assert) {
      assert.true(/until you agree/.test(aiConsentRefusalMessage(appStateFor(userWithRoute('self')))));
    });

    test('the three routes give three different messages', function(assert) {
      var messages = ['organization', 'parent', 'self'].map(function(r) { return aiConsentRefusalMessage(appStateFor(userWithRoute(r))); });
      assert.strictEqual(new Set(messages).size, 3);
    });

    test('an unknown or missing route, or no user, gets the neutral message and never a guess', function(assert) {
      var neutral = aiConsentRefusalMessage(appStateFor(userWithRoute(undefined)));
      assert.strictEqual(aiConsentRefusalMessage(appStateFor(userWithRoute('bogus'))), neutral);
      assert.strictEqual(aiConsentRefusalMessage(null), neutral);
      assert.false(/until you agree/.test(neutral));
    });
  });

  module('aiConsentNarrationMessage', function() {
    test('talks about the student, not the signed-in clinician', function(assert) {
      assert.true(/student/.test(aiConsentNarrationMessage()));
    });
  });
});
