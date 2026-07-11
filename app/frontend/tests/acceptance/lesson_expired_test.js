import { module, test } from 'qunit';
import { setupTest } from '../helpers';
import RSVP from 'rsvp';

// Codex review finding (dual-reviewer pass, 2026-07-11) on the earlier version
// of routes/lesson.js: mapping EVERY findRecord rejection to the link_expired
// sentinel mislabeled a genuinely missing/nonce-mismatched lesson (a real 404
// from Api::LessonsController#show's `exists?` guard) as "link expired".
// jsonApiNotFoundError() is the synthetic JSON:API error shape (kept as a
// second-format regression guard). fakeXhrNotFoundError() is the shape THIS
// APP actually produces in production: app/frontend/app/adapters/
// application.js overrides `ajax` to call `$.ajax` directly (bypassing Ember
// Data's own RESTAdapter error wrapping), and app/frontend/app/utils/
// extras.js's $.ajax override rejects with a `{ fakeXHR: {...} }` shape, not
// a JSON:API `errors` array (adversary-review finding: the JSON:API-shape
// test alone would pass even if the fix never actually fired for a real
// browser 404, since production never emits that shape).
function jsonApiNotFoundError() {
  return { errors: [{ status: '404', title: 'Record not found' }] };
}
function fakeXhrNotFoundError() {
  return { fakeXHR: { status: 404 }, message: 'Not Found' };
}
function fakeXhrServerError() {
  return { fakeXHR: { status: 500 }, message: 'Internal Server Error' };
}

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

/*
 * Task 4 -- full behavioral contract for the hardened routes/lesson.js +
 * controllers/lesson.js (see Task 2's commit) and the lesson.hbs link-expired
 * panel (see Task 3's commit).
 *
 * These are route+controller INTEGRATION tests (`setupTest`, no router, no
 * `visit()`), not full DOM/rendering acceptance tests. This repo's own
 * existing precedent for this exact tradeoff is
 * tests/unit/components/share-board-guard-test.js, whose top comment
 * explicitly scopes itself to the non-rendered guard logic and defers full
 * rendering coverage. The same reasoning applies here, compounded by the
 * documented visit()-hangs-under-Mirage limitation (see the top-of-file
 * comment above and tests/acceptance/README.md).
 *
 * What IS verified here (route/controller behavior, the actual new logic):
 *   - expired-token and malformed-token requests produce the IDENTICAL
 *     link_expired outcome (proves UX-05 reason-agnostic behavior at the
 *     one place that could leak a reason: the model()/setupController()
 *     code path).
 *   - a valid token still resolves the real lesson model and still calls
 *     setup_tracking() (regression guard).
 *   - a valid -> expired transition on the SAME controller instance leaves
 *     no stale prior model (adversary-review stale-model guard).
 *
 * What is NOT re-verified here (already verified by other means in Task 3):
 *   - that the template actually hides the iframe / shows the panel + the
 *     recovery link for link_expired=true. That is a static template
 *     structure fact, verified by `ember-template-lint` (0 errors) plus the
 *     grep-based structural checks in Task 3's commit (`{{#if
 *     this.link_expired}}` gates the iframe out of the expired branch; the
 *     expired branch contains the link_expired_home LinkTo and no
 *     reason-revealing text). A true DOM-rendered assertion of that same
 *     fact would need `visit()`, which hangs in this harness.
 */
