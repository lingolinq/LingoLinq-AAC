import Component from '@ember/component';
import EmberObject from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import buttonTracker from '../utils/raw_events';
import capabilities from '../utils/capabilities';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Component.extend({
  draw: observer(
    'pending',
    'current_dwell',
    'screen_width',
    'screen_height',
    'event_x',
    'event_y',
    'window_x',
    'window_y',
    'selected',
    'window_width',
    'window_height',
    function() {
      var elem = this.get('element').getElementsByClassName('preview')[0];
      var coords = this.getProperties('screen_width', 'screen_height', 'event_x', 'event_y', 'window_x', 'window_y', 'window_width', 'window_height');

      var now = (new Date()).getTime();
      var ts = this.get('ts');
      this.set('current_dwell', (ts && now - ts <= 2000));
      if(!this.get('current_dwell')) { this.set('pending', false); }

      if(elem && coords && coords.screen_width) {
        var context = elem.getContext('2d');
        var width = elem.width;
        var height = elem.height;
        context.clearRect(0, 0, width, height);
        if(this.get('pending')) {
          context.fillStyle = '#fff7b7';
          context.strokeStyle = '#a59a47';
        } else if(this.get('current_dwell')) {
          context.fillStyle = '#eee';
          context.strokeStyle = '#444';
        } else {
          context.fillStyle = '#fee';
          context.strokeStyle = '#844';
        }
        context.beginPath();
        context.rect(0, 0, width, height);
        context.closePath();
        context.fill();
        context.stroke();

        var ctx_window_width = width * (coords.window_width / coords.screen_width);
        var ctx_window_height = height * (coords.window_height / coords.screen_height);
        var ctx_window_x = width * (coords.window_x / coords.screen_width);
        var ctx_window_y = height * (coords.window_y / coords.screen_height);
        if(this.get('current_dwell')) {
          context.fillStyle = '#fff';
          context.strokeStyle = '#444';
        } else {
          context.fillStyle = '#fff';
          context.strokeStyle = '#844';
        }
        context.beginPath();
        context.rect(ctx_window_x, ctx_window_y, ctx_window_width, ctx_window_height);
        context.closePath();
        context.fill();
        context.stroke();

        if(coords.event_x >= 0 && coords.event_y >= 0) {
          var cursor = this.get('cursor');
          cursor.style.display = (this.get('current_dwell') && this.get('preferences.device.dwell_cursor')) ? 'block' : 'none';
          var offset = 0;
          if(!this.get('source.head') && !this.get('source.eyegaze') && !this.get('source.gamepad')) {
            offset = 30;
          }
          if(this.get('source.head') || this.get('source.eyegaze')) {
            // head pointing and eye gaze can have huge jumps in
            // position, so we enable css transitions to make
            // it less jarring
            cursor.classList.add('with_transition');
          } else {
            cursor.classList.remove('with_transition');
          }
          cursor.style.left = (coords.event_x - (window.screenInnerOffsetX || window.screenX) + offset) + 'px';//(coords.event_x / coords.screen_width * coords.window_width) + 'px';
          cursor.style.top = (coords.event_y - (window.screenInnerOffsetY || window.screenY) - offset) + 'px';//(coords.event_y / coords.screen_height * coords.window_height) + 'px';  

          var ctx_point_x = width * (coords.event_x / coords.screen_width);
          var ctx_point_y = height * (coords.event_y / coords.screen_height);
          context.fillStyle = '#f00';
          if(this.get('selected')) {
            context.strokeStyle = '#742eff';
            context.fillStyle = '#3cff00';
          }
          context.beginPath();
          context.arc(ctx_point_x, ctx_point_y, 10, 0, 2*Math.PI);
          context.closePath();
          context.fill();
          if(this.get('selected')) {
            context.lineWidth = 4;
            context.stroke();
          }
        }
      }
    }
  ),
  clear_on_change: observer('type', function() {
    this.setProperties({
      ts: (new Date()).getTime(),
      pending: true,
      event_x: null,
      hardware: null
    });
  }),
  hardware_type: computed('hardware', 'source', function() {
    var res = {};
    if(this.get('hardware') && this.get('source.eyegaze')) {
      res[this.get('hardware')] = true;
      return res;
    } else {
      return null;
    }
  }),
  has_coords: computed('event_x', 'event_y', function() {
    return this.get('event_x') >= 0 && this.get('event_y') >= 0;
  }),
  eye_tracking: computed('type', function() {
    return this.get('type') == 'eyegaze';
  }),
  update_speed: observer('preferences.device.dwell_arrow_speed', function() {
    if(buttonTracker.gamepadupdate && this.get('preferences.device.dwell_arrow_speed')) {
      buttonTracker.gamepadupdate.speed = this.get('preferences.device.dwell_arrow_speed');
    }
  }),
  update_expression: observer('preferences.device.dwell_selection', 'preferences.device.select_expression', function() {
    if(buttonTracker.gamepadupdate && this.get('preferences.device.dwell_selection') == 'expression') {
      buttonTracker.gamepadupdate.expression = this.get('preferences.device.select_expression');
    }
  }),
  dwell_icon_class: observer('preferences.device.dwell_icon', function() {
    this.get('cursor').setAttribute('class', this.get('preferences.device.dwell_icon'));
  }),
  didInsertElement: function() {
    var _this = this;

    var cursor = document.createElement('div'); 
    cursor.id = "dwell_icon";
    cursor.classList.add(this.get('preferences.device.dwell_icon'));
    cursor.style.zIndex = 9999; 
    cursor.style.display = 'none';
    cursor.style.position = 'fixed';
    this.get('element').appendChild(cursor);
    this.set('cursor', cursor);

    _this.setProperties({
      screen_width: capabilities.screen.width,
      screen_height: capabilities.screen.height,
      pending: true,
      window_x: window.screenInnerOffsetX || window.screenX,
      window_y: window.screenInnerOffsetY || window.screenY,
      window_width: window.innerWidth,
      window_height: window.innerHeight,
      event_x: null,
      event_y: null,
      eye_listener: null,
      head_listener: null,
      mouse_listener: null
    });

    var head_pointer = _this.get('preferences.device.dwell_type') == 'head' && _this.get('preferences.device.dwell_head_pointer');
    if(!_this.get('preferences.device.dwell_type') || _this.get('preferences.device.dwell_type') == 'eyegaze' || _this.get('preferences.device.dwell_type') == 'eyegaze_external' || head_pointer) {
      var eye_listener = function(e) {
        var ratio = window.devicePixelRatio || 1.0;
        e.screenX = (e.clientX + (window.screenInnerOffsetX || window.screenX));
        e.screenY = (e.clientY + (window.screenInnerOffsetY || window.screenY));
        _this.setProperties({
          screen_width: capabilities.screen.width,
          screen_height: capabilities.screen.height,
          event_x: e.screenX,
          event_y: e.screenY,
          pending: false,
          hardware: e.eyegaze_hardware,
          window_x: window.screenInnerOffsetX || window.screenX,
          window_y: window.screenInnerOffsetY || window.screenY,
          ts: (new Date()).getTime(),
          window_width: window.innerWidth,
          window_height: window.innerHeight,
          source: e.pointer ? {head: true} : {eyegaze: true}
        });
      };
      if(head_pointer) {
        capabilities.head_tracking.listen({head_pointing: true, tilt: capabilities.tracking.tilt_factor(_this.get('preferences.device.dwell_tilt_sensitivity'))});
      } else {
        capabilities.eye_gaze.listen({level: 'noisy', expressions: true, external_accessory: _this.get('preferences.device.dwell_type') == 'eyegaze_external'});
      }
      capabilities.eye_gaze.calibrating_or_testing = true;
      this.set('eye_listener', eye_listener);
      document.addEventListener('gazelinger', eye_listener);
      this.set('eye_gaze', capabilities.eye_gaze);
    }

    if(_this.get('preferences.device.dwell_type') == 'mouse_dwell') {
      var mouse_listener = function(e) {
        _this.setProperties({
          screen_width: capabilities.screen.width,
          screen_height: capabilities.screen.height,
          event_x: e.screenX,
          event_y: e.screenY,
          pending: false,
          window_x: window.screenInnerOffsetX || window.screenX,
          window_y: window.screenInnerOffsetY || window.screenY,
          ts: (new Date()).getTime(),
          window_width: window.innerWidth,
          window_height: window.innerHeight,
          source: {cursor: true}
        });
      };
      this.set('mouse_listener', mouse_listener);
      this.set('ts', (new Date()).getTime());
      document.addEventListener('mousemove', mouse_listener);
    }

    if(_this.get('preferences.device.dwell_type') == 'arrow_dwell' || (_this.get('preferences.device.dwell_type') == 'head' && !head_pointer)) {
      var key_listener = function(e) {
        if(_this.get('preferences.device.dwell_selection') == 'button') {
          var select_code = _this.get('preferences.device.scanning_select_keycode');
          if((e.keyCode && e.keyCode == select_code) || (e.code && e.code == select_code)) {
            if(buttonTracker.gamepadupdate) {
              buttonTracker.gamepadupdate('select', e);
            }
          }
        }
      };
      document.addEventListener('keydown', key_listener);
      _this.set('key_listener', key_listener);
      buttonTracker.gamepadupdate = function(action, e) {
        if(action == 'select') {
          var now = (new Date()).getTime()
          _this.setProperties({
            selected: now
          })
          runLater(function() {
            if(_this.get('selected') == now) {
              _this.set('selected', null);
            }
          }, 800);
        } else if(action == 'move') {
          var window_x = window.screenInnerOffsetX || window.screenX;
          var window_y = window.screenInnerOffsetY || window.screenY;
          var window_width = window.innerWidth;
          var window_height = window.innerHeight;
          e.screenX = (e.clientX + (window.screenInnerOffsetX || window.screenX));
          e.screenY = (e.clientY + (window.screenInnerOffsetY || window.screenY));
          console.log(e.screenX, e.screenY, e.clientX, e.clientY);
          var source = {gamepad: true};
          source[e.activation] = true;
          _this.setProperties({
            screen_width: capabilities.screen.width,
            screen_height: capabilities.screen.height,
            event_x: e.screenX, //Math.min(Math.max(window_x, event_x + e.horizontal), window_x + window_width),
            event_y: e.screenY , //Math.min(Math.max(window_y, event_y + e.vertical), window_y + window_height),
            pending: false,
            window_x: window_x,
            window_y: window_y,
            ts: (new Date()).getTime(),
            window_width: window_width,
            window_height: window_height,          
            source: source
          });
        }
      };
      _this.set('gp_update', buttonTracker.gamepadupdate);

      if(_this.get('preferences.device.dwell_type') == 'head' || _this.get('preferences.device.dwell_selection') == 'expression') {
        if(capabilities.head_tracking.available || window.weblinger) {
          var tilt_factor = capabilities.tracking.tilt_factor(_this.get('preferences.device.dwell_tilt_sensitivity'));
          capabilities.head_tracking.listen({tilt: tilt_factor});
        }  
      }

      buttonTracker.gamepadupdate.speed = _this.get('preferences.device.dwell_arrow_speed');
      _this.set('gampead_listener', buttonTracker.gamepadupdate);
    }
    
    if(_this.get('preferences.device.dwell_selection') == 'expression') {
      var expression_listener = function(e) {
        var matching_expression = e.expression && e.expression == _this.get('preferences.device.select_expression');
        if(_this.get('preferences.device.select_expression') == 'smirk' && e.expresssion == 'smile') {
          matching_expression = true;
        }

        if(matching_expression) {
          var now = (new Date()).getTime()
          _this.setProperties({
            selected: now
          })
          runLater(function() {
            if(_this.get('selected') == now) {
              _this.set('selected', null);
            }
          }, 1500);
        }
      };
      buttonTracker.gamepadupdate = buttonTracker.gamepadupdate || function() { };
      buttonTracker.gamepadupdate.expression = _this.get('preferences.device.select_expression');
      document.addEventListener('facechange', expression_listener);
      this.set('expression_listener', expression_listener)
      if(!this.get('head_tracking')) {
        capabilities.head_tracking.listen();
        this.set('head_tracking', capabilities.head_tracking);
      }
    }
    _this.check_timeout();

  },
  with_status: computed('eye_gaze.statuses', function() {
    return emberGet(capabilities.eye_gaze, 'statuses');
  }),
  toggle_cursor: observer('current_dwell', function() {
    if(!this.get('current_dwell')) {
      this.get('cursor').style.display = 'none';
    }  
  }),
  check_timeout: function() {
    var _this = this;
    if(this.get('mouse_listener') || this.get('eye_listener') || this.get('head_listener') || this.get('gamepad_listener') || this.get('expression_listener') || this.get('key_listener')) {
      var now = (new Date()).getTime();
      var ts = this.get('ts');
      this.set('current_dwell', (ts && now - ts <= 2000));
      if(!this.get('current_dwell')) { this.set('pending', false); }
      runLater(function() { _this.check_timeout(); }, 100);
    }
  },
  willDestroyElement: function() {
    capabilities.eye_gaze.calibrating_or_testing = false;
    capabilities.eye_gaze.stop_listening();
    capabilities.head_tracking.stop_listening();
    if(this.get('mouse_listener')) {
      document.removeEventListener('mousemove', this.get('mouse_listener'));
      this.set('mouse_listener', null);
    }
    if(this.get('eye_listener')) {
      document.removeEventListener('gazelinger', this.get('eye_listener'));
      this.set('eye_listener', null);
    }
    if(this.get('head_listener')) {
      document.removeEventListener('headtilt', this.get('head_listener'));
      this.set('head_listener', null);
    }
    if(this.get('key_listener')) {
      document.removeEventListener('keydown', this.get('key_listener'));
      this.set('key_listener', null);
    }
    if(this.get('gp_update')) {
      if(buttonTracker.gamepadupdate == this.get('gp_update')) {
        buttonTracker.gamepadupdate = null;
      }
      this.set('gp_update', null);
    }
    if(this.get('gampead_listener')) {
      this.set('gamepad_listener', null);
    }
    if(this.get('keycode_listener')) {
      document.removeEventListener('keydown', this.get('keycode_listener'));
      this.set('keycode_listener', null);
    }
    if(this.get('expression_listener')) {
      document.removeEventListener('facechange', this.get('expression_listener'));
      this.set('expression_listener', null);
    }
  },
  actions: {
    advanced: function() {
      this.set('advanced', true);
    }
  }
});
