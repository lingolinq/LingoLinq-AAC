import Component from '@ember/component';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import LingoLinq from '../../app';
import i18n from '../../utils/i18n';
import { computed } from '@ember/object';
import modal from '../../utils/modal';
import { htmlSafe } from '@ember/template';

export default Component.extend({
  didInsertElement: function() {
    this.draw();
  },
  draw: function() {
    var $elem = $(this.get('element'));
    $elem.find(".week,.profile_box").tooltip({container: 'body'});
  },
  communicators_with_stats: computed(
    'users',
    'weeks',
    'more_weeks',
    'more_users',
    'populated_stamps',
    'refresh_id',
    function() {
      var res = [];
      var _this = this;
      var always_proceed = true;
      if(this.get('weeks') || always_proceed) {
        var user_weeks = {};
        var weeks = this.get('weeks') || {};
        for(var user_id in weeks) {
          user_weeks[user_id] = weeks[user_id];
        }
        weeks = this.get('more_weeks') || {};
        for(var user_id in weeks) {
          user_weeks[user_id] = weeks[user_id];
        }

        var max_count = 1;
        for(var user_id in user_weeks) {
          for(var week_stamp in user_weeks[user_id]) {
            max_count = Math.max(max_count, user_weeks[user_id][week_stamp].count);
          }
        }

        var populated_stamps = this.get('populated_stamps');
        var max_session_count = (this.get('max_session_count') || max_count || 50);
        var session_cutoff = max_session_count * 0.75;
        if(this.get('max_session_count')) {
          max_count = this.get('max_session_count');
        }

        var users = this.get('users') || [];
        if(this.get('more_users')) {
          users = users.concat(this.get('more_users'));
        }
        var totals = {
        };
        users.forEach(function(user) {
          user = $.extend({}, user);
          var weeks = user_weeks[user.id];
          user.week_stats = [];
          populated_stamps.forEach(function(stamp) {
            if(_this.get('user_type') == 'total') {
              var user_level = 0;
              if(weeks && weeks[stamp]) {
                // scale of 0-5, average supervisor activity level
                user_level = weeks[stamp].average_level || 0;
                if(weeks[stamp].count) {
                  // # of communicator sessions for the week
                  user_level = Math.min(5, Math.round(weeks[stamp].count / (session_cutoff / 5)));
                }
              }
              user.week_stats.push({
                level: user_level
              });
            } else if(_this.get('user_type') == 'communicator') {
              var statuses = (weeks && weeks[stamp] && weeks[stamp].statuses) || [];
              statuses.forEach(function(s) {
                if(s.score == 1) {
                  s.display_class = 'face sad';
                } else if(s.score == 2) {
                  s.display_class = 'face neutral';
                } else if(s.score == 3) {
                  s.display_class = 'face happy';
                } else if(s.score == 4) {
                  s.display_class = 'face laugh';
                }
                if(s.from_unit) { s.display_class = s.display_class + ' gray'; }
              });
              var count = (weeks && weeks[stamp] && weeks[stamp].count) || 0;
              var goals = (weeks && weeks[stamp] && weeks[stamp].goals) || 0;
              var level = Math.round(count / max_count * 10);
              var str = i18n.t('n_sessions', "session", {count: count});
              if(goals > 0) {
                str = str + i18n.t('comma_space', ", ");
                str = str + i18n.t('n_goal_events', "goal event", {count: goals});
              }
              user.week_stats.push({
                count: count,
                tooltip: str,
                goals: goals,
                statuses: statuses,
                class: 'week level_' + level
              });
            } else {
              var level = weeks && weeks[stamp] && (Math.round(weeks[stamp].average_level * 10) / 10);
              var models = weeks && weeks[stamp] && weeks[stamp].models;
              if(models > 5) {
                level = Math.max(level + 1, 10);
              }
              level = level || 0;
              var str = i18n.t('week_activity_level', "activity level: ") + level;
              if(models != null) {
                str = str + i18n.t('comma_space', ", ");
                str = str + i18n.t('models', "models: ") + models;
              }
              user.week_stats.push({
                count: level,
                models: (models > 0) ? (models > 5 ? {mid: true} : {low: true}) : {none: true},
                tooltip: str,
                class: 'week level_' + Math.round(level * 2)
              });
            }
          });
          if(_this.get('lesson')) {
            var comp = (_this.get('lesson.completed_users') || {})[user.id];
            user.org_status_state = comp ? i18n.t('training_complete', "Training Completed") : i18n.t('training_incomplete', "Training Not Completed");
            user.unit_lesson_class = htmlSafe(comp ? 'lesson_state' : 'lesson_state dim');
            if(comp) {
              user.unit_lesson_complete = true;
              if(comp.rating) {
                user.unit_lesson_rating_class = htmlSafe('face ' + (comp.rating == 3 ? 'laugh' : (comp.rating == 2 ? 'neutral' : 'sad')))
              }
            }
          }
          if(user.org_status) {
            var state = LingoLinq.user_statuses.find(function(s) { return s.id == user.org_status.state; });
            if(_this.get('org.status_overrides')) {
              state = _this.get('org.status_overrides').find(function(s) { return s.id == user.org_status.state; });
            }
            if(state) {
              user.org_status_state = i18n.t('status_colon', "Status: " + state.label);
            }
            if(user.unit_lesson_complete) {
              user.org_status_state = user.org_status_state + ', ' + i18n.t('training_complete', "Training Completed");
            }
            user.org_status_class = htmlSafe('glyphicon glyphicon-' + user.org_status.state);
          }
          res.push(user);
        });
        if(_this.get('profiles')) {
          var now = window.moment();
          var now_minus_18m = window.moment().add(-18, 'month');
          res.forEach(function(user) {
            if(user.profile_history && user.profile_history.length > 0) {
              var prof = null;
              var n_recent = 0;
              user.profile_history.forEach(function(p) {
                var set_as_prof = false;
                var added = window.moment(p.added * 1000);
                if(!prof) {
                  prof = p;
                  set_as_prof = true;
                  n_recent++;
                  var expected = window.moment(p.expected * 1000);
                  if(p.expected && expected < now) {
                    user.profile_class = htmlSafe('btn btn-default weeks_profile overdue');
                    user.profile_state = i18n.t('overdue', "overdue");
                  } else if(p.expected && expected < now.add(-1, 'month')) {
                    user.profile_class = htmlSafe('btn btn-default weeks_profile due_soon');
                    user.profile_state = i18n.t('due_soon', "due soon");
                  }
                }
                if(added > now_minus_18m && !set_as_prof) {
                  n_recent++;
                  if(!user.first_profile_history) {
                    user.first_profile_history = true;
                  } else if(!user.second_profile_history) {
                    user.second_profile_history = true;
                  }
                }
              });
              user.profile_state = user.profile_state || n_recent || i18n.t('none_recent_lower', "none recent");
            } else {
              user.profile_class = 'btn btn-default weeks_profile overdue';
              user.profile_state = i18n.t('overdue', "overdue");
            }
          });  
        }
        if(_this.get('user_type') == 'total' && res.length > 0) {
          var total_users = res.length;
          var u = res[0];
          var new_res = [{
            user_name: 'totals',
            totals: true,
            week_stats: []
          }];
          u.week_stats.forEach(function(week, idx) {
            var stats = {};
            var total_with_any_usage = 0;
            var tally = 0;
            res.forEach(function(user) {
              tally = tally + user.week_stats[idx].level;
              if(user.week_stats[idx].level > 0) {
                total_with_any_usage++;
              }
            });
            var avg = Math.round(tally / total_users * 10) / 10;
            var level = Math.round(avg * 2);
            if(total_with_any_usage > 1) {
              level = Math.max(level, 1);
            }
            // if at least 1/5 users have activity, it will be at least level 2
            if(total_with_any_usage > total_users / 5) {
              level = Math.max(level, 2);
            }
            // if only a few users have activity but it's a noticeable level, set it to at least 2
            if(total_with_any_usage <= 3 && total_users > 5 && tally >= 4.3) {
              level = Math.max(level, 2);
            }
            new_res[0].week_stats.push({
              count: avg,
              tooltip: i18n.t('activity_level', "activity level: ") + avg,
              class: 'week level_' + Math.min(level, 10)
            });
          });
          res = new_res;
        }
      }
      var _this = this;
      runLater(function() {
        _this.draw();
      });
      return res;
    }
  ),
  labeled_weeks: computed('populated_stamps', function() {
    return this.get('populated_stamps').map(function(s) { return window.moment(s * 1000).format('MMM DD, \'YY'); });
  }),
  populated_stamps: computed('weeks', 'more_weeks', 'user_type', function() {
    var all_weeks = {};
    var weeks = this.get('weeks');
    var more_weeks = this.get('more_weeks');
    for(var user_id in (weeks || {})) {
      all_weeks[user_id] = weeks[user_id];
    }
    for(var user_id in (more_weeks || {})) {
      all_weeks[user_id] = more_weeks[user_id];
    }
    if(weeks) {
      var weeks = all_weeks;
      var all_stamps = [];
      for(var user_id in weeks) {
        for(var week_stamp in weeks[user_id]) {
          if(all_stamps.indexOf(week_stamp) == -1) {
            all_stamps.push(week_stamp);
          }
        }
      }
      all_stamps = all_stamps.sort();
      var populated_stamps = [];
      var cutoff = -3;
      if(this.get('user_type') == 'total') {
        cutoff = -10;
      }
      var three_weeks_ago = window.moment().add(cutoff, 'week').unix();
      if(all_stamps.length === 0 || all_stamps[0] > three_weeks_ago) {
        all_stamps.unshift(three_weeks_ago);
      }
      var ref_stamp = all_stamps[0];
      var now = (new Date()).getTime() / 1000;
      while(ref_stamp < now) {
        if(all_stamps.length > 0) {
          ref_stamp = all_stamps.shift();
        }
        populated_stamps.push(ref_stamp);

        var m = null;
        while(m == null || (ref_stamp < now && ref_stamp < all_stamps[0])) {
          if(m) {
            populated_stamps.push(ref_stamp);
          }
          var m = window.moment(ref_stamp * 1000);
          m.add(1, 'week');
          ref_stamp = m.unix() + 1;
        }
      }
      populated_stamps = populated_stamps.slice(-10);
      return populated_stamps;
    }
    return [];
  }),
  notable: computed('user_type', 'org', function() {
    return this.get('org.premium') && this.get('user_type') == 'communicator';
  }),
  actions: {
    note: function(user) {
      var _this = this;
      LingoLinq.store.findRecord('user', user.id).then(function(user) {
        var goal_id = 'status';
        if(_this.get('room_goal_id')) {
          goal_id = _this.get('room_goal_id');
        }
        modal.open('record-note', {note_type: 'text', user: user, goal_id: goal_id}).then(function() {
          if (_this.refresh) {
            _this.refresh();
          }
        });
      }, function(err) {
        modal.error(i18n.t('error_loading_user_un', "Error Loading User %{un}", {un: user.user_name}));
      })
    },
    delete_action: function(id) {
      if (this.delete_user) {
        this.delete_user(this.get('unit'), this.get('user_type'), id);
      }
    },
    user_profile: function(user) {
      if (this.user_profile) {
        this.user_profile(user);
      }
    },
    user_status: function(user) {
      if (this.user_status) {
        this.user_status(user);
      }
    }
  }
});

