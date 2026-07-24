import { module, test } from 'qunit';
import $ from 'jquery';
import ai_word_predictor from 'frontend/utils/ai_word_predictor';

/*
 * EU AI Act Article 50(1) DEGRADE-mode coverage for word prediction (D-03,
 * Plan 03-04 Task 2). Word prediction NEVER blocks and NEVER prompts: an
 * unacknowledged in-scope user simply gets is_enabled() === false, which
 * predict() already turns into a silent RSVP.resolve([]) with no AJAX call.
 *
 * Fixtures below drive the real needsAcknowledgement()/aiFeatureEnabled()
 * logic through realistic appState/user stubs (same pattern as
 * article50-gate-test.js's makeAppState/makeUser) rather than monkeypatching
 * the gate module, so these tests exercise the actual is_enabled() short
 * circuit end to end.
 */

function makeUser(attrs) {
  var data = Object.assign({
    preferences: {},
    article_50_disclosure_required: false,
    article_50_disclosure_shown: false
  }, attrs || {});
  return {
    get: function(key) {
      return data[key];
    }
  };
}

function makeAppState(opts) {
  opts = opts || {};
  var flags = Object.assign({
    ai_word_prediction: true,
    article_50_disclosure: false
  }, opts.flags || {});
  var user = opts.user !== undefined ? opts.user : makeUser();
  return {
    get: function(key) {
      if(key.indexOf('feature_flags.') === 0) {
        return flags[key.slice('feature_flags.'.length)];
      }
      if(key === 'currentUser') { return user; }
      return null;
    }
  };
}

module('Unit | Utility | ai_word_predictor article50 degrade', function(hooks) {
  hooks.afterEach(function() {
    ai_word_predictor.clear_cache();
  });

  test('is_enabled returns false when needsAcknowledgement is true, even when the AI feature flag and user preference both say enabled', function(assert) {
    var appState = makeAppState({
      flags: { ai_word_prediction: true, article_50_disclosure: true },
      user: makeUser({
        article_50_disclosure_required: true,
        article_50_disclosure_shown: false,
        preferences: { ai_features_enabled: true, ai_word_prediction: true }
      })
    });
    assert.false(ai_word_predictor.is_enabled(appState));
  });

  test('is_enabled returns its existing value, unchanged, when needsAcknowledgement is false (article_50_disclosure flag off)', function(assert) {
    var appState = makeAppState({
      flags: { ai_word_prediction: true, article_50_disclosure: false }
    });
    assert.true(ai_word_predictor.is_enabled(appState));
  });

  test('is_enabled still returns false when needsAcknowledgement is false but the underlying ai_word_prediction flag is off (pre-existing behavior unchanged)', function(assert) {
    var appState = makeAppState({
      flags: { ai_word_prediction: false, article_50_disclosure: false }
    });
    assert.false(ai_word_predictor.is_enabled(appState));
  });

  test('acknowledgement (shown true) re-enables prediction automatically, since is_enabled is evaluated per call', function(assert) {
    var appState = makeAppState({
      flags: { ai_word_prediction: true, article_50_disclosure: true },
      user: makeUser({ article_50_disclosure_required: true, article_50_disclosure_shown: true })
    });
    assert.true(ai_word_predictor.is_enabled(appState));
  });

  test('predict() resolves with an empty array and issues no AJAX request in the degraded case', function(assert) {
    var done = assert.async();
    var originalAjax = $.ajax;
    var ajaxCalled = false;
    $.ajax = function() { ajaxCalled = true; return originalAjax.apply($, arguments); };

    var appState = makeAppState({
      flags: { ai_word_prediction: true, article_50_disclosure: true },
      user: makeUser({ article_50_disclosure_required: true, article_50_disclosure_shown: false })
    });

    ai_word_predictor.predict('hello there', { appState: appState, immediate: true }).then(function(words) {
      $.ajax = originalAjax;
      assert.deepEqual(words, []);
      assert.false(ajaxCalled);
      done();
    }, function() {
      $.ajax = originalAjax;
      assert.ok(false, 'predict() should not reject in the degraded case');
      done();
    });
  });
});
