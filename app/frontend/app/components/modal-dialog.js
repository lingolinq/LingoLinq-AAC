import Component from '@ember/component';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import capabilities from '../utils/capabilities';
import buttonTracker from '../utils/raw_events';
import modal from '../utils/modal';
import { observer } from '@ember/object';

export default Component.extend({
  didRender: function() {
    if(!this || typeof this.get !== 'function' || this.isDestroyed || this.isDestroying) { return; }
    if (this.get('standalone')) {
      var el = this.get('element');
      if (el && !this.isDestroyed && !this.isDestroying) {
        var height = $(window).height() - 50;
        $(el).find('.modal-content--standalone').css('maxHeight', height).css('overflow', 'auto');
      }
      return;
    }
    this.stretch();
    if(!this.get('already_opened')) {
      this.set('already_opened', true);
      // Access closure action via get() - direct property access bypasses Ember's property system
      var opening = this.get('opening');
      if (opening && typeof opening === 'function') {
        opening();
      }
      
      // Accessibility: Focus first tabbable element or the modal itself
      runLater(() => {
        if (this.isDestroyed || this.isDestroying || !this.element) { return; }
        const tabbable = $(this.element).find('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])').filter(':visible');
        if (tabbable.length > 0) {
          tabbable[0].focus();
        } else {
          $(this.element).find('.modal-content').attr('tabindex', '-1').focus();
        }
      }, 100);
    }
    this.set('auto_close', !!modal.auto_close);
    if(modal.last_any_template != 'highlight' && modal.last_any_template != 'highlight-secondary') {
      modal.component = this;
      var service = modal._getService();
      if (service) {
        service.setComponent(this);
      }
    }
    var el = this.get('element');
    if (!el || this.isDestroyed || this.isDestroying) { return; }
    var height = $(window).height() - 50;
    $(el).find(".modal-content").css('maxHeight', height).css('overflow', 'auto');
  },
  willClearRender: function() {
    this.set('already_opened', false);
  },
  
  keyDown(event) {
    if (this.isDestroyed || this.isDestroying || !this.element) { return; }
    // Escape key
    if (event.keyCode === 27) {
      if (this.get('uncloseable')) { return; }
      this.send('close', event);
      return;
    }

    // Tab key trapping
    if (event.keyCode === 9) {
      const tabbable = $(this.element).find('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])').filter(':visible');
      if (tabbable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = tabbable[0];
      const last = tabbable[tabbable.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first) {
          last.focus();
          event.preventDefault();
        }
      } else {
        if (document.activeElement === last) {
          first.focus();
          event.preventDefault();
        }
      }
    }
  },

  stretch: observer('stretch_ratio', 'desired_width', function() {
    if(!this || typeof this.get !== 'function' || this.isDestroyed || this.isDestroying) { return; }
    var el = this.get('element');
    if (!el) { return; }
    if(this.get('stretch_ratio')) {
      var height = $(window).height() - 50;
      var width = $(window).width();
      var modal_width = (width * 0.9);
      if(modal_width > height * this.get('stretch_ratio') * 0.9) {
        modal_width = height * this.get('stretch_ratio') * 0.9;
      }
      $(el).find(".modal-dialog").css('width', modal_width);
    } else if(this.get('full_stretch')) {
      var height = $(window).height() - 50;
      var width = $(window).width();
      var modal_width = (width * 0.97);
      $(el).find(".modal-dialog").css('width', modal_width);
    } else if(this.get('desired_width')) {
      var width = $(window).width();
      var modal_width = (width * 0.9);
      if(this.get('desired_width') < modal_width) {
        modal_width = this.get('desired_width');
      }
      $(el).find(".modal-dialog").css('width', modal_width);
    } else {
      $(el).find(".modal-dialog").css('width', '');
    }
  }),
  willDestroy: function() {
    if(!this.get('already_closed')) {
      this.set('already_closed', true);
      try {
        var closing = this.get('closing');
        if (closing && typeof closing === 'function') {
          closing();
        }
      } catch(e) { }
    }
    if(modal.component === this) {
      modal.component = null;
    }
  },
  touchEnd: function(event) {
    this.send('close', event);
  },
  mouseUp: function(event) {
    var ignore = false;
    var now = (new Date()).getTime();
    event.handled_at = now;
    if(buttonTracker.lastTouchStart) {
      if(capabilities.mobile && now - buttonTracker.lastTouchStart < 300) {
        ignore = true;
        event.fake_event = true;
      }
    } else if(event.clientX == 0 && event.clientY == 0) {
      ignore = true;
    }
    if(this.last_started_on_modal) {
      this.last_started_on_modal = false;
      if(!ignore && !this.get('uncloseable')) {
        this.send('close', event);
      }
    }
  },
  mouseDown: function(event) {
    this.last_started_on_modal = event.target.classList.contains('modal');
  },
  actions: {
    close: function(event) {
      if(!this || typeof this.get !== 'function') { return; }
      var isBackdropClick = event && event.target && $(event.target).hasClass('modal');
      if (this.get('uncloseable') && isBackdropClick) { return; }
      var isExplicitButtonCall = event && (event.type === 'click' || event.type === 'keydown') && !isBackdropClick;

      if(isBackdropClick) {
        try {
          event.preventDefault();
        } catch(e) { }
        buttonTracker.ignoreUp = true;
      }
      
      if(isBackdropClick || isExplicitButtonCall) {
        var _this = this;
        var doClose = function() {
          var action = null;
          try {
            if (!_this.isDestroyed && !_this.isDestroying && _this.get) {
              action = _this.get('action');
            }
          } catch (e) { }
          if (action && typeof action === 'function') {
            action();
          } else {
            try {
              if (modal && typeof modal.close === 'function') {
                modal.close();
              }
            } catch (e) { }
          }
        };
        if (isBackdropClick) {
          runLater(doClose, 0);
        } else {
          doClose();
        }
      }
    },
    any_select: function(e) {
      if(!this) { return; }
      if(e && e.type == 'select' && e.target && e.target.closest('.auto_focus') != null) {
      } else {
        modal.cancel_auto_close();
      }
    }
  }
});
