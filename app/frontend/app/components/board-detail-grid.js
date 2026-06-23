import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';
import { scheduleOnce, debounce, cancel } from '@ember/runloop';
import labelFit from '../utils/label_fit';

// Throttle window resize re-fits to ~250ms. Resizing fires many events
// per drag; we only need the last one's measurement.
var RESIZE_DEBOUNCE_MS = 250;

// Look up the rendered grid root by scoping inside the board-detail
// content area. The board-detail page has one grid at a time, but
// hard-coding document.querySelector('.md-board-detail-grid') would
// break if the legacy /board/:key view ever co-mounted; scoping to
// the board-detail shell keeps us isolated.
function findGridEl() {
  return document.querySelector('.md-board-detail-main .md-board-detail-grid') ||
         document.querySelector('.md-board-detail-grid');
}

export default Component.extend({
  tagName: '',
  app_state: service('app-state'),

  init: function() {
    this._super(...arguments);
    var _this = this;
    this.selfActionNoBubble = function(attrName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        var action = _this.get(attrName);
        if (action) { action.apply(null, bound); }
      };
    };
    // Parent-passed closures (selectButton, closeColorPicker, …) are only
    // reliable via this.get() in classic components — bare this.selectButton
    // in templates is undefined under Ember 5. Speak-mode mouse clicks are
    // routed through raw_events buttonSelect, not these {{on}} handlers.
    this.invokeAttr = function(attrName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var action = _this.get(attrName);
        if (action) {
          action.apply(null, bound.concat(Array.prototype.slice.call(arguments)));
        }
      };
    };
    this.invokeAttr0 = function(attrName) {
      return function() {
        var action = _this.get(attrName);
        if (action) { action.apply(null, arguments); }
      };
    };
    this._on_resize = function() {
      _this._schedule_fit('resize');
    };
    window.addEventListener('resize', this._on_resize);
  },

  willDestroyElement: function() {
    if(this._on_resize) {
      window.removeEventListener('resize', this._on_resize);
      this._on_resize = null;
    }
    if(this._resize_pending) {
      cancel(this._resize_pending);
      this._resize_pending = null;
    }
    this._super(...arguments);
  },

  didRender: function() {
    this._super(...arguments);
    // Re-fit on every render — covers initial mount, route re-entry,
    // ordered_buttons changes, and toggle flips. scheduleOnce keeps
    // multiple same-render triggers from compounding.
    scheduleOnce('afterRender', this, '_run_fit_or_clear');
  },

  // shrinkLabelsToFit flipping is also caught by didRender, but a
  // dedicated observer makes the intent explicit and lets the clear
  // pass fire promptly even when nothing else triggers a re-render.
  _shrink_observer: observer('shrinkLabelsToFit', function() {
    scheduleOnce('afterRender', this, '_run_fit_or_clear');
  }),

  _schedule_fit: function(source) {
    this._resize_pending = debounce(this, '_run_fit_or_clear', source, RESIZE_DEBOUNCE_MS);
  },

  _run_fit_or_clear: function() {
    if(this.isDestroyed || this.isDestroying) { return; }
    var gridEl = findGridEl();
    if(!gridEl) { return; }
    if(this.get('shrinkLabelsToFit')) {
      labelFit.apply(gridEl);
    } else {
      labelFit.clear(gridEl);
    }
  },

  actions: {
    select_button(button) {
      var action = this.get('selectButton');
      if(action) { action(button); }
    },

    select_button_key(button, event) {
      var action = this.get('selectButtonKey');
      if(action) { action(button, event); }
    },

    edit_button_settings(button) {
      var action = this.get('editButtonSettings');
      if(action) { action(button); }
    },

    open_color_picker(button) {
      var action = this.get('openColorPicker');
      if(action) { action(button); }
    },

    stash_button(button) {
      var action = this.get('stashButton');
      if(action) { action(button); }
    },

    word_data(button) {
      var action = this.get('wordData');
      if(action) { action(button); }
    },

    clear_button(button) {
      var action = this.get('clearButton');
      if(action) { action(button); }
    },

    toggle_button_menu(button) {
      var action = this.get('toggleButtonMenu');
      if(action) { action(button); }
    },

    close_color_picker() {
      var action = this.get('closeColorPicker');
      if(action) { action(); }
    },

    apply_swatch_color(swatch) {
      var action = this.get('applySwatchColor');
      if(action) { action(swatch); }
    },

    toggle_minicolors() {
      var action = this.get('toggleMinicolors');
      if(action) { action(); }
    },

    apply_custom_color() {
      var action = this.get('applyCustomColor');
      if(action) { action(); }
    },

    button_event() {
      /* Forward ALL args from button-listener — not just the first two.
         button-listener fires `rearrangeButtons` with (action, dragId,
         dropId) and `buttonSelect` with (action, id, event). The
         previous 2-arg signature truncated the 3rd arg, so dropId
         (and the event) were silently dropped. With dropId undefined,
         editManager.switch_buttons logged "couldn't find a button!"
         and returned without committing — the drag visual reverted on
         release. See docs/task-management/2026-05-26-board-detail-drag-drop-revert.md. */
      var action = this.get('buttonEvent');
      if(action) { action.apply(null, arguments); }
    }
  }
});
