import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

/* ARRIVING FROM THE UPDATES PILL RETIRES YOUR OWN BADGE (section 24 of
 * docs/task-management/2026-11-10_offline-followup-proposals.md). currentUser and the page's user can be the records
 * keyed 'self' and by the real id of one person; the own-log check compares people by backend id
 * (utils/backend_user_id.js same_person), and a supporter on someone else's log still never clears it. */
module('Unit | Route | user/logs backend ids', function(hooks) {
  setupTest(hooks);
  hooks.afterEach(function() { restoreStubs(); });

  function arrive(context, me, page) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ currentUser: me, sessionUser: me }));
    var route = context.owner.lookup('route:user/logs');
    stub(route, 'modelFor', function() { return page; });
    var controller = EmberObject.create({ nav: 'home', send: function() {} });
    route.setupController(controller, page);
  }
  function person(id) {
    return EmberObject.create({ id: id, global_id: '1_3', read_notifications: false, save: function() { return Promise.resolve(this); } });
  }

  test('your own log marks updates read while currentUser is keyed self', function(assert) {
    var me = person('self');
    arrive(this, me, person('1_3'));
    assert.true(me.get('read_notifications'));
  });

  test('a genuinely different person\'s log leaves your badge alone', function(assert) {
    var me = person('self');
    arrive(this, me, EmberObject.create({ id: '1_7', global_id: '1_7' }));
    assert.false(me.get('read_notifications'));
  });
});
