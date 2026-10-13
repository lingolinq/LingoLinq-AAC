import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* A SEARCH FILTER ON THE ROOMS PAGE (requested 2026-10-01). Supervisors see their own rooms
 * (`ownRooms`, by name); managers see every room with its people (`units`), so their filter also
 * matches a supervisor's or communicator's user name, to find the room someone is in. The
 * controller is a singleton, so leaving the page clears the filter (the caseload had that leak).
 */
module('Unit | Controller | organization rooms filter', function(hooks) {
  setupTest(hooks);

  function controller(context, units) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: EmberObject.create({ supervised_units: units || [] })
    }));
    var c = context.owner.lookup('controller:organization/rooms');
    c.set('model', EmberObject.create({ id: '1_1', permissions: { view: true } }));
    return c;
  }

  function names(list) { return (list || []).map(function(r) { return r.get ? r.get('name') : r.name; }); }

  test('a supervisor\'s rooms filter by name, ignoring case', function(assert) {
    var c = controller(this, [
      { id: '1_10', name: 'Room 2 - Speech', organization_id: '1_1' },
      { id: '1_11', name: 'Room 10 - Motor', organization_id: '1_1' }
    ]);
    assert.deepEqual(names(c.get('filteredOwnRooms')), ['Room 2 - Speech', 'Room 10 - Motor'], 'all, in the existing order, with no filter');
    c.set('roomFilter', '  speech ');
    assert.deepEqual(names(c.get('filteredOwnRooms')), ['Room 2 - Speech']);
  });

  test('a manager\'s rooms filter by room name or by a person in the room', function(assert) {
    var c = controller(this);
    c.set('units', [
      EmberObject.create({ id: 'u1', name: 'Blue Room', supervisors: [{ user_name: 'slp_ana' }], communicators: [{ user_name: 'aiden_parker' }] }),
      EmberObject.create({ id: 'u2', name: 'Green Room', supervisors: [{ user_name: 'slp_ben' }], communicators: [] })
    ]);
    c.set('roomFilter', 'green');
    assert.deepEqual(names(c.get('filteredUnits')), ['Green Room'], 'by room name');
    c.set('roomFilter', 'AIDEN');
    assert.deepEqual(names(c.get('filteredUnits')), ['Blue Room'], 'by a communicator');
    c.set('roomFilter', 'slp_ben');
    assert.deepEqual(names(c.get('filteredUnits')), ['Green Room'], 'by a supervisor');
    c.set('roomFilter', 'nobody');
    assert.deepEqual(names(c.get('filteredUnits')), [], 'no match');
  });

  test('the filter shows only when there is more than one room, or while it is in use', function(assert) {
    var c = controller(this, [{ id: '1_10', name: 'Only Room', organization_id: '1_1' }]);
    assert.false(c.get('showRoomFilter'), 'one room: nothing to filter');
    c.set('roomFilter', 'x');
    assert.true(c.get('showRoomFilter'), 'kept while a filter is set, so it can be cleared');
  });

  test('leaving the page clears the filter', function(assert) {
    var c = controller(this);
    c.set('roomFilter', 'speech');
    this.owner.lookup('route:organization/rooms').resetController(c, true);
    assert.strictEqual(c.get('roomFilter'), '');
  });
});
