import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { send_basic_viewer_to_landing } from 'frontend/utils/basic_landing';

/* BACK MUST NOT LOOP THROUGH A MODERN-ONLY PAGE IN BASIC (2026-10-02, requested). Arriving on
 * Caseload, My Boards or Extras by Back/Forward or a typed address (a URL transition: Ember's
 * handleURL sets urlMethod to null) sends a Basic viewer to the Basic landing. That redirect must
 * REPLACE the history entry, after aborting the transition in flight, or Ember pushes a new entry
 * and the next Back lands on the same page again (scripts/view-switch-back-loop-qa.mjs).
 * A link click (urlMethod 'update') keeps the ordinary transition, so the page the user came from
 * stays in history.
 */
module('Unit | Utility | basic_landing redirect history', function() {
  var basic = EmberObject.create({ id: '1_2', user_name: 'sarah', preferences: { board_view_style: 'classic' } });
  var appState = EmberObject.create({ effective_view_user: basic, currentUser: basic });

  function fakes(urlMethod) {
    var calls = [];
    var router = {
      transitionTo: function() { calls.push(['transitionTo'].concat(Array.prototype.slice.call(arguments))); },
      replaceWith: function() { calls.push(['replaceWith'].concat(Array.prototype.slice.call(arguments))); }
    };
    var transition = { urlMethod: urlMethod, abort: function() { calls.push(['abort']); } };
    return { calls: calls, router: router, transition: transition };
  }

  test('Back, Forward or a typed address: abort, then replace the entry', function(assert) {
    assert.expect(2);
    var f = fakes(null);
    assert.true(send_basic_viewer_to_landing(appState, f.router, 'caseload', basic, null, f.transition));
    assert.deepEqual(f.calls.map(function(c) { return c[0]; }), ['abort', 'replaceWith'], 'aborted first, then replaced');
  });

  test('a link click: the ordinary transition, nothing aborted', function(assert) {
    assert.expect(2);
    var f = fakes('update');
    assert.true(send_basic_viewer_to_landing(appState, f.router, 'caseload', basic, null, f.transition));
    assert.deepEqual(f.calls.map(function(c) { return c[0]; }), ['transitionTo']);
  });

  test('no transition handed over: the ordinary transition, as before', function(assert) {
    assert.expect(1);
    var f = fakes(null);
    send_basic_viewer_to_landing(appState, f.router, 'caseload', basic);
    assert.deepEqual(f.calls.map(function(c) { return c[0]; }), ['transitionTo']);
  });
});
