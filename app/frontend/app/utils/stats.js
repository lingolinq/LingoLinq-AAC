import Ember from 'ember';
import EmberObject from '@ember/object';
import LingoLinq from '../app';
import i18n from './i18n';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

LingoLinq.Stats = EmberObject.extend({
  no_data: computed('total_sessions', function() {
    return this.get('total_sessions') === undefined || this.get('total_sessions') === 0;
  }),
  has_data: computed('no_data', function() {
    return !this.get('no_data');
  }),
  date_strings: function() {
    var today_date = window.moment();
    var today = today_date.format('YYYY-MM-DD');
    var two_months_ago = today_date.add(-2, 'month').format("YYYY-MM-DD");
    var four_months_ago = today_date.add(-2, 'month').format("YYYY-MM-DD");
    var six_months_ago = today_date.add(-2, 'month').format("YYYY-MM-DD");
    return {
      today: today,
      two_months_ago: two_months_ago,
      four_months_ago: four_months_ago,
      six_months_ago: six_months_ago
    };
  },
  days_sorted: computed('days', function() {
    var res = [];
    for(var day in (this.get('days') || {})) {
      var day_data = this.get('days')[day];
      day_data.day = day;
      res.push(day_data);
    }
    return res.sort(function(a, b) { return a.day.localeCompare(b.day); });
  }),
  check_known_filter: observer(
    'start',
    'end',
    'started_at',
    'ended_at',
    'location_id',
    'device_id',
    'snapshot_id',
    function() {
      var date_strings = this.date_strings();
      if(this.get('snapshot_id')) {
        this.set('filter', 'snapshot_' + this.get('snapshot_id'));
      } else if(this.get('start') && this.get('end')) {
        if(!this.get('location_id') && !this.get('device_id')) {
          if(this.get('start') == date_strings.two_months_ago && this.get('end') == date_strings.today) {
            this.set('filter', 'last_2_months');
            return;
          } else if(this.get('start') == date_strings.four_months_ago && this.get('end') == date_strings.two_months_ago) {
            this.set('filter', '2_4_months_ago');
            return;
          }
        }
        this.set('filter', 'custom');
      }
    }
  ),
  filtered_snapshot_id: computed('filter', function() {
    var parts = (this.get('filter') || "").split(/_/);
    if(parts[0] == 'snapshot') {
      return parts.slice(1).join('_');
    } else {
      return null;
    }
  }),
  show_filtered_snapshot: computed('filtered_snapshot_id', 'snapshot_id', function() {
    return this.get('snapshot_id') && this.get('filtered_snapshot_id') == this.get('snapshot_id');
  }),
  filtered_start_date: computed('start_date_field', 'filter', function() {
    var date_strings = this.date_strings();
    if((this.get('filter') || "").match(/snapshot/)) {
      return null;
    } else if(this.get('filter') == 'last_2_months') {
      return date_strings.two_months_ago;
    } else if(this.get('filter') == '2_4_months_ago') {
      return date_strings.four_months_ago;
    } else {
      return this.get('start_date_field');
    }
  }),
  filtered_end_date: computed('end_date_field', 'filter', function() {
    var date_strings = this.date_strings();
    if((this.get('filter') || "").match(/snapshot/)) {
      return null;
    } if(this.get('filter') == 'last_2_months') {
      return date_strings.today;
    } else if(this.get('filter') == '2_4_months_ago') {
      return date_strings.two_months_ago;
    } else {
      return this.get('end_date_field');
    }
  }),
  custom_filter: computed('filter', function() {
    return this.get('filter') == 'custom';
  }),
  comes_before: function(stats) {
    if(!stats || !stats.get('started_at') || !stats.get('ended_at') || !this.get('started_at') || !this.get('ended_at')) {
      return false;
    } else if(this.get('ended_at') <= stats.get('ended_at') && this.get('started_at') < stats.get('started_at')) {
      return true;
    } else if(this.get('ended_at') < stats.get('ended_at') && this.get('started_at') <= stats.get('started_at')) {
      return true;
    } else if(this.get('ended_at') <= stats.get('started_at') && this.get('started_at') < stats.get('started_at')) {
      return true;
    } else if(this.get('ended_at') > stats.get('ended_at') && this.get('started_at') < stats.get('started_at')) {
      return true;
    } else {
      return false;
    }
  },
  popular_words: computed(
    'words_by_frequency',
    'modeled_words_by_frequency',
    'modeling',
    function() {
      var list = (this.get('modeling') ? this.get('modeled_words_by_frequency') : this.get('words_by_frequency')) || [];
      return list.filter(function(word, idx) { return idx < 100 && word['count'] > 1; });
    }
  ),
  weighted_words: computed(
    'words_by_frequency',
    'modeled_words_by_frequency',
    'modeling',
    function() {
      // TODO: weight correctly for side_by_side view
      var list = (this.get('modeling') ? this.get('modeled_words_by_frequency') : this.get('words_by_frequency')) || [];
      var max = (list[0] || {}).count || 0;
      var res = list.filter(function(word) { return !word.text.match(/^[\+:]/); }).map(function(word) {
        var weight = "weight_" + Math.ceil(word.count / max * 10);
        return {text: word.text, weight_class: "weighted_word " + weight};
      });
      return res.sort(function(a, b) {
        var a_text = (a.text || "").toLowerCase();
        var b_text = (b.text || "").toLowerCase();
        if(a_text < b_text) { return -1; } else if(a_text > b_text) { return 1; } else { return 0; }
      });
    }
  ),
  label: computed('started_at', 'ended_at', function() {
    return Ember.templateHelpers.date(this.get('started_at'), 'day') + " " + i18n.t('to', "to") + " " + Ember.templateHelpers.date(this.get('ended_at'), 'day');
  }),
  geo_locations: computed('locations', function() {
    return (this.get('locations') || []).filter(function(location) { return location.type == 'geo'; });
  }),
  ip_locations: computed('locations', function() {
    return (this.get('locations') || []).filter(function(location) { return location.type == 'ip_address'; });
  }),
  tz_offset: function() {
    return (new Date()).getTimezoneOffset();
  },
  local_time_blocks: computed(
    'time_offset_blocks',
    'max_time_block',
    'max_combined_time_block',
    'ref_max_time_block',
    'ref_max_combined_time_block',
    'modeling',
    'modeled_time_offset_blocks',
    'max_modeled_time_block',
    'max_combined_modeled_time_block',
    'ref_max_modeled_time_block',
    'ref_max_combined_modeled_time_block',
    function() {
      var new_blocks = {};
      var offset = this.tz_offset() / 15;
      var max = this.get('max_combined_time_block') || (this.get('max_time_block') * 2);
      if(this.get('ref_max_time_block')) {
        max = Math.max(max, this.get('ref_max_combined_time_block') || (this.get('ref_max_time_block') * 2));
      }
      var blocks = this.get('time_offset_blocks');
      if(this.get('modeling')) {
        max = this.get('max_combined_modeled_time_block') || (this.get('max_modeled_time_block') * 2);
        if(this.get('ref_max_modeled_time_block')) {
          max = Math.max(max, this.get('ref_max_combined_modeled_time_block') || (this.get('ref_max_modeled_time_block') * 2));
        }
        blocks = this.get('modeled_time_offset_blocks');
      }
      var mod = (7 * 24 * 4);
      for(var idx in blocks) {
        var new_block = (idx - offset + mod) % mod;
        new_blocks[new_block] = blocks[idx];
      }
      var res = [];
      for(var wday = 0; wday < 7; wday++) {
        var day = {day: wday, blocks: []};
        if(wday === 0) {
          day.day = i18n.t('sunday_abbrev', 'Su');
        } else if(wday == 1) {
          day.day = i18n.t('monday_abbrev', 'M');
        } else if(wday == 2) {
          day.day = i18n.t('tuesday_abbrev', 'Tu');
        } else if(wday == 3) {
          day.day = i18n.t('wednesday_abbrev', 'W');
        } else if(wday == 4) {
          day.day = i18n.t('thurs_abbrev', 'Th');
        } else if(wday == 5) {
          day.day = i18n.t('friday_abbrev', 'F');
        } else if(wday == 6) {
          day.day = i18n.t('saturday_abbrev', 'Sa');
        }
        for(var block = 0; block < (24*4); block = block + 2) {
          var val = new_blocks[(wday * 24 * 4) + block] || 0;
          val = val + (new_blocks[(wday * 24 * 4) + block + 1] || 0);
          var level = Math.ceil(val / max * 10);
          var hour = Math.floor(block / 4);
          var minute = (block % 4) === 0 ? ":00" : ":30";
          var tooltip = day.day + " " + hour + minute + ", ";
          tooltip = tooltip + i18n.t('n_events', "event", {hash: {count: val}});
          day.blocks.push({
            val: val,
            tooltip: val ? tooltip : "",
            style_class: val ? ("time_block level_" + level) : "time_block"
          });
        }
        res.push(day);
      }
      return res;
    }
  ),
  start_date_field: computed('start_at', function() {
    return (this.get('start_at') || "").substring(0, 10);
  }),
  end_date_field: computed('end_at', function() {
    return (this.get('end_at') || "").substring(0, 10);
  }),
  device_name: computed('device_id', function() {
    if(this.get('device_id')) {
      var stats = this;
      if(stats.devices && stats.devices[0] && stats.devices[0].name) {
        return stats.devices[0].name;
      }
    }
    return i18n.t('device_lower', "device");
  }),
  location_name: computed('location_id', function() {
    var location_id = this.get('location_id');
    var stats = this;
    if(location_id && stats && stats.locations) {
      var location = stats.locations.find(function(l) { return l.id == location_id; });
      if(location) {
        if(location.type == 'geo') {
          return location.short_name || i18n.t('geo_location', "geo location");
        } else if(location.type == 'ip_address') {
          return location.readable_ip_address || i18n.t('ip_location', "ip address");
        }
      }
    }
    return i18n.t('location_lower', "location");
  }),
});

export default LingoLinq.Stats;
