import {
  describe,
  it,
  expect,
  beforeEach,
  waitsFor,
  runs,
  stub
} from 'frontend/tests/helpers/jasmine';
import 'frontend/tests/helpers/ember_helper';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import modal from 'frontend/utils/modal';

describe('OrganizationsController', 'controller:organizations', function() {
  var testOwner;

  beforeEach(function() {
    testOwner = this.owner;
  });

  function makeController(adminAccess, attrs) {
    var controller = testOwner.factoryFor('controller:organizations').create();
    // has_admin_access is computed from all_orgs — drive it via that dependency.
    controller.set('app_state', EmberObject.create({
      currentUser: EmberObject.create({
        organizations: adminAccess
          ? [{id: '1', admin: true, full_manager: true, type: 'manager'}]
          : [{id: '2', admin: false, full_manager: false, type: 'manager'}]
      })
    }));
    Object.keys(attrs || {}).forEach(function(key) {
      controller.set(key, attrs[key]);
    });
    return controller;
  }

  it('should exist', function() {
    expect(this).not.toEqual(null);
  });

  it('find_user no-op without has_admin_access', function() {
    var queried = false;
    var controller = makeController(false, {
      search_user: 'someone',
      store: EmberObject.create({
        query: function() { queried = true; return RSVP.resolve({slice: function() { return []; }}); }
      })
    });
    expect(controller.get('has_admin_access')).toEqual(false);
    controller.send('find_user');
    expect(queried).toEqual(false);
  });

  it('find_user queries globally when has_admin_access', function() {
    var opts = null;
    var controller = makeController(true, {
      search_user: 'lingolinq_admin',
      store: EmberObject.create({
        query: function(type, query) {
          opts = {type: type, query: query};
          return RSVP.resolve({slice: function() { return []; }});
        }
      }),
      router: EmberObject.create({transitionTo: function() {}})
    });
    expect(controller.get('has_admin_access')).toEqual(true);
    controller.send('find_user');
    expect(opts).not.toEqual(null);
    expect(opts.type).toEqual('user');
    expect(opts.query.q).toEqual('lingolinq_admin');
    expect(opts.query.org_id).toEqual(undefined);
  });

  it('find_user opens results modal for an exact single username match', function() {
    var opened = null;
    stub(modal, 'open', function(template, opts) {
      opened = {template: template, opts: opts};
    });
    var controller = makeController(true, {
      search_user: 'alice',
      store: EmberObject.create({
        query: function() {
          return RSVP.resolve({
            slice: function() {
              return [EmberObject.create({user_name: 'alice'})];
            }
          });
        }
      }),
      router: EmberObject.create({transitionTo: function() {}})
    });
    controller.send('find_user');
    waitsFor(function() { return !!opened; });
    runs(function() {
      expect(opened.template).toEqual('user-results');
      expect(opened.opts.q).toEqual('alice');
      expect(opened.opts.list.length).toEqual(1);
    });
  });

  it('find_user opens results modal for a single partial match', function() {
    var opened = null;
    stub(modal, 'open', function(template, opts) {
      opened = {template: template, opts: opts};
    });
    var controller = makeController(true, {
      search_user: 'melissa',
      store: EmberObject.create({
        query: function() {
          return RSVP.resolve({
            slice: function() {
              return [EmberObject.create({user_name: 'melissao'})];
            }
          });
        }
      }),
      router: EmberObject.create({transitionTo: function() {}})
    });
    controller.send('find_user');
    waitsFor(function() { return !!opened; });
    runs(function() {
      expect(opened.template).toEqual('user-results');
      expect(opened.opts.q).toEqual('melissa');
    });
  });

  it('search_user_keydown Enter triggers find_user', function() {
    var findCalled = false;
    var controller = makeController(true, {
      search_user: 'x',
      store: EmberObject.create({
        query: function() {
          findCalled = true;
          return RSVP.resolve({slice: function() { return []; }});
        }
      }),
      router: EmberObject.create({transitionTo: function() {}})
    });
    controller.search_user_keydown({key: 'Enter', preventDefault: function() {}});
    expect(findCalled).toEqual(true);
  });
});
