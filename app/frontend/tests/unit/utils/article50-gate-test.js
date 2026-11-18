import { module, test } from 'qunit';
import RSVP from 'rsvp';
import modal from 'frontend/utils/modal';
import i18n from 'frontend/utils/i18n';
import {
  needsAcknowledgement, needsAiConsent, sessionEntryGatePending, GATE_AI_CONSENT_NOT_GIVEN, aiConsentDeferred, deferAiConsent, clearAiConsentDeferral, aiConsentDisclosureUrl,
  presentBlockingGate,
  maybeShowSessionEntryGate,
  onlyIfGenuinelyResolved,
  GATE_NOT_ACKNOWLEDGED,
  art50DisclosureUrl,
  art50Subject,
  art50UserId,
  ART50_DISCLOSURE_URL
} from 'frontend/utils/article50_gate';

function makeAppState(flagOn, user) {
  return {
    get: function(key) {
      if(key === 'feature_flags.article_50_disclosure') { return flagOn; }
      if(key === 'currentUser') { return user; }
      return null;
    }
  };
}

/* app-state in SPEAK MODE for a supporter: set_current_user has repointed
   currentUser at speakModeUser (the communicator) while sessionUser is still the
   authenticated supporter. This is the shape the whole subject fix exists for. */
function makeSpeakModeAppState(flagOn, sessionUser, currentUser) {
  return {
    get: function(key) {
      if(key === 'feature_flags.article_50_disclosure') { return flagOn; }
      if(key === 'sessionUser') { return sessionUser; }
      if(key === 'currentUser') { return currentUser; }
      return null;
    }
  };
}

function makeUser(overrides) {
  var attrs = Object.assign({
    really_fresh: true,
    article_50_disclosure_required: true,
    article_50_disclosure_shown: false,
    feature_flags: { article_50_disclosure: true }
  }, overrides || {});
  return {
    get: function(key) {
      if(key.indexOf('.') !== -1) {
        var parts = key.split('.');
        var val = attrs;
        for(var i = 0; i < parts.length; i++) {
          if(val == null) { return null; }
          val = val[parts[i]];
        }
        return val;
      }
      return attrs[key];
    },
    /* Lets a test simulate the acknowledgement actually being RECORDED, which is what
       the real disclosure flow does before its modal resolves. presentBlockingGate
       re-checks needsAcknowledgement() after the modal settles (article50_gate.js:108)
       and rejects if it is still true, so a stub that only resolves a value can never
       exercise the success path. */
    set: function(key, val) { attrs[key] = val; }
  };
}

