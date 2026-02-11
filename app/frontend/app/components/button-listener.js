import Component from '@ember/component';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import buttonTracker from '../utils/raw_events';
import editManager from '../utils/edit_manager';
import capabilities from '../utils/capabilities';
import { inject as service } from '@ember/service';

var board_ids = {};
export default Component.extend({
  appState: service('app-state'),
  didInsertElement: function() {
    var _this = this;
    _this.set('active_tracking', true);
    var resizeHandler = function() {
      runLater(function() {
        // on mobile devices, keyboard popup shouldn't trigger a redraw
        if(_this.appState.get('window_inner_width') && capabilities.mobile && window.innerWidth == _this.appState.get('window_inner_width')) {
          // TODO: do we need to force scrolltop to 0?
          return;
        }
        if(_this.get('active_tracking')) {
          var computeHeight = _this.get('computeHeight') || _this.get('compute_height');
          if (computeHeight && typeof computeHeight === 'function') {
            computeHeight(true);
          }
        }
      }, 100);
    };
    $(window).on('resize orientationchange', resizeHandler);
    // Store handler reference for cleanup
    _this.set('resizeHandler', resizeHandler);
    var computeHeight = _this.get('computeHeight') || _this.get('compute_height');
    if (computeHeight && typeof computeHeight === 'function') {
      computeHeight();
    }
  },
  willDestroyElement: function() {
    this.set('active_tracking', false);
    // Remove event listener to prevent memory leak
    var resizeHandler = this.get('resizeHandler');
    if (resizeHandler) {
      $(window).off('resize orientationchange', resizeHandler);
      this.set('resizeHandler', null);
    }
  },
  buttonId: function(event) {
    var $button = $(event.target).closest('.button');
    return $button.attr('data-id') || $(event.target).attr('id');
  },
  speakMenuSelect: function(event) {
    var buttonEvent = this.get('buttonEvent') || this.get('button_event');
    if (buttonEvent && typeof buttonEvent === 'function') {
      buttonEvent('speakMenuSelect', event.button_id, event);
    } else if (buttonEvent && typeof buttonEvent === 'string') {
      this.sendAction(buttonEvent, 'speakMenuSelect', event.button_id, event);
    } else {
      this.sendAction('button_event', 'speakMenuSelect', event.button_id, event);
    }
  },
  buttonSelect: function(event) {
    // if(app_state.get('feature_flags.super_fast_html')) {
    //   var board_id = app_state.get('currentBoardState.id');
    //   var content = document.getElementsByClassName('board')[0];
    //   if(Object.keys(board_ids).length > 1 && content) {
    //     var keys = Object.keys(board_ids);
    //     if(board_ids.current_id == keys[0]) {
    //       content.innerHTML = board_ids[keys[1]];
    //       board_ids.current_id = keys[1];
    //     } else {
    //       content.innerHTML = board_ids[keys[0]];
    //       board_ids.current_id = keys[0];
    //     }
    //     return;
    //   }
    //   if(!board_ids[board_id]) {
    //     if(content) {
    //       board_ids[board_id] = content.innerHTML;
    //     }
    //   }
    // }
    var button_id = this.buttonId(event);
    if(this.appState.get('edit_mode') && editManager.paint_mode) {
      this.buttonPaint(event);
    } else {
      var buttonEvent = this.get('buttonEvent') || this.get('button_event');
      if (buttonEvent && typeof buttonEvent === 'function') {
        buttonEvent('buttonSelect', button_id, event);
      } else if (buttonEvent && typeof buttonEvent === 'string') {
        this.sendAction(buttonEvent, 'buttonSelect', button_id, event);
      } else {
        this.sendAction('button_event', 'buttonSelect', button_id, event);
      }
    }
  },
  buttonPaint: function(event) {
    if(editManager.paint_mode) {
      var button_id = this.buttonId(event);
      var buttonEvent = this.get('buttonEvent') || this.get('button_event');
      if (buttonEvent && typeof buttonEvent === 'function') {
        buttonEvent('buttonPaint', button_id);
      } else if (buttonEvent && typeof buttonEvent === 'string') {
        this.sendAction(buttonEvent, 'buttonPaint', button_id);
      } else {
        this.sendAction('button_event', 'buttonPaint', button_id);
      }
    }
  },
  symbolSelect: function(event) {
    if(this.appState.get('edit_mode')) {
      if(editManager.finding_target()) {
        return this.buttonSelect(event);
      }
      var button_id = this.buttonId(event);
      var buttonEvent = this.get('buttonEvent') || this.get('button_event');
      if (buttonEvent && typeof buttonEvent === 'function') {
        buttonEvent('symbolSelect', button_id);
      } else if (buttonEvent && typeof buttonEvent === 'string') {
        this.sendAction(buttonEvent, 'symbolSelect', button_id);
      } else {
        this.sendAction('button_event', 'symbolSelect', button_id);
      }
    }
  },
  actionSelect: function(event) {
    if(this.appState.get('edit_mode')) {
      if(editManager.finding_target()) {
        return this.buttonSelect(event);
      }
      var button_id = this.buttonId(event);
      var buttonEvent = this.get('buttonEvent') || this.get('button_event');
      if (buttonEvent && typeof buttonEvent === 'function') {
        buttonEvent('actionSelect', button_id);
      } else if (buttonEvent && typeof buttonEvent === 'string') {
        this.sendAction(buttonEvent, 'actionSelect', button_id);
      } else {
        this.sendAction('button_event', 'actionSelect', button_id);
      }
    }
  },
  rearrange: function(event) {
    if(this.appState.get('edit_mode')) {
      var dragId = $(event.target).data('drag_id');
      var dropId = $(event.target).data('drop_id');
      var buttonEvent = this.get('buttonEvent') || this.get('button_event');
      if (buttonEvent && typeof buttonEvent === 'function') {
        buttonEvent('rearrangeButtons', dragId, dropId);
      } else if (buttonEvent && typeof buttonEvent === 'string') {
        this.sendAction(buttonEvent, 'rearrangeButtons', dragId, dropId);
      } else {
        this.sendAction('button_event', 'rearrangeButtons', dragId, dropId);
      }
    }
  },
  clear: function(event) {
    if(this.appState.get('edit_mode')) {
      var button_id = this.buttonId(event);
      var buttonEvent = this.get('buttonEvent') || this.get('button_event');
      if (buttonEvent && typeof buttonEvent === 'function') {
        buttonEvent('clear_button', button_id);
      } else if (buttonEvent && typeof buttonEvent === 'string') {
        this.sendAction(buttonEvent, 'clear_button', button_id);
      } else {
        this.sendAction('button_event', 'clear_button', button_id);
      }
    }
  },
  stash: function(event) {
    if(this.appState.get('edit_mode')) {
      var button_id = this.buttonId(event);
      var buttonEvent = this.get('buttonEvent') || this.get('button_event');
      if (buttonEvent && typeof buttonEvent === 'function') {
        buttonEvent('stash_button', button_id);
      } else if (buttonEvent && typeof buttonEvent === 'string') {
        this.sendAction(buttonEvent, 'stash_button', button_id);
      } else {
        this.sendAction('button_event', 'stash_button', button_id);
      }
    }
  }
});
