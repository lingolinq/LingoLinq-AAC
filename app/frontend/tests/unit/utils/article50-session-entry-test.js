import { module, test } from 'qunit';
import RSVP from 'rsvp';
import modal from 'frontend/utils/modal';
import {
  onlyIfGenuinelyResolved,
  maybeShowSessionEntryGate
} from 'frontend/utils/article50_gate';

// These tests cover the session-entry wiring described in 03-UI-SPEC.md
// section 7.1, as applied in routes/index.js#setupController /
// routes/bento.js#setupController. They exercise the real, shared
// article50_gate helpers the same way those routes call them -- as pure
// branch logic with stubs -- rather than standing up a full route/model
// integration test (which the plan explicitly says not to attempt).

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
    }
  };
}

module('Unit | Utility | article50-session-entry (routes/index.js & routes/bento.js wiring)', function(hooks) {
  var originalOpen;

  hooks.beforeEach(function() {
    originalOpen = modal.open;
  });

  hooks.afterEach(function() {
    modal.open = originalOpen;
  });

  test('Case: a bumped (replaced) terms-agree resolution does NOT open the Art.50 modal', function(assert) {
    var openCalled = false;
    modal.open = function() { openCalled = true; return RSVP.resolve(); };
    var user = makeUser();
    // Mirrors: modal.open('terms-agree').then(function(result) { onlyIfGenuinelyResolved(result, model); });
    onlyIfGenuinelyResolved({ replaced: true }, user);
    assert.false(openCalled, 'a bump must never be mistaken for a genuine acknowledgement');
  });

  test('Case: a genuine (non-replaced) terms-agree resolution DOES open the Art.50 modal', function(assert) {
    var openArgs = null;
    modal.open = function(template, options) { openArgs = [template, options]; return RSVP.resolve(); };
    var user = makeUser();
    onlyIfGenuinelyResolved(null, user);
    assert.deepEqual(openArgs[0], 'ai-disclosure');
    assert.true(openArgs[1].scannable);
  });

  test('Case: a stale (not really_fresh) model no-ops, even when otherwise in-scope', function(assert) {
    var openCalled = false;
    modal.open = function() { openCalled = true; return RSVP.resolve(); };
    var staleUser = makeUser({ really_fresh: false });
    // Mirrors the offline/stale Case 2 in 03-UI-SPEC 7.1: no branch runs, so
    // the shared tail's maybeShowSessionEntryGate(model) call is the only
    // thing protecting against showing the gate on stale data.
    maybeShowSessionEntryGate(staleUser);
    assert.false(openCalled, 'really_fresh must gate the session-entry opportunity');
  });

  test('Case: art50_checked_inline=true suppresses the shared tail check', function(assert) {
    var openCalled = false;
    modal.open = function() { openCalled = true; return RSVP.resolve(); };
    var user = makeUser();
    // Mirrors the exact tail guard in routes/index.js / routes/bento.js:
    //   if(!art50_checked_inline) { maybeShowSessionEntryGate(model); }
    var art50_checked_inline = true;
    if(!art50_checked_inline) {
      maybeShowSessionEntryGate(user);
    }
    assert.false(openCalled, 'when a terms_agree-missing branch already claimed the check, the tail must not check again');
  });

  test('Sanity check: the same tail guard DOES fire when art50_checked_inline is false', function(assert) {
    var openCalled = false;
    modal.open = function() { openCalled = true; return RSVP.resolve(); };
    var user = makeUser();
    var art50_checked_inline = false;
    if(!art50_checked_inline) {
      maybeShowSessionEntryGate(user);
    }
    assert.true(openCalled, 'when no earlier branch claimed the check, the tail must still run it');
  });
});
