import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { roomsOrgId, showsRoomsPill, supervisedRooms } from 'frontend/utils/rooms_nav';

/* ONE READING OF THE USER, FOUR CONSUMERS. components/user-pill-nav draws the pill,
 * controllers/application decides whether the nav renders on the rooms page,
 * components/account-rail decides whether its Home row lights there, and utils/primary_nav
 * takes the answer as a gate. A second reading anywhere means the nav can offer Rooms on a
 * page that does not draw it, or draw it on a page the nav does not offer -- which is the
 * failure `utils/primary_nav`'s own test exists to stop.
 */
module('Unit | Utility | rooms_nav', function() {
  var user = function(attrs) { return EmberObject.create(attrs || {}); };
  var room = function(name, org) { return { id: name, name: name, organization_id: org }; };

  test('a supervisor with rooms and no managed org gets the pill', function(assert) {
    assert.expect(2);
    var u = user({ supervised_units: [room('Birch', '1_5')] });
    assert.true(showsRoomsPill(u), 'the pill shows');
    assert.strictEqual(roomsOrgId(u), '1_5', 'and points at that room\'s organization');
  });

  /* The two pills share a slot, so this gate and the Organizations gate are opposite sides of
     one condition. A manager who ALSO supervises rooms must get Organizations, not both. */
  test('a manager gets Organizations instead, even when they supervise rooms', function(assert) {
    assert.expect(1);
    assert.false(showsRoomsPill(user({
      has_management_responsibility: true,
      supervised_units: [room('Birch', '1_5')]
    })), 'management responsibility wins the slot');
  });

  /* A LinkTo with no model throws rather than degrading, so a destination is part of the gate
     and not a lookup afterwards. */
  test('no rooms, or rooms with no organization, is no pill', function(assert) {
    assert.expect(4);
    assert.false(showsRoomsPill(user({ supervised_units: [] })), 'empty list');
    assert.false(showsRoomsPill(user({})), 'no list at all');
    assert.false(showsRoomsPill(user({ supervised_units: [{ id: 'x', name: 'Orphan' }] })),
      'a unit with no organization_id has nowhere to link to');
    assert.false(showsRoomsPill(null), 'no user at all, e.g. before the session resolves');
  });

  /* ORDER DECIDES THE DESTINATION, so it is stated here rather than left to the order the
     server serialised. The Basic rail and the Modern Rooms card sort the same way; if this
     drifted, the three would open different organisations from the same room list. */
  test('the destination is the first room by name, not by payload order', function(assert) {
    assert.expect(2);
    var u = user({ supervised_units: [room('Willow', '1_9'), room('Aspen', '1_2')] });
    assert.deepEqual(supervisedRooms(u).map(function(r) { return r.name; }),
      ['Aspen', 'Willow'], 'sorted by name');
    assert.strictEqual(roomsOrgId(u), '1_2', 'so the pill opens Aspen\'s organization');
  });

  /* Reads through `get`, so a plain object from a fixture or a test literal answers the same
     as the real user record. */
  test('a plain object answers the same as a user record', function(assert) {
    assert.expect(1);
    assert.true(showsRoomsPill({ supervised_units: [room('Birch', '1_5')] }),
      'no EmberObject required');
  });
});
