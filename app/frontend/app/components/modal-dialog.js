import Component from '@ember/component';
import $ from 'jquery';
import capabilities from '../utils/capabilities';
import buttonTracker from '../utils/raw_events';
import { observer } from '@ember/object';

export default Component.extend({
  didRender: function() {
    this.stretch();
    if(!this.get('already_opened')) {
      this.set('already_opened', true);
      var opening = this.get('opening');
      if (opening && typeof opening === 'function') {
        opening();
      } else if (opening && typeof opening === 'string') {
        // Fallback for string-based actions (legacy support)
        this.sendAction('opening');
      }
    }
    this.set('auto_close', !!modal.auto_close);
    if(modal.last_any_template != 'highlight' && modal.last_any_template != 'highlight-secondary') {
      modal.component = this;
    }
    var height = $(window).height() - 50;
    $(this.get('element')).find(".modal-content").css('maxHeight', height).css('overflow', 'auto');
  },
  willClearRender: function() {
    this.set('already_opened', false);
  },
  stretch: observer('stretch_ratio', 'desired_width', function() {
    if(this.get('stretch_ratio')) {
      var height = $(window).height() - 50;
      var width = $(window).width();
      var modal_width = (width * 0.9);
      if(modal_width > height * this.get('stretch_ratio') * 0.9) {
        modal_width = height * this.get('stretch_ratio') * 0.9;
      }
      $(this.get('element')).find(".modal-dialog").css('width', modal_width);
    } else if(this.get('full_stretch')) {
      var height = $(window).height() - 50;
      var width = $(window).width();
      var modal_width = (width * 0.97);
      $(this.get('element')).find(".modal-dialog").css('width', modal_width);
    } else if(this.get('desired_width')) {
      var width = $(window).width();
      var modal_width = (width * 0.9);
      if(this.get('desired_width') < modal_width) {
        modal_width = this.get('desired_width');
      }
      $(this.get('element')).find(".modal-dialog").css('width', modal_width);
    } else {
      $(this.get('element')).find(".modal-dialog").css('width', '');
    }
  }),
  willDestroy: function() {
    if(!this.get('already_closed')) {
      this.set('already_closed', true);
      try {
        var closing = this.get('closing');
        if (closing && typeof closing === 'function') {
          closing();
        } else if (closing && typeof closing === 'string') {
          // Fallback for string-based actions (legacy support)
          this.sendAction('closing');
        }
      } catch(e) { }
    }
    // Clear modal component reference when component is destroyed to prevent null reference errors
    if(modal.component === this) {
      modal.component = null;
    }
  },
  touchEnd: function(event) {
    this.send('close', event);
  },
  mouseUp: function(event) {
    // on iOS (probably just UIWebView) this phantom
    // click event get triggered. If you tap & release 
    // really fast then tap somewhere else, right after
    // touchstart a click gets triggered at the location
    // you hit and released before.
    var ignore = false;
    var now = (new Date()).getTime();
    event.handled_at = now;
    if(buttonTracker.lastTouchStart) {
      if(capabilities.mobile && now - buttonTracker.lastTouchStart < 300) {
        ignore = true;
        event.fake_event = true;
      }
    } else if(event.clientX == 0 && event.clientY == 0) {
      // on window blur if the focus is on a dropdown,
      // it seems to trigger a phantom mouseup event
      ignore = true;
    }
    if(this.last_started_on_modal) {
      this.last_started_on_modal = false;
      if(!ignore) {
        this.send('close', event);
      }
    }
  },
  mouseDown: function(event) {
    this.last_started_on_modal = event.target.classList.contains('modal');
  },
  actions: {
    close: function(event) {
      if(!$(event.target).hasClass('modal')) {
        return;
      } else {
        try {
          event.preventDefault();
        } catch(e) { }
        console.log("close from event");
        buttonTracker.ignoreUp = true;
        var action = this.get('action');
        if (action && typeof action === 'function') {
          return action();
        } else if (action && typeof action === 'string') {
          // Fallback for string-based actions (legacy support)
          return this.sendAction();
        }
      }
    },
    any_select: function(e) {
      if(e && e.type == 'select' && e.target && e.target.closest('.auto_focus') != null) {
        // auto-focus should not disable inactivity_timeout
      } else {
        modal.cancel_auto_close();
      }
    }
  }
});



