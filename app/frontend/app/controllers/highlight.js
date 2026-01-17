import {
  debounce as runDebounce,
  later as runLater
} from '@ember/runloop';
import $ from 'jquery';
import modal from '../utils/modal';
import app_state from '../utils/app_state';
import scanner from '../utils/scanner';
import buttonTracker from '../utils/raw_events';
import { htmlSafe } from '@ember/string';
import { observer, computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  modal: service(),

  opening: function() {
    modal.highlight_controller = this;
    this.set('pending', false);
    if(!this.get('model.secondary_highlight')) {
      scanner.setup(this);
    }
    var _this = this;
    runLater(function() {
      _this.compute_styles();
    }, 500);
    _this.set('model.shift_color', false);
    _this.set('model.shifted_color', null);
    if(_this.get('model.highlight_type') == 'model') {
      var id = Math.random();
      this.set('model.shift_id', id);
      runLater(function() {
        if(_this.get('model.shift_id') == id) {
          _this.set('model.shift_color', true);
        }
      }, 15000);
      runLater(function() {
        if(_this.get('model.shift_id') == id) {
          _this.set('model.clear_overlay', false);
        }
      }, 30000);
    }
    if(_this.recompute) {
      window.removeEventListener('resize', _this.recompute);
    }
    _this.recompute = function() {
      runDebounce(_this, _this.compute_styles, 500);
    };
    window.addEventListener('resize', _this.recompute);
  },
  shift_color: observer(
    'app_state.short_refresh_stamp',
    'model.shift_color',
    function() {
      if(this.get('model.shift_color')) {
        var now = (new Date()).getTime();
        var last = this.get('model.last_shift') || 0;
        if(last < now - 1000) {
          this.set('model.shifted_color', !this.get('model.shifted_color'));
          this.set('model.last_shift', now);
        }
      }
    }
  ),
  closing: function() {
    this.set('model.shift_color', false);
    this.set('model.shifted_color', null);
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
      var opacity = "0.3";
      var display = this.get('model.overlay') ? '' : 'display: none;';
      if(this.get('model.clear_overlay')) {
        opacity = "0.0";
      }
      var header_height = $("header").outerHeight();
      var window_height = $(window).outerHeight();
      var window_width = $(window).outerWidth();
      var top = this.get('model.top');
      var left = this.get('model.left');
      var bottom = this.get('model.bottom');
      var right = this.get('model.right');
      var width = this.get('model.width');
      var height = this.get('model.height');
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
      if(this.get('model.secondary_highlight')) {
        z = 2005;
        left = left + 10;
        right = right - 10;
        width = width - 20;
        top = top + 10;
        bottom = bottom - 10;
        height = height - 20;
      }
      this.set('model.top_style', htmlSafe(display + "z-index: " + z + "; position: absolute; top: -" + header_height + "px; left: 0; background: #000; opacity: " + opacity + "; width: 100%; height: " + (top + header_height) + "px;"));
      this.set('model.left_style', htmlSafe(display + "z-index: " + z + "; position: absolute; top: " + (top) + "px; left: 0; background: #000; opacity: " + opacity + "; width: " + left + "px; height: " + height + "px;"));
      this.set('model.right_style', htmlSafe(display + "z-index: " + z + "; position: absolute; top: " + (top) + "px; left: calc(" + left+ "px + " + width + "px); background: #000; opacity: " + opacity + "; width: calc(100% - " + left + "px - " + width + "px); height: " + height + "px;"));
      this.set('model.bottom_style', htmlSafe(display + "z-index: " + z + "; position: absolute; top: " + (bottom) + "px; left: 0; background: #000; opacity: " + opacity + "; width: 100%; height: 5000px;"));
      this.set('model.highlight_style', htmlSafe("z-index: " + (z + 1) + "; position: absolute; top: " + (top - 4) + "px; left: " + (left - 4) + "px; width: " + (width + 8) + "px; height: " + (height + 8) + "px; cursor: pointer;"));
      this.set('model.inner_highlight_style', htmlSafe("z-index: " + (z + 1) + "; position: absolute; top: " + (top) + "px; left: " + left + "px; width: " + width + "px; height: " + height + "px; cursor: pointer;"));
      var icon_size = Math.min(Math.max(8, (height - 27) / 2), 75);
      this.set('model.icon_style', htmlSafe("font-size: " + icon_size + 'px;'));
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
        this.modal.close(null, 'highlight');
        this.modal.close(null, 'highlight-secondary');
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
          this.modal.close(null, 'highlight');
          this.modal.close(null, 'highlight-secondary');
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
