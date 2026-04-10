import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import persistence from '../../utils/persistence';
import i18n from '../../utils/i18n';
import modal from '../../utils/modal';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Controller.extend({
  app_state: service('app-state'),
  refresh_lists: function() {
    this.set('logs', {});
    this.refresh_stats();
    this.refresh_report();
    if(this.get('model.permissions.manage')) {
      this.refresh_logs();
    }
  },
  refresh_logs: function() {
    var _this = this;
    var id = this.get('model.id');
    if(!id) { return; }
    this.set('logs', {loading: true});
    persistence.ajax('/api/v1/organizations/' + id + '/logs', {type: 'GET'}).then(function(data) {
      if(_this.get('model.id') == id) {
        _this.set('logs.loading', null);
        _this.set('logs.data', data.log);
      }
    }, function() {
      if(_this.get('model.id') == id) {
        _this.set('logs.loading', null);
        _this.set('logs.data', null);
      }
    });
  },
  refresh_logs_on_reload: observer('model.permissions.manage', 'logs.loading', 'logs.data', function() {
    if(this.get('model.permissions.manage') && !this.get('logs.loading') && !this.get('logs.data')) {
      this.refresh_logs();
    }
  }),
  loading_org: computed('model.permissions', function() {
    return !this.get('model.permissions');
  }),
  first_log: computed('logs.data', function() {
    return (this.get('logs.data') || [])[0];
  }),
  recent_users: computed('logs.data', function() {
    return (this.get('logs.data') || []).map(function(e) { return e.user.id; }).uniq().length;
  }),
  recent_sessions: computed('logs.data', function() {
    return (this.get('logs.data') || []).length;
  }),
  words: computed('user_counts.word_counts', function() {
    var counts = this.get('user_counts.word_counts') || [];
    return {
      words_by_frequency: counts.map(function(w) { return {text: w.word, count: w.cnt }; })
    };
  }),
  combined_models: computed('user_counts.modeled_word_counts', 'user_counts.supervisor_models', function() {
    var counts = this.get('user_counts.modeled_word_counts') || [];
    var sup = (this.get('user_counts.supervisor_models') || {});
    for(var key in sup) {
      var word = counts.find(function(w) { return w.word == key; });
      if(!word && !key.match(/^(\+|:)/)) {
        word = {word: key, cnt: 0};
        counts.push(word);
      }
      if(word) {
        word.cnt = word.cnt + sup[key];
      }
    }
    return {
      words_by_frequency: counts.map(function(w) { return {text: w.word, count: w.cnt }; })
    };
  }),
  multi_home_boards: computed('model.home_board_keys', function() {
    return (this.get('model.home_board_keys') || []).length > 1;
  }),
  default_home_board_user: computed('model.default_home_board.key', function() {
    var key = this.get('model.default_home_board.key') || '';
    return key.split('/')[0] || '';
  }),
  default_home_board_name: computed('model.default_home_board.key', function() {
    var key = this.get('model.default_home_board.key') || '';
    return key.split('/').slice(1).join('/') || '';
  }),
  refresh_stats: function() {
    var _this = this;
    _this.set('weekly_stats', null);
    _this.set('user_counts', null);
    persistence.ajax('/api/v1/organizations/' + this.get('model.id') + '/stats', {type: 'GET'}).then(function(stats) {
      _this.set('weekly_stats', stats.weeks);
      _this.set('user_counts', stats.user_counts);
    }, function() {
      _this.set('weekly_stats', {error: true});
    });
  },
  refresh_report: function() {
    var _this = this;
    _this.set('report', {loading: true});
    persistence.ajax('/api/v1/organizations/' + this.get('model.id') + '/admin_reports?report=summaries', {type: 'GET'}).then(function(report) {
      _this.set('report', report);
    }, function(err) {
      _this.set('report', {error: true});
    });
  },
  redis_state: computed('model.site.mem_redis', 'model.site.max_redis', function() {
    var mem = parseInt(this.get('model.site.mem_redis'), 10);
    var max = parseInt(this.get('model.site.max_redis'), 10);
    if(mem > max * 0.95) {
      return 'site-emergency';
    } else if(mem > max * 0.85) {
      return 'site-danger';
    } else if(mem > max * 0.65) {
      return 'site-warning';
    }
    return 'site-normal';
  }),
  queue_state: computed('model.site.default_queue', 'model.site.priority_queue', 'model.site.slow_queue', function() {
    var res = {
      'default-limit': 5000,
      'slow-limit': 15000,
      'priority-limit': 50
    };
    ['default', 'priority', 'slow'].forEach(function(q) {
      if(q > res[q + '-limit'] * 0.95) {
        res[q] = 'site-emergency';
      } else if(q > res[q + '-limit'] * 0.80) {
        res[q] = 'site-danger';
      } else if(q > res[q + '-limit'] * 0.5) {
        res[q] = 'site-warning';
      } else {
        res[q] = 'site-normal';
      }
    });
    return res;
  }),
  actions: {
    update_org: function() {
      var org = this.get('model');
      org.save().then(null, function(err) {
        console.log(err);
        modal.error(i18n.t('org_update_failed', 'Organization update failed unexpectedly'));
      });
    },
    edit_org: function() {
      this.transitionToRoute('organization.settings', this.get('model.id'));
    }
  }
});
