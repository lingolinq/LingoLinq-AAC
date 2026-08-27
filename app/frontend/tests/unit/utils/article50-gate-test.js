import { module, test } from 'qunit';
import RSVP from 'rsvp';
import modal from 'frontend/utils/modal';
import i18n from 'frontend/utils/i18n';
import {
  needsAcknowledgement,
  presentBlockingGate,
  maybeShowSessionEntryGate,
  onlyIfGenuinelyResolved,
  GATE_NOT_ACKNOWLEDGED,
  art50DisclosureUrl,
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
      var user = makeUser({article_50_disclosure_required: true, article_50_disclosure_shown: false});
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
});
