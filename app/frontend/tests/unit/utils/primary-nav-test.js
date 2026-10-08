import { module, test } from 'qunit';
import { pillForRoute, hasHomeNavParam } from 'frontend/utils/primary_nav';

/* THE ONE RULE BEHIND THREE CONSUMERS. `controllers/application.js` uses this to decide which
 * pill is active AND whether the nav renders at all; `components/account-rail.js` uses it to
 * decide whether the rail's Home row is the current row; `controllers/user.js` uses the param
 * test. Before 2026-09-21 each held its own copy, which is the "two lists that must move
 * together will not, unless a test makes them" failure recorded in
 * docs/task-management/learnings-archive/2026-09.md. This file is that test.
 *
 * THE GATES ARE THE POINT of pinning it. Two pills do not always render, and a rule that names
 * a pill the nav will not draw produces a nav with nothing active and — through the rail — a
 * lit row for a section the user cannot see. Both are reachable: routes/organizations.js has
 * no permission guard, and lib/feature_flags.rb:140 says `updates_pill` is temporary and comes
 * off before go-live.
 */
module('Unit | Utility | primary_nav', function() {
  var ALL = { canManageOrgs: true, updatesEnabled: true };

  test('the ungated destinations are the pill regardless of role', function(assert) {
    assert.expect(5);
    assert.strictEqual(pillForRoute('index', '/', {}), 'home', 'the top-level index is home');
    assert.strictEqual(pillForRoute('user.home', '/someone/home', {}), 'home',
      'and so is the per-user home route');
    assert.strictEqual(pillForRoute('caseload', '/caseload', {}), 'caseload', 'caseload');
    assert.strictEqual(pillForRoute('user.boards', '/someone/boards', {}), 'boards', 'boards');
    assert.strictEqual(pillForRoute('user.extras', '/someone/extras', {}), 'extras', 'extras');
  });

  /* routes/organizations.js has NO afterModel guard (routes/caseload.js:23-35 does), so this
     route IS reachable by a user whose pill is hidden — a typed URL, an old link, or a
     permission revoked after the page was bookmarked. */
  test('Organizations is a pill only for someone who has the pill', function(assert) {
    assert.expect(2);
    assert.strictEqual(pillForRoute('organizations', '/organizations', ALL), 'organizations',
      'a manager gets the pill');
    assert.strictEqual(pillForRoute('organizations', '/organizations', {}), null,
      'without management responsibility the nav draws no Organizations pill, so the rule names none');
  });

  /* THE ROOMS PAGE IS THE ONE `organization.*` ROUTE IN THIS NAV (2026-09-23). A rooms-only
     supervisor is offered Rooms in the Organizations slot, so `/organizations/:id/rooms` has to
     keep the rail and the full nav; a manager is offered Organizations and reaches rooms
     through it, so for them the same URL is an org sub-page with the org section's own nav.
     BOTH DIRECTIONS ARE PINNED because the failure is silent either way: unnamed, the page
     loses its nav for the person whose nav it is; named for a manager, the org strip stands
     down (templates/organization.hbs) and a page that is not in this nav shows it anyway. */
  test('the rooms page is a pill only for someone who has the Rooms pill', function(assert) {
    assert.expect(3);
    assert.strictEqual(
      pillForRoute('organization.rooms', '/organizations/1_1/rooms', { canSeeRooms: true }),
      'rooms', 'a rooms-only supervisor gets the pill');
    assert.strictEqual(
      pillForRoute('organization.rooms', '/organizations/1_1/rooms', ALL), null,
      'a manager reaches rooms through Organizations, so this page is not in their nav');
    assert.strictEqual(
      pillForRoute('organization.room', '/organizations/1_1/rooms/1_2', { canSeeRooms: true }),
      null, 'one room is a detail page and is not in this nav');
  });

  /* The same page answers differently depending on which menu the user arrived through, and
     `?nav=home` is the whole difference. This is the rule R3 rests on. */
  test('the logs page is Updates only when it was reached from this nav', function(assert) {
    assert.expect(3);
    assert.strictEqual(pillForRoute('user.logs', '/someone/logs?type=note&nav=home', ALL), 'updates',
      'arriving from the Updates pill');
    assert.strictEqual(pillForRoute('user.logs', '/someone/logs', ALL), null,
      'arriving from the rail Logs row is not in this nav at all');
    assert.strictEqual(pillForRoute('user.logs', '/someone/logs?type=note', ALL), null,
      'a filter alone is not an origin');
  });

  /* lib/feature_flags.rb:140 documents this flag as forced on temporarily and due off before
     go-live. When it goes, a stale `?nav=home` link must not name a pill that is not drawn. */
  test('Updates is a pill only while its feature flag is on', function(assert) {
    assert.expect(1);
    assert.strictEqual(
      pillForRoute('user.logs', '/someone/logs?type=note&nav=home', { canManageOrgs: true }),
      null,
      'with updates_pill off the logs page is just the logs page');
  });

  /* router.js:142 declares the detail page as a SIBLING (`path: '/logs/:log_id'`), so opening
     one update is a route change. It stays in this nav when the origin came with it. */
  test('a single log entry stays in the nav when the origin came with it', function(assert) {
    assert.expect(2);
    assert.strictEqual(pillForRoute('user.log', '/someone/logs/1_1?nav=home', ALL), 'updates',
      'opening one update from the Updates list is still Updates');
    assert.strictEqual(pillForRoute('user.log', '/someone/logs/1_1', ALL), null,
      'reached from the rail Logs row it is an account page, as before');
  });

  test('the account section is not in this nav', function(assert) {
    var outside = ['user.account', 'user.index', 'user.goals', 'user.goal', 'user.badges',
      'user.edit', 'user.recordings', 'user.stats', 'user.preferences', 'user.subscription',
      'user.supervision', 'user.history', 'user.lessons', 'user.focus', 'user.board-detail',
      'organization.index', 'organization.people', 'organization.reports',
      'organization.settings'];
    assert.expect(outside.length);
    outside.forEach(function(route) {
      assert.strictEqual(pillForRoute(route, '/someone/whatever', ALL), null,
        route + ' has no pill, so the nav does not belong on it');
    });
  });

  /* Defensive, because the callers read `router.currentURL`, which is undefined before the
     first transition settles. A throw here would take the whole nav down. */
  test('a missing url is not an origin and does not throw', function(assert) {
    assert.expect(3);
    assert.false(hasHomeNavParam(undefined), 'undefined');
    assert.false(hasHomeNavParam(''), 'empty');
    assert.strictEqual(pillForRoute('user.logs', undefined, ALL), null, 'no url, no Updates');
  });

  /* `nav=homepage` must not match `nav=home`. The trailing boundary in the pattern is the only
     thing stopping it, and a regex is exactly the kind of thing that gets "simplified". */
  test('the origin param matches exactly', function(assert) {
    assert.expect(4);
    assert.true(hasHomeNavParam('/x/logs?nav=home'), 'last param');
    assert.true(hasHomeNavParam('/x/logs?nav=home&type=note'), 'followed by another param');
    assert.false(hasHomeNavParam('/x/logs?nav=homepage'), 'a longer value is a different value');
    assert.false(hasHomeNavParam('/x/logs?type=nav=home'), 'not a param of its own');
  });
});
