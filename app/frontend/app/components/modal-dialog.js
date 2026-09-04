import Component from '@ember/component';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import capabilities from '../utils/capabilities';
import buttonTracker from '../utils/raw_events';
import modal from '../utils/modal';
import { observer } from '@ember/object';

export default Component.extend({
  // Optional ARIA wiring (additive, opt-in only -- see 03-UI-SPEC.md 6.4). When a
  // caller passes labelledBy/describedBy string ids, modal-dialog.hbs binds them as
  // aria-labelledby/aria-describedby on the outer .modal div. Left undefined here so
  // Ember omits the attribute entirely for the ~140 existing callers that don't pass
  // either -- zero behavior change for every modal that predates this.
  labelledBy: undefined,
  describedBy: undefined,
  // Optional opt-in override for clicking the backdrop (additive, same pattern as
  // labelledBy above). When a caller passes @backdropAction, a backdrop click calls
  // it INSTEAD of @action, so a modal can distinguish "clicked outside" from
  // "pressed Close" -- copying-board uses this to minimize an in-flight copy into
  // the background drawer rather than dismissing it. Left undefined so every modal
  // that doesn't pass it keeps the single close path it has today.
  backdropAction: undefined,
  init() {
    this._super(...arguments);
    var self = this;
    this.onAnySelect = function(e) {
      self.send('any_select', e);
    };
  },
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
      // Capture the element that had focus before the modal opened so
      // willDestroy can return focus to it on close (WCAG 2.1.2 / 2.4.3
      // best practice — added 2026-04-11 per WCAG audit). We store it on
      // the component instance, not via a service, since modal-dialog is
      // already the natural single source of truth for modal lifecycle.
      try {
        var prevFocus = document.activeElement;
        if (prevFocus && prevFocus !== document.body && typeof prevFocus.focus === 'function') {
          this._previously_focused = prevFocus;
        }
      } catch(e) { }
      // Access closure action via get() - direct property access bypasses Ember's property system
      var opening = this.get('opening');
      if (opening && typeof opening === 'function') {
        opening();
      }

      // Accessibility (ARIA APG dialog pattern): initial focus.
      // A modal may OPT IN to "focus a static element first" by marking one with
      // [data-autofocus] — e.g. read-first dialogs (terms agreement) focus their
      // title so it's announced and the body isn't skipped, and Tab then walks to
      // the controls. Otherwise fall back to the general default: focus the first
      // tabbable element, or the modal container.
      runLater(() => {
        if (this.isDestroyed || this.isDestroying || !this.element) { return; }
        const explicit = Array.prototype.slice.call(this.element.querySelectorAll('[data-autofocus]'))
          .find((el) => el.getClientRects().length > 0);
        if (explicit) {
          if (explicit.getAttribute('tabindex') == null) { explicit.setAttribute('tabindex', '-1'); }
          explicit.focus();
          return;
        }
        const focusable = Array.prototype.slice.call(
          this.element.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        ).find((el) => el.getClientRects().length > 0);
        if (focusable) {
          focusable.focus();
        } else {
          const content = this.element.querySelector('.modal-content');
          if (content) { content.setAttribute('tabindex', '-1'); content.focus(); }
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
    // Restore focus to the element that had it before the modal opened
    // (WCAG 2.1.2 / 2.4.3 best practice — added 2026-04-11). Skip if the
    // saved element is no longer in the DOM (e.g. its containing route
    // unmounted while the modal was open).
    try {
      var prev = this._previously_focused;
      if (prev && document.body.contains(prev) && typeof prev.focus === 'function') {
        prev.focus();
      }
      this._previously_focused = null;
    } catch(e) { }
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
          var backdropAction = null;
          try {
            if (!_this.isDestroyed && !_this.isDestroying && _this.get) {
              action = _this.get('action');
              if (isBackdropClick) { backdropAction = _this.get('backdropAction'); }
            }
          } catch (e) { }
          if (backdropAction && typeof backdropAction === 'function') {
            backdropAction();
            return;
          }
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
