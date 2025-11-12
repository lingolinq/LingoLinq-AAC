import EmberObject from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import DS from 'ember-data';
import LingoLinq from '../app';
import { htmlSafe } from '@ember/string';
import { computed, observer } from '@ember/object';
import contentGrabbers from '../utils/content_grabbers';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import RSVP from 'rsvp';
import persistence from '../utils/persistence';

LingoLinq.Log = DS.Model.extend({
  didLoad: function() {
    this.check_for_events();
  },
  type: DS.attr('string'),
  message_type: DS.attr('boolean'),
  events: DS.attr('raw'),
  note: DS.attr('raw'),
  device: DS.attr('raw'),
  author: DS.attr('raw'),
  daily_use: DS.attr('raw'),
  user: DS.attr('raw'),
  imported: DS.attr('boolean'),
  started_at: DS.attr('date'),
  ended_at: DS.attr('date'),
  summary: DS.attr('string'),
  time_id: DS.attr('number'),
  button_count: DS.attr('number'),
  utterance_count: DS.attr('number'),
  utterance_word_count: DS.attr('number'),
  duration: DS.attr('number'),
  user_id: DS.attr('string'),
  timestamp: DS.attr('number'),
  assessment: DS.attr('raw'),
  highlighted: DS.attr('boolean'),
  highlight_summary: DS.attr('string'),
  notify: DS.attr('string'),
  next_log_id: DS.attr('string'),
  previous_log_id: DS.attr('string'),
  geo: DS.attr('raw'),
  readable_ip_address: DS.attr('string'),
  ip_cluster_id: DS.attr('string'),
  geo_cluster_id: DS.attr('string'),
  video_id: DS.attr('string'),
  goal_id: DS.attr('string'),
  goal_status: DS.attr('string'),
  goal: DS.attr('raw'),
  journal: DS.attr('raw'),
  profile: DS.attr('raw'),
  guid: DS.attr('string'),
  video: DS.attr('raw'),
  evaluation: DS.attr('raw'),
  nonce: DS.attr('string'),
  encryption_settings: DS.attr('raw'),
  data_url: DS.attr('string'),
  event_note_count: DS.attr('number'),
  minutes: computed('duration', function() {
    return Math.round((this.get('duration') || 0) / 60);
  }),
  session_type: computed('type', function() {
    return this.get('type') == 'session';
  }),
  note_type: computed('type', function() {
    return this.get('type') == 'note';
  }),
  video_type: computed('type', 'note', function() {
    return this.get('type') == 'note' && this.get('note.video');
  }),
  assessment_type: computed('type', function() {
    return this.get('type') == 'assessment';
  }),
  journal_type: computed('type', function() {
    return this.get('type') == 'journal';
  }),
  profile_type: computed('type', function() {
    return this.get('type') == 'profile';
  }),
  eval_type: computed('type', function() {
    return this.get('type') == 'eval';
  }),
  goal_status_class: computed('goal.status', function() {
    var status = this.get('goal.status');
    if(status == 1) {
      return 'face sad';
    } else if(status == 2) {
      return 'face neutral';
    } else if(status == 3) {
      return 'face happy';
    } else if(status == 4) {
      return 'face laugh';
    } else {
      return '';
    }
  }),
  check_for_events: observer('events', 'data_url', 'encryption_settings', function() {
    var _this = this;
    if(_this.get('events_state.checking')) { return; }
    _this.set('events_state', {checking: true});
    if(!_this.get('events')) {
      if(_this.get('data_url') && _this.get('encryption_settings')) {
        persistence.remote_json(_this.get('data_url'), _this.get('encryption_settings')).then(function(data) {
          _this.set('events', data);
          _this.set('events_state', {ready: true});
        }, function() {
          _this.set('events_state', {error: true});
        });
      } else {
        _this.set('events_state', {empty: true});
      }
    } else {
      _this.set('events_state', {ready: true});
    }
  }),
  processed_events: computed('events', 'toggled_event_ids', function() {
    var result = [];
    var last_ts = null;
    var max_id = Math.max.apply(null, (this.get('events') || []).mapBy('id').compact()) || 0;
    if(max_id < 0) { max_id = 0; }
    var shown_ids = this.get('toggled_event_ids') || [];
    (this.get('events') || []).forEach(function(event, idx) {
      emberSet(event, 'id', event['id'] || ++max_id);
      emberSet(event, event.type + "_type", true);
      if(event.action_type) {
        emberSet(event, 'type_icon', 'glyphicon-flash');
      } else if(event.utterance_type) {
        emberSet(event, 'type_icon', 'glyphicon-comment');
      } else {
        emberSet(event, 'type_icon', 'glyphicon-stop');
      }
      if(event.timestamp && last_ts) {
        emberSet(event, 'delay', event.timestamp - last_ts);
        emberSet(event, 'long_delay', event.delay > 60);
      }
      if(event.button_type) {
        emberSet(event, 'part_of_speech', ((event.parts_of_speech || {}).types || [])[0] || 'unknown');
      }
      emberSet(event, 'show_notes', event.id && shown_ids.indexOf(event.id) >= 0);
      emberSet(event, 'processed_summary', event.summary);
      if(event.type == 'utterance' && event.utterance_text) {
        emberSet(event, 'processed_summary', event.summary + " \"" + event.utterance_text + "\"");
      }

      emberSet(event, 'note_count', (event.notes || []).length);
      last_ts = event.timestamp;
      emberSet(event, 'type_class', "glyphicon " + emberGet(event, 'type_icon'));
      emberSet(event, 'part_of_speech_class', "part_of_speech_box " + emberGet(event, 'part_of_speech'));
      result.push(event);
    });
    return result;
  }),
  processed_tallies: computed('assessment', function() {
    var result = [];
    var tallies = [];
    var last_ts = null;
    var running_correct_total = 0;
    var running_total = 0;
    (this.get('assessment.tallies') || []).forEach(function(tally, idx) {
      if(tally.timestamp && last_ts) {
        emberSet(tally, 'delay', tally.timestamp - last_ts);
      }
      running_total++;
      emberSet(tally, 'running_total', running_total);
      if(tally.correct) {
        running_correct_total++;
        emberSet(tally, 'running_correct_total', running_correct_total);
      }
      last_ts = tally.timestamp;
      result.push(tally);
    });
    return result;
  }),
  daily_use_history: computed('daily_use', function() {
    var res = [];
    var daily = this.get('daily_use') || [];
    var first = daily[0];
    if(!first) { return null; }
    var date = window.moment(first.date);
    var today = window.moment();
    var finder = function(d) { return d.date == str; };
    while(date <= today) {
      var str = date.format('YYYY-MM-DD');
      var day = daily.find(finder);
      day = day || {date: str, activity: htmlSafe('none')};
      if(day.activity_level == 1) {
        day.activity = htmlSafe('light');
      } else if(day.activity_level == 2) {
        day.activity = htmlSafe('light-moderate');
      } else if(day.activity_level == 3) {
        day.activity = htmlSafe('moderate');
      } else if(day.activity_level == 4) {
        day.activity = htmlSafe('moderate-active');
      } else if(day.activity_level == 5) {
        day.activity = htmlSafe('active');
      } else if(day.active === false) {
        day.activity = htmlSafe('light');
      } else if(day.active === true) {
        day.activity = htmlSafe('active');
      }
      res.push(day);
      date = date.add(1, 'day');
    }
    res = res.slice(-90);
    var pct = Math.round(1 / res.length * 1000) / 10;
    res.forEach(function(d) {
      d.display_style = htmlSafe('width: ' + pct + '%;');
    });
    return res;
  }),
  toggle_notes: function(event_id) {
    var notes = [];
    var found = false;
    (this.get('toggled_event_ids') || []).forEach(function(id) {
      if(event_id == id) {
        found = true;
      } else {
        notes.push(id);
      }
    });
    if(!found) {
      notes.push(event_id);
    }
    this.set('toggled_event_ids', notes);
  },
  remove_note: function(event_id, note_id) {
    var events = [].concat(this.get('events') || []);
    events.forEach(function(event) {
      if(event.id == event_id) {
        var new_notes = [];
        (event['notes'] || []).forEach(function(note) {
          if(note.id != note_id) {
            new_notes.push(note);
          }
        });
        event.notes = new_notes;
      }
    });
    this.set('events', events);
    this.save().then(null, function() { });
  },
  add_note: function(event_id, text) {
    var events = [].concat(this.get('events') || []);
    events.forEach(function(event) {
      if(event.id == event_id) {
        event['notes'] = event['notes'] || [];
        var max_id = Math.max.apply(null, event['notes'].mapBy('id').compact()) || 0;
        if(max_id < 0) { max_id = 0; }
        event['notes'].push({
          id: ++max_id,
          note: text
        });
      }
    });
    this.set('events', events);
    this.save().then(null, function() { });
  },
  highlight: function(event_id, do_highlight) {
    var events = [].concat(this.get('events') || []);
    events.forEach(function(event) {
      if(event.id == event_id) {
        emberSet(event, 'highlighted', do_highlight);
      }
    });
    this.set('events', events);
    this.save().then(null, function() { });
  },
  cleanup: function() {
    // TODO: do we need to store the image?
    var events = this.get('events') || [];
    for(var idx = 0; idx < events.length; idx++) {
      delete events[idx]['show_notes'];
      if(events[idx] && events[idx].button && events[idx].button.image && events[idx].button.image.match(/^data/)) {
        events[idx].button.image = null;
      }
    }
    this.set('events', events);
  }
});

