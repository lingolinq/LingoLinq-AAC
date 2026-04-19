import Controller from '@ember/controller';
import EmberObject from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater, scheduleOnce, run } from '@ember/runloop';
import $ from 'jquery';
import i18n from '../../utils/i18n';
import persistence from '../../utils/persistence';
import LingoLinq from '../../app';
import app_state from '../../utils/app_state';
import modal from '../../utils/modal';
import Utils from '../../utils/misc';
import Stats from '../../utils/stats';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Controller.extend({
  title: computed('model.user_name', function() {
    if(this.get('model.user_name')) {
      return this.get('model.user_name') + "'s Activity";
    }
  }),
  queryParams: ['start', 'end', 'location_id', 'device_id', 'snapshot_id', 'split', 'start2', 'end2', 'location_id2', 'device_id2', 'snapshot_id2'],
  reset_params: function() {
    var _this = this;
    _this.set('model', {});
    _this.set('usage_stats', null);
    _this.set('usage_stats2', null);
    _this.set('left_pending', null);
    _this.set('right_pending', null);
    this.get('queryParams').forEach(function(param) {
      _this.set(param, null);
    });
  },
  start: null,
  end: null,
  location_id: null,
  device_id: null,
  snapshot_id: null,
  split: null,
  start2: null,
  end2: null,
  location_id2: null,
  device_id2: null,
  snapshot_id2: null,
  some_data: computed(
    'usage_stats.has_data',
    'status',
    'usage_stats2.has_data',
    'status2',
    function() {
      return !!((this.get('usage_stats.has_data') && !this.get('status')) || (this.get('usage_stats2.has_data') && !this.get('status2')));
    }
  ),
  // Explicit display values so templates update when usage_stats is replaced (binding fix)
  display_total_sessions: computed('usage_stats', 'usage_stats.total_sessions', function() { var s = this.get('usage_stats'); return s ? s.get('total_sessions') : undefined; }),
  display_total_words: computed('usage_stats', 'usage_stats.total_words', function() { var s = this.get('usage_stats'); return s ? s.get('total_words') : undefined; }),
  display_total_utterances: computed('usage_stats', 'usage_stats.total_utterances', function() { var s = this.get('usage_stats'); return s ? s.get('total_utterances') : undefined; }),
  display_total_buttons: computed('usage_stats', 'usage_stats.total_buttons', function() { var s = this.get('usage_stats'); return s ? s.get('total_buttons') : undefined; }),
  display_words_per_utterance: computed('usage_stats', 'usage_stats.words_per_utterance', function() { var s = this.get('usage_stats'); return s ? s.get('words_per_utterance') : undefined; }),
  display_words_per_minute: computed('usage_stats', 'usage_stats.words_per_minute', function() { var s = this.get('usage_stats'); return s ? s.get('words_per_minute') : undefined; }),
  display_utterances_per_minute: computed('usage_stats', 'usage_stats.utterances_per_minute', function() { var s = this.get('usage_stats'); return s ? s.get('utterances_per_minute') : undefined; }),
  display_buttons_per_minute: computed('usage_stats', 'usage_stats.buttons_per_minute', function() { var s = this.get('usage_stats'); return s ? s.get('buttons_per_minute') : undefined; }),
  // Right side (compare) display values
  display_total_sessions2: computed('usage_stats2', 'usage_stats2.total_sessions', function() { var s = this.get('usage_stats2'); return s ? s.get('total_sessions') : undefined; }),
  display_total_words2: computed('usage_stats2', 'usage_stats2.total_words', function() { var s = this.get('usage_stats2'); return s ? s.get('total_words') : undefined; }),
  display_total_utterances2: computed('usage_stats2', 'usage_stats2.total_utterances', function() { var s = this.get('usage_stats2'); return s ? s.get('total_utterances') : undefined; }),
  display_total_buttons2: computed('usage_stats2', 'usage_stats2.total_buttons', function() { var s = this.get('usage_stats2'); return s ? s.get('total_buttons') : undefined; }),
  display_words_per_utterance2: computed('usage_stats2', 'usage_stats2.words_per_utterance', function() { var s = this.get('usage_stats2'); return s ? s.get('words_per_utterance') : undefined; }),
  display_words_per_minute2: computed('usage_stats2', 'usage_stats2.words_per_minute', function() { var s = this.get('usage_stats2'); return s ? s.get('words_per_minute') : undefined; }),
  display_utterances_per_minute2: computed('usage_stats2', 'usage_stats2.utterances_per_minute', function() { var s = this.get('usage_stats2'); return s ? s.get('utterances_per_minute') : undefined; }),
  display_buttons_per_minute2: computed('usage_stats2', 'usage_stats2.buttons_per_minute', function() { var s = this.get('usage_stats2'); return s ? s.get('buttons_per_minute') : undefined; }),
  wordPairsForSankey: computed('usage_stats.word_pairs', function() {
    var pairs = this.get('usage_stats.word_pairs') || {};
    var arr = Object.keys(pairs).map(function(k) {
      var p = pairs[k];
      return { from: p.a, to: p.b, flow: p.count || 0 };
    }).filter(function(d) { return d.from && d.to && d.flow > 0; });
    return arr.sort(function(a, b) { return (b.flow || 0) - (a.flow || 0); }).slice(0, 50);
  }),
  wordPairsForSankey2: computed('usage_stats2.word_pairs', function() {
    var pairs = this.get('usage_stats2.word_pairs') || {};
    var arr = Object.keys(pairs).map(function(k) {
      var p = pairs[k];
      return { from: p.a, to: p.b, flow: p.count || 0 };
    }).filter(function(d) { return d.from && d.to && d.flow > 0; });
    return arr.sort(function(a, b) { return (b.flow || 0) - (a.flow || 0); }).slice(0, 50);
  }),
  refresh_left_on_type_change: observer(
    'start',
    'end',
    'location_id',
    'device_id',
    'snapshot_id',
    'model.id',
    function() {
      var _this = this;
      scheduleOnce('actions', this, this.load_left_charts);
    }
  ),
  refresh_right_on_type_change: observer(
    'start2',
    'end2',
    'location_id2',
    'device_id2',
    'snapshot_id2',
    'model.id',
    function() {
      var _this = this;
      scheduleOnce('actions', this, this.load_right_charts);
    }
  ),
  handle_split: observer('split', 'usage_stats', 'usage_stats2', function() {
    if(this.get('split') && this.get('usage_stats') && !this.get('usage_stats2')) {
      this.load_right_charts();
    } else if(!this.get('split')) {
      this.set('usage_stats2', null);
      this.set('status2', null);
      this.set('start2', null);
      this.set('end2', null);
      this.set('device_id2', null);
      this.set('snapshot_id2', null);
      this.set('location_id2', null);
      this.draw_charts();
    }
  }),
  different_dates: computed('usage_stats', 'usage_stats2', function() {
    if(this.get('usage_stats') && this.get('usage_stats2')) {
      if(this.get('usage_stats').comes_before(this.get('usage_stats2'))) {
        return true;
      } else if(this.get('usage_stats2').comes_before(this.get('usage_stats'))) {
        return true;
      }
    }
    return false;
  }),
  draw_charts: function() {
    var stats = this.get('usage_stats');
    var controller = this;
    if(!stats) { return; }

    var draw_id = Math.random() * 9999999;
    runLater(function() {
      if(controller.get('usage_stats')) {
        controller.set('usage_stats.draw_id', draw_id);
      }
      if(controller.get('usage_stats2')) {
        controller.set('usage_stats2.draw_id', draw_id);
      }
    });
  },
  model_id: computed('model.id', function() {
    return this.get('model.id');
  }),
  already_loaded: function(side, stats) {
    if(!stats) { return false; }
    var suffix = side == 'left' ? '' : '2';
    var keys = ['device_id', 'location_id', 'snapshot_id', 'start', 'end'];
    var ref = this.get('status' + suffix) || this.get('usage_stats' + suffix);
    var matches = true;
    var _this = this;
    keys.forEach(function(key) {
      if(emberGet(ref, key) != _this.get(key + suffix)) {
        matches = false;
      }
    });
    return matches;
  },
  load_core: function() {
    var _this = this;
    if(!this.get('model.core_lists')) {
      persistence.ajax('/api/v1/users/' + this.get('model.id') + '/core_lists', {type: 'GET'}).then(function(res) {
        _this.set('model.core_lists', res);
      }, function(err) {
      });
    }
  },
  load_snapshots: function() {
    var _this = this;
    Utils.all_pages('snapshot', {user_id: this.get('model.id')}, function(res) {
      _this.set('snapshots', res);
      if(_this.get('usage_stats')) {
        _this.get('usage_stats').check_known_filter();
      }
      if(_this.get('usage_stats2')) {
        _this.get('usage_stats2').check_known_filter();
      }
    }).then(function(res) {
      _this.set('snapshots', res);
      if(_this.get('usage_stats')) {
        _this.get('usage_stats').check_known_filter();
      }
      if(_this.get('usage_stats2')) {
        _this.get('usage_stats2').check_known_filter();
      }
    }, function(err) {
    });
  },
  load_left_charts: function() {
    this.load_charts('left');
  },
  load_right_charts: function() {
    if(!this.get('split')) { return; }
    this.load_charts('right');
  },
  load_charts: function(side) {
    side = side || "left";
    // must have an active paid subscription to access reports for a user's account
    if(!this.get('model.preferences.logging') || !this.get('model.currently_premium')) {
      return;
    }

    if(this.already_loaded(side, side == 'left' ? this.get('usage_stats') : this.get('usage_stats2'))) {
      runLater(this, this.draw_charts);
      return;
    }

    var pending_key_name = 'left_pending';
    var pending_key_value = null;
    if(side == 'left') {
      this.set('last_start', this.get('start') || "_blank");
      this.set('last_end', this.get('end') || "_blank");
      this.set('last_device_id', this.get('device_id') || "_blank");
      this.set('last_snapshot_id', this.get('snapshot_id') || "_blank");
      this.set('last_location_id', this.get('location_id') || "_blank");
      pending_key_value = this.get('last_start') + ":" + this.get('last_end') + ":" + this.get('last_device_id') + ":" + this.get('last_location_id') + ":" + this.get('last_snapshot_id');
    } else {
      pending_key_name = 'right_pending';
      this.set('last_start2', this.get('start2') || "_blank");
      this.set('last_end2', this.get('end2') || "_blank");
      this.set('last_device_id2', this.get('device_id2') || "_blank");
      this.set('last_snapshot_id2', this.get('snapshot_id2') || "_blank");
      this.set('last_location_id2', this.get('location_id2') || "_blank");
      pending_key_value = this.get('last_start2') + ":" + this.get('last_end2') + ":" + this.get('last_device_id2') + ":" + this.get('last_location_id2') + ":" + this.get('last_snapshot_id2');
    }
    if(pending_key_value && this.get(pending_key_name) == pending_key_value) { return; }
    this.set(pending_key_name, pending_key_value);
    this.set('last_model_id', this.get('model_id') || "_blank");
    var controller = this;
    var args = {};
    ['start', 'end', 'location_id', 'device_id', 'snapshot_id'].forEach(function(key) {
      var lookup = key;
      if(side == 'right') { lookup = key + "2"; }
      if(controller.get(lookup)) {
        args[key] = controller.get(lookup);
      }
    });
    if(side == 'left' && !args.start && !args.end) {
      var tmp_stats = this.get('usage_stats') || Stats.create({});
      var dates = typeof tmp_stats.date_strings === 'function' ? tmp_stats.date_strings() : { today: window.moment().format('YYYY-MM-DD'), two_months_ago: window.moment().add(-2, 'month').format('YYYY-MM-DD') };
      args.start = dates.two_months_ago;
      args.end = dates.today;
    }
    if(side == 'right' && (!this.get('usage_stats.filter') || this.get('usage_stats.filter') == 'last_2_months') && !args.start && !args.end) {
      var tmp_stats = this.get('usage_stats') || Stats.create({});
      var dates = typeof tmp_stats.date_strings === 'function' ? tmp_stats.date_strings() : { four_months_ago: window.moment().add(-4, 'month').format('YYYY-MM-DD'), two_months_ago: window.moment().add(-2, 'month').format('YYYY-MM-DD') };
      args.start = dates.four_months_ago;
      args.end = dates.two_months_ago;
    }

    var status = $.extend({}, args, {loading: true});
    var status_key = side == 'left' ? 'status' : 'status2';
    var stats_key = side == 'left' ? 'usage_stats' : 'usage_stats2';
    controller.set(status_key, status);
    persistence.ajax('/api/v1/users/' + controller.get('model.id') + '/stats/daily', {type: 'GET', data: args}).then(function(data) {
      run(function() {
        try {
          if(controller.get(pending_key_name) == pending_key_value) { controller.set(pending_key_name, null); }
          // API returns flat JSON; allow wrapped payload if present
          var payload = data && (data.stats || data.data || data);
          if(!payload) { payload = {}; }
          // Create empty Stats then apply payload so all keys are set (create() can miss some in large hashes)
          var stats = Stats.create();
          stats.setProperties(payload);
        var summaryKeys = [
          'total_sessions', 'total_words', 'total_utterances', 'total_buttons',
          'words_per_utterance', 'words_per_minute', 'utterances_per_minute', 'buttons_per_minute'
        ];
        var defaults = {
          total_sessions: 0,
          total_words: 0,
          total_utterances: 0,
          total_buttons: 0,
          words_per_utterance: 0,
          words_per_minute: 0,
          utterances_per_minute: 0,
          buttons_per_minute: 0
        };
        summaryKeys.forEach(function(k) {
          var val = payload[k];
          if (val !== undefined && val !== null && !Number.isNaN(Number(val))) {
            stats.set(k, Number(val));
          } else if (stats.get(k) === undefined || stats.get(k) === null || Number.isNaN(Number(stats.get(k)))) {
            stats.set(k, defaults[k]);
          }
        });
        stats.setProperties({
          raw: data,
          device_id: args.device_id,
          location_id: args.location_id,
          start: args.start || (data && data.start_at && data.start_at.substring(0, 10)),
          end: args.end || (data && data.end_at && data.end_at.substring(0, 10)),
          snapshot_id: args.snapshot_id
        });
        controller.set(status_key, null);
        if(!stats.get('has_data')) {
          controller.set(status_key, {no_data: true});
        }
        controller.set(stats_key, stats);
        } catch (e) {
          console.error('[stats/daily] error in run block', e);
        }
      });
    }, function() {
      if(controller.get(pending_key_name) == pending_key_value) { controller.set(pending_key_name, null); }
      controller.set(status_key + '.loading', false);
      controller.set(status_key + '.error', true);
    });
  },
  actions: {
    reset_to_default: function() {
      var _this = this;
      _this.set('usage_stats', null);
      _this.set('usage_stats2', null);
      _this.set('left_pending', null);
      _this.set('right_pending', null);
      _this.set('status', null);
      _this.set('status2', null);
      this.get('queryParams').forEach(function(param) {
        _this.set(param, null);
      });
      this.load_left_charts();
    },
    compare_to: function() {
      this.set('split', 1);
    },
    clear_left_side: function() {
      this.set('usage_stats', this.get('usage_stats2'));
      this.set('usage_stats2', null);
      this.set('split', null);
    },
    clear_right_side: function() {
      this.set('usage_stats2', null);
      this.set('split', null);
    },
    draw_charts: function() {
      this.draw_charts();
    },
    enable_logging: function() {
      var user = this.get('model');
      user.set('preferences.logging', true);
      var _this = this;
      user.save().then(function(user) {
        if(user.get('id') == app_state.get('currentUser.id')) {
          app_state.set('currentUser', user);
        }
        _this.load_charts();
      }, function() { });
      modal.open('enable-logging', {save: true, user: user});
    },
    enable_geo_logging: function() {
      var user = this.get('model');
      user.set('preferences.geo_logging', true);
      var _this = this;
      user.save().then(function(user) {
        if(user.get('id') == app_state.get('currentUser.id')) {
          app_state.set('currentUser', user);
        }
        _this.load_charts();
      }, function() { });
    },
    update_left_filter: function(filter_type, id) {
      if(filter_type == 'date') {
        var start = this.get('usage_stats.filtered_start_date');
        var end = this.get('usage_stats.filtered_end_date');
        var snapshot_id = this.get('usage_stats.filtered_snapshot_id');
        if(snapshot_id) {
          this.set('snapshot_id', snapshot_id);
          this.set('start', null);
          this.set('end', null);
        } else {
          this.set('snapshot_id', null);
          this.set('start', start);
          this.set('end', end);
        }
      } else if(filter_type == 'device') {
        this.set('device_id', id ? id : null);
      } else if(filter_type == 'location') {
        this.set('location_id', id ? id : null);
      }
    },
    update_right_filter: function(filter_type, id) {
      if(filter_type == 'date') {
        var start = this.get('usage_stats2.filtered_start_date');
        var end = this.get('usage_stats2.filtered_end_date');
        var snapshot_id = this.get('usage_stats2.filtered_snapshot_id');
        if(snapshot_id) {
          this.set('start2', null);
          this.set('end2', null);
          this.set('snapshot_id2', snapshot_id);
        } else {
          this.set('start2', start);
          this.set('end2', end);
          this.set('snapshot_id2', null);
        }
      } else if(filter_type == 'device') {
        this.set('device_id2', id ? id : null);
      } else if(filter_type == 'location') {
        this.set('location_id2', id ? id : null);
      }
    },
    word_cloud_left: function() {
      modal.open('word-cloud', {stats: this.get('usage_stats'), stats2: this.get('usage_stats2'), user: this.get('model')});
    },
    word_cloud_right: function() {
      modal.open('word-cloud', {stats: this.get('usage_stats'), stats2: this.get('usage_stats2'), user: this.get('model')});
    },
    word_data: function(word) {
      modal.open('word-data', {word: word, usage_stats: this.get('usage_stats'), user: this.get('model')});
    },
    show_logs: function(opts) {
      opts = opts || {};
      this.transitionToRoute('user.logs', this.get('model.user_name'), {queryParams: {start: opts.start, end: opts.end, device_id: opts.device_id, location_id: opts.location_id, highlighted: null, type: 'session'}});
    },
    modify_core: function() {
      var _this = this;
      modal.open('modify-core-words', {user: this.get('model')}).then(function() {
        _this.set('model.core_lists', null);
        _this.load_core();
      });
    },
    save_snapshot: function() {
      var _this = this;
      modal.open('save-snapshot', {usage_stats: this.get('usage_stats'), user: this.get('model')}).then(function(res) {
        if(res.created) {
          modal.success(i18n.t('snapshot_created', "Snapshot successfully created! Now you can filter reports using your new snapshot."));
          _this.load_snapshots();
        }
      });
    },
    switch_communicators: function() {
      var prompt = i18n.t('select_user_for_reports', "Select User for Reports");
      app_state.controller.send('switch_communicators', {stay: true, modeling: true, skip_me: !app_state.get('currentUser.subscription.premium_supporter_plus_communicator'), route: 'user.stats', header: prompt});
    }
  }
});
