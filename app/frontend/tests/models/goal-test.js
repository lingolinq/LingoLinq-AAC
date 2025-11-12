import DS from 'ember-data';
import RSVP from 'rsvp';
import EmberObject from '@ember/object';
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
import $ from 'jquery';

describe('Goal', function() {
  var fixed_moment = function() { return window.moment('2015-11-01'); };
  beforeEach(function() {
    var mm = window.moment;
    stub(window, 'moment', function(a, b) {
      if(a || b) {
        return mm(a, b);
      } else {
        return mm('2015-11-01');
      }
    });
  });
  var empty = {
    monthly: {
      totals: {
        statuses: [],
        sessions: 0
      }
    },
    weekly: {
      totals: {
        statuses: [],
        sessions: 0
      }
    },
    daily: {
      totals: {
        statuses: [],
        sessions: 0
      }
    }
  };
  var today = fixed_moment();
  var day1 = fixed_moment().add(-1, 'day');
  var day2 = fixed_moment().add(-3, 'day');
  var day3 = fixed_moment().add(-4, 'day');
  var recent_daily = $.extend(true, {}, empty);
  recent_daily.daily[day1.toISOString().substring(0, 10)] = {
    statuses: [3],
    sessions: 1
  };
  recent_daily.daily[day2.toISOString().substring(0, 10)] = {
    statuses: [4, 2],
    sessions: 2
  };
  recent_daily.daily[day3.toISOString().substring(0, 10)] = {
    statuses: [1],
    sessions: 1
  };
  recent_daily.weekly[day1.format('GGGG-WW')] = {
    statuses: [3, 4, 2, 1],
    sessions: 4
  };
  recent_daily.monthly[day1.toISOString().substring(0, 7)] = {
    statuses: [3, 4, 2, 1],
    sessions: 4
  };
  recent_daily.daily.totals = {sessions: 4, statuses: [3, 4, 2, 1]};
  recent_daily.weekly.totals = {sessions: 4, statuses: [3, 4, 2, 1]};
  recent_daily.monthly.totals = {sessions: 4, statuses: [3, 4, 2, 1]};

  var day4 = fixed_moment().add(-11, 'day');
  var day5 = fixed_moment().add(-16, 'day');
  var recent_weekly = $.extend(true, {}, empty);
  recent_weekly.daily[day1.toISOString().substring(0, 10)] = {
    statuses: [1],
    sessions: 1
  };
  recent_weekly.daily[day4.toISOString().substring(0, 10)] = {
    statuses: [4],
    sessions: 1
  };
  recent_weekly.daily[day5.toISOString().substring(0, 10)] = {
    statuses: [4, 3, 2],
    sessions: 3
  };
  recent_weekly.weekly[day1.format('GGGG-WW')] = {
    statuses: [1],
    sessions: 1
  };
  recent_weekly.weekly[day4.format('GGGG-WW')] = {
    statuses: [4, 4, 3, 2],
    sessions: 4
  };
  recent_weekly.monthly[day1.toISOString().substring(0, 7)] = {
    statuses: [1, 4, 4, 3, 2],
    sessions: 5
  };
  recent_weekly.daily.totals = {sessions: 2, statuses: [1, 4]};
  recent_weekly.weekly.totals = {sessions: 5, statuses: [1, 4, 4, 3, 2]};
  recent_weekly.monthly.totals = {sessions: 5, statuses: [1, 4, 4, 3, 2]};

  var day6 = fixed_moment().add(-50, 'day');
  var day7 = fixed_moment().add(-100, 'day');
  var recent_monthly = $.extend(true, {}, empty);
  recent_monthly.daily[day1.toISOString().substring(0, 10)] = {
    statuses: [1, 2],
    sessions: 2
  };
  recent_monthly.daily[day4.toISOString().substring(0, 10)] = {
    statuses: [4],
    sessions: 1
  };
  recent_monthly.weekly[day1.format('GGGG-WW')] = {
    statuses: [1, 2, 4],
    sessions: 3
  };
  recent_monthly.weekly[day5.format('GGGG-WW')] = {
    statuses: [3, 3, 3, 3],
    sessions: 4
  };
  recent_monthly.monthly[day1.toISOString().substring(0, 7)] = {
    statuses: [1, 2, 4, 3, 3, 3, 3],
    sessions: 7
  };
  recent_monthly.monthly[day6.toISOString().substring(0, 7)] = {
    statuses: [3, 2, 3],
    sessions: 3
  };
  recent_monthly.monthly[day7.toISOString().substring(0, 7)] = {
    statuses: [4],
    sessions: 1
  };
  recent_monthly.daily.totals = {sessions: 3, statuses: [1, 2, 4]};
  recent_monthly.weekly.totals = {sessions: 7, statuses: [1, 2, 4, 3, 3, 3, 3]};
  recent_monthly.monthly.totals = {sessions: 11, statuses: [1, 2, 4, 3, 3, 3, 3, 3, 2, 3, 4]};

  var day8 = fixed_moment().add(-500, 'day');
  var day9 = fixed_moment().add(-501, 'day');
  var old_daily = $.extend(true, {}, empty);
  old_daily.daily[day8.toISOString().substring(0, 10)] = {
    statuses: [1, 4],
    sessions: 2
  };
  old_daily.daily[day9.toISOString().substring(0, 10)] = {
    statuses: [3],
    sessions: 1
  };
  old_daily.weekly[day8.format('GGGG-WW')] = {
    statuses: [1, 4, 3],
    sessions: 3
  };
  old_daily.monthly[day8.toISOString().substring(0, 7)] = {
    statuses: [1, 4, 3],
    sessions: 3
  };
  old_daily.daily.totals = {sessions: 3, statuses: [1, 4, 3]};
  old_daily.weekly.totals = {sessions: 3, statuses: [1, 4, 3]};
  old_daily.monthly.totals = {sessions: 3, statuses: [1, 4, 3]};

  var old_weekly = $.extend(true, {}, empty);
  var day10 = fixed_moment().add(-510, 'day');
  var day11 = fixed_moment().add(-520, 'day');
  old_weekly.daily[day8.toISOString().substring(0, 10)] = {
    statuses: [3],
    sessions: 1
  };
  old_weekly.daily[day9.toISOString().substring(0, 10)] = {
    statuses: [1, 2],
    sessions: 2
  };
  old_weekly.daily[day10.toISOString().substring(0, 10)] = {
    statuses: [3, 3, 3],
    sessions: 3
  };
  old_weekly.daily[day11.toISOString().substring(0, 10)] = {
    statuses: [4],
    sessions: 1
  };
  old_weekly.weekly[day8.format('GGGG-WW')] = {
    statuses: [3, 1, 2],
    sessions: 3
  };
  old_weekly.weekly[day10.format('GGGG-WW')] = {
    statuses: [3, 3, 3],
    sessions: 3
  };
  old_weekly.weekly[day11.format('GGGG-WW')] = {
    statuses: [4],
    sessions: 1
  };
  old_weekly.monthly[day8.toISOString().substring(0, 7)] = {
    statuses: [3, 1, 2, 3, 3, 3, 4],
    sessions: 7
  };
  old_weekly.daily.totals = {sessions: 6, statuses: [3, 1, 2, 3, 3, 3]};
  old_weekly.weekly.totals = {sessions: 7, statuses: [3, 1, 2, 3, 3, 3, 4]};
  old_weekly.monthly.totals = {sessions: 7, statuses: [3, 1, 2, 3, 3, 3, 4]};

  var day12 = fixed_moment().add(-550, 'day');
  var old_monthly = $.extend(true, {}, empty);
  old_monthly.daily[day8.toISOString().substring(0, 10)] = {
    statuses: [3, 1],
    sessions: 2
  };
  old_monthly.weekly[day8.format('GGGG-WW')] = {
    statuses: [3, 1],
    sessions: 2
  };
  old_monthly.weekly[day10.format('GGGG-WW')] = {
    statuses: [4, 4, 3, 2, 4],
    sessions: 5
  };
  old_monthly.monthly[day8.toISOString().substring(0, 7)] = {
    statuses: [3, 1, 4, 4, 3, 2, 4],
    sessions: 7
  };
  old_monthly.monthly[day12.toISOString().substring(0, 7)] = {
    statuses: [3, 2, 4, 2, 4],
    sessions: 5
  };
  old_monthly.daily.totals = {sessions: 2, statuses: [3, 1]};
  old_monthly.weekly.totals = {sessions: 7, statuses: [3, 1, 4, 4, 3, 2, 4]};
  old_monthly.monthly.totals = {sessions: 12, statuses: [3, 1, 4, 4, 3, 2, 4, 3, 2, 4, 2, 4]};

  var empty = $.extend(true, {}, empty);

  it("should calculate best_time_level", function() {
    var goal = LingoLinq.store.createRecord('goal');
    goal.set('stats', empty);
    expect(goal.get('best_time_level')).toEqual('none');

    goal.set('stats', recent_daily);
    expect(goal.get('best_time_level')).toEqual('daily');

    goal.set('stats', recent_weekly);
    expect(goal.get('best_time_level')).toEqual('weekly');

    goal.set('stats', recent_monthly);
    expect(goal.get('best_time_level')).toEqual('monthly');

    goal.set('stats', old_daily);
    expect(goal.get('best_time_level')).toEqual('monthly');

    goal.set('stats', old_weekly);
    expect(goal.get('best_time_level')).toEqual('monthly');

    goal.set('stats', old_monthly);
    expect(goal.get('best_time_level')).toEqual('monthly');
  });

  it("should calculate time_units", function() {
    var goal = LingoLinq.store.createRecord('goal');
    goal.get('stats', empty);
    expect(goal.get('time_units')).toEqual([]);

    goal.set('stats', recent_daily);
    expect(goal.get('time_units').length).toEqual(5);
    expect(goal.get('time_units')[4]).toEqual({
      key: today.toISOString().substring(0, 10),
      label: today.toISOString().substring(0, 10),
      max_statuses: 0,
      sessions: 0
    });
    expect(goal.get('time_units')[3]).toEqual({
      key: day1.toISOString().substring(0, 10),
      label: day1.toISOString().substring(0, 10),
      max_statuses: 1,
      sessions: 1
    });
    expect(goal.get('time_units')[1]).toEqual({
      key: day2.toISOString().substring(0, 10),
      label: day2.toISOString().substring(0, 10),
      max_statuses: 1,
      sessions: 2
    });

    goal.set('stats', recent_weekly);
    expect(goal.get('time_units').length).toEqual(4);
    expect(goal.get('time_units')[2]).toEqual({
      key: day1.format('GGGG-WW'),
      label: day1.clone().weekday(0).toISOString().substring(0, 10),
      max_statuses: 1,
      sessions: 1
    });
    expect(goal.get('time_units')[1]).toEqual({
      key: day4.format('GGGG-WW'),
      label: day4.clone().weekday(0).toISOString().substring(0, 10),
      max_statuses: 2,
      sessions: 4
    });

    goal.set('stats', recent_monthly);
    expect(goal.get('time_units').length).toEqual(4);
    expect(goal.get('time_units')[0]).toEqual({
      key: day7.toISOString().substring(0, 7),
      label: day7.toISOString().substring(0, 7) + '-01',
      max_statuses: 1,
      sessions: 1
    });
    expect(goal.get('time_units')[3]).toEqual({
      key: day1.toISOString().substring(0, 7),
      label: day1.toISOString().substring(0, 7) + '-01',
      max_statuses: 4,
      sessions: 7
    });

    goal.set('stats', old_daily);
    expect(goal.get('time_units').length).toEqual(4);
    expect(goal.get('time_units')[3]).toEqual({
      key: day8.toISOString().substring(0, 7),
      label: day8.toISOString().substring(0, 7) + '-01',
      max_statuses: 1,
      sessions: 3
    });

    goal.set('stats', old_weekly);
    expect(goal.get('time_units').length).toEqual(4);
    expect(goal.get('time_units')[3]).toEqual({
      key: day8.toISOString().substring(0, 7),
      label: day8.toISOString().substring(0, 7) + '-01',
      max_statuses: 4,
      sessions: 7
    });

    goal.set('stats', old_monthly);
    expect(goal.get('time_units').length).toEqual(4);
    expect(goal.get('time_units')[3]).toEqual({
      key: day8.toISOString().substring(0, 7),
      label: day8.toISOString().substring(0, 7) + '-01',
      max_statuses: 3,
      sessions: 7
    });
    expect(goal.get('time_units')[1]).toEqual({
      key: day12.toISOString().substring(0, 7),
      label: day12.toISOString().substring(0, 7) + '-01',
      max_statuses: 2,
      sessions: 5
    });
  });

  it("should return the correct unit_description", function() {
    var goal = LingoLinq.store.createRecord('goal');
    goal.set('best_time_level', 'none');
    expect(goal.get('unit_description')).toEqual('No Data');

    goal.set('best_time_level', 'daily');
    expect(goal.get('unit_description')).toEqual('Day');

    goal.set('best_time_level', 'weekly');
    expect(goal.get('unit_description')).toEqual('Week');

    goal.set('best_time_level', 'monthly');
    expect(goal.get('unit_description')).toEqual('Month');
  });

  it("should return time_unit_measurements", function() {
    var goal = LingoLinq.store.createRecord('goal');
    goal.set('stats', empty);
    expect(goal.get('time_unit_measurements')).toEqual({});

    goal.set('stats', recent_daily);
    expect(goal.get('time_unit_measurements')[day1.toISOString().substring(0, 10)]).toEqual({sessions: 1, statuses: [3]});
    expect(goal.get('time_unit_measurements')[day2.toISOString().substring(0, 10)]).toEqual({sessions: 2, statuses: [4, 2]});
    expect(goal.get('time_unit_measurements')[day3.toISOString().substring(0, 10)]).toEqual({sessions: 1, statuses: [1]});
    expect(goal.get('time_unit_measurements')['totals']).toEqual({sessions: 4, statuses: [3, 4, 2, 1]});

    goal.set('stats', recent_weekly);
    expect(goal.get('time_unit_measurements')[day1.format('GGGG-WW')]).toEqual({sessions: 1, statuses: [1]});
    expect(goal.get('time_unit_measurements')[day4.format('GGGG-WW')]).toEqual({sessions: 4, statuses: [4, 4, 3, 2]});
    expect(goal.get('time_unit_measurements')['totals']).toEqual({sessions: 5, statuses: [1, 4, 4, 3, 2]});

    goal.set('stats', recent_monthly);
    expect(goal.get('time_unit_measurements')[day1.toISOString().substring(0, 7)]).toEqual({sessions: 7, statuses: [1, 2, 4, 3, 3, 3, 3]});
    expect(goal.get('time_unit_measurements')[day6.toISOString().substring(0, 7)]).toEqual({sessions: 3, statuses: [3, 2, 3]});
    expect(goal.get('time_unit_measurements')[day7.toISOString().substring(0, 7)]).toEqual({sessions: 1, statuses: [4]});
    expect(goal.get('time_unit_measurements')['totals']).toEqual({sessions: 11, statuses: [1, 2, 4, 3, 3, 3, 3, 3, 2, 3, 4]});

    goal.set('stats', old_daily);
    expect(goal.get('time_unit_measurements')[day8.toISOString().substring(0, 7)]).toEqual({sessions: 3, statuses: [1, 4, 3]});
    expect(goal.get('time_unit_measurements')['totals']).toEqual({sessions: 3, statuses: [1, 4, 3]});

    goal.set('stats', old_weekly);
    expect(goal.get('time_unit_measurements')[day8.toISOString().substring(0, 7)]).toEqual({sessions: 7, statuses: [3, 1, 2, 3, 3, 3, 4]});
    expect(goal.get('time_unit_measurements')['totals']).toEqual({sessions: 7, statuses: [3, 1, 2, 3, 3, 3, 4]});

    goal.set('stats', old_monthly);
    expect(goal.get('time_unit_measurements')[day8.toISOString().substring(0, 7)]).toEqual({sessions: 7, statuses: [3, 1, 4, 4, 3, 2, 4]});
    expect(goal.get('time_unit_measurements')[day12.toISOString().substring(0, 7)]).toEqual({sessions: 5, statuses: [3, 2, 4, 2, 4]});
    expect(goal.get('time_unit_measurements')['totals']).toEqual({sessions: 12, statuses: [3, 1, 4, 4, 3, 2, 4, 3, 2, 4, 2, 4]});
  });

  it("should return time_unit_status_rows", function() {
    var goal = LingoLinq.store.createRecord('goal');
    goal.set('stats', empty);
    expect(goal.get('time_unit_status_rows')).toEqual([]);

    goal.set('stats', recent_daily);
    expect(goal.get('time_unit_status_rows')[0]['time_blocks'].length).toEqual(5);
    expect(goal.get('time_unit_status_rows')[0]['status_class']).toEqual('face');
    expect(goal.get('time_unit_status_rows')[0]['tooltip']).toEqual('We did awesome! (4)');
    expect(goal.get('time_unit_status_rows')[0]['time_blocks'][1].score).toEqual(1);
    expect(goal.get('time_unit_status_rows')[0]['time_blocks'][1].style_class).toEqual('time_block level_10');
    expect(goal.get('time_unit_status_rows')[0]['time_blocks'][1].tooltip).toEqual('1 status, ' + day2.toISOString().substring(0, 10));

    goal.set('stats', recent_weekly);
    expect(goal.get('time_unit_status_rows').length).toEqual(4);
    expect(goal.get('time_unit_status_rows')[3].time_blocks.length).toEqual(4);
    expect(goal.get('time_unit_status_rows')[3].status_class).toEqual('face sad');
    expect(goal.get('time_unit_status_rows')[3].tooltip).toEqual("We didn't do it (1)");
    expect(goal.get('time_unit_status_rows')[3].time_blocks[2].score).toEqual(1);
    expect(goal.get('time_unit_status_rows')[3].time_blocks[2].style_class).toEqual('time_block level_5');
    expect(goal.get('time_unit_status_rows')[3].time_blocks[2].tooltip).toEqual('1 status, ' + day1.clone().weekday(0).toISOString().substring(0, 10));

    goal.set('stats', recent_monthly);
    expect(goal.get('time_unit_status_rows').length).toEqual(4);
    expect(goal.get('time_unit_status_rows')[1].time_blocks.length).toEqual(4);
    expect(goal.get('time_unit_status_rows')[1].status_class).toEqual('face happy');
    expect(goal.get('time_unit_status_rows')[1].tooltip).toEqual("We did good! (3)");
    expect(goal.get('time_unit_status_rows')[1].time_blocks[2].score).toEqual(2);
    expect(goal.get('time_unit_status_rows')[1].time_blocks[2].style_class).toEqual('time_block level_5');
    expect(goal.get('time_unit_status_rows')[1].time_blocks[2].tooltip).toEqual('2 statuses, ' + day6.toISOString().substring(0, 7) + '-01');
    expect(goal.get('time_unit_status_rows')[1].time_blocks[3].score).toEqual(4);
    expect(goal.get('time_unit_status_rows')[1].time_blocks[3].style_class).toEqual('time_block level_10');
    expect(goal.get('time_unit_status_rows')[1].time_blocks[3].tooltip).toEqual('4 statuses, ' + day1.toISOString().substring(0, 7) + '-01');

    goal.set('stats', old_daily);
    expect(goal.get('time_unit_status_rows').length).toEqual(4);
    expect(goal.get('time_unit_status_rows')[2].time_blocks.length).toEqual(4);
    expect(goal.get('time_unit_status_rows')[2].status_class).toEqual('face neutral');
    expect(goal.get('time_unit_status_rows')[2].tooltip).toEqual("We barely did it (2)");
    expect(goal.get('time_unit_status_rows')[2].time_blocks[2].score).toEqual(0);
    expect(goal.get('time_unit_status_rows')[2].time_blocks[2].style_class).toEqual('time_block level_0');
    expect(goal.get('time_unit_status_rows')[2].time_blocks[2].tooltip).toEqual('');
    expect(goal.get('time_unit_status_rows')[2].time_blocks[3].score).toEqual(0);
    expect(goal.get('time_unit_status_rows')[2].time_blocks[3].style_class).toEqual('time_block level_0');
    expect(goal.get('time_unit_status_rows')[2].time_blocks[3].tooltip).toEqual('');

    goal.set('stats', old_weekly);
    expect(goal.get('time_unit_status_rows').length).toEqual(4);
    expect(goal.get('time_unit_status_rows')[1].time_blocks.length).toEqual(4);
    expect(goal.get('time_unit_status_rows')[1].status_class).toEqual('face happy');
    expect(goal.get('time_unit_status_rows')[1].tooltip).toEqual("We did good! (3)");
    expect(goal.get('time_unit_status_rows')[1].time_blocks[3].score).toEqual(4);
    expect(goal.get('time_unit_status_rows')[1].time_blocks[3].style_class).toEqual('time_block level_10');
    expect(goal.get('time_unit_status_rows')[1].time_blocks[3].tooltip).toEqual('4 statuses, ' + day8.toISOString().substring(0, 7) + '-01');

    goal.set('stats', old_monthly);
    expect(goal.get('time_unit_status_rows').length).toEqual(4);
    expect(goal.get('time_unit_status_rows')[1].time_blocks.length).toEqual(4);
    expect(goal.get('time_unit_status_rows')[1].status_class).toEqual('face happy');
    expect(goal.get('time_unit_status_rows')[1].tooltip).toEqual("We did good! (3)");
    expect(goal.get('time_unit_status_rows')[0].time_blocks[1].score).toEqual(2);
    expect(goal.get('time_unit_status_rows')[0].time_blocks[1].style_class).toEqual('time_block level_7');
    expect(goal.get('time_unit_status_rows')[0].time_blocks[1].tooltip).toEqual('2 statuses, ' + day12.toISOString().substring(0, 7) + '-01');
    expect(goal.get('time_unit_status_rows')[1].time_blocks[3].score).toEqual(2);
    expect(goal.get('time_unit_status_rows')[1].time_blocks[3].style_class).toEqual('time_block level_7');
    expect(goal.get('time_unit_status_rows')[1].time_blocks[3].tooltip).toEqual('2 statuses, ' + day8.toISOString().substring(0, 7) + '-01');
    expect(goal.get('time_unit_status_rows')[2].time_blocks[1].score).toEqual(2);
    expect(goal.get('time_unit_status_rows')[2].time_blocks[1].style_class).toEqual('time_block level_7');
    expect(goal.get('time_unit_status_rows')[2].time_blocks[1].tooltip).toEqual('2 statuses, ' + day12.toISOString().substring(0, 7) + '-01');
    expect(goal.get('time_unit_status_rows')[3].time_blocks[3].score).toEqual(1);
    expect(goal.get('time_unit_status_rows')[3].time_blocks[3].style_class).toEqual('time_block level_4');
    expect(goal.get('time_unit_status_rows')[3].time_blocks[3].tooltip).toEqual('1 status, ' + day8.toISOString().substring(0, 7) + '-01');
  });

  describe("high_level_summary", function() {
    it("should return the correct value", function() {
      var goal = LingoLinq.store.createRecord('goal');
      goal.set('summary', 'asdf');
      goal.set('sequence_summary', 'jkl');
      expect(goal.get('high_level_summary')).toEqual('asdf');
      goal.set('sequence', true);
      expect(goal.get('high_level_summary')).toEqual('jkl');
    });
  });

  describe("high_level_description", function() {
    it("should return the correct value", function() {
      var goal = LingoLinq.store.createRecord('goal');
      goal.set('description', 'asdf');
      goal.set('sequence_description', 'jkl');
      expect(goal.get('high_level_description')).toEqual('asdf');
      goal.set('sequence', true);
      expect(goal.get('high_level_description')).toEqual('jkl');
    });
  });
  describe("advance_type", function() {
    it("should return the correct value", function() {
      var goal = LingoLinq.store.createRecord('goal');
      expect(goal.get('advance_type')).toEqual('none');
      expect(goal.get('any_advance')).toEqual(false);
      expect(goal.get('date_advance')).toEqual(false);
      expect(goal.get('duration_advance')).toEqual(false);
      goal.set('advance', new Date());
      expect(goal.get('advance_type')).toEqual('date');
      expect(goal.get('any_advance')).toEqual(true);
      expect(goal.get('date_advance')).toEqual(true);
      expect(goal.get('duration_advance')).toEqual(false);
      goal.set('duration', 123456);
      expect(goal.get('advance_type')).toEqual('date');
      expect(goal.get('any_advance')).toEqual(true);
      expect(goal.get('date_advance')).toEqual(true);
      expect(goal.get('duration_advance')).toEqual(false);
      goal.set('advance', null);
      expect(goal.get('advance_type')).toEqual('duration');
      expect(goal.get('any_advance')).toEqual(true);
      expect(goal.get('date_advance')).toEqual(false);
      expect(goal.get('duration_advance')).toEqual(true);
    });
  });
  describe('update_advancement', function() {
    it("should generate correct values", function() {
      var goal = LingoLinq.store.createRecord('goal');
      goal.update_advancement();
      expect(goal.get('advancement')).toEqual('none');
      goal.set('advance_type', 'date');
      goal.update_advancement();
      expect(goal.get('advancement')).toEqual('none');
      goal.set('goal_advances_at', 'July 1');
      goal.update_advancement();
      expect(goal.get('advancement')).toEqual('date:July 1');
      goal.set('advance_type', 'duration');
      goal.update_advancement();
      expect(goal.get('advancement')).toEqual('date:July 1');
      goal.set('goal_duration_number', 12);
      goal.update_advancement();
      expect(goal.get('advancement')).toEqual('date:July 1');
      goal.set('goal_duration_unit', 'week');
      goal.update_advancement();
      expect(goal.get('advancement')).toEqual('duration:12:week');
    });
  });
  describe('generate_next_template_if_new', function() {
    it("should return success if not new", function() {
      stub(RSVP, 'resolve', function(res) {
        expect(res).toEqual(null);
        return "promisey";
      });
      var goal = LingoLinq.store.createRecord('goal');
      var res = goal.generate_next_template_if_new();
      expect(res).toEqual('promisey');
    });
    it("should return save promise if new", function() {
      var obj = EmberObject.create();
      var goal = LingoLinq.store.createRecord('goal');
      stub(LingoLinq.store, 'createRecord', function(type) {
        expect(type).toEqual('goal');
        return obj;
      });
      var saving = false;
      stub(obj, 'save', function() {
        saving = true;
        return "saving";
      });
      goal.set('next_template_id', 'new');
      goal.set('template_header_id', 'bacon');
      goal.set('new_next_template_summary', 'summary');
      goal.set('related', {header: {id: 'bacon'}});
      var res = goal.generate_next_template_if_new();
      expect(res).toEqual('saving');
      expect(saving).toEqual(true);
      expect(obj.get('template_header_id')).toEqual('bacon');
      expect(obj.get('template')).toEqual(true);
      expect(obj.get('summary')).toEqual('summary');
    });
  });

  describe('new_next_template_id', function() {
    it("should return the correct value", function() {
      var goal = LingoLinq.store.createRecord('goal');
      expect(goal.get('new_next_template_id')).toEqual(false);
      goal.set('next_template_id', '12');
      expect(goal.get('new_next_template_id')).toEqual(false);
      goal.set('next_template_id', 'new');
      expect(goal.get('new_next_template_id')).toEqual(true);
    });
  });

  describe('current_template', function() {
    it("should return the correct result", function() {
      var goal = LingoLinq.store.createRecord('goal');
      goal.set('summary', 'bacon');
      expect(goal.get('current_template')).toEqual(goal);
      expect(goal.get('current_template.summary')).toEqual('bacon');
      goal.set('currently_running_template', {summary: 'cheese'});
      expect(goal.get('current_template')).toNotEqual(goal);
      expect(goal.get('current_template.summary')).toEqual('cheese');
    });
  });

  describe('any_statuses', function() {
    it('should return correct values', function() {
      var g = LingoLinq.store.createRecord('goal');
      expect(g.get('any_statuses')).toEqual(false);
      g.set('time_unit_status_rows', []);
      expect(g.get('any_statuses')).toEqual(false);
      g.set('time_unit_status_rows', [{time_blocks: []}]);
      expect(g.get('any_statuses')).toEqual(false);
      g.set('time_unit_status_rows', [{time_blocks: [{score: 1}]}]);
      expect(g.get('any_statuses')).toEqual(true);
    });
  });

  describe('remove_badge', function() {
    it('should remove the specified badge', function() {
      var g = LingoLinq.store.createRecord('goal');
      g.remove_badge(null);
      expect(g.get('badges')).toEqual([]);
      var obj = {a: 1};
      g.set('badges', [{a: 1}, {}, obj, obj]);
      g.remove_badge(obj);
      expect(g.get('badges')).toEqual([{a: 1}, {}]);
    });
  });

  describe('add_badge_level', function() {
    it('should a badge cloned from the previous level', function() {
      var g = LingoLinq.store.createRecord('goal');
      g.add_badge_level();
      expect(g.get('badges').length).toEqual(1);
      expect(g.get('badges')[0].id).toNotEqual(undefined);
      g.set('badges', [{a: 1}, {b: 1}]);
      g.add_badge_level();
      expect(g.get('badges').length).toEqual(3);
      expect(g.get('badges')[2]['b']).toEqual(1);
    });

    it('should have multiple possible default images', function() {
      expect('test').toEqual('todo');
    });
  });

  describe('set_zero_badge', function() {
    it('should automatically set up the zero badge', function() {
      var g = LingoLinq.store.createRecord('goal');
      expect(g.get('assessment_badge')).toEqual(undefined);
      expect(g.get('auto_assessment')).toEqual(undefined);
      g.set('auto_assessment', true);
      expect(g.get('assessment_badge')).toEqual({assessment: true});
      expect(g.get('auto_assessment')).toEqual(true);
      g.set('auto_assessment', false);
      expect(g.get('assessment_badge')).toEqual(null);
      expect(g.get('auto_assessment')).toEqual(false);
      g.set('assessment_badge', {a: 1});
      expect(g.get('assessment_badge')).toEqual({a: 1});
      expect(g.get('auto_assessment')).toEqual(true);
    });
  });

  describe('check_badges', function() {
    it('should set enabled only if true', function() {
      var g = LingoLinq.store.createRecord('goal');
      expect(g.get('badges_enabled')).toEqual(undefined);
      g.set('badges', []);
      expect(g.get('badges_enabled')).toEqual(false);
      g.set('badges', [{level: 0}]);
      expect(g.get('badges_enabled')).toEqual(false);
      g.set('badges', [{level: 0}, {level: 1}]);
      expect(g.get('badges_enabled')).toEqual(true);
    });
  });
});
