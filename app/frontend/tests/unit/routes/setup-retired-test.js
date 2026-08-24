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
//
// CONTRACT CHANGE (2026-08-23): these tests previously asserted that `beforeModel`
// returned a promise REJECTING with `{setup_retired: true}`. `routes/setup.js:42-51`
// deliberately stopped doing that — the comment there explains why: a non-Error POJO
// rejection races router_js's abort classification, and when the race is lost the user
// typing /setup gets a "Failed to load" error page instead of their home page. The
// guard now redirects and returns nothing. The tests were never updated, so all four
// failed on `out.result.then` against `undefined`. They now assert the CURRENT
// contract: redirect happened, nothing thrown, no promise returned.
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

  // The guard's whole job: send the user home, synchronously, without throwing. Asserted
  // as one helper so a future change to the contract is updated in ONE place rather than
  // drifting across four tests the way the reject-based version did.
  var assertRedirectedHome = function(assert, built, out, label) {
    assert.notOk(out.threw, label + ': did not throw');
    assert.equal(built.calls.home, 1, label + ': return_to_index() was called exactly once');
    assert.notOk(out.result && typeof out.result.then === 'function',
      label + ': returns no promise — it redirects, it does not reject (routes/setup.js:42)');
  };

  test('the bare wizard URL is refused and the user is sent home', function(assert) {
    var built = buildRoute();
    assertRedirectedHome(assert, built, runGuard(built.route, {}), 'bare /setup');
  });

  // mode=layout was the board symbol-layout editor — a distinct feature that merely
  // lives on this route. It is not being rehomed for now, so it is intentionally NOT
  // excepted. If someone re-adds an exception this fails, and they have to justify it.
  test('mode=layout is refused too (the editor is not rehomed)', function(assert) {
    var built = buildRoute();
    var out = runGuard(built.route, { mode: 'layout', page: 'symbols' });
    assertRedirectedHome(assert, built, out, 'mode=layout');
  });

  test('mode=critical is refused (wizard flow, never had a caller)', function(assert) {
    var built = buildRoute();
    var out = runGuard(built.route, { mode: 'critical' });
    assertRedirectedHome(assert, built, out, 'mode=critical');
  });

  test('a missing/malformed transition does not crash the guard', function(assert) {
    var built = buildRoute();
    // Defensive: the guard reads transition.to.queryParams, which is absent on some
    // synthetic transitions. It must still fail CLOSED (send home), not throw and
    // leave the user on a half-retired wizard.
    var out = runGuard(built.route, undefined);
    assertRedirectedHome(assert, built, out, 'malformed transition');
  });
});
