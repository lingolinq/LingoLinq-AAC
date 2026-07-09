import {
  describe,
  it,
  expect,
  beforeEach,
  stub
} from 'frontend/tests/helpers/jasmine';
import 'frontend/tests/helpers/ember_helper';
import EmberObject from '@ember/object';
import modal from '../../utils/modal';

describe('CaseloadController', 'controller:caseload', function() {
  var testOwner;

  beforeEach(function() {
    testOwner = this.owner;
  });

  it("should exist", function() {
    expect(this).not.toEqual(null);
    expect(this).not.toEqual(window);
  });

  it("opens modeling ideas for the current user when known supervisees are not loaded", function() {
    var opened = null;
    var model = EmberObject.create({
      supervisees: [{ user_name: 'supervisee' }],
      known_supervisees: []
    });
    var controller = testOwner.lookup('controller:caseload');
    controller.set('model', model);
    stub(modal, 'open', function(template, options) {
      opened = { template: template, options: options };
    });

    controller.send('modeling_ideas');

    expect(opened.template).toEqual('modals/modeling-ideas');
    expect(opened.options.users).toEqual([model]);
  });
});
