import DS from 'ember-data';
import LingoLinqAAC from '../app';
import i18n from '../utils/i18n';
import speecher from '../utils/speecher';
import { htmlSafe } from '@ember/string';
import { computed } from '@ember/object';

LingoLinqAAC.Badge = DS.Model.extend({
  name: DS.attr('string'),
  user_id: DS.attr('string'),
  user_name: DS.attr('string'),
  avatar_url: DS.attr('string'),
  highlighted: DS.attr('boolean'),
  disabled: DS.attr('boolean'),
  global: DS.attr('boolean'),
  global_goal_priority: DS.attr('number'),
  image_url: DS.attr('string'),
  sound_url: DS.attr('string'),
  level: DS.attr('number'),
  goal_id: DS.attr('string'),
  max_level: DS.attr('boolean'),
  progress: DS.attr('number'),
  earned: DS.attr('date'),
  started: DS.attr('date'),
  ended: DS.attr('date'),
  completion_settings: DS.attr('raw'),
  permissions: DS.attr('raw'),
  sound_url_with_fallback: computed('sound_url', function() {
    return this.get('sound_url') || speecher.chimes_url;
  }),
  progress_out_of_100: computed('progress', function() {
    return Math.min(Math.max(this.get('progress') || 0, 0) * 100, 100);
  }),
  progress_style: computed('progress', function() {
    return htmlSafe("width: " + Math.min(Math.max((this.get('progress') || 0) * 100, 0), 100) + "%");
  }),
  numbered_interval: function(interval, number) {
    var res = {multiplier: 1, unit: i18n.t('day_lower', "day")};
    if(interval == 'monthyear') {
      res.unit = i18n.t('month_lower', "month");
    } else if(interval == 'biweekyear') {
      res.unit = i18n.t('week_lower', "week");
      res.multiplier = 2;
      res.total = (number || 0) * 2;
    } else if(interval == 'weekyear') {
      res.unit = i18n.t('week_lower', "week");
    }
    res.total = (number || 0) * res.multiplier;
    return res;
  },
  time_left: computed('earned', 'progress', 'completion_settings', function() {
    if(this.get('earned')) {
      return i18n.t('done_excl', "Done!");
    } else if(this.get('completion_settings')) {
      var badge_level = this.get('completion_settings');
      var interval = this.numbered_interval(badge_level.interval);
      var unit_string = interval.unit;
      var unit_multiplier = interval.multiplier;
      var str = "";
      var progress = this.get('progress') || 0;
      if(badge_level.consecutive_units) {
        str = i18n.t('n_consecutive_units', /*"consecutive " +*/ unit_string, {count: Math.round(badge_level.consecutive_units * (1 - progress) * unit_multiplier)});
      } else if(badge_level.matching_units) {
        str = i18n.t('n_units', unit_string, {count: Math.round(badge_level.matching_units * (1 - progress) * unit_multiplier)});
      } else if(badge_level.matching_instances) {
        str = i18n.t('n_matches', this.get('completion_type'), {count: Math.round(badge_level.matching_instances * (1 - progress))});
      }
      return str + i18n.t('left_to_go', " left to go!");
    } else {
      var pct = Math.round(this.get('progress') * 100) || 0;
      return i18n.t('percent_of_the_way_there', "%{pct}% of the way there!", {pct: pct});
    }
  }),
  completion_type: computed('completion_settings', function() {
    if(!this.get('completion_settings')) { return null; }
    var badge_level = this.get('completion_settings');
    if(badge_level.instance_count) {
      if(badge_level.word_instances) {
        return i18n.t('word', 'word');
      } else if(badge_level.button_instances) {
        return i18n.t('button', 'button');
      } else if(badge_level.session_instances) {
        return i18n.t('session', 'session');
      } else if(badge_level.modeled_button_instances) {
        return i18n.t('modeled_button', 'modeled button');
      } else if(badge_level.modeled_word_instances) {
        return i18n.t('modeled_word', 'modeled word');
      } else if(badge_level.unique_word_instances) {
        return i18n.t('unique_word', 'unique word');
      } else if(badge_level.unique_button_instances) {
        return i18n.t('unique_button', 'unique button');
      }
    }
    return i18n.t('match', "match");
  }),
  completion_watch_list: computed('completion_settings', function() {
    if(!this.get('completion_settings')) { return null; }
    var badge_level = this.get('completion_settings');
    var res = "";
    var list = (badge_level.words_list || badge_level.parts_of_speech_list || []);
    list.forEach(function(item, idx) {
      if(badge_level.words_list) {
        res = res + "\"" + item + "\"";
      } else {
        res = res + i18n.pluralize(item);
      }
      if(idx == list.length - 1) {
      } else if(idx == list.length - 2) {
        res = res + i18n.t('comma_or_space', ", or ");
      } else {
        res = res + i18n.t('comma_space', ", ");
      }
    });
    return res;
  }),
  completion_interval: computed('completion_settings', function() {
    if(!this.get('completion_settings')) { return null; }
    var badge_level = this.get('completion_settings');
    var each = (badge_level.words_list || badge_level.parts_of_speech_list || []).length == 1;
    if(badge_level.interval == 'monthyear') {
      if(each) {
        return i18n.t('each_month', "each month");
      } else {
        return i18n.t('per_month_lower', "per month");
      }
    } else if(badge_level.interval == 'biweekyear') {
      return i18n.t('every_two_weeks', "every two weeks");
    } else if(badge_level.interval == 'weekyear') {
      if(each) {
        return i18n.t('each_week', "each week");
      } else {
        return i18n.t('per_week_lower', "per week");
      }
    } else {
      if(each) {
        return i18n.t('each_day', "each day");
      } else {
        return i18n.t('per_day_lower', "per day");
      }
    }
  }),
  completion_duration: computed('completion_settings', function() {
    if(!this.get('completion_settings')) { return null; }
    var badge_level = this.get('completion_settings');
    var res = " ";
    if(badge_level.consecutive_units || badge_level.matching_units || badge_level.matching_instances) {
      var n = badge_level.consecutive_units || badge_level.matching_units;
      var interval = this.numbered_interval(badge_level.interval, n);
      if(!badge_level.watchlist) {
        res = res + this.get('completion_interval');
      } else {
        res = "";
      }
      if(badge_level.consecutive_units || badge_level.matching_units) {
        if(n == 1) {
          res = res + i18n.t('at_least_once', " at least once");
        } else {
          if(badge_level.consecutive_units) {
            res = res + i18n.t('for_spaced', " for ");
          } else {
            res = res + i18n.t('for_any', " for any ");
          }
          res = res + i18n.t('n_units', interval.unit, {count: interval.total});
        }
        if(badge_level.consecutive_units && n > 1) {
          res = res + " " + i18n.t('in_a_row', "in a row");
        }
      } else if(badge_level.watchlist) {
        res = res + i18n.t('for_a_total_of', " for a total of ");
        res = res + i18n.t('n_times', "time", {count: badge_level.matching_instances});
      } else {
        res = res + i18n.t('for_a_total_of', " for a total of ");
        res = res + i18n.t('n_items', this.get('completion_type'), {count: badge_level.matching_instances});
      }
    } else if(badge_level.assessment) {
      var interval = this.numbered_interval(badge_level.interval, 1);
      res = res + i18n.t('every', " every ");
      res = res + interval.unit;
    } else {
      return null;
    }
    return res;
  }),
  completion_explanation: computed('completion_settings', function() {
    if(!this.get('completion_settings')) { return null; }
    var badge_level = this.get('completion_settings');
    if(badge_level.watchlist) {
      var str = "";
      if(badge_level.watch_type_count) {
        if(badge_level.words_list) {
          if(badge_level.words_list.length > 1) {
            str = i18n.t('use_at_least_n_of_the_words', "Use at least %{cnt} of the words ", {cnt: badge_level.watch_type_count});
            str = str + this.get('completion_watch_list');
          } else {
            str = i18n.t('use_the_word_wrd', "Use the word \"%{wrd}\"", {wrd: badge_level.words_list[0]});
          }
        } else if(badge_level.parts_of_speech_list) {
          if(badge_level.parts_of_speech_list.length > 1) {
            str = i18n.t('use_at_least_n', "Use at least %{cnt} ", {cnt: badge_level.watch_type_count});
            str = str + this.get('completion_watch_list');
          } else {
            str = i18n.t('use_pos', "Use %{pos}", {pos: i18n.pluralize(badge_level.parts_of_speech_list[0])});
          }
        } else {
          return null;
        }
      } else {
        if(badge_level.words_list) {
          if(badge_level.words_list.length > 1) {
            str = i18n.t('use_the_words', "Use the words ");
            str = str + this.get('completion_watch_list');
          } else {
            str = i18n.t('use_the_word_wrd', "Use the word \"%{wrd}\"", {wrd: badge_level.words_list[0]});
          }
        } else if(badge_level.parts_of_speech_list) {
          if(badge_level.parts_of_speech_list.length > 1) {
            str = i18n.t('use', "Use ");
            str = str + this.get('completion_watch_list');
          } else {
            str = i18n.t('use_pos_space', "Use %{pos} ", {pos: i18n.pluralize(badge_level.parts_of_speech_list[0])});
          }
          str = i18n.t('use', "Use ");

        } else {
          return null;
        }
      }
      if(badge_level.watch_total) {
        str = str + i18n.t('at_least', " at least ");
        str = str + i18n.t('n_times', "time", {count: badge_level.watch_total});
      }
      str = str + " " + this.get('completion_interval');
      var watch_type = badge_level.words_list ? i18n.t('word', "word") : i18n.t('speech_type', "speech type");
      if(badge_level.watch_type_minimum) {
        var do_add = true;
        if((badge_level.words_list || badge_level.parts_of_speech_list).length == 1) {
          if(badge_level.watch_type_minimum == 1) {
            do_add = false;
          } else {
            str = str + i18n.t('using_the_type_at_least', ", using the %{type} at least ", {type: watch_type});
          }
        } else {
          str = str + i18n.t('with_each_type_getting_used_at_least', ", with each %{type} getting used at least ", {type: watch_type});
        }
        if(do_add) {
          str = str + i18n.t('n_times', "time", {count: badge_level.watch_type_minimum});
        }
      }
      if(badge_level.watch_type_interval && badge_level.watch_type_interval_count) {
        str = str + i18n.t('paren_also_use_at_least_n_different_watch_types_from_the_list_unit', " (also use at least %{cnt} different %{types} from the list %{unit})", {cnt: badge_level.watch_type_interval_count, types: i18n.pluralize(watch_type), unit: this.get('completion_interval')});
      }
      if(this.get('completion_duration')) {
        str = str + i18n.t('comma', ",") + this.get('completion_duration');
      } else {
        return null;
      }
      return str;
      // use at least 2 of the words "a", "b", "c" at least 3 times a day for 6 days
      // -- also use at least 3 different words from the list every week
      // use at least 1 noun, verb or adjective at least 4 times a week for 12 weeks
      // -- also using at least 3 different parts of speech from the list every month
    } else if(badge_level.instance_count) {
      var str = "";
      var item = null;
      if(badge_level.word_instances) {
        str = i18n.t('use_at_least', "Use at least ");
        str = str + i18n.t('n_words', 'word', {count: badge_level.instance_count});
        item = i18n.t('word', 'word');
      } else if(badge_level.button_instances) {
        str = i18n.t('hit_at_least', "Hit at least ");
        str = str + i18n.t('n_buttons', 'button', {count: badge_level.instance_count});
        item = i18n.t('button', 'button');
      } else if(badge_level.session_instances) {
        str = i18n.t('have_at_least', "Have at least ");
        str = str + i18n.t('n_sessions', 'session', {count: badge_level.instance_count});
        item = i18n.t('session', 'session');
      } else if(badge_level.modeled_button_instances) {
        str = i18n.t('have_modeled_at_least', "Have modeled at least ");
        str = str + i18n.t('n_buttons', 'button', {count: badge_level.instance_count});
        item = i18n.t('modeled_button', 'modeled button');
      } else if(badge_level.modeled_word_instances) {
        str = i18n.t('have_modeled_at_least', "Have modeled at least ");
        str = str + i18n.t('n_words', 'word', {count: badge_level.instance_count});
        item = i18n.t('modeled_word', 'modeled word');
      } else if(badge_level.unique_word_instances) {
        str = i18n.t('use_at_least', "Use at least ");
        str = str + i18n.t('n_unique_words', 'unique word', {count: badge_level.instance_count});
        item = i18n.t('unique_word', 'unique word');
      } else if(badge_level.unique_button_instances) {
        str = i18n.t('hit_at_least', "Hit at least ");
        str = str + i18n.t('n_unique_buttons', 'unique button', {count: badge_level.instance_count});
        item = i18n.t('unique_button', 'unique button');
      } else {
        return null;
      }
      if(this.get('completion_duration')) {
        str = str + this.get('completion_duration');
      } else {
        return null;
      }
      return str;
    } else {
      return i18n.t('do_nothing', "do nothing!");
    }
  })
});