module('Unit | Utility | article50 gate', function(hooks) {
  var originalOpen;

  hooks.beforeEach(function() {
    originalOpen = modal.open;
  });

  hooks.afterEach(function() {
    modal.open = originalOpen;
  });

  module('needsAcknowledgement', function() {
    test('returns false when the article_50_disclosure feature flag is off, regardless of other inputs', function(assert) {
      var user = makeUser({
        article_50_disclosure_required: true,
        article_50_disclosure_shown: false,
        feature_flags: {article_50_disclosure: false}
      });
      var appState = makeAppState(false, user);
      assert.false(needsAcknowledgement(appState));
    });

    test('returns false when the flag is on but there is no current user', function(assert) {
      var appState = makeAppState(true, null);
      assert.false(needsAcknowledgement(appState));
    });

    test('returns false when the flag is on but article_50_disclosure_required is false', function(assert) {
      var user = makeUser({article_50_disclosure_required: false, article_50_disclosure_shown: false});
      var appState = makeAppState(true, user);
      assert.false(needsAcknowledgement(appState));
    });

    test('returns false when the flag is on but article_50_disclosure_shown is already true', function(assert) {
      var user = makeUser({article_50_disclosure_required: true, article_50_disclosure_shown: true});
      var appState = makeAppState(true, user);
      assert.false(needsAcknowledgement(appState));
    });

    test('returns true only when the flag is on, required is true and shown is false', function(assert) {
      var user = makeUser({article_50_disclosure_required: true, article_50_disclosure_shown: false});
      var appState = makeAppState(true, user);
      assert.true(needsAcknowledgement(appState));
    });
  });

  module('presentBlockingGate', function() {
    test('resolves immediately without opening any modal when needsAcknowledgement is false', function(assert) {
      var done = assert.async();
      var openCalled = false;
      modal.open = function() { openCalled = true; return RSVP.resolve(); };
      var user = makeUser({article_50_disclosure_shown: true});
      var appState = makeAppState(true, user);
      presentBlockingGate(appState).then(function() {
        assert.false(openCalled);
        done();
      });
    });

    test('opens ai-disclosure with scannable true when needsAcknowledgement is true, and resolves after a genuine resolution', function(assert) {
      var done = assert.async();
      var openArgs = null;
      var user = makeUser({article_50_disclosure_required: true, article_50_disclosure_shown: false});
      modal.open = function(template, options) {
        openArgs = [template, options];
        /* A GENUINE resolution — the name of this test — means the acknowledgement was
           recorded, not merely that the modal closed with a truthy value. Without this
           line needsAcknowledgement() is still true when the gate re-checks it, the gate
           rejects with GATE_NOT_ACKNOWLEDGED (correctly — that re-check is the fix that
           stops a stray modal.close() satisfying the gate for an EU user), the success
           handler below never runs, and the test hangs until QUnit's 15s timeout. */
        user.set('article_50_disclosure_shown', true);
        return RSVP.resolve({ok: true});
      };
      var appState = makeAppState(true, user);
      presentBlockingGate(appState).then(function(result) {
        assert.deepEqual(openArgs[0], 'ai-disclosure');
        assert.true(openArgs[1].scannable);
        assert.strictEqual(openArgs[1].inactivity_timeout, undefined);
        assert.deepEqual(result, {ok: true});
        done();
      });
    });

    test('does NOT resolve when the modal resolves with {replaced: true}, and rejects with GATE_NOT_ACKNOWLEDGED instead', function(assert) {
      var done = assert.async();
      modal.open = function() {
        return RSVP.resolve({replaced: true});
      };
      var user = makeUser({article_50_disclosure_required: true, article_50_disclosure_shown: false});
      var appState = makeAppState(true, user);
      var resolved = false;
      var rejection = null;
      presentBlockingGate(appState).then(function() {
        resolved = true;
      }, function(err) {
        rejection = err;
      });
      setTimeout(function() {
        // Fail-closed: the gated action must not proceed on a bumped modal...
        assert.false(resolved);
        // ...but the caller still needs to know why, so it can say so instead of
        // leaving a button that looks broken. An unsettled promise cannot do that.
        assert.notStrictEqual(rejection, null);
        assert.strictEqual(rejection.art50_gate, GATE_NOT_ACKNOWLEDGED);
        done();
      }, 50);
    });
  });

  module('maybeShowSessionEntryGate', function() {
    test('opens the modal when the model is really_fresh and needs acknowledgement', function(assert) {
      var openArgs = null;
      modal.open = function(template, options) {
        openArgs = [template, options];
        return RSVP.resolve();
      };
      var user = makeUser({really_fresh: true, article_50_disclosure_required: true, article_50_disclosure_shown: false});
      maybeShowSessionEntryGate(user);
      assert.deepEqual(openArgs[0], 'ai-disclosure');
      assert.true(openArgs[1].scannable);
    });

    test('no-ops on a stale (not really_fresh) model', function(assert) {
      var openCalled = false;
      modal.open = function() { openCalled = true; return RSVP.resolve(); };
      var user = makeUser({really_fresh: false, article_50_disclosure_required: true, article_50_disclosure_shown: false});
      maybeShowSessionEntryGate(user);
      assert.false(openCalled);
    });
  });

  module('onlyIfGenuinelyResolved', function() {
    test('calls maybeShowSessionEntryGate when result is falsy', function(assert) {
      var openCalled = false;
      modal.open = function() { openCalled = true; return RSVP.resolve(); };
      var user = makeUser({really_fresh: true, article_50_disclosure_required: true, article_50_disclosure_shown: false});
      onlyIfGenuinelyResolved(null, user);
      assert.true(openCalled);
    });

    test('calls maybeShowSessionEntryGate when result.replaced is not truthy', function(assert) {
      var openCalled = false;
      modal.open = function() { openCalled = true; return RSVP.resolve(); };
      var user = makeUser({really_fresh: true, article_50_disclosure_required: true, article_50_disclosure_shown: false});
      onlyIfGenuinelyResolved({ok: true}, user);
      assert.true(openCalled);
    });

    test('does NOT call maybeShowSessionEntryGate when result.replaced is truthy', function(assert) {
      var openCalled = false;
      modal.open = function() { openCalled = true; return RSVP.resolve(); };
      var user = makeUser({really_fresh: true, article_50_disclosure_required: true, article_50_disclosure_shown: false});
      onlyIfGenuinelyResolved({replaced: true}, user);
      assert.false(openCalled);
    });
  });

  module('art50DisclosureUrl', function(hooks) {
    var original_langs;
    hooks.beforeEach(function() { original_langs = i18n.langs; });
    hooks.afterEach(function() { i18n.langs = original_langs; });

    test('appends the reader locale so a Spanish reader gets the Spanish notice', function(assert) {
      i18n.langs = {preferred: 'es', fallback: 'es'};
      assert.strictEqual(art50DisclosureUrl(), ART50_DISCLOSURE_URL + '?locale=es');
    });

    test('sends the full regional tag and lets the server resolve the base language', function(assert) {
      i18n.langs = {preferred: 'es-ES', fallback: 'es'};
      assert.strictEqual(art50DisclosureUrl(), ART50_DISCLOSURE_URL + '?locale=es-ES');
    });

    test('falls back to the bare URL when no locale has been resolved yet', function(assert) {
      i18n.langs = null;
      assert.strictEqual(art50DisclosureUrl(), ART50_DISCLOSURE_URL);
    });

    test('does not send the "backwards" debug pseudo-locale', function(assert) {
      i18n.langs = {preferred: 'backwards'};
      assert.strictEqual(art50DisclosureUrl(), ART50_DISCLOSURE_URL);
    });

    test('percent-encodes the locale value', function(assert) {
      i18n.langs = {preferred: 'es ES&x=1'};
      assert.strictEqual(art50DisclosureUrl().indexOf('&x=1'), -1);
    });
  });

  /* The gate SUBJECT. The server backstop evaluates @api_user, the
     token-authenticated account, and never follows speak mode; the client must
     name the same person or the two ends decide about different humans. */
  module('art50Subject', function() {
    test('prefers the authenticated sessionUser over currentUser', function(assert) {
      var supporter = makeUser();
      var communicator = makeUser();
      var appState = makeSpeakModeAppState(true, supporter, communicator);
      assert.strictEqual(art50Subject(appState), supporter);
    });

    test('falls back to currentUser before sessionUser is assigned', function(assert) {
      var user = makeUser();
      assert.strictEqual(art50Subject(makeAppState(true, user)), user);
    });

    test('returns null for a non-appState argument', function(assert) {
      assert.strictEqual(art50Subject(null), null);
      assert.strictEqual(art50Subject({}), null);
    });
  });

  module('needsAcknowledgement in speak mode (supporter modeling for a communicator)', function() {
    test('gates the SUPPORTER who has not acknowledged, even though the communicator has', function(assert) {
      var supporter = makeUser({article_50_disclosure_required: true, article_50_disclosure_shown: false});
      var communicator = makeUser({article_50_disclosure_required: true, article_50_disclosure_shown: true});
      var appState = makeSpeakModeAppState(true, supporter, communicator);
      assert.true(needsAcknowledgement(appState),
        'the supporter is the human interacting with the AI, and the server will refuse THEIR account');
    });

    test('does NOT gate a supporter who has acknowledged, even though the communicator has not', function(assert) {
      var supporter = makeUser({article_50_disclosure_required: true, article_50_disclosure_shown: true});
      var communicator = makeUser({article_50_disclosure_required: true, article_50_disclosure_shown: false});
      var appState = makeSpeakModeAppState(true, supporter, communicator);
      assert.false(needsAcknowledgement(appState),
        'gating here would ask the supporter to re-acknowledge a notice already on their record');
    });

    test('reads the feature flag from the supporter, not from appState (the communicator)', function(assert) {
      var supporter = makeUser({
        article_50_disclosure_required: true,
        article_50_disclosure_shown: false,
        feature_flags: {article_50_disclosure: false}
      });
      var communicator = makeUser({
        article_50_disclosure_required: true,
        article_50_disclosure_shown: false,
        feature_flags: {article_50_disclosure: true}
      });
      // appState.feature_flags is ON (communicator), but the supporter's org
      // has the flag off. Gating here would show a modal the server will not
      // enforce, and the inverse (appState off, subject on) would skip a modal
      // the server will 403.
      var appState = makeSpeakModeAppState(true, supporter, communicator);
      assert.false(needsAcknowledgement(appState),
        'org overrides are per-account; the communicator flag must not drag the supporter in');
    });

    test('still gates a supporter whose own flag is on when appState (communicator) flag is off', function(assert) {
      var supporter = makeUser({
        article_50_disclosure_required: true,
        article_50_disclosure_shown: false,
        feature_flags: {article_50_disclosure: true}
      });
      var communicator = makeUser({
        article_50_disclosure_required: true,
        article_50_disclosure_shown: false,
        feature_flags: {article_50_disclosure: false}
      });
      var appState = makeSpeakModeAppState(false, supporter, communicator);
      assert.true(needsAcknowledgement(appState),
        'the server evaluates the supporter flag; skipping the modal here would 403');
    });
  });

  module('art50UserId', function() {
    test('prefers global_id over the self sentinel on .id', function(assert) {
      var user = makeUser({id: 'self', global_id: '1_24', _actual_id: '1_24'});
      assert.strictEqual(art50UserId(user), '1_24');
    });

    test('falls back to _actual_id when global_id is absent', function(assert) {
      var user = makeUser({id: 'self', _actual_id: '1_99'});
      assert.strictEqual(art50UserId(user), '1_99');
    });

    test('uses .id when it is already a real backend id', function(assert) {
      var user = makeUser({id: '1_7'});
      assert.strictEqual(art50UserId(user), '1_7');
    });

    test('returns null for the self sentinel with no parked backend id', function(assert) {
      var user = makeUser({id: 'self'});
      assert.strictEqual(art50UserId(user), null);
    });

    test('returns null for a missing user', function(assert) {
      assert.strictEqual(art50UserId(null), null);
    });
  });

  /* REGRESSION GUARD for the fail-OPEN trap in asAppState. routes/index.js and
     routes/bento.js hand maybeShowSessionEntryGate a MODEL, not an appState;
     asAppState shims it. If that shim stops answering the identity key
     art50Subject asks for, needsAcknowledgement returns false and the
     session-entry disclosure silently never opens again. No other suite would
     notice. */
  module('session-entry gate survives the subject change', function() {
    // modal.open is saved and restored by the enclosing module's hooks.
    test('maybeShowSessionEntryGate still opens the modal for a fresh un-acknowledged model', function(assert) {
      var openCalled = false;
      modal.open = function() { openCalled = true; return RSVP.resolve(); };
      maybeShowSessionEntryGate(makeUser({
        really_fresh: true,
        article_50_disclosure_required: true,
        article_50_disclosure_shown: false
      }));
      assert.true(openCalled,
        'asAppState must resolve BOTH currentUser and sessionUser to the model, or this gate dies silently');
    });

    test('maybeShowSessionEntryGate still stays shut once the model is acknowledged', function(assert) {
      var openCalled = false;
      modal.open = function() { openCalled = true; return RSVP.resolve(); };
      maybeShowSessionEntryGate(makeUser({
        really_fresh: true,
        article_50_disclosure_required: true,
        article_50_disclosure_shown: true
      }));
      assert.false(openCalled);
    });
  });

  /* AI data-sharing consent (#1136). The same modal asks for it, so the gate opens for
     either need. These tests cover the new predicate and the paths it changes; the
     Article-50-only paths above are the ones that must stay exactly as they were. */
  module('AI data-sharing consent', function(consentHooks) {
    var consentUser = null;

    function makeConsentUser(overrides) {
      return makeUser(Object.assign({
        global_id: 'test_ai_consent_user_1',
        article_50_disclosure_required: false,
        article_50_disclosure_shown: false,
        feature_flags: { article_50_disclosure: true },
        ai_consent_required: true,
        ai_consent_route: 'self',
        preferences: {ai_features_enabled: true}
      }, overrides || {}));
    }

    consentHooks.beforeEach(function() {
      consentUser = makeConsentUser();
      clearAiConsentDeferral(consentUser);
    });

    consentHooks.afterEach(function() {
      clearAiConsentDeferral(consentUser);
    });

    module('needsAiConsent truth table', function() {
      test('true only when ai_consent_required is true AND the route is self', function(assert) {
        assert.true(needsAiConsent(makeAppState(true, makeConsentUser())));
      });

      test('false when consent is not required, whatever the route', function(assert) {
        assert.false(needsAiConsent(makeAppState(true, makeConsentUser({ai_consent_required: false}))));
        assert.false(needsAiConsent(makeAppState(true, makeConsentUser({ai_consent_required: false, ai_consent_route: 'organization'}))));
      });

      test('false when the route is organization or parent: the account cannot agree for itself', function(assert) {
        assert.false(needsAiConsent(makeAppState(true, makeConsentUser({ai_consent_route: 'organization'}))));
        assert.false(needsAiConsent(makeAppState(true, makeConsentUser({ai_consent_route: 'parent'}))));
      });

      test('false when the route is missing or unknown', function(assert) {
        assert.false(needsAiConsent(makeAppState(true, makeConsentUser({ai_consent_route: undefined}))));
        assert.false(needsAiConsent(makeAppState(true, makeConsentUser({ai_consent_route: 'bogus'}))));
      });

      test('false when the fields are absent (a record that is not the session user)', function(assert) {
        var user = makeUser();
        assert.false(needsAiConsent(makeAppState(true, user)));
      });

      test('false with no appState, no subject or a non-appState argument', function(assert) {
        assert.false(needsAiConsent(null));
        assert.false(needsAiConsent({}));
        assert.false(needsAiConsent(makeAppState(true, null)));
      });

      test('reads the authenticated sessionUser, not the speak-mode communicator', function(assert) {
        var supporter = makeConsentUser();
        var communicator = makeConsentUser({ai_consent_required: false});
        assert.true(needsAiConsent(makeSpeakModeAppState(true, supporter, communicator)));
        assert.false(needsAiConsent(makeSpeakModeAppState(true, communicator, supporter)));
      });

      test('does not depend on the article_50_disclosure feature flag', function(assert) {
        var user = makeConsentUser({feature_flags: {article_50_disclosure: false}});
        assert.true(needsAiConsent(makeAppState(false, user)));
        assert.false(needsAcknowledgement(makeAppState(false, user)));
      });
    });

    module('presentBlockingGate with consent', function() {
      test('opens the modal when only consent is needed, and resolves once consent is recorded', function(assert) {
        assert.expect(3);
        var done = assert.async();
        var openArgs = null;
        modal.open = function(template, options) {
          openArgs = [template, options];
          consentUser.set('ai_consent_required', false);
          return RSVP.resolve({ok: true});
        };
        presentBlockingGate(makeAppState(true, consentUser)).then(function(result) {
          assert.strictEqual(openArgs[0], 'ai-disclosure');
          assert.true(openArgs[1].scannable);
          assert.deepEqual(result, {ok: true});
          done();
        });
      });

      test('REJECTS when the modal closes without consent ("Not now"), naming the consent gate only', function(assert) {
        assert.expect(3);
        var done = assert.async();
        modal.open = function() { return RSVP.resolve(); };
        var resolved = false;
        presentBlockingGate(makeAppState(true, consentUser)).then(function() {
          resolved = true;
        }, function(err) {
          assert.false(resolved);
          assert.strictEqual(err.ai_consent_gate, GATE_AI_CONSENT_NOT_GIVEN);
          assert.strictEqual(err.art50_gate, undefined, 'Article 50 is not outstanding, so it is not named');
          done();
        });
      });

      test('names both gates when both are outstanding and the modal closes', function(assert) {
        assert.expect(2);
        var done = assert.async();
        modal.open = function() { return RSVP.resolve(); };
        var user = makeConsentUser({article_50_disclosure_required: true, article_50_disclosure_shown: false});
        presentBlockingGate(makeAppState(true, user)).then(null, function(err) {
          assert.strictEqual(err.ai_consent_gate, GATE_AI_CONSENT_NOT_GIVEN);
          assert.strictEqual(err.art50_gate, GATE_NOT_ACKNOWLEDGED);
          done();
        });
      });

      test('a bumped modal rejects and says so (replaced), still naming the outstanding consent', function(assert) {
        assert.expect(3);
        var done = assert.async();
        modal.open = function() { return RSVP.resolve({replaced: true}); };
        presentBlockingGate(makeAppState(true, consentUser)).then(null, function(err) {
          assert.true(err.replaced);
          assert.strictEqual(err.art50_gate, GATE_NOT_ACKNOWLEDGED);
          assert.strictEqual(err.ai_consent_gate, GATE_AI_CONSENT_NOT_GIVEN);
          done();
        });
      });

      test('"Not now" does not stop the next blocking AI action from asking again', function(assert) {
        assert.expect(1);
        var done = assert.async();
        var opens = 0;
        modal.open = function() { opens++; return RSVP.resolve(); };
        deferAiConsent(consentUser);
        presentBlockingGate(makeAppState(true, consentUser)).then(null, function() {
          assert.strictEqual(opens, 1, 'the remembered "Not now" only quiets the session-entry notice');
          done();
        });
      });

      test('an account that needs neither opens nothing and resolves', function(assert) {
        assert.expect(1);
        var done = assert.async();
        var openCalled = false;
        modal.open = function() { openCalled = true; return RSVP.resolve(); };
        presentBlockingGate(makeAppState(true, makeConsentUser({ai_consent_required: false}))).then(function() {
          assert.false(openCalled);
          done();
        });
      });

      test('a district-route account is not prompted', function(assert) {
        assert.expect(1);
        var done = assert.async();
        var openCalled = false;
        modal.open = function() { openCalled = true; return RSVP.resolve(); };
        presentBlockingGate(makeAppState(true, makeConsentUser({ai_consent_route: 'organization'}))).then(function() {
          assert.false(openCalled);
          done();
        });
      });

      test('Article-50-only rejection is unchanged: only art50_gate, no consent key', function(assert) {
        assert.expect(1);
        var done = assert.async();
        modal.open = function() { return RSVP.resolve(); };
        var user = makeUser({article_50_disclosure_required: true, article_50_disclosure_shown: false});
        presentBlockingGate(makeAppState(true, user)).then(null, function(err) {
          assert.deepEqual(err, {art50_gate: GATE_NOT_ACKNOWLEDGED});
          done();
        });
      });
    });

    module('presentBlockingGate with skipAiConsent (evaluation narration)', function() {
      test('resolves at once with no modal when only consent is outstanding', function(assert) {
        assert.expect(2);
        var done = assert.async();
        var openCalled = false;
        modal.open = function() { openCalled = true; return RSVP.resolve(); };
        presentBlockingGate(makeAppState(true, consentUser), {skipAiConsent: true}).then(function() {
          assert.false(openCalled);
          assert.true(needsAiConsent(makeAppState(true, consentUser)), 'the clinician\'s own consent is untouched');
          done();
        });
      });

      test('with Article 50 outstanding it opens the notice, told to skip consent, and resolves once acknowledged', function(assert) {
        assert.expect(3);
        var done = assert.async();
        var openArgs = null;
        var user = makeConsentUser({article_50_disclosure_required: true});
        modal.open = function(template, options) {
          openArgs = [template, options];
          user.set('article_50_disclosure_shown', true);
          return RSVP.resolve({ok: true});
        };
        presentBlockingGate(makeAppState(true, user), {skipAiConsent: true}).then(function(result) {
          assert.strictEqual(openArgs[0], 'ai-disclosure');
          assert.deepEqual(openArgs[1], {scannable: true, skipAiConsent: true});
          assert.deepEqual(result, {ok: true});
          done();
        });
      });

      test('a close without the acknowledgement rejects naming Article 50 only, never the consent gate', function(assert) {
        assert.expect(2);
        var done = assert.async();
        modal.open = function() { return RSVP.resolve(); };
        var user = makeConsentUser({article_50_disclosure_required: true});
        presentBlockingGate(makeAppState(true, user), {skipAiConsent: true}).then(null, function(err) {
          assert.deepEqual(err, {art50_gate: GATE_NOT_ACKNOWLEDGED});
          assert.strictEqual(err.ai_consent_gate, undefined);
          done();
        });
      });

      test('without the option the modal is opened with exactly the options it always had', function(assert) {
        assert.expect(1);
        var done = assert.async();
        var openArgs = null;
        modal.open = function(template, options) {
          openArgs = options;
          consentUser.set('ai_consent_required', false);
          return RSVP.resolve();
        };
        presentBlockingGate(makeAppState(true, consentUser)).then(function() {
          assert.deepEqual(openArgs, {scannable: true});
          done();
        });
      });

      test('the blocking path ignores the Allow AI features preference: it still asks when an AI action starts', function(assert) {
        assert.expect(1);
        var done = assert.async();
        var opens = 0;
        modal.open = function() { opens++; return RSVP.resolve(); };
        var user = makeConsentUser({preferences: {ai_features_enabled: false}});
        presentBlockingGate(makeAppState(true, user)).then(null, function() {
          assert.strictEqual(opens, 1);
          done();
        });
      });
    });

    module('session entry', function() {
      test('opens the modal for a fresh account that needs consent', function(assert) {
        var openArgs = null;
        modal.open = function(template, options) { openArgs = [template, options]; return RSVP.resolve(); };
        maybeShowSessionEntryGate(consentUser);
        assert.strictEqual(openArgs[0], 'ai-disclosure');
        assert.true(sessionEntryGatePending(consentUser));
      });

      test('stays shut for a stale model', function(assert) {
        var openCalled = false;
        modal.open = function() { openCalled = true; return RSVP.resolve(); };
        var stale = makeConsentUser({really_fresh: false});
        maybeShowSessionEntryGate(stale);
        assert.false(openCalled);
        assert.false(sessionEntryGatePending(stale));
      });

      test('stays shut for district and parent route accounts', function(assert) {
        assert.false(sessionEntryGatePending(makeConsentUser({ai_consent_route: 'organization'})));
        assert.false(sessionEntryGatePending(makeConsentUser({ai_consent_route: 'parent'})));
      });

      test('does not re-open after "Not now" on this device, for that user only', function(assert) {
        var openCalled = false;
        modal.open = function() { openCalled = true; return RSVP.resolve(); };
        assert.true(deferAiConsent(consentUser));
        assert.true(aiConsentDeferred(consentUser));
        maybeShowSessionEntryGate(consentUser);
        assert.false(openCalled, 'remembered "Not now" keeps the session-entry notice shut');
        assert.false(sessionEntryGatePending(consentUser));
        var other = makeConsentUser({global_id: 'test_ai_consent_user_2'});
        assert.false(aiConsentDeferred(other), 'another account on the same device is still asked');
        assert.true(sessionEntryGatePending(other));
      });

      test('an outstanding Article 50 acknowledgement still opens it even after "Not now"', function(assert) {
        var user = makeConsentUser({article_50_disclosure_required: true, article_50_disclosure_shown: false});
        deferAiConsent(user);
        assert.true(sessionEntryGatePending(user));
      });

      test('a localStorage that throws means "not remembered", never a crash', function(assert) {
        assert.expect(3);
        var descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get: function() { throw new Error('denied'); }
        });
        try {
          assert.false(deferAiConsent(consentUser));
          assert.false(aiConsentDeferred(consentUser));
          assert.true(sessionEntryGatePending(consentUser), 'errs toward asking');
        } finally {
          if (descriptor) {
            Object.defineProperty(window, 'localStorage', descriptor);
          } else {
            delete window.localStorage;
          }
        }
      });

      test('does not open for consent when Allow AI features is off, absent, null or unrecognized', function(assert) {
        assert.expect(8);
        var openCalled = false;
        modal.open = function() { openCalled = true; return RSVP.resolve(); };
        [{ai_features_enabled: false}, {ai_features_enabled: 'false'}, {ai_features_enabled: 0}, {ai_features_enabled: null}, {ai_features_enabled: 'maybe'}, {}, undefined].forEach(function(prefs) {
          var user = makeConsentUser({preferences: prefs});
          assert.false(sessionEntryGatePending(user), 'pending for ' + JSON.stringify(prefs));
          maybeShowSessionEntryGate(user);
        });
        assert.false(openCalled);
      });

      test('opens for consent when Allow AI features is on, in the app\'s own true vocabulary', function(assert) {
        assert.expect(5);
        var opens = 0;
        modal.open = function() { opens++; return RSVP.resolve(); };
        [true, 'true', '1', 1].forEach(function(value) {
          var user = makeConsentUser({preferences: {ai_features_enabled: value}});
          assert.true(sessionEntryGatePending(user), 'pending for ' + JSON.stringify(value));
          maybeShowSessionEntryGate(user);
        });
        assert.strictEqual(opens, 4);
      });

      test('Article-50-only session entry is not affected by the preference', function(assert) {
        assert.expect(3);
        [{ai_features_enabled: false}, {}, undefined].forEach(function(prefs) {
          var user = makeUser({really_fresh: true, article_50_disclosure_required: true, article_50_disclosure_shown: false, preferences: prefs});
          assert.true(sessionEntryGatePending(user), 'pending for ' + JSON.stringify(prefs));
        });
      });

      test('an Article 50 notice still opens, with the consent step, for an account whose AI preference is off', function(assert) {
        var user = makeConsentUser({article_50_disclosure_required: true, preferences: {ai_features_enabled: false}});
        assert.true(sessionEntryGatePending(user), 'Article 50 alone keeps the notice open');
      });

      test('consent-free accounts behave exactly as before (Article 50 only)', function(assert) {
        var user = makeUser({really_fresh: true, article_50_disclosure_required: true, article_50_disclosure_shown: false});
        assert.true(sessionEntryGatePending(user));
        var acked = makeUser({really_fresh: true, article_50_disclosure_required: true, article_50_disclosure_shown: true});
        assert.false(sessionEntryGatePending(acked));
      });
    });

    module('aiConsentDisclosureUrl', function() {
      test('uses the version the server reported, and the current one otherwise', function(assert) {
        assert.strictEqual(aiConsentDisclosureUrl(makeConsentUser({ai_consent_disclosures_version: 2})), '/ai_consent/disclosures/2');
        assert.strictEqual(aiConsentDisclosureUrl(makeConsentUser()), '/ai_consent/disclosures/current');
        assert.strictEqual(aiConsentDisclosureUrl(null), '/ai_consent/disclosures/current');
      });
    });
  });
});