LingoLinq.Log.manual_log = function(user_id, external_device) {
  modal.open('modals/manual-log', {external_device: external_device}).then(function(res) {
    if(res && res.words && res.words.length > 0 && res.date) {
      var file = LingoLinq.Log.generate_obf(res.words, res.date);

      var log_type = 'unspecified';
      LingoLinq.Log.import(file, log_type, user_id).then(function(logs) {
        modal.success(i18n.t('log_imported', "Your log session has been imported!"));
      }, function(err) {
        modal.error(i18n.t('log_import_failed', "There was an unexpected error importing the specified logs"));
      });
    }
  }, function() { });
};

LingoLinq.Log.generate_obf = function(text, date) {
  // manual-entered data by a user, one button label per line, with a date and time field
  // convert it to obl and import it, yo
  var json = {
    format: 'open-board-log-0.1',
    source: 'user-entry',
    locale: 'en',
    sessions: [{
      id: 'session1',
      type: 'log',
      events: []
    }]
  };
  var lines = text.split(/\n/);
  var timestamp = (date.getTime() / 1000) - (5 * lines.length) - 10;
  var start = new Date(timestamp * 1000);
  lines.forEach(function(line) {
    if(line && line.length > 0) {
      json.sessions[0].events.push({
        id: "e" + timestamp,
        type: 'button',
        label: line,
        spoken: true,
        timestamp: (new Date(timestamp * 1000)).toISOString()
      })
      timestamp = timestamp + 5;
    }
  });
  var end = new Date(timestamp * 1000);
  json.sessions[0].started = start.toISOString();
  json.sessions[0].ended = end.toISOString();
  var str = btoa(JSON.stringify(json));
  var file = contentGrabbers.data_uri_to_blob("data:text/plain;base64," + str);
  return file;
};

LingoLinq.Log.import = function(file, log_type, user_id) {
  return new RSVP.Promise(function(resolve, reject) {
    var progressor = EmberObject.create();
    modal.open('modals/importing-logs', progressor);
    // do the hard stuff
    var progress = contentGrabbers.upload_for_processing(file, '/api/v1/logs/import', {type: log_type, user_id: user_id}, progressor);

    progress.then(function(logs) {
      modal.close('importing-logs');
      resolve(logs);
    }, function(err) { 
      reject(err);
    });
  });

};

export default LingoLinq.Log;