module('Acceptance | lesson expired link route/controller contract', function(hooks) {
  setupTest(hooks);

  function stubUnresolvedTokenResponse(store) {
    var adapter = store.adapterFor('lesson');
    var original = adapter.findRecord;
    adapter.findRecord = function() {
      // Same payload shape for every unresolved-token cause (expired,
      // malformed, wrong signature) -- api/lessons#show never reveals why.
      return RSVP.resolve({
        lesson: { id: '1_777', title: 'Some Lesson', url: 'https://example.com/lesson' }
      });
    };
    return function restore() { adapter.findRecord = original; };
  }

  function stubValidTokenResponse(store, requestedId) {
    var adapter = store.adapterFor('lesson');
    var original = adapter.findRecord;
    adapter.findRecord = function() {
      return RSVP.resolve({
        lesson: {
          id: requestedId,
          title: 'A Real Lesson',
          url: 'https://example.com/real-lesson',
          user: { id: '1_1', user_name: 'learner' }
        }
      });
    };
    return function restore() { adapter.findRecord = original; };
  }

  test('expired token: model() resolves the link_expired sentinel and setupController sets the flag', async function(assert) {
    const store = this.owner.lookup('service:store');
    const route = this.owner.lookup('route:lesson');
    const controller = this.owner.lookup('controller:lesson');
    const restore = stubUnresolvedTokenResponse(store);

    let model;
    try {
      model = await route.model({ lesson_id: '1_777', lesson_code: 'abc123', user_token: 'expiredtoken999' });
    } finally {
      restore();
    }

    assert.ok(model && model.link_expired, 'model() resolves the link_expired sentinel for an expired token');

    route.setupController(controller, model);
    assert.strictEqual(controller.get('link_expired'), true, 'controller.link_expired is true');
    assert.strictEqual(controller.get('model'), model, 'controller.model is set to the sentinel (not left unset)');
  });

  test('malformed token: produces the SAME link_expired outcome as an expired token (UX-05 reason-agnostic)', async function(assert) {
    const store = this.owner.lookup('service:store');
    const route = this.owner.lookup('route:lesson');
    const controller = this.owner.lookup('controller:lesson');
    // api/lessons#show returns the identical tolerant shape for a malformed
    // token as for an expired one -- User.find_by_lesson_share_token(...)
    // returns nil either way, so the same stub covers both.
    const restore = stubUnresolvedTokenResponse(store);

    let model;
    try {
      model = await route.model({ lesson_id: '1_777', lesson_code: 'abc123', user_token: 'not-even-a-real-token-format' });
    } finally {
      restore();
    }

    assert.ok(model && model.link_expired, 'model() resolves the SAME link_expired sentinel for a malformed token');

    route.setupController(controller, model);
    assert.strictEqual(controller.get('link_expired'), true, 'controller.link_expired is true (identical to the expired-token case)');
  });

  test('valid token: model() resolves the real lesson and setup_tracking runs (regression guard)', async function(assert) {
    const store = this.owner.lookup('service:store');
    const route = this.owner.lookup('route:lesson');
    const controller = this.owner.lookup('controller:lesson');
    const requestedId = '1_888:realcode:realtoken777';
    const restore = stubValidTokenResponse(store, requestedId);

    let model;
    try {
      model = await route.model({ lesson_id: '1_888', lesson_code: 'realcode', user_token: 'realtoken777' });
    } finally {
      restore();
    }

    assert.notOk(model && model.link_expired, 'model() does NOT resolve the sentinel for a valid token');
    assert.ok(model && model.get && model.get('user'), 'the resolved record has a `user` block');

    route.setupController(controller, model);
    assert.strictEqual(controller.get('link_expired'), false, 'controller.link_expired is false');
    assert.strictEqual(controller.get('model'), model, 'controller.model is the real lesson record');
    assert.ok(controller.get('started'), 'setup_tracking() ran (started timestamp set), so the lesson still tracks as before');
  });

  test('no stale model after a valid -> expired transition on the same controller (adversary-review guard)', async function(assert) {
    const store = this.owner.lookup('service:store');
    const route = this.owner.lookup('route:lesson');
    const controller = this.owner.lookup('controller:lesson');

    // 1. Valid lesson first.
    const validId = '1_999:validcode:validtoken555';
    const restoreValid = stubValidTokenResponse(store, validId);
    let validModel;
    try {
      validModel = await route.model({ lesson_id: '1_999', lesson_code: 'validcode', user_token: 'validtoken555' });
    } finally {
      restoreValid();
    }
    route.setupController(controller, validModel);
    assert.strictEqual(controller.get('link_expired'), false, 'sanity: starts on the valid lesson, not expired');
    assert.strictEqual(controller.get('model'), validModel, 'sanity: controller.model is the valid lesson record');

    // 2. Same-session transition to an expired-token lesson.
    const restoreExpired = stubUnresolvedTokenResponse(store);
    let expiredModel;
    try {
      expiredModel = await route.model({ lesson_id: '1_222', lesson_code: 'abc123', user_token: 'expiredtoken999' });
    } finally {
      restoreExpired();
    }
    route.setupController(controller, expiredModel);

    assert.strictEqual(controller.get('link_expired'), true, 'controller.link_expired flips to true on the expired transition');
    assert.strictEqual(controller.get('model'), expiredModel, 'controller.model is overwritten with the sentinel -- no stale prior lesson record remains');
    assert.notStrictEqual(controller.get('model'), validModel, 'the prior valid lesson record is no longer the controller model');
  });

  test('genuinely missing lesson: a real 404 rejection is NOT relabeled as link_expired (Codex review finding)', async function(assert) {
    const store = this.owner.lookup('service:store');
    const route = this.owner.lookup('route:lesson');
    const adapter = store.adapterFor('lesson');
    const originalFindRecord = adapter.findRecord;

    adapter.findRecord = function() {
      return RSVP.reject(jsonApiNotFoundError());
    };

    let rejected = false;
    let rejection = null;
    try {
      await route.model({ lesson_id: '1_nonexistent', lesson_code: 'abc123', user_token: 'sometoken' });
    } catch (e) {
      rejected = true;
      rejection = e;
    } finally {
      adapter.findRecord = originalFindRecord;
    }

    assert.ok(rejected, 'model() re-throws a genuine 404 instead of masking it as link_expired');
    assert.ok(rejection && rejection.errors && rejection.errors[0].status === '404',
      'the original 404 error shape is preserved so the normal not-found error path can handle it');
  });

  test('genuinely missing lesson (production fakeXHR error shape): NOT relabeled as link_expired (adversary-review finding)', async function(assert) {
    // The synthetic JSON:API-errors shape above is a defensive second format,
    // not what this app actually produces. adapters/application.js's custom
    // `ajax` override + utils/extras.js's `$.ajax` wrapper reject with a
    // `{ fakeXHR: {...} }` shape (see persistence.js's own existing
    // `err.fakeXHR.status` checks for the same convention). This test proves
    // the fix fires for the shape production actually emits.
    const store = this.owner.lookup('service:store');
    const route = this.owner.lookup('route:lesson');
    const adapter = store.adapterFor('lesson');
    const originalFindRecord = adapter.findRecord;

    adapter.findRecord = function() {
      return RSVP.reject(fakeXhrNotFoundError());
    };

    let rejected = false;
    let rejection = null;
    try {
      await route.model({ lesson_id: '1_nonexistent2', lesson_code: 'abc123', user_token: 'sometoken' });
    } catch (e) {
      rejected = true;
      rejection = e;
    } finally {
      adapter.findRecord = originalFindRecord;
    }

    assert.ok(rejected, 'model() re-throws a genuine 404 in the real production (fakeXHR) error shape');
    assert.ok(rejection && rejection.fakeXHR && rejection.fakeXHR.status === 404,
      'the original fakeXHR error shape is preserved');
  });

  test('transient server error (500): NOT relabeled as link_expired (adversary-review finding)', async function(assert) {
    const store = this.owner.lookup('service:store');
    const route = this.owner.lookup('route:lesson');
    const adapter = store.adapterFor('lesson');
    const originalFindRecord = adapter.findRecord;

    adapter.findRecord = function() {
      return RSVP.reject(fakeXhrServerError());
    };

    let rejected = false;
    let rejection = null;
    try {
      await route.model({ lesson_id: '1_500', lesson_code: 'abc123', user_token: 'sometoken' });
    } catch (e) {
      rejected = true;
      rejection = e;
    } finally {
      adapter.findRecord = originalFindRecord;
    }

    assert.ok(rejected, 'model() re-throws a 500 instead of showing "link expired" for a transient backend failure');
    assert.ok(rejection && rejection.fakeXHR && rejection.fakeXHR.status === 500,
      'the original error is preserved so it can surface to the normal error path / error reporting');
  });

  module('server-side token-validity short-circuit (Codex review High finding)', function(hooks2) {
    // Codex flagged (High): booting the Ember shell unconditionally means the
    // browser always calls findRecord -> Api::LessonsController#show, which
    // renders full lesson content (title/url/description) regardless of
    // token validity -- defeating the "links stop working" promise, since
    // the content is fetched either way, just hidden by CSS/JS. The fix:
    // app/views/boards/index.html.erb now embeds
    // `window.lesson_share_token_valid` (set server-side from the same
    // User.find_by_lesson_share_token result boards_controller#lesson
    // already computed) so this route can skip findRecord ENTIRELY when the
    // token didn't resolve -- no content-fetching API call happens at all.
    hooks2.afterEach(function() {
      delete window.lesson_share_token_valid;
    });

    test('window.lesson_share_token_valid === false: model() never calls findRecord, no content-fetching API call happens', async function(assert) {
      const store = this.owner.lookup('service:store');
      const route = this.owner.lookup('route:lesson');
      const adapter = store.adapterFor('lesson');
      const originalFindRecord = adapter.findRecord;
      let findRecordCalled = false;
      adapter.findRecord = function() {
        findRecordCalled = true;
        return RSVP.resolve({ lesson: { id: '1_777', title: 'Some Lesson', url: 'https://example.com/lesson' } });
      };

      window.lesson_share_token_valid = false;
      let model;
      try {
        model = await route.model({ lesson_id: '1_777', lesson_code: 'abc123', user_token: 'expiredtoken999' });
      } finally {
        adapter.findRecord = originalFindRecord;
      }

      assert.notOk(findRecordCalled, 'findRecord was NEVER called -- no lesson content was fetched from the API for an unresolved token');
      assert.ok(model && model.link_expired, 'model() resolves the link_expired sentinel immediately from the server-side flag');
    });

    test('window.lesson_share_token_valid is consumed (one-shot): a later same-session transition falls through to normal findRecord detection', async function(assert) {
      const store = this.owner.lookup('service:store');
      const route = this.owner.lookup('route:lesson');
      const adapter = store.adapterFor('lesson');
      const originalFindRecord = adapter.findRecord;
      let findRecordCallCount = 0;
      adapter.findRecord = function() {
        findRecordCallCount += 1;
        return RSVP.resolve({
          lesson: { id: '1_888:realcode:realtoken777', title: 'A Real Lesson', url: 'https://example.com/real-lesson', user: { id: '1_1', user_name: 'learner' } }
        });
      };

      // First transition: server-side flag says the token IS valid (true), so model() must still
      // proceed to findRecord (the flag only short-circuits the FALSE case).
      window.lesson_share_token_valid = true;
      let firstModel;
      try {
        firstModel = await route.model({ lesson_id: '1_888', lesson_code: 'realcode', user_token: 'realtoken777' });
      } finally {
        adapter.findRecord = originalFindRecord;
      }
      assert.strictEqual(findRecordCallCount, 1, 'findRecord IS called when the server-side flag is true');
      assert.notOk(firstModel && firstModel.link_expired, 'a valid token still resolves the real lesson');
      assert.strictEqual(window.lesson_share_token_valid, undefined, 'the one-shot flag is consumed (cleared) after the first read');

      // Second, same-session transition: no flag is set anymore (consumed above), so this must
      // fall through to the normal resolve/reject detection, not be affected by the first
      // transition's now-stale flag value.
      const restore = stubUnresolvedTokenResponse(store);
      let secondModel;
      try {
        secondModel = await route.model({ lesson_id: '1_777', lesson_code: 'abc123', user_token: 'expiredtoken999' });
      } finally {
        restore();
      }
      assert.ok(secondModel && secondModel.link_expired, 'a later transition to an unresolved-token lesson still correctly resolves link_expired via the normal (non-flag) path');
    });

    test('window.lesson_share_token_valid unset (undefined): falls through to normal findRecord-based detection unaffected', async function(assert) {
      const store = this.owner.lookup('service:store');
      const route = this.owner.lookup('route:lesson');
      const restore = stubUnresolvedTokenResponse(store);

      let model;
      try {
        model = await route.model({ lesson_id: '1_777', lesson_code: 'abc123', user_token: 'expiredtoken999' });
      } finally {
        restore();
      }

      assert.ok(model && model.link_expired, 'with no server-side flag set, the existing resolve-with-no-user detection still works');
    });
  });
});
