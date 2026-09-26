import { module, test } from 'qunit';
import { badge_snapshot } from 'frontend/utils/badge_display';

/* WHY THIS EXISTS (2026-09-25). The dashboard writes the "best next badge" onto each entry of
 * `user.supervisees` so the caseload and classic home cards can show it. `supervisees` is
 * `attr('raw')` (app/models/user.js:183) -- a plain JSON payload that
 * `services/persistence.js:706` hands to local storage BY REFERENCE, where
 * `app/utils/dbman.js:158` JSON.stringify's it. The value written was a live Ember Data Badge
 * record, whose `.store` points at the Ember Data Store, whose `notifications` points back at
 * the store: `JSON.stringify` threw "Converting circular structure to JSON" and the user record
 * silently never reached local storage.
 *
 * Measured in the browser before this was written, on the home page, twice per load:
 *   $.supervisees.0.current_badge.store => Store
 *
 * So the invariant under test is not "the snapshot has the right fields" but "whatever goes onto
 * a raw payload survives JSON.stringify". The fourth test is the one tied to the mechanism; it
 * fails on a record passed through unchanged, which is exactly what the code did. */
module('Unit | Utility | badge_display', function() {
  // A stand-in for a materialised Badge. Two details are deliberate, both from the red-team
  // review of this test:
  //   - THE DISPLAY FIELDS ARE REACHABLE ONLY THROUGH `get()`, held in a closure rather than
  //     assigned as own properties. On a real Ember Data 5.3 record the attributes are
  //     prototype getters, so a stub that also carries them as own keys lets an implementation
  //     built on `Object.assign` pass here and copy nothing at all in production.
  //   - `___recordState` CARRIES THE CIRCLE TOO, under a name no implementation can know. A
  //     denylist (`delete store; delete _secretInit`) therefore still throws, which is the
  //     point: only an allowlist can pass.
  var record_like = function(attrs) {
    var store = { notifications: {} };
    store.notifications.store = store;
    var rec = { store: store, _secretInit: { store: store }, ___recordState: { store: store } };
    rec.get = function(k) { return attrs[k]; };
    return rec;
  };

  test('no badge yields null rather than an empty object', function(assert) {
    assert.strictEqual(badge_snapshot(null), null);
    assert.strictEqual(badge_snapshot(undefined), null);
  });

  test('reads through get() on a record', function(assert) {
    var snap = badge_snapshot(record_like({ id: '9', name: 'Talker', image_url: '/b.png', progress: 0.4 }));
    assert.strictEqual(snap.id, '9');
    assert.strictEqual(snap.name, 'Talker');
    assert.strictEqual(snap.image_url, '/b.png');
    assert.strictEqual(snap.progress, 0.4);
  });

  test('reads a plain object too, so a re-snapshot is not a special case', function(assert) {
    var snap = badge_snapshot({ id: '3', name: 'Starter', image_url: '/a.png', progress: 1 });
    assert.strictEqual(snap.id, '3');
    assert.strictEqual(snap.name, 'Starter');
    assert.strictEqual(snap.image_url, '/a.png');
    assert.strictEqual(snap.progress, 1);
  });

  test('THE MECHANISM: the result survives JSON.stringify on a payload that reached the store', function(assert) {
    var supervisees = [{ id: '1_1170', user_name: 'someone' }];
    supervisees[0].current_badge = badge_snapshot(record_like({ id: '9', name: 'Talker', image_url: '/b.png', progress: 0.4 }));
    var json = null;
    try {
      json = JSON.stringify({ supervisees: supervisees });
    } catch (e) {
      assert.ok(false, 'threw: ' + e.message);
    }
    assert.ok(json && json.indexOf('Talker') > -1, 'the badge is still there to render');
    assert.ok(json && json.indexOf('notifications') === -1, 'and the store did not ride along');
  });

  test('is an allowlist: exactly the four fields the consumers read, and nothing else', function(assert) {
    var snap = badge_snapshot(record_like({ id: '9', name: 'Talker', image_url: '/b.png', progress: 0.4 }));
    // THE ASSERTION THAT FORCES AN ALLOWLIST. Without it, "copy everything then delete the keys
    // I know about" passes the whole module and still ships the bug, because a record's internal
    // properties are not limited to the ones this test happens to name.
    assert.deepEqual(Object.keys(snap).sort(), ['id', 'image_url', 'name', 'progress']);
    assert.strictEqual(snap.store, undefined);
    assert.strictEqual(snap._secretInit, undefined);
    assert.strictEqual(snap.___recordState, undefined);
    Object.keys(snap).forEach(function(k) {
      assert.notStrictEqual(typeof snap[k], 'function', k + ' is not a function');
    });
  });
});
