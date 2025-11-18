import DS from 'ember-data';
import RSVP from 'rsvp';
import $ from 'jquery';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import Utils from '../utils/misc';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

LingoLinq.Goal = DS.Model.extend({
  didLoad: function() {
    this.check_badges();
    if(this.get('assessment_badge')) {
      this.set('auto_assessment', true);
    }
  },
  user_id: DS.attr('string'),
  video_id: DS.attr('string'),
  has_video: DS.attr('boolean'),
  primary: DS.attr('boolean'),
  active: DS.attr('boolean'),
  uneditable: DS.attr('boolean'),
  unit_id: DS.attr('string'),
  unit_name: DS.attr('string'),
  unit_org_id: DS.attr('string'),
  template_id: DS.attr('string'),
  template: DS.attr('boolean'),
  template_header: DS.attr('boolean'),
  global: DS.attr('boolean'),
  summary: DS.attr('string'),
  sequence_summary: DS.attr('string'),
  description: DS.attr('string'),
  sequence_description: DS.attr('string'),
  permissions: DS.attr('raw'),
  currently_running_template: DS.attr('raw'),
  video: DS.attr('raw'),
  user: DS.attr('raw'),
  author: DS.attr('raw'),
  comments: DS.attr('raw'),
  started: DS.attr('date'),
  ended: DS.attr('date'),
  advance: DS.attr('date'),
  expires: DS.attr('date'),
  advancement: DS.attr('string'),
  duration: DS.attr('number'),
  stats: DS.attr('raw'),
  related: DS.attr('raw'),
  ref_data: DS.attr('raw'),
  sequence: DS.attr('boolean'),
  date_based: DS.attr('boolean'),
  next_template_id: DS.attr('string'),
  template_header_id: DS.attr('string'),
  template_stats: DS.attr('raw'),
  badge_name: DS.attr('string'),
  badge_image_url: DS.attr('string'),
  badges: DS.attr('raw'),
  assessment_badge: DS.attr('raw'),
  goal_advances_at: DS.attr('string'),
  goal_duration_unit: DS.attr('string'),
  goal_duration_number: DS.attr('string'),
  best_time_level: computed('stats', function() {
    var stats = this.get('stats') || {};
    if(stats && stats.monthly && stats.monthly.totals && stats.monthly.totals.sessions > 0) {
      var levels = {};
      var suggested_level = null;
      ['daily', 'weekly', 'monthly'].forEach(function(level) {
        levels[level] = [];
        var hash = stats[level] || {};
        for(var idx in hash) {
          if(idx != 'totals') {
            levels[level].push(idx);
          }
        }
        var last_value = levels[level].sort().reverse()[0];
        // if there's no data, just do daily or something
        // preference for the lowest level
        if(level == 'daily') {
          // if nothing's happened in the last 2 weeks, don't use daily
          // if weekly has the same sessions as daily, use daily
          var two_weeks_ago = window.moment().add(-2, 'weeks').toISOString().substring(0, 10);
          if(last_value > two_weeks_ago) {
            if(stats.weekly && stats.weekly.totals && stats.daily && stats.daily.totals && stats.weekly.totals.sessions == stats.daily.totals.sessions) {
              suggested_level = 'daily';
            }
          }
        } else if(level == 'weekly') {
          // if nothing's happened in the last 12 weeks, don't use weekly
          // if monthly has the same sessions as weekly, use weekly unless already using daily
          var twelve_weeks_ago = window.moment().add(-12, 'weeks').format('GGGG-WW');
          if(last_value > twelve_weeks_ago) {
            if(stats.monthly && stats.monthly.totals && stats.weekly && stats.weekly.totals && stats.monthly.totals.sessions == stats.weekly.totals.sessions) {
              suggested_level = suggested_level || 'weekly';
            }
          }
        } else if(level == 'monthly') {
          suggested_level = suggested_level || 'monthly';
          // otherwise use monthly
        }

      });
      return suggested_level;
    } else {
      return 'none';
    }
  }),
  time_units: computed('stats', 'best_time_level', function() {
    var level = this.get('best_time_level');
    var stats = this.get('stats');
    var units = [];
    if(level == 'daily') {
      var days = [];
      var day = window.moment();
      for(var idx = 0; idx < 14; idx++) {
        var key = day.toISOString().substring(0, 10);
        days.push({
          key: key,
          label: day.toISOString().substring(0, 10),
          sessions: ((stats.daily[key] || {}).sessions || 0),
          max_statuses: Utils.max_appearance((stats.daily[key] || {}).statuses || [])
        });
        day = day.add(-1, 'days');
      }
      units = days;
    } else if(level == 'weekly') {
      var weeks = [];
      var week = window.moment();
      for(var idx = 0; idx < 12; idx++) {
        var key = week.clone().weekday(1).format('GGGG-WW');
        weeks.push({
          key: key,
          label: week.clone().weekday(0).toISOString().substring(0, 10),
          sessions: ((stats.weekly[key] || {}).sessions || 0),
          max_statuses: Utils.max_appearance((stats.weekly[key] || {}).statuses || [])
        });
        week = week.add(-1, 'weeks');
      }
      units = weeks;
    } else if(level == 'monthly') {
      var months = [];
      var month_keys = [];
      var monthly = this.get('stats').monthly || {};
      for(var idx in monthly) {
        if(idx != 'totals') {
          month_keys.push(idx);
        }
      }
      var last_month = month_keys.sort().reverse()[0];
      var first_month = month_keys.sort()[0];
      var date = window.moment(last_month, 'YYYY-MM');
      for(var idx = 0; idx < 36; idx++) {
        var key = date.format('YYYY-MM');
        months.push({
          key: key,
          label: date.toISOString().substring(0, 10),
          sessions: ((stats.monthly[key] || {}).sessions || 0),
          max_statuses: Utils.max_appearance((stats.monthly[key] || {}).statuses || [])
        });
        date = date.add(-1, 'month');
      }
      units = months;
    }
    var reversed_units = [];
    var found_session = false;
    units.reverse().forEach(function(unit, idx) {
      if(found_session || unit.sessions > 0 || idx > (units.length - 5)) {
        found_session = true;
        reversed_units.push(unit);
      }
    });
    var max = Math.max.apply(null, units.mapBy('max_statuses'));
    reversed_units.max = max;
    return reversed_units;
  }),
  unit_description: computed('stats', 'best_time_level', function() {
    var level = this.get('best_time_level');
    if(level == 'daily') {
      return i18n.t('day', "Day");
    } else if(level == 'weekly') {
      return i18n.t('week', "Week");
    } else if(level == 'monthly') {
      return i18n.t('month', "Month");
    } else {
      return i18n.t('no_unit', "No Data");
    }
  }),
  duration_diff: computed('started', 'ended', 'active', function() {
    if(!this.get('active') && this.get('started') && this.get('ended')) {
      return new Date((new Date()).getTime() - (this.get('ended') - this.get('started')));
    }
    return null;
  }),
  template_or_unit: computed('template', 'unit_id', function() {
    return this.get('template') || this.get('unit_id');
  }),
  time_unit_measurements: computed('stats', 'best_time_level', function() {
    return this.get('stats')[this.get('best_time_level')] || {};
  }),
  any_statuses: computed('time_unit_status_rows', function() {
    var any_found = false;
    (this.get('time_unit_status_rows') || []).forEach(function(row) {
      (row.time_blocks || []).forEach(function(block) {
        if(block && block.score > 0) { any_found = true; }
      });
    });
    return any_found;
  }),
  time_unit_status_rows: computed('stats', 'best_time_level', function() {
    if(this.get('best_time_level') == 'none') { return []; }
    var units = this.get('time_units');
    var rows = [{
      status_class: 'face', tooltip: i18n.t('we_did_awesome_4', "We did awesome! (4)"), time_blocks: []
    }, {
      status_class: 'face happy', tooltip: i18n.t('we_did_good_3', "We did good! (3)"), time_blocks: []
    }, {
      status_class: 'face neutral', tooltip: i18n.t('we_barely_did_it_2', "We barely did it (2)"), time_blocks: []
    }, {
      status_class: 'face sad', tooltip: i18n.t('we_didnt_do_it_1', "We didn't do it (1)"), time_blocks: []
    }];
    for(var idx = 0; idx < 14 && idx < units.length; idx++) {
      var unit = units[idx];
      var unit_stats = (this.get('stats')[this.get('best_time_level')] || {})[unit.key] || {};
      var statuses = unit_stats.statuses || [];
      var score = statuses.filter(function(s) { return s == 4; }).length;
      var level = Math.ceil(score / units.max * 10);
      rows[0].time_blocks.push({
        score: score,
        tooltip: score ? (i18n.t('status_sessions', "status", {count: score}) + ', ' + unit.label) : "",
        style_class: 'time_block level_' + level
      });
      score = statuses.filter(function(s) { return s == 3; }).length;
      level = Math.ceil(score / units.max * 10);
      rows[1].time_blocks.push({
        score: score,
        tooltip: score ? (i18n.t('status_sessions', "status", {count: score}) + ', ' + unit.label) : "",
        style_class: 'time_block level_' + level
      });
      score = statuses.filter(function(s) { return s == 2; }).length;
      level = Math.ceil(score / units.max * 10);
      rows[2].time_blocks.push({
        score: score,
        tooltip: score ? (i18n.t('status_sessions', "status", {count: score}) + ', ' + unit.label) : "",
        style_class: 'time_block level_' + level
      });
      score = statuses.filter(function(s) { return s == 1; }).length;
      level = Math.ceil(score / units.max * 10);
      rows[3].time_blocks.push({
        score: score,
        tooltip: score ? (i18n.t('status_sessions', "status", {count: score}) + ', ' + unit.label) : "",
        style_class: 'time_block level_' + level
      });
    }
    return rows;
  }),
  high_level_summary: computed('sequence', 'summary', 'sequence_summary', function() {
    var res = this.get('sequence') ? this.get('sequence_summary') : null;
    res = res || this.get('summary');
    return res;
  }),
  high_level_description: computed('sequence', 'description', 'sequence_description', function() {
    var res = this.get('sequence') ? this.get('sequence_description') : null;
    res = res || this.get('description');
    return res;
  }),
  advance_type: computed('advance', 'duration', function() {
    if(this.get('advance')) {
      return 'date';
    } else if(this.get('duration')) {
      return 'duration';
    } else {
      return 'none';
    }
  }),
  date_advance: computed('advance_type', function() {
    return this.get('advance_type') == 'date';
  }),
  duration_advance: computed('advance_type', function() {
    return this.get('advance_type') == 'duration';
  }),
  any_advance: computed('advance_type', function() {
    return this.get('advance_type') && this.get('advance_type') != 'none';
  }),
  update_advancement: function() {
    if(this.get('advance_type') == 'date') {
      if(this.get('goal_advances_at')) {
        this.set('advancement', 'date:' + this.get('goal_advances_at'));
      }
    } else if(this.get('advance_type') == 'duration') {
      if(this.get('goal_duration_number') && this.get('goal_duration_unit')) {
        this.set('advancement', 'duration:' + this.get('goal_duration_number') + ':' + this.get('goal_duration_unit'));
      }
    } else {
      this.set('advancement', 'none');
    }
  },
  generate_next_template_if_new: function() {
    if(this.get('new_next_template_id')) {
      var next_template = LingoLinq.store.createRecord('goal');
      next_template.set('template_header_id', this.get('related.header.id'));
      next_template.set('template', true);
      next_template.set('summary', this.get('new_next_template_summary'));
      return next_template.save();
    } else {
      return RSVP.resolve(null);
    }
  },
  new_next_template_id: computed('next_template_id', function() {
    return this.get('next_template_id') == 'new';
  }),
  current_template: computed('currently_running_template', function() {
    if(this.get('currently_running_template')) {
      return LingoLinq.store.createRecord('goal', this.get('currently_running_template'));
    } else {
      return this;
    }
  }),
  remove_badge: function(badge) {
    var badges = (this.get('badges') || []).filter(function(b) { return b != badge; });
    this.set('badges', badges);
  },
  add_badge_level: function(auto_awarded) {
    var badges = this.get('badges') || [];
    var badge = {};
    if(badges.length > 0) {
      badge = $.extend({}, badges[badges.length - 1]);
    } else if(this.get('assessment_badge')) {
      badge = $.extend({}, this.get('assessment_badge'));
      delete badge['assessment'];
    }
    badge.level = null;
    var imgs = [
      "https://lingolinq-usercontent.s3.amazonaws.com/images/6/8/8/5/1_6885_5781b0671b2b65ad0b53f2fe-980af0f90c67ef293e98f871270e4bc0096493b2863245a3cff541792acf01050e534135fb96262c22d691132e2721b37b047a02ccaf6931549278719ec8fa08.png",
      "https://lingolinq-usercontent.s3.amazonaws.com/images/1/0/8/1/4/1_10814_416af4357e5d5ae7294f055e-235f4f4bd4f7d844a8a09d0eb28062c615e1730dbf3365960630afcbac3905dad0ba1cc999b617d9a24238cfcf0a82325dd3d74b59f8411ee19c8579a0fd6d8f.png",
      "https://lingolinq-usercontent.s3.amazonaws.com/images/1/0/8/1/5/1_10815_0e58b818762cc2c8e497e806-060c8cb4f011f7966500f60e882f846e5ac1bf5c1cb6a02ae6049b82c2143a98501e2f81f44bd8456854e5d822f60dd7888c87a29b74c333911a83c90488f50d.png",
      "https://lingolinq-usercontent.s3.amazonaws.com/images/1/0/8/1/6/1_10816_9d16462c983ad8d8ba797b21-5e01d833199dfda08729e8b8bfd1ff10ffaf6c9c77a8ce058d48c6ed2e7612a9ce1639ccc9b2d4805a6105952f8ecbbc1cbee920a5db4c6f149d2967358baeec.png",
      "https://lingolinq-usercontent.s3.amazonaws.com/images/1/0/8/1/7/1_10817_1ce27e902481829889f7609e-5c21ce11c22cfc76fc9666d5016c5aa0683bbefb3b23c69686dd5ceae9a8533dec222be32a44ad42aa4f99ad44853ddfdbbf1f863e1e231439423a0961d2f7fa.png",
      "https://lingolinq-usercontent.s3.amazonaws.com/images/1/0/8/1/8/1_10818_b417b324205b0d42242b84a6-b11988d97faf1dccc0522ad9bd2988af13747c7b6115a4a403565fccb1c50d4d76efcdb8ab847cd0ef21e3a5f48f10e6266f43626782c7854bc4a64634878efa.png",
      "https://lingolinq-usercontent.s3.amazonaws.com/images/1/0/8/1/9/1_10819_1ae58b0e731d0cec9c0efecf-1e5cc8b7eb3fb2ae83189da745780511c1cf130938539d1a744b5e2d79d903110797a97669cfa422922684b49915cba8d13cba2441fe477e37f788975df90d23.png",
      "https://lingolinq-usercontent.s3.amazonaws.com/images/1/0/8/2/0/1_10820_cd0425b538b7ce21935185f4-a9d36b9478183c0ad641b0eafc71368a739d1e59cd2e21e723ab9bafa7ca7e53e66a8e03f433d08ba861fa3769e10b4464b61f0de345d4cf7257d29afb023463.png",
      "https://lingolinq-usercontent.s3.amazonaws.com/images/1/0/8/2/1/1_10821_e5ace6e6742644d8026aa0b3-352c31ece55aff666961d95e0091edcebabeb971c8baf2da3994c034f9fc981fd06df3b9717cf431fec9a057f5641d4a7bde5488996945e26b3625e0a569bedb.png",
      "https://lingolinq-usercontent.s3.amazonaws.com/images/1/0/8/2/2/1_10822_17792dbcca5deabc63c38e9c-b103e72144204b434189509a5419d64eecc382c0eadc01d94598023528e29d024481692235e610d889917ed360ffffcf690bb4823a932100db738c3881b4a48f.png",
      "https://lingolinq-usercontent.s3.amazonaws.com/images/1/0/8/2/3/1_10823_c2cbed9bb1c7dee5323ad8f9-8840e227c0d4ef85cc61033bed9290f7c12b1880448603f83d18548c6342cc22584d34a6dcc27ba42b91d90e9e8c0317c545aca272000b2bf9bf12e01935cba4.png",
      "https://lingolinq-usercontent.s3.amazonaws.com/images/1/0/8/2/4/1_10824_6703a0d7788a59ddab2f97c9-c246bb3b869b22b894e4223542b302b2f00060a8bab328052cd546913d8aa650ba4d97adf8a6a56be2c54573e62474908c824f46cb43b6a79539d9fd5a64956b.png",
      "https://lingolinq-usercontent.s3.amazonaws.com/images/1/0/8/2/5/1_10825_494fbe703b1a0dff3ac087c3-4a6f04d6c25f4b82d2fd59655850a1b0431ad050b7a0bfe10c1f8e7d374c2fb9c1523f1b00e725ee37df2e24c4c489a29bc3cc7bc53d58bb229d02cfcd560d69.png",
      "https://lingolinq-usercontent.s3.amazonaws.com/images/1/0/8/2/6/1_10826_c9a17852b9be550959173cd8-e30f80f885806b1cbf21c02340be2bda4005a961a5f0b21368f8ec80f7dceaad536f9198bb20a93ee07287ba08db1081fc068bb1b9eed1efdb87b4f07322a867.png",
      "https://lingolinq-usercontent.s3.amazonaws.com/images/1/0/8/2/8/1_10828_5d7e0c9d29d70312f12b41a0-ba9c6e7bc356a80b0464da04140ff406c2850836eb2668ac9804a1a15dfbb879a58316f2b327f20a807c45907faf5268ab3bde175f1903c693e59ba51fc20ef5.png"
    ];
    var fallback = imgs[Math.floor(Math.random() * imgs.length)];
    badge.image_url = badge.image_url || fallback;
    badge.id = Math.random();
    badges.pushObject(badge);
    this.set('badges', badges);
  },
  check_badges: observer('badges', 'badges.length', function() {
    var badges = this.get('badges') || [];
    this.set('badges_enabled', !!(badges.length > 0 && badges[badges.length - 1].level !== 0));
  }),
  set_zero_badge: observer('auto_assessment', 'assessment_badge', function(obj, changed) {
    if(changed == 'auto_assessment' && this.get('auto_assessment') === false) {
      this.set('assessment_badge', null);
    }
    if(this.get('auto_assessment') || this.get('assessment_badge')) {
      this.set('auto_assessment', true);
      if(!this.get('assessment_badge')) {
        this.set('assessment_badge', {assessment: true});
      }
    } else {
      this.set('auto_assessment', false);
      this.set('assessment_badge', null);
    }
  })
});

export default LingoLinq.Goal;
