import { module, test } from 'qunit';
import SetupRoute from 'frontend/routes/setup';

// The onboarding WIZARD was retired 2026-08-15: every UI entry point was removed and
// routes/setup.js gained a guard closing the last one — typing /setup directly.
// This is the highest-risk change in that batch, so the guard is locked down here.
//
// The setup PAGES themselves are deliberately still on disk (controllers/setup.js,
// templates/setup.hbs, app/components/setup/**) — only the access points are closed,
// so the flow can be revived later. This test covers the guard, not a deletion.
//
// Deliberately a UNIT test of `beforeModel` rather than an acceptance test: stubbing
// the one thing the guard actually touches (appState.return_to_index) tests the real
// logic deterministically in ~20ms, where a `visit('/setup')` acceptance test costs
// ~200s of full app boot for the same assertion. (The acceptance suite itself is
// healthy — verified 17/17 on 2026-08-15 — so an end-to-end companion is viable, just
// not a good trade here.)
module('Unit | Route | setup (retired guard)', function() {
  var buildRoute = function() {
    var calls = { home: 0 };
    var route = SetupRoute.create({
      appState: { return_to_index: function() { calls.home++; } },
      router: {}
    });
    return { route: route, calls: calls };
  };

  var runGuard = function(route, queryParams) {
    var transition = { to: { queryParams: queryParams || {} } };
    var result;
    try {
      result = route.beforeModel(transition);
    } catch (e) {
      return { threw: e };
    }
    return { result: result };
  };

  test('the bare wizard URL is refused and the user is sent home', function(assert) {
    var done = assert.async();
    var built = buildRoute();
    var out = runGuard(built.route, {});

    assert.equal(built.calls.home, 1, 'return_to_index() was called');
    assert.ok(out.result && typeof out.result.then === 'function', 'returns a promise');
    out.result.then(function() {
      assert.ok(false, 'the transition must NOT be allowed to proceed');
      done();
    }, function(err) {
      assert.ok(err && err.setup_retired, 'rejects with the setup_retired marker');
      done();
    });
  });

  // mode=layout was the board symbol-layout editor — a distinct feature that merely
  // lives on this route. It is not being rehomed for now, so it is intentionally NOT
  // excepted. If someone re-adds an exception this fails, and they have to justify it.
  test('mode=layout is refused too (the editor is not rehomed)', function(assert) {
    var done = assert.async();
    var built = buildRoute();
    var out = runGuard(built.route, { mode: 'layout', page: 'symbols' });

    assert.equal(built.calls.home, 1, 'sent home');
    out.result.then(function() {
      assert.ok(false, 'mode=layout must not reach the wizard');
      done();
    }, function() { assert.ok(true, 'rejected'); done(); });
  });

  test('mode=critical is refused (wizard flow, never had a caller)', function(assert) {
    var done = assert.async();
    var built = buildRoute();
    var out = runGuard(built.route, { mode: 'critical' });

    assert.equal(built.calls.home, 1, 'sent home');
    out.result.then(function() {
      assert.ok(false, 'mode=critical must not reach the wizard');
      done();
    }, function() { assert.ok(true, 'rejected'); done(); });
  });

  test('a missing/malformed transition does not crash the guard', function(assert) {
    var done = assert.async();
    var built = buildRoute();
    // Defensive: the guard reads transition.to.queryParams, which is absent on some
    // synthetic transitions. It must still fail CLOSED (send home), not throw and
    // leave the user on a half-retired wizard.
    var out = runGuard(built.route, undefined);
    assert.notOk(out.threw, 'did not throw');
    assert.equal(built.calls.home, 1, 'still sent home');
    out.result.then(function() {
      assert.ok(false, 'must not proceed');
      done();
    }, function() { assert.ok(true, 'still rejected'); done(); });
  });
});
