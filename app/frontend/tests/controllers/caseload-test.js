import {
  describe,
  it,
  expect,
  stub
} from 'frontend/tests/helpers/jasmine';
import { queryLog } from 'frontend/tests/helpers/ember_helper';
import EmberObject from '@ember/object';
import modal from '../../utils/modal';

describe('CaseloadController', 'controller:caseload', function() {
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
    this.set('model', model);
    stub(modal, 'open', function(template, options) {
      opened = { template: template, options: options };
    });

    this.send('modeling_ideas');

    expect(opened.template).toEqual('modals/modeling-ideas');
    expect(opened.options.users).toEqual([model]);
  });
});
