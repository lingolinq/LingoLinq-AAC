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
import { } from 'frontend/tests/helpers/ember_helper';
import LingoLinq from '../../app';
import speecher from '../../utils/speecher';
import persistence from '../../utils/persistence';

describe('Unit', function() {
  describe("supervisor_count", function() {
    it("should return the correct count", function() {
      var u = LingoLinq.store.createRecord('unit');
      expect(u.get('supervisor_count')).toEqual(0);
      u.set('supervisors', []);
      expect(u.get('supervisor_count')).toEqual(0);
      u.set('supervisors', [{}, {}]);
      expect(u.get('supervisor_count')).toEqual(2);
      u.set('supervisors', null);
      expect(u.get('supervisor_count')).toEqual(0);
    });
  });

  describe("communicator_count", function() {
    it("should return the correct count", function() {
      var u = LingoLinq.store.createRecord('unit');
      expect(u.get('communicator_count')).toEqual(0);
      u.set('communicators', []);
      expect(u.get('communicator_count')).toEqual(0);
      u.set('communicators', [{}, {}]);
      expect(u.get('communicator_count')).toEqual(2);
      u.set('communicators', null);
      expect(u.get('communicator_count')).toEqual(0);
    });
  });
});
