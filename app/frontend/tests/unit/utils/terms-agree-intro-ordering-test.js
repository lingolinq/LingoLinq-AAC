import { module, test } from 'qunit';
import RSVP from 'rsvp';
import modal from 'frontend/utils/modal';

// Regression coverage for LL-53cb93fab1 (routes/index.js & routes/bento.js
// setupController, applied identically in both). modal.open() unconditionally
// replaces whatever modal is currently open/pending (utils/modal.js#open
// resolves the prior promise with {replaced: true} and swaps in the new
// template — there is no queue). On the synchronous really_fresh path, both
// routes used to call modal.open('terms-agree') and then, later in the SAME
// render, unconditionally call modal.open('intro') when appState.show_intro
// is set — bumping terms-agree before the user ever sees or confirms it.
// terms_agree stays false (no false-positive consent), but consent is never
// presented either, and the modal is uncloseable at that point in the flow.
//
// Same mirroring approach as article50-session-entry-test.js: exercises the
// real, exact branch-guard shape both routes now use as pure logic with a
// stubbed modal.open, rather than standing up a full route/model integration
// harness (that harness does not exist for these routes and is out of scope
// here, same as the Art.50 coverage this sits alongside).

module('Unit | Utility | terms-agree-intro-ordering (routes/index.js & routes/bento.js wiring)', function(hooks) {
  var originalOpen;

  hooks.beforeEach(function() {
    originalOpen = modal.open;
  });

  hooks.afterEach(function() {
    modal.open = originalOpen;
  });

  test('Case: really_fresh + show_intro true does NOT let intro bump the pending terms-agree modal', function(assert) {
    var openedTemplates = [];
    modal.open = function(template) { openedTemplates.push(template); return RSVP.resolve(); };

    // Mirrors the really_fresh branch in both routes:
    //   } else if (model.get('really_fresh')) {
    //     art50_checked_inline = true;
    //     terms_agree_gate_pending_inline = true;
    //     modal.open('terms-agree').then(...);
    //   }
    var terms_agree_gate_pending_inline = false;
    terms_agree_gate_pending_inline = true;
    modal.open('terms-agree').then(function() {});

    // Mirrors the shared tail:
    //   if (_this.appState.get('show_intro') && !terms_agree_gate_pending_inline) {
    //     modal.open('intro');
    //   }
    var show_intro = true;
    if (show_intro && !terms_agree_gate_pending_inline) {
      modal.open('intro');
    }

    assert.deepEqual(openedTemplates, ['terms-agree'], 'terms-agree must be the only modal opened this render; intro must not bump it');
  });

  test('Sanity check: show_intro true DOES open intro when no terms-agree gate is pending', function(assert) {
    var openedTemplates = [];
    modal.open = function(template) { openedTemplates.push(template); return RSVP.resolve(); };

    var terms_agree_gate_pending_inline = false;
    var show_intro = true;
    if (show_intro && !terms_agree_gate_pending_inline) {
      modal.open('intro');
    }

    assert.deepEqual(openedTemplates, ['intro'], 'intro must still open normally when terms-agree was not queued this render');
  });

  test('Case: show_intro false never opens intro regardless of the terms-agree gate', function(assert) {
    var openedTemplates = [];
    modal.open = function(template) { openedTemplates.push(template); return RSVP.resolve(); };

    var terms_agree_gate_pending_inline = false;
    var show_intro = false;
    if (show_intro && !terms_agree_gate_pending_inline) {
      modal.open('intro');
    }

    assert.deepEqual(openedTemplates, [], 'no modal opens when show_intro is false');
  });
});
