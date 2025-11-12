import EmberObject from '@ember/object';
import {
  later as runLater,
  debounce as runDebounce
} from '@ember/runloop';
import $ from 'jquery';
import app_state from './app_state';
import scanner from './scanner';
import speecher from './speecher';
import utterance from './utterance';
import { observer } from '@ember/object';

var raw_listeners = {};
var frame_listener = EmberObject.extend({
  handle_action: function(data) {
    data.respond = data.respond || function() { };
    // TODO: event to set dim_header and small_header if desired
    if(data.action == 'listen') {
      this.listen(data);
    } else if(data.action == 'stop_listening') {
      this.stop_listening(data);
    } else if(data.action == 'status') {
      this.status(data);
    } else if(data.action == 'add_text') {
      this.add_text(data);
    } else if(data.action == 'speak_text') {
      this.speak_text(data);
    } else if(data.action == 'update_manifest') {
      this.update_manifest(data);
    } else if(data.action == 'retrieve_object') {
      this.retrieve_object(data);
    } else if(data.action == 'add_target') {
      this.add_target(data);
    } else if(data.action == 'clear_target') {
      this.clear_target(data);
    } else if(data.action == 'clear_targets') {
      this.clear_targets(data);
    } else {
      data.respond({error: 'unrecognized action, ' + data.action});
    }
  },
  unload: function() {
    this.stop_listening('all');
    this.clear_targets('all');
  },
  listen: function(data) {
    var id = (new Date().getTime()) + "_" + Math.random();
    frame_listener.raw_listeners[data.session_id + id] = data;
    data.respond({listen_id: id});
  },
  stop_listening: function(data) {
    if(data == 'all') {
      for(var idx in frame_listener.raw_listeners) {
        if(frame_listener.raw_listeners[idx]) {
          delete frame_listener.raw_listeners[idx];
        }
      }
    } else if(data.listen_id == 'all') {
      for(var idx in frame_listener.raw_listeners) {
        if(frame_listener.raw_listeners[idx] && data.session_id && idx.indexOf(data.session_id) === 0) {
          delete frame_listener.raw_listeners[idx];
        }
      }
    } else {
      delete frame_listener.raw_listeners[data.session_id + data.listen_id];
    }
    if(data && data.respond) {
      data.respond({cleared: true});
    }
  },
  raw_event: function(event) {
    var overlay = document.getElementById('integration_overlay');
    var session_id = event.session_id;
    if(!session_id) {
      session_id = document.getElementById('integration_frame').getAttribute('data-session_id');
    }
    if(overlay) {
      var rect = overlay.getBoundingClientRect();
      for(var idx in frame_listener.raw_listeners) {
        if(frame_listener.raw_listeners[idx] && frame_listener.raw_listeners[idx].session_id == session_id && frame_listener.raw_listeners[idx].respond) {
          frame_listener.raw_listeners[idx].respond({
            type: event.type, // 'click', 'touch', 'gazedwell', 'scanselect', 'mousemove', 'gazelinger'
            aac_type: event.aac_type, // 'start', 'select', 'over'
            x_percent: (event.clientX - rect.left) / rect.width, // 0.0 - 1.0
            y_percent: (event.clientY - rect.top ) / rect.height // 0.0 - 1.0
          });
        }
      }
    }
    // propagate to active listeners
  },
  status: function(data) {
    var session_id = data.session_id;
    var $elem = $("#integration_frame");
    $("#integration_overlay").removeClass('pending');
    data.respond({
      status: 'ready',
      session_id: session_id,
      code: $elem.attr('data-code'),
      system_token: 'LingoLinqAAC',
      user_token: $elem.attr('data-user_token')
    });
  },
  add_text: function(data) {
    var obj = {
      label: data.text,
      vocalization: data.text,
      image: data.image_url,
      prevent_return: true,
      button_id: null,
      source: 'external',
      board: {id: app_state.get('currentBoardState.id'), parent_id: app_state.get('currentBoardState.parent_id'), key: app_state.get('currentBoardState.key')},
      type: 'speak'
    };

    app_state.activate_button({}, obj);

    data.respond({added: true});
  },
  speak_text: function(data) {
    var vocalized = false;
    if(app_state.get('speak_mode')) {
      vocalized = true;
      var alt_voice = speecher.alternate_voice && speecher.alternate_voice.enabled && speecher.alternate_voice.for_integrations != false;
      speecher.speak_text((data.text || ""), false, {alternate_voice: (alt_voice && data.voice == 'secondary'), interrupt: true});
    } else {
      utterance.silent_speak_button({
        label: (data.text || '')
      });
    }

    data.respond({spoken: true, vocalized: vocalized});
  },
  update_manifest: function(data) {
    // { html_url: '', script_url: '', state: {key: 'values', only: 'folks'}, objects: [{url: '', type: 'image'}] }
    data.respond({error: 'not implemented'});
  },
  retrieve_object: function(data) {
    data.respond({error: 'not implemented'});
  },
  trigger_target: function(ref) {
    var target = (this.get('targets') || []).find(function(t) { return (t.dom && ref == t.dom) || (t.session_id == ref.session_id && t.id == ref.id); });
    if(target && target.respond) {
      target.respond({
        type: 'select',
        id: target.id
      });
    }
  },
  add_target: function(data) {
    // really add-or-update, since it should update in place if a target with the id already exists
    if(!data.target) {
      return data.respond({error: 'target attribute missing'});
    }
//    this.clear_target({session_id: data.session_id, id: data.target.id});
    var targets = this.get('targets') || [];
    var dom_id = "target_" + data.session_id + "_" + data.target.id;
    var div = document.getElementById(dom_id);
    div = div || document.createElement('div');
    div.id = dom_id;
    div.classList.add('integration_target');
    div.tabIndex = 0;
    var overlay = document.getElementById('integration_overlay');
    if(overlay) {
      var rect = overlay.getBoundingClientRect();
      div.style.width = (data.target.width_percent * rect.width) + "px";
      div.style.height = (data.target.height_percent * rect.height) + "px";
      div.style.left = (data.target.left_percent * rect.width) + "px";
      div.style.top = (data.target.top_percent * rect.height) + "px";
      overlay.appendChild(div);
      var found = targets.find(function(t) { return t.id == data.target.id && t.session_id == data.session_id; });
      if(!found) {
        targets.push({id: data.target.id, session_id: data.session_id, target: data.target, dom: div, respond: data.respond});
      } else {
        found.target = data.target;
        found.dom = div;
        found.respond = data.respond;
      }
      this.set('targets', targets);
      data.respond({id: data.target.id});
      if(scanner.scanning) {
        scanner.reset();
      }
    } else {
      data.respond({error: 'not ready'});
    }
  },
  trigger_target_event: function(dom, type, aac_type, session_id) {
    var rect = dom.getBoundingClientRect();
    var overlay = document.getElementById('integration_overlay');
    if(overlay) {
      session_id = session_id || document.getElementById('integration_frame').getAttribute('data-session_id');
      if(session_id) {
        frame_listener.raw_event({
          session_id: session_id,
          type: type,
          aac_type: aac_type,
          clientX: rect.left + (rect.width / 2),
          clientY: rect.top + (rect.height / 2)
        });
      }
    }
  },
  size_targets: observer('app_state.speak_mode', function() {
    var overlay = document.getElementById('integration_overlay');
    if(overlay) {
      var rect = overlay.getBoundingClientRect();
      (this.get('targets') || []).forEach(function(t) {
        if(t && t.dom && t.target) {
          t.dom.style.width = (t.target.width_percent * rect.width) + "px";
          t.dom.style.height = (t.target.height_percent * rect.height) + "px";
          t.dom.style.left = (t.target.left_percent * rect.width) + "px";
          t.dom.style.top = (t.target.top_percent * rect.height) + "px";
        }
      });
    }
  }),
  clear_target: function(data) {
    var targets = this.get('targets') || [];
    var matches = targets.filter(function(t) { return t.session_id == data.session_id && t.id == data.id; });
    matches.forEach(function(m) {
      if(m.dom && m.dom.parentNode) {
        m.dom.parentNode.removeChild(m.dom);
      }
    });
    targets = targets.filter(function(t) { return t.session_id != data.session_id || t.id != data.id; });
    this.set('targets', targets);
    if(data.respond) {
      data.respond({id: data.id, cleared: true});
    }
  },
  clear_targets: function(data) {
    var targets = this.get('targets') || [];
    var matches = [];
    if(data == 'all') {
      matches = targets;
      targets = [];
    } else {
      matches = targets.filter(function(t) { return t.session_id == data.session_id && (!data.ids || data.ids.indexOf(t.id) != -1); });
      targets = targets.filter(function(t) { return t.session_id != data.session_id || (data.ids && data.ids.indexOf(t.id) == -1); });
    }
    var ids = [];
    matches.forEach(function(m) {
      ids.push(m.id);
      if(m.dom && m.dom.parentNode) {
        m.dom.parentNode.removeChild(m.dom);
      }
    });
    this.set('targets', targets);
    if(data.respond) {
      data.respond({cleared: true, ids: ids});
    }
  },
  visible: function() {
    return !!document.getElementById('integration_overlay');
  },
  active_targets: function() {
    var session_id = document.getElementById('integration_frame').getAttribute('data-session_id');
    return (this.get('targets') || []).filter(function(t) { return t.session_id == session_id; });
  },
  notify_of_button(button, obj) {
    // TODO: check for a parent window, embed mode, and notification authorization,
    // and postMessage if it's allowed
  },
  respond: function(source, message) {
    if(source && message) {
      source.postMessage(message, '*');
    }
  },
  session_window: function(session_id) {
    var $elem = $("#integration_frame");
    if(!$elem.attr('data-session_id')) {
      $elem.attr('data-session_id', session_id);
    }
    return $elem[0] && $elem[0].contentWindow;
  }
}).create({targets: []});
frame_listener.raw_listeners = raw_listeners;

window.addEventListener('message', function(event) {
  if(event.data && event.data.aac_shim) {
    var session_window = frame_listener.session_window(event.data.session_id);
    event.data.respond = function(obj) {
      obj.aac_shim = true;
      obj.callback_id = event.data.callback_id;
      frame_listener.respond(event.source, obj);
    };
    if(!event.data.session_id) {
      event.data.respond({error: 'session_id required, but not sent'});
      return;
    } else if(!session_window) {
      event.data.respond({error: 'message came from unknown source'});
      return;
    } else if(event.source != session_window) {
      event.data.respond({error: 'message came from wrong window'});
      return;
    }
    frame_listener.handle_action(event.data);
  }
});

window.addEventListener('resize', function() {
  runDebounce(frame_listener, frame_listener.size_targets, 100);
});

export default frame_listener;
