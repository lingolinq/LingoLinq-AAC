import DS from 'ember-data';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  waitsFor,
  runs,
  stub
} from 'frontend/tests/helpers/jasmine';
import { queryLog } from 'frontend/tests/helpers/ember_helper';
import LingoLinq from '../../app';
import persistence from '../../utils/persistence';
import modal from '../../utils/modal';
import Button from '../../utils/button';

describe('Boardversion', function() {
  it("should check recent", function() {
    var bv = LingoLinq.store.createRecord('boardversion');
    var date = window.moment().add(-5, 'day').toDate();
    bv.set('created', date);
    expect(bv.get('recent')).toEqual(true);
    date = window.moment().add(-10, 'day').toDate();
    bv.set('created', date);
    expect(bv.get('recent')).toEqual(false);
  });

  describe("button_labels_list", function() {
    it("should return correct values", function() {
      var bv = LingoLinq.store.createRecord('boardversion');
      expect(bv.get('button_labels_list')).toEqual('');
      bv.set('button_labels', []);
      expect(bv.get('button_labels_list')).toEqual('');
      bv.set('button_labels', ['asdf', 'jkl']);
      expect(bv.get('button_labels_list')).toEqual('asdf, jkl');
    });
  });
});
