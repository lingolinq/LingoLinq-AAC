import Component from '@ember/component';
import i18n from '../utils/i18n';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Component.extend({
  didInsertElement: function() {
    var _this = this;
    _this.process_badge();
  },
  process_badge: observer('badge', function() {
    if(this.get('badge')) {
      var _this = this;
      this.set('badge.enable_auto_tracking', !!(this.get('badge.watchlist') || this.get('badge.instance_count') ||this.get('assessment')));
      if(!this.get('badge.simple_type')) { this.set('badge.simple_type', 'custom'); }
      if(this.get('badge.instance_count')) {
        this.set('badge.tracking_type', 'instance_count');

        if(this.get('badge.word_instances')) {
          this.set('badge.instance_metric', 'word');
        } else if(this.get('badge.button_instances')) {
          this.set('badge.instance_metric', 'button');
        } else if(this.get('badge.session_instances')) {
          this.set('badge.instance_metric', 'session');
        } else if(this.get('badge.modeled_button_instances')) {
          this.set('badge.instance_metric', 'modeled_button');
        } else if(this.get('badge.modeled_word_instances')) {
          this.set('badge.instance_metric', 'modeled_word');
        } else if(this.get('badge.unique_word_instances')) {
          this.set('badge.instance_metric', 'unique_word');
        } else if(this.get('badge.unique_button_instances')) {
          this.set('badge.instance_metric', 'unique_button');
        } else if(this.get('badge.repeat_word_instances')) {
          this.set('badge.instance_metric', 'repeat_word');
        } else if(this.get('badge.geolocation_instances')) {
          this.set('badge.instance_metric', 'geolocation');
        }
      } else if(this.get('badge.watchlist')) {
        this.set('badge.tracking_type', 'watchlist');
        if(this.get('badge.words_list')) {
          var list = this.get('badge.words_list') || [];
          if(list.join) { list = list.join(','); }
          this.set('badge.string_list', list);
          this.set('badge.watchlist_type', 'words');
        } else if(this.get('badge.parts_of_speech_list')) {
          var list = this.get('badge.parts_of_speech_list') || [];
          if(list.join) { list = list.join(','); }
          this.set('badge.string_list', list);
          this.set('badge.watchlist_type', 'parts_of_speech');
        }
        this.setProperties({
          'badge.enable_watch_type_minimum': !!this.get('badge.watch_type_minimum'),
          'badge.enable_watch_total': !!this.get('badge.watch_total'),
          'badge.enable_watch_type_count': !!this.get('badge.watch_type_count'),
          'badge.enable_watch_type_interval': !!this.get('badge.watch_type_interval')
        });
      }
    }
    if(this.get('badge.consecutive_units')) {
      if(!this.get('badge.simple_type')) { this.set('badge.simple_type', 'custom'); }
      this.set('badge.criteria_type', 'consecutive_units');
    } else if(this.get('badge.matching_units')) {
      if(!this.get('badge.simple_type')) { this.set('badge.simple_type', 'custom'); }
      this.set('badge.criteria_type', 'matching_units');
    } else if(this.get('badge.matching_instances')) {
      if(!this.get('badge.simple_type')) { this.set('badge.simple_type', 'custom'); }
      this.set('badge.criteria_type', 'matching_instances');
    }
  }),
  simple_types: [
    {name: i18n.t('how_to_earn_badge', "[ How to Earn This Badge ]"), id: ''},
    {name: i18n.t('earned_by_words_per_day', "Earned by Watchwords Used Per Day"), id: 'words_per_day'},
    {name: i18n.t('earned_by_words_per_week', "Earned by Watchwords Used Per Week"), id: 'words_per_week'},
    {name: i18n.t('earned_by_buttons_per_day', "Earned by Buttons Hit Per Day"), id: 'buttons_per_day'},
    {name: i18n.t('earned_by_buttons_per_week', "Earned by Buttons Hit Per Week"), id: 'buttons_per_week'},
    {name: i18n.t('earned_by_modeling_per_day', "Earned by Modeling Events Per Day"), id: 'modeling_per_day'},
    {name: i18n.t('earned_by_modeling_per_week', "Earned by Modeling Events Per Week"), id: 'modeling_per_week'},
    {name: i18n.t('custom_tracking', "Custom or More Fine-Grained Tracking"), id: 'custom'},
  ],
  simple_assessment_types: [
    {name: i18n.t('select_simple_tracking_type', "[ How to Track for Mastery ]"), id: ''},
    {name: i18n.t('assess_by_words_per_day', "Track Watchwords Used Each Day"), id: 'words_per_day'},
    {name: i18n.t('assess_by_buttons_per_day', "Track Buttons Hit Each Day"), id: 'buttons_per_day'},
    {name: i18n.t('assess_by_modeling_per_day', "Track Modeling Events Each Day"), id: 'modeling_per_day'},
    {name: i18n.t('custom_tracking', "Custom or More Fine-Grained Tracking"), id: 'custom'},
  ],
  tracking_types: [
    {name: i18n.t('select_tracking_type', "[ Select ]"), id: ''},
    {name: i18n.t('watch_for_events', "Watch for events of a specific type"), id: 'instance_count'},
    {name: i18n.t('watch_for_list', "Watch for a list of words or word types"), id: 'watchlist'},
  ],
  watchlist_types: [
    {name: i18n.t('select_watchlist_type', "[ Select Type ]"), id: ''},
    {name: i18n.t('words_list', "Words"), id: 'words'},
    {name: i18n.t('parts_of_speech', "Parts of Speech"), id: 'parts_of_speech'},
  ],
  unit_type_list: [
    {name: i18n.t('select_type_list', "[ Select Time ]"), id: ''},
    {name: i18n.t('per_day', "Per Day"), id: 'date'},
    {name: i18n.t('per_week', "Per Week"), id: 'weekyear'},
    {name: i18n.t('every_other_week', "Every Other Week"), id: 'biweekyear'},
    {name: i18n.t('per_month', "Per Month"), id: 'monthyear'},
  ],
  instance_metric_list: [
    {name: i18n.t('select_metric_list', "[ Select Metric ]"), id: ''},
    {name: i18n.t('words2', "Selected Word(s)"), id: 'word'},
    {name: i18n.t('selected_buttons2', "Selected Button(s)"), id: 'button'},
    {name: i18n.t('sessions2', "Session(s)"), id: 'session'},
    {name: i18n.t('modeled_words2', "Modeled Word(s)"), id: 'modeled_word'},
    {name: i18n.t('modeled_buttons2', "Modeled Button(s)"), id: 'modeled_button'},
    {name: i18n.t('unique_words2', "Unique Word(s)"), id: 'unique_word'},
    {name: i18n.t('unique_buttons2', "Unique Button(s)"), id: 'unique_button'},
  ],
  custom_badge: computed('badge.simple_type', function() {
    return this.get('badge.simple_type') == 'custom';
  }),
  simple_badge: computed('badge.simple_type', function() {
    return (this.get('badge.simple_type') && this.get('badge.simple_type') != 'custom');
  }),
  simple_word_badge: computed('badge.simple_type', function() {
    var type = this.get('badge.simple_type') || '';
    return type.match(/words/);
  }),
  simple_button_badge: computed('badge.simple_type', function() {
    var type = this.get('badge.simple_type') || '';
    return type.match(/buttons/);
  }),
  simple_modeling_badge: computed('badge.simple_type', function() {
    var type = this.get('badge.simple_type') || '';
    return type.match(/modeling/);
  }),
  simple_badge_unit: computed('badge.simple_type', function() {
    var type = this.get('badge.simple_type') || '';
    if(type.match(/per_day/)) {
      return i18n.t('days_lower', "days");
    } else if(type.match(/per_week/)) {
      return i18n.t('weeks_lower', "weeks");
    } else {
      return i18n.t('units_lower', "units");
    }
  }),
  criteria_type_list: computed('badge.interval', function() {
    if(this.get('badge.interval') == 'monthyear') {
      return [
        {name: i18n.t('select_criteria_list', "[ Select Criteria ]"), id: ''},
        {name: i18n.t('every_month_in_a_sequence_for', "Every Month in a Sequence for"), id: 'consecutive_units'},
        {name: i18n.t('multiple_months_at_least', "Multiple Months, at Least"), id: 'matching_units'},
        {name: i18n.t('for_a_total_button_count_of', "For a Total Count of"), id: 'matching_instances'},
      ];
    } else if(this.get('badge.interval') == 'biweekyear') {
      return [
        {name: i18n.t('select_criteria_list', "[ Select Criteria ]"), id: ''},
        {name: i18n.t('every_other_week_in_a_sequence_for', "Every Two Weeks in a Sequence for"), id: 'consecutive_units'},
        {name: i18n.t('multiple_biweeks_at_least', "Multiple Bi-Weeks, at Least"), id: 'matching_units'},
        {name: i18n.t('for_a_total_button_count_of', "For a Total Count of"), id: 'matching_instances'},
      ];
    } else if(this.get('badge.interval') == 'weekyear') {
      return [
        {name: i18n.t('select_criteria_list', "[ Select Criteria ]"), id: ''},
        {name: i18n.t('every_week_in_a_sequence_for', "Every Week in a Sequence for"), id: 'consecutive_units'},
        {name: i18n.t('multiple_weeks_at_least', "Multiple Weeks, at Least"), id: 'matching_units'},
        {name: i18n.t('for_a_total_button_count_of', "For a Total Count of"), id: 'matching_instances'},
      ];
    } else {
      return [
        {name: i18n.t('select_criteria_list', "[ Select Criteria ]"), id: ''},
        {name: i18n.t('every_day_in_a_sequence_for', "Every Day in a Sequence for"), id: 'consecutive_units'},
        {name: i18n.t('multiple_days_at_least', "Multiple Days, at Least"), id: 'matching_units'},
        {name: i18n.t('for_a_total_button_count_of', "For a Total Count of"), id: 'matching_instances'},
      ];
    }
  }),
  update_watch_type_values: observer(
    'badge.enable_watch_total',
    'badge.enable_watch_type_minimum',
    'badge.enable_watch_type_count',
    'badge.enable_watch_type_interval',
    function() {
      if(this.get('badge.enable_watch_total') !== undefined) {
        this.set('badge.watch_total', this.get('badge.enable_watch_total') ? (this.get('badge.watch_total') || 1) : null);
      }
      if(this.get('badge.enable_watch_type_minimum') !== undefined) {
        this.set('badge.watch_type_minimum', this.get('badge.enable_watch_type_minimum') ? (this.get('badge.watch_type_minimum') || 1) : null);
      }
      if(this.get('badge.enable_watch_type_count') !== undefined) {
        this.set('badge.watch_type_count', this.get('badge.enable_watch_type_count') ? (this.get('badge.watch_type_count') || 1) : null);
      }
      if(this.get('badge.enable_watch_type_interval') !== undefined) {
        this.set('badge.watch_type_interval', this.get('badge.enable_watch_type_interval') ? (this.get('badge.watch_type_interval') || 1) : null);
      }
    }
  ),
  update_criteria_values: observer('badge.criteria_type', function() {
    if(this.get('badge.criteria_type') == 'consecutive_units') {
      this.set('badge.consecutive_units', this.get('badge.consecutive_units') || 1);
      this.set('badge.for_consecutive_units', true);
      this.set('badge.matching_units', null);
      this.set('badge.for_matching_units', false);
      this.set('badge.matching_instances', null);
      this.set('badge.for_matching_instances', false);
    } else if(this.get('badge.criteria_type') == 'matching_units') {
      this.set('badge.consecutive_units', null);
      this.set('badge.for_consecutive_units', false);
      this.set('badge.matching_units', this.get('badge.matching_units') || 1);
      this.set('badge.for_matching_units', true);
      this.set('badge.matching_instances', null);
      this.set('badge.for_matching_instances', false);
    } else if(this.get('badge.criteria_type') == 'matching_instances') {
      this.set('badge.consecutive_units', null);
      this.set('badge.for_consecutive_units', false);
      this.set('badge.matching_units', null);
      this.set('badge.for_matching_units', false);
      this.set('badge.matching_instances', this.get('badge.matching_instances') || 1);
      this.set('badge.for_matching_instances', true);
    }
  }),
  update_tracking_types: observer('badge.tracking_type', function() {
    console.log(this.get('badge'));
    if(this.get('badge.tracking_type') == 'watchlist') {
      this.set('badge.watchlist', true);
      this.set('badge.instance_count', null);
    } else if(this.get('badge.tracking_type') == 'instance_count') {
      this.set('badge.watchlist', null);
      this.set('badge.instance_count', this.get('badge.instance_count') || 1);
    }
  }),
  loggy: observer('badge.auto_tracking', function() {
    console.log('change!');
  }),
  update_lists: observer(
    'badge.string_list',
    'badge.watchlist_type',
    'badge.simple_type',
    function() {
      if(this.get('badge.watchlist_type') == 'words' && this.get('badge.string_list')) {
        this.set('badge.words_list', this.get('badge.string_list'));
      } else if((this.get('badge.simple_type') || '').match(/words/)) {
        this.set('badge.words_list', this.get('badge.string_list'));
      } else if(this.get('badge.watchlist_type') == 'parts_of_speech' && this.get('badge.string_list')) {
        this.set('badge.parts_of_speech_list', this.get('badge.string_list'));
      }
    }
  ),
  update_instance_count: observer('badge.instance_count', 'badge.instance_metric', function() {
    if(this.get('badge.instance_metric') && this.get('badge.instance_count')) {
      var _this = this;
      ['word_instances', 'button_instances', 'session_instances', 'modeled_button_instances',
            'modeled_word_instances', 'unique_word_instances', 'unique_button_instances',
            'repeat_word_instances', 'geolocation_instances'].forEach(function(key) {
        _this.set('badge.' + key, null);
      });

      this.set('badge.' + this.get('badge.instance_metric') + '_instances', this.get('badge.instance_count'));
    }
  }),
  unit_type: computed('badge.interval', function() {
    if(this.get('badge.interval') == 'monthyear') {
      return i18n.t('month', 'month');
    } else if(this.get('badge.interval') == 'biweekyear') {
      return i18n.t('other_week', 'other week');
    } else if(this.get('badge.interval') == 'weekyear') {
      return i18n.t('week', 'week');
    } else {
      return i18n.t('day', 'day');
    }
  }),
  unit_type_plural: computed('badge.interval', function() {
    if(this.get('badge.interval') == 'monthyear') {
      return i18n.t('months', 'months');
    } else if(this.get('badge.interval') == 'biweekyear') {
      return i18n.t('bi-weeks', 'bi-weeks');
    } else if(this.get('badge.interval') == 'weekyear') {
      return i18n.t('weeks', 'weeks');
    } else {
      return i18n.t('days', 'days');
    }
  }),
  event_type_plural: computed('badge.instance_metric', function() {
    if(this.get('badge.instance_metric') == 'button') {
      return i18n.t('buttons', 'buttons');
    } else if(this.get('badge.instance_metric') == 'word') {
      return i18n.t('words', 'words');
    } else if(this.get('badge.instance_metric') == 'session') {
      return i18n.t('sessions', 'sessions');
    } else if(this.get('badge.instance_metric') == 'modeled_word') {
      return i18n.t('modeled_words', 'modeled words');
    } else if(this.get('badge.instance_metric') == 'modeled_button') {
      return i18n.t('modeled_buttons', 'modeled buttons');
    } else if(this.get('badge.instance_metric') == 'unique_word') {
      return i18n.t('unique_words', 'unique words');
    } else if(this.get('badge.instance_metric') == 'unique_button') {
      return i18n.t('unique_buttons', 'unique buttons');
    } else {
      return i18n.t('instances', 'instances');
    }
  }),
  watchlist_type_plural: computed('badge.watchlist_type', function() {
    if(this.get('badge.watchlist_type') == 'words') {
      return i18n.t('words', 'words');
    } else if(this.get('badge.watchlist_type') == 'parts_of_speech') {
      return i18n.t('parts_of_speech', 'parts of speech');
    } else {
      return i18n.t('units', 'units');
    }
  }),
  in_list: computed('index', function() {
    return this.get('index') !== undefined && this.get('index') !== null;
  }),
  actions: {
    change_image: function() {
      this.modal.open('badge-image', {badge: this.get('badge') });
    },
    delete_badge: function(state) {
      this.sendAction('remove_badge', this.get('badge'));
    },
    change_sound: function() {
      var _this = this;
      this.modal.open('new-sound').then(function(sound) {
//        debugger
        if(sound && sound.url) {
          _this.set('badge.sound_url', sound.url);
        }
      });
    },
    delete_sound: function() {
      this.get('badge').set('sound_url', null);
    }
  }
});