LingoLinqAAC.Badge.best_next_badge = function(badges, goal_id) {
  var res = null;
  badges = (badges || []).filter(function(b) { return !b.get('earned') && b.get('progress') > 0; });
  res = badges.find(function(b) { return b.get('goal_id') == goal_id; });
  if(!res) {
    badges = badges.sort(function(a, b) {
      // sort by non-global first, progress second
      if(a.get('global') == b.get('global')) {
        if(a.get('global') && (a.get('global_goal_priority') || b.get('global_goal_priority'))) {
          // if they're both global and at least one of them has a priority, use that
          var ap = a.get('global_goal_priority') || 99999999;
          var bp = b.get('global_goal_priority') || 99999999;
          return ap - bp;
        }
        if(a.get('progress') == b.get('progress')) {
          if(a.get('name') == b.get('name')) {
            return 0;
          } else if(a.get('name') > b.get('name')) {
            return 1;
          } else {
            return -1;
          }
        } else if(a.get('progress') > b.get('progress')) {
          return -1;
        } else {
          return 1;
        }
      } else if(a.get('global') && !b.get('global')) {
        return 1;
      } else {
        return -1;
      }
    });
  }
  return badges[0];
};
LingoLinqAAC.Badge.best_earned_badge = function(badges) {
  badges = (badges || []).filter(function(b) { return b.get('earned'); })
  badges = badges.sort(function(a, b) {
    // first show non-dismissed badges, then show most-recently-earned
    if(a.get('dismissed') && !b.get('dismissed')) {
      return 1;
    } else if(!a.get('dismissed') && b.get('dismissed')) {
      return -1;
    } else {
      if(a.get('earned') > b.get('earned')) {
        return -1;
      } else if(a.get('earned') < b.get('earned')) {
        return 1;
      } else {
        if(a.get('name') > b.get('name')) {
          return 1;
        } else if(a.get('name') < b.get('name')) {
          return -1;
        } else {
          return 0;
        }
      }
    }
  });
  return badges[0];
};


export default LingoLinqAAC.Badge;
