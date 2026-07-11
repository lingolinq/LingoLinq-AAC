import { module, test } from 'qunit';
import { setupTest } from '../helpers';
import RSVP from 'rsvp';

/*
 * UX-06 runtime finding (Task 1 of 01-02-PLAN.md) -- see 01-02-SUMMARY.md for
 * the full writeup.
 *
 * Why this file is a `setupTest` container test, not `setupApplicationTest` +
 * `visit()`: this project's only prior acceptance test
 * (board-detail-empty-state-test.js) is entirely `QUnit.skip`'d -- its own
 * top comment and tests/acceptance/README.md document that `visit()` hangs
 * because the app's boot chain (session/persistence/IndexedDB bootstrap)
 * never settles under Mirage alone. Rather than add a second hanging
 * acceptance test, this file follows the already-working, already-proven
 * `setupTest` pattern from tests/unit/models/board-reload-if-lite-test.js:
 * it boots only the DI container (no router, no `visit()`), looks up the
 * REAL `service:store`, and exercises the REAL Ember-Data + RESTSerializer
 * id-reconciliation path directly -- the exact mechanism in question -- by
 * substituting a trivial stub `adapter.findRecord` that resolves the exact
 * JSON shape `Api::LessonsController#show` sends for an unresolved
 * (expired/malformed/wrong-signature) `lesson_share_token`: `id` = the bare
 * lesson `global_id` (NOT the composite `lesson_id:lesson_code:user_token`
 * id Ember Data requested) and no `user` key (see lib/json_api/lesson.rb and
 * the 01-02-PLAN.md <interfaces> block, verified against origin/staging).
 *
 * This deliberately bypasses the app's separate local-persistence/IndexedDB
 * caching wrapper (persistence.DSExtend, mixed into the adapter) so the test
 * isolates the single question Task 1 asks: what does Ember Data itself do
 * with an id-mismatched, user-less findRecord payload. That local-caching
 * layer is an orthogonal concern -- it does not change Ember Data's own
 * identifier-reconciliation rules, as shown by the fact the identical
 * failure mode for 'board' and 'buttonset' (see app/serializers/application.js)
 * was already fixed purely at the serializer level, with no changes to
 * persistence.js.
 *
 * OBSERVED RESULT (confirmed by running this test under
 * `ember test --filter="lesson expired"`, Ember Data 5.3.8):
 * `store.findRecord(...)` RESOLVES (it does NOT reject/throw). Ember Data
 * logs two console WARNINGS but does not raise a hard assertion error:
 *   "WARNING: You requested a record of type 'lesson' with id
 *   '<composite-id>' but the adapter returned a payload with primary data
 *   having an id of '<bare-global-id>'. Use 'store.findRecord()' when the
 *   requested id is the same as the one returned by the adapter. In other
 *   cases use 'store.queryRecord()' instead."
 *   "WARNING: The 'id' for a RecordIdentifier should not be updated once it
 *   has been set. Attempted to set id for '@lid:lesson-<composite-id>' to
 *   '<bare-global-id>'."
 * The resolved record keeps `user` undefined (no `user` key in the payload)
 * and its usable identity stays keyed to the ORIGINAL requested composite id
 * (the id-update to the bare global id is refused per the second warning) --
 * i.e. this is outcome (b) from the plan: "the promise RESOLVES with a
 * record whose id is [effectively still the requested composite id, since
 * the update to the bare id is refused] and whose user is undefined."
 * This is the SAME underlying id-reconciliation quirk already worked around
 * for 'board' and 'buttonset' in app/serializers/application.js (see the two
 * normalizeResponse blocks there, and the app/models/base.js `save()`
 * comment: "DS gets mad now if the server returns a different id") -- for
 * those two models the mismatch is silenced by normalizing the id BEFORE it
 * reaches the store; 'lesson' has no equivalent fix, so the raw warning
 * surfaces, but critically it does NOT throw or reject the promise in this
 * Ember Data version.
 *
 * CONCLUSION FOR TASK 2: routes/lesson.js's model() hook must handle the
 * RESOLVE-with-missing-user case as the primary (actually observed) path.
 * It must ALSO guard a rejected-promise case defensively (`.catch`), since
 * this is a console warning today, not a contract -- a future Ember Data
 * upgrade could tighten this into a thrown assertion. The plan's
 * <behavior> block requires both branches to be handled regardless of which
 * one is currently reachable.
 */
module('Acceptance | lesson expired link (UX-06 runtime finding)', function(hooks) {
  setupTest(hooks);

  test('findRecord on an expired-token payload (bare id, no user) -- observed Ember Data behavior', async function(assert) {
    const store = this.owner.lookup('service:store');
    const adapter = store.adapterFor('lesson');
    const requestedId = '1_555:abc123:expiredtoken999';

    const originalFindRecord = adapter.findRecord;
    // Stub only the adapter's findRecord (not persistence.ajax / $.ajax) so this
    // test hits the real store/serializer id-reconciliation path directly,
    // with the exact payload shape an unresolved-token lesson#show returns.
    adapter.findRecord = function() {
      return RSVP.resolve({
        lesson: { id: '1_555', title: 'Some Lesson', url: 'https://example.com/lesson' }
        // NOTE: no `user` key -- matches the unresolved-token payload shape.
      });
    };

    let rejected = false;
    let resolvedRecord = null;
    let rejection = null;
    try {
      resolvedRecord = await store.findRecord('lesson', requestedId);
    } catch (e) {
      rejected = true;
      rejection = e;
    } finally {
      adapter.findRecord = originalFindRecord;
    }

    // Pin the OBSERVED behavior (outcome (b), see top-of-file comment): the
    // promise resolves, does not reject, on this exact Ember Data version.
    assert.notOk(rejected, 'findRecord does NOT reject for the id-mismatched/user-less expired-token payload (observed outcome (b))');
    assert.notOk(rejection, 'no rejection reason was captured (findRecord resolved)');
    assert.ok(resolvedRecord, 'findRecord resolved with a record');
    assert.notOk(resolvedRecord && resolvedRecord.get && resolvedRecord.get('user'),
      'the resolved record has no `user` -- this is the reliable "token unresolved" signal routes/lesson.js must check');
  });
});
