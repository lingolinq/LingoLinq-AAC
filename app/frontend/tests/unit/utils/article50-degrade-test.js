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

/* SPEAK MODE, supporter modeling for a communicator: app-state#set_current_user
   has repointed currentUser at speakModeUser (the communicator) while
   sessionUser is still the authenticated supporter.

   Word prediction is the highest-traffic surface the Article 50 subject change
   touches, and it is the one place where the two gates in is_enabled()
   deliberately resolve to DIFFERENT people:
     - article50_gate#needsAcknowledgement -> the SUPPORTER (art50Subject), the
       operator the server's backstop also judges;
     - ai_feature_gate#aiFeatureEnabled    -> the COMMUNICATOR (currentUser),
       the data subject whose preferences and opt-outs govern whether their data
       may be processed by AI at all.
   These fixtures let one scenario assert both halves at once. */
function makeSpeakModeAppState(opts) {
  opts = opts || {};
  var flags = Object.assign({
    ai_word_prediction: true,
    article_50_disclosure: true
  }, opts.flags || {});
  return {
    get: function(key) {
      if(key.indexOf('feature_flags.') === 0) {
        return flags[key.slice('feature_flags.'.length)];
      }
      if(key === 'sessionUser') { return opts.sessionUser; }
      if(key === 'currentUser') { return opts.currentUser; }
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

  /* The Article 50 subject change is largest here: word prediction runs
     constantly in speak mode, so this is where a wrong subject silently
     enables or disables an AI feature for real sessions. */
  module('speak mode: supporter modeling for a communicator', function() {
    var enabledPrefs = { ai_features_enabled: true, ai_word_prediction: true };

    test('degrades on the SUPPORTER who has not acknowledged, even though the communicator has', function(assert) {
      var appState = makeSpeakModeAppState({
        sessionUser: makeUser({
          article_50_disclosure_required: true,
          article_50_disclosure_shown: false,
          preferences: enabledPrefs
        }),
        currentUser: makeUser({
          article_50_disclosure_required: true,
          article_50_disclosure_shown: true,
          preferences: enabledPrefs
        })
      });
      assert.false(ai_word_predictor.is_enabled(appState),
        'the server refuses the supporter, so predicting here would only burn a request on a guaranteed 403');
    });

    test('does NOT degrade on a supporter who HAS acknowledged, even though the communicator has not', function(assert) {
      var appState = makeSpeakModeAppState({
        sessionUser: makeUser({
          article_50_disclosure_required: true,
          article_50_disclosure_shown: true,
          preferences: enabledPrefs
        }),
        currentUser: makeUser({
          article_50_disclosure_required: true,
          article_50_disclosure_shown: false,
          preferences: enabledPrefs
        })
      });
      assert.true(ai_word_predictor.is_enabled(appState),
        'Article 50(1) informs the operator, and the supporter has been informed');
    });

    /* The two gates must keep resolving to DIFFERENT people. If a future change
       "tidies" ai_feature_gate onto art50Subject, this test fails: the
       communicator's AI opt-out would stop being honored while a supporter
       drives their session. */
    test('the communicator preference opt-out still wins even when the supporter is fully acknowledged', function(assert) {
      var appState = makeSpeakModeAppState({
        sessionUser: makeUser({
          article_50_disclosure_required: true,
          article_50_disclosure_shown: true,
          preferences: enabledPrefs
        }),
        currentUser: makeUser({
          article_50_disclosure_required: true,
          article_50_disclosure_shown: true,
          preferences: { ai_features_enabled: false, ai_word_prediction: false }
        })
      });
      assert.false(ai_word_predictor.is_enabled(appState),
        'the data subject governs whether their data may be processed, regardless of who is operating');
    });
  });
});
