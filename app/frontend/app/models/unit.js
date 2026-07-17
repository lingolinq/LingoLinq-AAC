import { attr } from '@ember-data/model';
import BaseModel from './base';
import LingoLinq from '../app';
import speecher from '../utils/speecher';
import persistence from '../utils/persistence';
import Utils from '../utils/misc';
import { computed } from '@ember/object';

LingoLinq.Unit = BaseModel.extend({
  settings: attr('raw'),
  organization_id: attr('string'),
  name: attr('string'),
  management_action: attr('string'),
  goal: attr('raw'),
  topics: attr('raw'),
  lesson: attr('raw'),
  prior_goals: attr('raw'),
  supervisors: attr('raw'),
  communicators: attr('raw'),
  permissions: attr('raw'),
  org_supervisor_profile: attr('boolean'),
  org_communicator_profile: attr('boolean'),
  org_profile: attr('boolean'),
  supervisor_count: computed('supervisors', function() {
    return (this.get('supervisors') || []).length;
  }),
  communicator_count: computed('communicators', function() {
    return (this.get('communicators') || []).length;
  }),
  load_data: function(force) {
    if(!force && this.get('weekly_stats') && !this.get('weekly_stats.error')) {
      return;
    }
    this.refresh_stats();
    this.refresh_logs();
  },
  refresh_stats: function() {
    var _this = this;
    _this.set('weekly_stats', {loading: true});
    _this.set('user_counts', null);
    _this.set('user_weeks', null);
    _this.set('supervisor_weeks', null);
    persistence.ajax('/api/v1/units/' + _this.get('id') + '/stats', {type: 'GET'}).then(function(stats) {
      _this.set('weekly_stats', stats.weeks);
      _this.set('user_counts', stats.user_counts);
      stats.user_weeks.populated = true;
      stats.user_weeks.ts = Math.random();
      _this.set('user_weeks', stats.user_weeks);
      stats.supervisor_weeks.populated = true;
      stats.supervisor_weeks.ts = Math.random();
      _this.set('supervisor_weeks', stats.supervisor_weeks);
    }, function() {
      _this.set('weekly_stats', {error: true});
    });
  },
  max_session_count: computed('user_weeks', function() {
    var counts = [0];
    var weeks = this.get('user_weeks') || {};
    for(var user_id in weeks) {
      for(var ts in weeks[user_id]) {
        counts.push(weeks[user_id][ts].count || 0);
      }
    }
    return Math.max.apply(null, counts);
  }),
  refresh_logs: function() {
    var _this = this;
    _this.set('logs', {loading: true});
    persistence.ajax('/api/v1/units/' + _this.get('id') + '/logs', {type: 'GET'}).then(function(data) {
      _this.set('logs.loading', null);
      _this.set('logs.data', data.log);
    }, function() {
      _this.set('logs.loading', null);
      _this.set('logs.data', null);
    });
  }
});

export default LingoLinq.Unit;
