import Controller from '@ember/controller';
import EmberObject from '@ember/object';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import i18n from '../../utils/i18n';
import persistence from '../../utils/persistence';

export default Controller.extend({
  app_state: service('app-state'),
  store: service('store'),
  queryParams: ['scope', 'start_at', 'end_at', 'filter_user_id', 'filter_device_id'],
  scope: 'organization',
  start_at: null,
  end_at: null,
  filter_user_id: '',
  filter_device_id: '',

  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };

    if(!this.start_at && window.moment) {
      this.set('start_at', window.moment().add(-14, 'day').format('YYYY-MM-DD'));
    }
    if(!this.end_at && window.moment) {
      this.set('end_at', window.moment().format('YYYY-MM-DD'));
    }
  },

  clear_filters_for_scope: observer('scope', function() {
    if(this.get('scope') !== 'organization') {
      this.set('filter_user_id', '');
      this.set('filter_device_id', '');
    }
  }),

  clear_device_when_user_cleared: observer('filter_user_id', function() {
    if(!this.get('filter_user_id')) {
      this.set('filter_device_id', '');
    }
  }),

  filter_user_loaded: observer('filter_user_id', function() {
    var uid = this.get('filter_user_id');
    var _this = this;
    if(!uid) {
      this.set('filter_user_record', null);
      return;
    }
    this.store.findRecord('user', uid).then(function(record) {
      _this.set('filter_user_record', record);
    }, function() {
      _this.set('filter_user_record', null);
    });
  }),

  is_super_admin: computed('app_state.currentUser.admin', 'app_state.currentUser.is_admin', function() {
    var user = this.get('app_state.currentUser');
    return !!(user && (user.get('admin') || user.get('is_admin')));
  }),

  scope_options: computed('is_super_admin', function() {
    var list = [
      {id: 'organization', name: i18n.t('this_organization', "This organization")}
    ];
    if(this.get('is_super_admin')) {
      list.push({id: 'none', name: i18n.t('no_organization', "No organization")});
      list.push({id: 'global', name: i18n.t('all_users', "All users")});
    }
    return list;
  }),

  user_filter_options: computed('model.all_communicators', function() {
    var list = [
      {id: '', name: i18n.t('all_org_communicators', "All organization communicators")}
    ];
    (this.get('model.all_communicators') || []).forEach(function(u) {
      if(u && u.id) {
        list.push({id: u.id, name: u.user_name || u.name || u.id});
      }
    });
    return list;
  }),

  device_filter_options: computed('filter_user_id', 'filter_user_record.devices', function() {
    if(!this.get('filter_user_id')) {
      return [];
    }
    var list = [
      {id: '', name: i18n.t('all_devices', "All devices")}
    ];
    (this.get('filter_user_record.devices') || []).forEach(function(d) {
      if(d && d.id) {
        list.push({
          id: d.id,
          name: d.name || d.device_key || d.id
        });
      }
    });
    return list;
  }),

  heatmapStats: computed('telemetry.heatmap', function() {
    var heatmap = this.get('telemetry.heatmap') || {};
    return EmberObject.create({
      touch_locations: heatmap.touch_locations || {},
      max_touches: heatmap.max_touches || 0,
      draw_id: JSON.stringify(heatmap.touch_locations || {})
    });
  }),

  has_heatmap: computed('heatmapStats.max_touches', function() {
    return this.get('heatmapStats.max_touches') > 0;
  }),

  summary_cards: computed('telemetry.summary', function() {
    var summary = this.get('telemetry.summary') || {};
    return [
      {label: i18n.t('telemetry_events', "Telemetry events"), value: summary.event_count || 0},
      {label: i18n.t('active_users', "Active users"), value: summary.active_users || 0},
      {label: i18n.t('page_views', "Page views"), value: summary.page_views || 0},
      {label: i18n.t('board_activations', "Board activations"), value: summary.board_activations || 0},
      {label: i18n.t('possible_misclicks', "Possible misclicks"), value: summary.possible_misclicks || 0},
      {label: i18n.t('clinical_sessions', "Clinical sessions"), value: summary.clinical_sessions || 0}
    ];
  }),

  show_zero_state_tips: computed('telemetry.summary', 'telemetry.loading', function() {
    if(this.get('telemetry.loading')) { return false; }
    var s = this.get('telemetry.summary');
    if(!s) { return false; }
    var vals = [s.event_count, s.active_users, s.page_views, s.board_activations, s.possible_misclicks, s.clinical_sessions];
    return vals.every(function(v) { return !v; });
  }),

  telemetry_filter_changed: observer('model.id', 'scope', 'start_at', 'end_at', 'filter_user_id', 'filter_device_id', function() {
    this.refreshTelemetry();
  }),

  refreshTelemetry: function() {
    var orgId = this.get('model.id');
    if(!orgId) { return; }
    var params = [];
    var addParam = function(key, value) {
      if(value !== null && value !== undefined && value !== '') {
        params.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
      }
    };
    addParam('scope', this.get('scope'));
    addParam('start_at', this.get('start_at'));
    addParam('end_at', this.get('end_at'));
    if(this.get('scope') === 'organization') {
      addParam('filter_user_id', this.get('filter_user_id'));
      addParam('filter_device_id', this.get('filter_device_id'));
    }
    this.set('telemetry', {loading: true});
    var _this = this;
    persistence.ajax('/api/v1/organizations/' + orgId + '/telemetry?' + params.join('&'), {type: 'GET'}).then(function(data) {
      _this.set('telemetry', data);
    }, function(err) {
      _this.set('telemetry', {
        error: (err && err.error) || i18n.t('unexpected_error', "Unexpected error")
      });
    });
  },

  actions: {
    refresh: function() {
      this.refreshTelemetry();
    },
    set_filter_user(id) {
      this.set('filter_user_id', id || '');
      this.set('filter_device_id', '');
    },
    set_filter_device(id) {
      this.set('filter_device_id', id || '');
    }
  }
});
