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

describe('Log', function() {
  describe("minutes", function() {
    it("should not error on empty value", function() {
      var log = LingoLinq.store.createRecord('log', {});
      expect(log.get('minutes')).toEqual(0);
    });
    it("should return filename if found in URL path, ignoring query params", function() {
      var log = LingoLinq.store.createRecord('log', {duration: 100});
      expect(log.get('minutes')).toEqual(2);
      log.set('duration', 300);
      expect(log.get('minutes')).toEqual(5);
    });
  });

  describe("goal_status_class", function() {
    it('should return the correct class', function() {
      var log = LingoLinq.store.createRecord('log');

      expect(log.get('goal_status_class')).toEqual('');

      log.set('goal', {});
      expect(log.get('goal_status_class')).toEqual('');

      log.set('goal', {status: 1});
      expect(log.get('goal_status_class')).toEqual('face sad');

      log.set('goal', {status: 2});
      expect(log.get('goal_status_class')).toEqual('face neutral');

      log.set('goal', {status: 3});
      expect(log.get('goal_status_class')).toEqual('face happy');

      log.set('goal', {status: 4});
      expect(log.get('goal_status_class')).toEqual('face laugh');

      log.set('goal', {status: 5});
      expect(log.get('goal_status_class')).toEqual('');
    });
  });

  describe("daily_use_history", function() {
    it('should return the correct value', function() {
      var l = LingoLinq.store.createRecord('log');
      expect(l.get('daily_use_history')).toEqual(null);
      l.set('daily_use', []);
      expect(l.get('daily_use_history')).toEqual(null);
      var moment = window.moment;
      stub(window, 'moment', function(str) {
        if(str) {
          return moment(str);
        } else {
          return moment('2016-12-19');
        }
      });
      l.set('daily_use', [
        {date: '2016-11-01', active: true},
        {date: '2016-11-20', active: false}
      ]);
      expect(l.get('daily_use_history').length).toEqual(49);
      expect(l.get('daily_use_history')[0].date).toEqual('2016-11-01');
      expect(l.get('daily_use_history')[0].active).toEqual(true);
      expect(l.get('daily_use_history')[1].date).toEqual('2016-11-02');
      expect(l.get('daily_use_history')[1].active).toEqual(undefined);
      expect(l.get('daily_use_history')[19].date).toEqual('2016-11-20');
      expect(l.get('daily_use_history')[19].active).toEqual(false);
    });
  });
});
