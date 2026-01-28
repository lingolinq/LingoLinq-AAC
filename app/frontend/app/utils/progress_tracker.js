import EmberObject from '@ember/object';
import { later as runLater } from '@ember/runloop';
import i18n from './i18n';
// import persistence from './persistence';

var progress_tracker = EmberObject.extend({
  success_wait: 2500,
  error_wait: 1500,
  setup: function(persistence) {
    this.persistence = persistence;
  },
  track: function(progress, status_callback, opts) {
    this.track_ids = this.track_ids || {};
    var id = null;
    while(!id || this.track_ids[id]) {
      id = Math.random() * 99999;
    }
    var _this = this;
    this.check(progress.status_url, function(data) {
      if(_this.track_ids[id]) {
        status_callback(data);
      }
    }, 0, id, opts);
    this.track_ids[id] = true;
    return id;
  },
  untrack: function(track_id) {
    this.track_ids = this.track_ids || {};
    if(track_id) {
      this.track_ids[track_id] = false;
    }
  },
  run_later: function(_this, cb, delay) {
    runLater(_this, cb, delay);
  },
  check: function(url, status_callback, error_count, track_id, opts) {
    opts = opts || {};
    opts.success_wait = opts.success_wait || progress_tracker.success_wait;
    opts.error_wait = opts.error_wait || progress_tracker.error_wait;
    error_count = error_count || 0;
    var _this = this;
    this.persistence.ajax(url, {type: 'GET'}).then(function(data) {
      data.progress.still_working = false;
      if(!data.progress.finished_at) {
        data.progress.still_working = true;
        progress_tracker.run_later(_this, function() {
          if(this.track_ids[track_id]) {
            this.check(url, status_callback, 0, track_id, opts);
          }
        }, opts.success_wait);
      }
      status_callback(data.progress);
//       Example progress object:
//       {
//         id: id,
//         status_url: url,
//         status: (started|pending|finished|errored)
//       }
    }, function(err) {
      if(error_count > 5) {
        status_callback({
          status: 'errored',
          sub_status: 'server_unresponsive'
        });
      } else {
        progress_tracker.run_later(_this, function() {
          if(this.track_ids[track_id]) {
            this.check(url, status_callback, error_count + 1, track_id, opts);
          }
        }, opts.error_wait);
      }
    });
  },
  status_text: function(status, sub_status) {
    var res = null;
    if(status == 'pending') {
      res = i18n.t('initializing', "Initializing...");
    } else if(status == 'started') {
      if(sub_status == 'generating_files') {
        res = i18n.t('generating_files', "Generating file(s)...");
      } else if(sub_status == 'converting_file' || sub_status == 'converting_files') {
        res = i18n.t('converting_files', "Converting file(s)");
      } else if(sub_status == 'uploading_file' || sub_status == 'uploading_files') {
        res = i18n.t('finalizing files', "Finalizing file(s)");
      } else {
        res = i18n.t('progressing', "Processing...");
      }
    } else if(status == 'finished') {
      res = i18n.t('progress_ready', "Ready!");
    } else if(status == 'errored') {
      res = i18n.t('progress_error', "Error");
    }
    return res;
  }
}).create();

export default progress_tracker;
