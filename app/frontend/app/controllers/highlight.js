import {
  debounce as runDebounce,
  later as runLater
} from '@ember/runloop';
import $ from 'jquery';
import modal from '../utils/modal';
import app_state from '../utils/app_state';
import scanner from '../utils/scanner';
import buttonTracker from '../utils/raw_events';
import { htmlSafe } from '@ember/template';
import { observer, computed, set } from '@ember/object';

function highlightModel(controller) {
  return controller.get('model');
}

function setModelProperty(controller, key, value) {
  var model = highlightModel(controller);
  if(!model) { return; }
  set(model, key, value);
}

export default modal.ModalController.extend({
  opening: function() {
    modal.highlight_controller = this;
    this.set('pending', false);
    var model = highlightModel(this);
    if(!model) { return; }
    if(!model.secondary_highlight) {
      scanner.setup(this);
    }
    var _this = this;
    runLater(function() {
      if(highlightModel(_this)) {
        _this.compute_styles();
      }
    }, 500);
    setModelProperty(_this, 'shift_color', false);
    setModelProperty(_this, 'shifted_color', null);
    if(model.highlight_type == 'model') {
      var id = Math.random();
      setModelProperty(_this, 'shift_id', id);
      runLater(function() {
        if(highlightModel(_this) && _this.get('model.shift_id') == id) {
          setModelProperty(_this, 'shift_color', true);
        }
      }, 15000);
      runLater(function() {
        if(highlightModel(_this) && _this.get('model.shift_id') == id) {
          setModelProperty(_this, 'clear_overlay', false);
        }
      }, 30000);
    }
    if(_this.recompute) {
      window.removeEventListener('resize', _this.recompute);
    }
    _this.recompute = function() {
      runDebounce(_this, function() {
        if(highlightModel(_this)) {
          _this.compute_styles();
        }
      }, 500);
    };
    window.addEventListener('resize', _this.recompute);
  },
  shift_color: observer(
    'app_state.short_refresh_stamp',
    'model.shift_color',
    function() {
      if(!highlightModel(this)) { return; }
      var model = highlightModel(this);
      if(model && model.shift_color) {
        var now = (new Date()).getTime();
        var last = model.last_shift || 0;
        if(last < now - 1000) {
          set(model, 'shifted_color', !model.shifted_color);
          set(model, 'last_shift', now);
        }
      }
    }
  ),
  closing: function() {
    var model = highlightModel(this);
    if(model) {
      set(model, 'shift_color', false);
      set(model, 'shifted_color', null);
    }
    window.removeEventListener('resize', this.recompute);
    this.recompute = null;
    modal.highlight_controller = null;
  },
  compute_styles: observer(
    'model.left',
    'model.top',
    'model.width',
    'model.height',
    'model.bottom',
    'model.right',
    'model.overlay',
    'model.clear_overlay',
    'model.secondary_highlight',
    function() {
      var model = highlightModel(this);
      if(!model) { return; }
      var opacity = "0.3";
      var display = model.overlay ? '' : 'display: none;';
      if(model.clear_overlay) {
        opacity = "0.0";
      }
      var header_height = $("header").outerHeight();
      var window_height = $(window).outerHeight();
      var window_width = $(window).outerWidth();
      var top = model.top;
      var left = model.left;
      var bottom = model.bottom;
      var right = model.right;
      var width = model.width;
      var height = model.height;
      if(top < 4) {
        height = height - (4 - top);
        top = 4;
      }
      if(bottom > window_height - 4) {
        height = height - (bottom - (window_height - 4));
        bottom = window_height - 4;
      }
      if(left < 4) {
        width = width - (4 - left);
        left = 4;
      }
      if(right > window_width - 20) {
        width = width - (right - (window_width - 4));
        right = window_width - 4;
      }
      if(width > window_width - 8) {
        width = window_width - 8;
      }
      var z = 2000;
      if(model.secondary_highlight) {
        z = 2005;
        left = left + 10;
        right = right - 10;
        width = width - 20;
        top = top + 10;
        bottom = bottom - 10;
        height = height - 20;
      }
      set(model, 'top_style', htmlSafe(display + "z-index: " + z + "; position: absolute; top: -" + header_height + "px; left: 0; background: #000; opacity: " + opacity + "; width: 100%; height: " + (top + header_height) + "px;"));
      set(model, 'left_style', htmlSafe(display + "z-index: " + z + "; position: absolute; top: " + (top) + "px; left: 0; background: #000; opacity: " + opacity + "; width: " + left + "px; height: " + height + "px;"));
      set(model, 'right_style', htmlSafe(display + "z-index: " + z + "; position: absolute; top: " + (top) + "px; left: calc(" + left+ "px + " + width + "px); background: #000; opacity: " + opacity + "; width: calc(100% - " + left + "px - " + width + "px); height: " + height + "px;"));
      set(model, 'bottom_style', htmlSafe(display + "z-index: " + z + "; position: absolute; top: " + (bottom) + "px; left: 0; background: #000; opacity: " + opacity + "; width: 100%; height: 5000px;"));
      set(model, 'highlight_style', htmlSafe("z-index: " + (z + 1) + "; position: absolute; top: " + (top - 4) + "px; left: " + (left - 4) + "px; width: " + (width + 8) + "px; height: " + (height + 8) + "px; cursor: pointer;"));
      set(model, 'inner_highlight_style', htmlSafe("z-index: " + (z + 1) + "; position: absolute; top: " + (top) + "px; left: " + left + "px; width: " + width + "px; height: " + height + "px; cursor: pointer;"));
      var icon_size = Math.min(Math.max(8, (height - 27) / 2), 75);
      set(model, 'icon_style', htmlSafe("font-size: " + icon_size + 'px;'));
    }
  ),
  highlight_class: computed(
    'model.secondary_highlight',
    'model.shifted_color',
    'pending',
    function() {
      var str = "highlight box";
      if(this.get('model.secondary_highlight') || this.get('model.shifted_color')) {
        str = str + " secondary";
      }
      if(this.get('pending')) {
        str = str + " pending";
      }
      return htmlSafe(str);
    }
  ),  
  highlight_inner_class: computed(
    'model.secondary_highlight',
    'model.shifted_color',
    'pending',
    function() {
      var str = "highlight box inner advanced_selection";
      if(this.get('model.secondary_highlight') || this.get('model.shifted_color')) {
        str = str + " secondary";
      }
      if(this.get('pending')) {
        // str = str + " pending";
      }
      return htmlSafe(str);
    }
  ),
  actions: {
    select: function() {
      if(this.get('model.defer')) {
        var _this = this;
        _this.get('model.defer').resolve({
          pending: function() {
            _this.set('pending', true);
          }
        });
      }
      if(!this.get('model.prevent_close')) {
        modal.close(null, 'highlight');
        modal.close(null, 'highlight-secondary');
      }
    },
    select_release: function(e) {
      var $target = $(e.target);
      if($target.hasClass('highlight') && !$target.hasClass('inner')) {
        buttonTracker.ignoreUp = true;
        this.send('close');
      }
    },
    close: function() {
      if(this.get('close_handled')) { return; }
      this.set('close_handled', true);
      if(this.get('model.select_anywhere')) { // whole-screen is giant switch
        this.send('select');
      } else {
        if(this.get('model.defer')) {
          this.get('model.defer').reject();
        }
        if(!this.get('model.prevent_close')) {
          modal.close(null, 'highlight');
          modal.close(null, 'highlight-secondary');
        }
      }
    },
    opening: function() {
      this.set('close_handled', false);
      var settings = Object.assign({}, modal.settings_for['highlight'] || {});
      var controller = this;
      modal.last_controller = controller;
      controller.set('model', settings);
      if(controller.opening) {
        controller.opening();
      }
    },
    closing: function() {
    }
  }
});
