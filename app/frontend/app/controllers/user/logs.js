import Controller from '@ember/controller';
import { later as runLater } from '@ember/runloop';
import { inject as service } from '@ember/service';
import $ from 'jquery';
import i18n from '../../utils/i18n';
import contentGrabbers from '../../utils/content_grabbers';
import app_state from '../../utils/app_state';
import EmberObject from '@ember/object';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import LingoLinq from '../../app';

export default Controller.extend({
  appState: service('app-state'),
  modal: service(),

  queryParams: ['type', 'start', 'end', 'highlighted', 'device_id', 'location_id'],
  reset_params: function () {
    var _this = this;
    _this.set('model', {});
    this.get('queryParams').forEach(function (param) {
      _this.set(param, null);
    });
    this.set('type', 'note');
  },
  filtered_results: computed('start', 'end', 'device_id', 'location_id', function () {
    return !!(this.get('start') || this.get('end') || this.get('device_id') || this.get('location_id'));
  }),
  type: null,
  start: null,
  end: null,
  device_id: null,
  location_id: null,
  title: computed('model.user_name', function () {
    return "Logs for " + this.get('model.user_name');
  }),
  refresh_on_params_change: observer(
    'type',
    'start',
    'end',
    'device_id',
    'location_id',
    'highlighted',
    function () {
      this.send('refresh');
    }
  ),
  messages_only: computed('type', function () {
    return this.get('type') == 'note';
  }),
  logging_cutoff_seconds: computed('meta.logging_cutoff_min', function () {
    var cutoff = this.get('meta.logging_cutoff_min') * 60 * 60;
    return cutoff;
  }),
  all_logs: computed('type', 'filtered_results', 'highlighted', function () {
    return !this.get('filtered_results') && (!this.get('type') || this.get('type') == 'all') && this.get('highlighted') != '1';
  }),
  pending_eval: computed(function () {
    var user_id = this.get('model.id');
    var assessment = this.appState.get('last_assessment_for_' + user_id) || {};
    var saved = false;
    var _this = this;
    (_this.get('logs') || []).forEach(function (log) {
      if (assessment.uid && log.get('eval.uid') == assessment.uid) {
        saved = true;
        this.appState.set('last_assessment_for_' + user_id, null);
      }
    });
    if (!saved && assessment.uid) {
      return assessment;
    }
  }),
  actions: {
    obl_export: function () {
      this.modal.open('download-log', { user: this.get('model') });
    },
    recordNote: function (type) {
      var _this = this;
      var user = this.get('model');
      this.modal.open('record-note', { note_type: type, user: user }).then(function () {
        _this.send('refresh');
      });
    },
    quick_assessment: function () {
      var _this = this;
      app_state.check_for_currently_premium(_this.get('model'), 'quick_assessment').then(function () {
        this.modal.open('quick-assessment', { user: _this.get('model') }).then(function () {
          _this.send('refresh');
        });
      }, function () { });
    },
    update_logging_code: function () {
      var code = this.get('logging_code');
      var now = (new Date()).getTime();
      var codes = LingoLinq.session.get('logging_codes') || [];
      var _this = this;
      codes = codes.filter(function (c) { return c.user_id != _this.get('model.id') });
      codes.push({
        user_id: _this.get('model.id'),
        code: code,
        timestamp: now
      });
      LingoLinq.session.set('logging_codes', codes);
      this.send('refresh');
    },
    refresh: function () {
      var model_id = this.get('model.id');
      if (!model_id) { return; }
      // Skip if user_id is 'cache' or starts with 'cache:' (from boards cache endpoint)
      if (model_id == 'cache' || model_id.toString().match(/^cache:/)) {
        return;
      }
      var controller = this;
      if (this.get('type') == 'all') { this.set('type', null); }
      var args = { user_id: model_id };
      if (this.get('type') && this.get('type') != 'all') {
        args.type = this.get('type');
      }
      if (this.get('highlighted') == '1') {
        args.highlighted = true;
      }
      if (this.get('start')) { args.start = this.get('start'); }
      if (this.get('end')) { args.end = this.get('end'); }
      if (this.get('device_id')) { args.device_id = this.get('device_id'); }
      if (this.get('location_id')) { args.location_id = this.get('location_id'); }

      this.set('logs', { loading: true });

      this.store.query('log', args).then(function (list) {
        controller.set('logs', list.map(function (i) { return i; }));
        var meta = $.extend({}, list.meta);
        controller.set('meta', meta);
        // weird things happen if we try to observe meta.next_url, it stops
        // updating on subsequent requests.. hence this setter.
        controller.set('more_available', !!meta.next_url);

        if (controller.get('type') == 'note' && controller.get('model')) {
          var user = controller.get('model');
          var log = controller.get('logs')[0];
          if (log && log.get('time_id') && user.get('last_message_read') != log.get('time_id')) {
            // TODO: there's a reloadRecord error happening here without the timeout,
            // you should probably figure out the root issue
            runLater(function () {
              user.set('last_message_read', log.get('time_id'));
              user.save().then(null, function () { });
            }, 1000);
          }
        }
      }, function () {
        controller.set('logs', { error: true });
      });
    },
    more: function () {
      var _this = this;
      if (this.get('more_available')) {
        var model_id = this.get('model.id');
        // Skip if user_id is 'cache' or starts with 'cache:' (from boards cache endpoint)
        if (!model_id || model_id == 'cache' || model_id.toString().match(/^cache:/)) {
          return;
        }
        var meta = this.get('meta');
        var args = { user_id: model_id, per_page: meta.per_page, offset: (meta.offset + meta.per_page) };
        if (this.get('type') && this.get('type') != 'all') {
          args.type = this.get('type');
        }
        if (this.get('start')) { args.start = this.get('start'); }
        if (this.get('end')) { args.end = this.get('end'); }
        if (this.get('device_id')) { args.device_id = this.get('device_id'); }
        if (this.get('location_id')) { args.location_id = this.get('location_id'); }
        var find = this.store.query('log', args);
        find.then(function (list) {
          _this.set('logs', _this.get('logs').concat(list.map(function (i) { return i; })));
          var meta = $.extend({}, list.meta);
          _this.set('meta', meta);
          _this.set('more_available', !!meta.next_url);
        }, function () { });
      }
    },
    clearLogs: function () {
      this.modal.open('confirm-delete-logs', { user: this.get('model') });
    },
    generate: function () {
      var _this = this;
      this.modal.open('modals/manual-log', { external_device: !!_this.get('model.external_device') }).then(function (res) {
        if (res && res.words && res.words.length > 0 && res.date) {
          var file = LingoLinq.Log.generate_obf(res.words, res.date);
          _this.send('import', file);
        }
      }, function () { });
    },
    import: function (file) {
      var _this = this;
      var log_type = 'unspecified';
      var user_id = _this.get('model.id');
      LingoLinq.Log.import(file, log_type, user_id).then(function (logs) {
        if (logs.length == 1) {
          _this.transitionToRoute('user.log', _this.get('model.user_name'), logs[0]);
        } else {
          _this.send('refresh');
          this.modal.success(i18n.t('logs_imported', "Your logs have been imported!"));
        }
      }, function (err) {
        this.modal.error(i18n.t('log_import_failed', "There was an unexpected error importing the specified logs"));
      });
    }
  }
});
