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
    if(!progress || !progress.status_url) {
      progress_tracker.run_later(progress_tracker, function() {
        if(typeof status_callback === 'function') {
          status_callback({ status: 'errored', sub_status: 'missing_progress' });
        }
      }, 0);
      return null;
    }
    var id = null;
    while(!id || this.track_ids[id]) {
      id = Math.random() * 99999;
    }
    // Mark active BEFORE scheduling the first poll. If persistence.ajax resolves
    // synchronously (cache/tests), the progress callback must still see track_ids[id]
    // true — otherwise status_callback never runs and consumers hang forever (e.g.
    // BoardHierarchy.load_with_button_set → load_button_set → generate).
    this.track_ids[id] = true;
    var _this = this;
    this.check(progress.status_url, function(data) {
      var active = _this.track_ids[id];
      var st = data && data.status;
      var fin = data && data.finished_at;
      // Always deliver terminal payloads: inactive track_id, or status/finished_at out of sync.
      var terminal = st === 'finished' || st === 'errored' || !!fin;
      if(active || terminal) {
        status_callback(data);
      }
    }, 0, id, opts);
    return id;
  },
  untrack: function(track_id) {
    this.track_ids = this.track_ids || {};
    if(track_id) {
      this.track_ids[track_id] = false;
    }
  },
  is_finished: function(event) {
    return !!(event && (event.status === 'finished' || event.finished_at));
  },
  is_errored: function(event) {
    return !!(event && event.status === 'errored');
  },
  is_terminal: function(event) {
    return this.is_finished(event) || this.is_errored(event);
  },
  _normalize_progress: function(prog) {
    if(!prog) { return prog; }
    /* Some workers set finished_at before settings.state catches up; consumers
       that only check status === 'finished' miss completion and stop updating
       the UI even though polling correctly halted on finished_at. */
    if(prog.finished_at && prog.status !== 'errored' && prog.status !== 'finished') {
      prog.status = 'finished';
    }
    return prog;
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
      try {
        var prog = data && data.progress;
        if(!prog) {
          status_callback({ status: 'errored', sub_status: 'invalid_progress_response' });
          return;
        }
        prog = progress_tracker._normalize_progress(prog);
        prog.still_working = false;
        if(!prog.finished_at) {
          prog.still_working = true;
          progress_tracker.run_later(_this, function() {
            if(_this.track_ids[track_id]) {
              _this.check(url, status_callback, 0, track_id, opts);
            }
          }, opts.success_wait);
        }
        status_callback(prog);
      } catch (e) {
        status_callback({ status: 'errored', sub_status: 'progress_parse_error' });
      }
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
          if(_this.track_ids[track_id]) {
            _this.check(url, status_callback, error_count + 1, track_id, opts);
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
