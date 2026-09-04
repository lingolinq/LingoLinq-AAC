import Component from '@ember/component';
import { computed } from '@ember/object';
import { later as runLater, cancel as runCancel } from '@ember/runloop';

// Press-and-hold duration (ms) required to open a chip's edit menu. A shorter
// press does nothing — this stops an AAC user's accidental / repeated taps from
// ever popping the menu up. Kept in sync with the `bd-chip-hold-fill` CSS anim.
const HOLD_DURATION = 2000;
// Pointer travel (px) that reclassifies a hold as a drag/scroll and cancels it.
// A little generous so an AAC user's hand tremor during the hold doesn't cancel
// it, while a real scroll/drag (which travels much further) still does.
const HOLD_MOVE_TOLERANCE = 12;
// Delay (ms) before the "holding" cue appears. Longer than a normal click/tap, so
// a quick press shows NO pressed/active formatting — only a deliberate hold does.
// The fill animation runs for the remaining (HOLD_DURATION - this) so it fills up
// right as the menu opens.
const PRESS_FEEDBACK_DELAY = 300;

/**
 * One chip in the board-detail speak bar, with optional ACTIVE-EDIT controls
 * (feature `sentence_bar_editing`). When editing is enabled, PRESS-AND-HOLD on a
 * chip for HOLD_DURATION opens its labeled action menu (Move left / Switch /
 * Remove / Move right), rendered by the PARENT below the chip. A `--pressing`
 * fill animates during the hold; releasing / moving before it completes cancels
 * with no menu (so a quick or accidental tap never opens it). This component owns
 * the chip's hold, selection, keyboard, and drag behavior — not the menu markup,
 * which lives outside the bar's overflow-clipped scroll container.
 *
 * Swap mode: the parent's Switch button highlights the chip (`swapSource`); the
 * parent then treats the next SHORT tap on ANOTHER chip as a position swap, or a
 * tap on a board grid button as a replace (no hold needed — already committed).
 *
 * Accessibility: the chip is focusable and fully keyboard-operable (Enter/Space
 * open menu, ← / → reposition while selected, Delete/Backspace remove, s/Enter
 * swap, Escape deselect/cancel) so it works without a pointer — hold + drag are
 * pointer enhancements. The parent owns an aria-live region that announces each
 * action's result.
 */
export default Component.extend({
  tagName: '',

  init() {
    this._super(...arguments);
    var self = this;
    /* PASSES THE EVENT THROUGH. This used to detect a trailing DOM event and `pop()` it
       off before `send()`, so every handler below received `undefined` for `event` —
       while all of them are written to USE it. The damage, traced live:

         tap()       `if(event) { event.stopPropagation(); event.preventDefault(); }`
                     never ran, so a chip click BUBBLED to
                     `.md-board-detail-sentence-bar__text`, whose {{on "click"}} is
                     `speak_sentence`. Completing a press-and-hold therefore SPOKE the
                     sentence, setting `list_vocalized = true` — and the next board-button
                     tap hit add_button's "already vocalized" rule and CLEARED the whole
                     utterance, replacing it with that one word. That is the reported
                     "hold, tap a button, and it wipes my sentence".
         holdEnd()   `if(event && event.type !== 'pointerup')` never cleared `_hold_fired`
                     on pointercancel/pointerleave, so the flag dangled true and ate the
                     next genuine tap — the reported "it gets stuck and nothing else works".
         holdStart() `_hold_origin` was always null, so holdMove() could never cancel a
                     hold on drag/scroll.
         keydown()   `var key = event.key` threw on every keypress on a chip.

       Introduced with the Ember 5.12 upgrade (#490) and present at this branch's
       merge-base, so it is latent on staging too — not a regression from this branch.
       Bound args (none today) still precede the event, which is the order every handler
       expects. */
    this.chipAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = Array.prototype.slice.call(arguments);
        self.send.apply(self, [actionName].concat(bound).concat(args));
      };
    };
  },

  // Per-chip flags derived from position. `total === 1` ⇒ both arrows hidden.
  show_move_left: computed('index', 'editingEnabled', function() {
    return !!this.get('editingEnabled') && this.get('index') > 0;
  }),
  show_move_right: computed('index', 'total', 'editingEnabled', function() {
    return !!this.get('editingEnabled') && this.get('index') < (this.get('total') - 1);
  }),
  // While another chip is held for swapping, every OTHER chip is a swap target.
  is_swap_target: computed('swapActive', 'swapSource', function() {
    return !!this.get('swapActive') && !this.get('swapSource');
  }),

  _fire(name, ...args) {
    var fn = this.get(name);
    if(fn) { fn(...args); }
  },

  // ----- Press-and-hold (open the menu only after a deliberate 2s hold) -----
  _cancel_hold() {
    runCancel(this._hold_timer);
    runCancel(this._press_feedback_timer);
    this._hold_timer = null;
    this._press_feedback_timer = null;
    this._hold_origin = null;
    if(!this.isDestroyed && !this.isDestroying) { this.set('pressing', false); }
  },

  actions: {
    // Begin a hold. Skipped in swap mode (there a short tap is a swap target, not
    // a hold) and when the menu is already open on this chip (a short tap closes
    // it — see `tap`). Does NOT preventDefault, so drag/scroll can still start.
    // The "holding" cue is delayed by PRESS_FEEDBACK_DELAY so a normal CLICK/tap
    // never flashes a pressed/active look — a short release cancels it first.
    holdStart(event) {
      // Start every gesture clean: if a prior completed hold ended on a
      // pointerup that synthesized NO click (rare), `_hold_fired` dangles true
      // and would eat this fresh tap — reset it before the guard so it clears in
      // any mode (swap/selected included).
      this._hold_fired = false;
      if(!this.get('editingEnabled') || this.get('swapActive') || this.get('selected')) { return; }
      var _this = this;
      this._hold_origin = event ? { x: event.clientX, y: event.clientY } : null;
      runCancel(this._press_feedback_timer);
      this._press_feedback_timer = runLater(this, function() {
        _this._press_feedback_timer = null;
        if(!_this.isDestroyed && !_this.isDestroying) { _this.set('pressing', true); }
      }, PRESS_FEEDBACK_DELAY);
      runCancel(this._hold_timer);
      this._hold_timer = runLater(this, function() {
        _this._hold_timer = null;
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('pressing', false);
        // Swallow the click that a pointerup will synthesize right after this, so
        // it doesn't immediately toggle the just-opened menu shut.
        _this._hold_fired = true;
        _this._fire('onSelect', _this.get('index'));
      }, HOLD_DURATION);
    },
    // A drag/scroll gesture (moved past tolerance) is not a hold — cancel it so
    // the native drag or the bar scroll can take over cleanly.
    holdMove(event) {
      var origin = this._hold_origin;
      if(!this._hold_timer || !origin || !event) { return; }
      if(Math.abs(event.clientX - origin.x) > HOLD_MOVE_TOLERANCE ||
         Math.abs(event.clientY - origin.y) > HOLD_MOVE_TOLERANCE) {
        this._cancel_hold();
      }
    },
    // Release / cancel / leave → stop the pending hold. `event` distinguishes HOW
    // the gesture ended, which matters for the `_hold_fired` swallow-flag below.
    holdEnd(event) {
      this._cancel_hold();
      // `_hold_fired` is armed by a COMPLETED hold solely to swallow the ONE
      // synthetic `click` that a pointerUP fires right after. On the
      // pointercancel / pointerleave paths the browser SUPPRESSES that trailing
      // click, so nothing ever consumes the flag — it dangles true, and the next
      // real tap meant to dismiss the open menu gets wrongly eaten (the menu then
      // needs two taps to close). Clear it on those non-pointerup terminations;
      // keep it for pointerup so `tap` can still swallow the genuine synthetic click.
      if(event && event.type !== 'pointerup') { this._hold_fired = false; }
    },

    // Click on the chip body. A SHORT tap does NOT open the menu (that requires a
    // hold). In swap mode it's a swap target; if this chip's menu is already open
    // a short tap dismisses it; otherwise it's a no-op. stopPropagation so it
    // doesn't trigger the bar's whole-sentence speak.
    tap(event) {
      if(!this.get('editingEnabled')) { return; } // let the click bubble → speak
      if(event) { event.stopPropagation(); event.preventDefault(); }
      // A completed hold already opened the menu and synthesizes this click — drop it.
      if(this._hold_fired) { this._hold_fired = false; return; }
      if(this.get('swapActive')) {
        this._fire('onSwapTarget', this.get('index'));
      } else if(this.get('selected')) {
        this._fire('onCancel'); // menu open → short tap dismisses
      }
      // else: short tap with no menu open → intentionally nothing.
    },
    keydown(event) {
      if(!this.get('editingEnabled')) { return; }
      var key = event.key;
      if(key === 'Enter' || key === ' ' || key === 'Spacebar') {
        event.stopPropagation(); event.preventDefault();
        if(this.get('swapActive')) { this._fire('onSwapTarget', this.get('index')); }
        else { this._fire('onSelect', this.get('index')); }
      } else if(key === 'Escape') {
        event.stopPropagation();
        this._fire('onCancel');
      } else if(this.get('selected') && (key === 'ArrowLeft' || key === 'Left') && this.get('show_move_left')) {
        event.stopPropagation(); event.preventDefault();
        this._fire('onMove', this.get('index'), -1);
      } else if(this.get('selected') && (key === 'ArrowRight' || key === 'Right') && this.get('show_move_right')) {
        event.stopPropagation(); event.preventDefault();
        this._fire('onMove', this.get('index'), 1);
      } else if(this.get('selected') && (key === 'Delete' || key === 'Backspace')) {
        event.stopPropagation(); event.preventDefault();
        this._fire('onRemove', this.get('index'));
      } else if(this.get('selected') && (key === 's' || key === 'S')) {
        event.stopPropagation(); event.preventDefault();
        this._fire('onToggleSwap', this.get('index'));
      }
    },

    // ----- Native HTML5 drag-and-drop (pointer-only reorder) -----
    dragStart(event) {
      this._cancel_hold(); // a drag is not a hold
      if(!this.get('editingEnabled') || this.get('swapActive')) {
        if(event) { event.preventDefault(); }
        return;
      }
      try {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(this.get('index')));
      } catch(e) { /* some browsers restrict dataTransfer */ }
      this.set('dragging', true);
    },
    dragOver(event) {
      if(!this.get('editingEnabled') || this.get('swapActive')) { return; }
      event.preventDefault();              // required to allow a drop
      try { event.dataTransfer.dropEffect = 'move'; } catch(e) { /* noop */ }
      this.set('drag_over', true);
    },
    dragLeave() {
      this.set('drag_over', false);
    },
    drop(event) {
      this.set('drag_over', false);
      if(!this.get('editingEnabled') || this.get('swapActive')) { return; }
      event.preventDefault(); event.stopPropagation();
      var from = parseInt(event.dataTransfer.getData('text/plain'), 10);
      var to = this.get('index');
      if(isFinite(from) && from !== to) { this._fire('onDragMove', from, to); }
    },
    dragEnd() {
      this.set('dragging', false);
      this.set('drag_over', false);
    }
  },

  willDestroy() {
    this._super(...arguments);
    runCancel(this._hold_timer);
    runCancel(this._press_feedback_timer);
    this._hold_timer = null;
    this._press_feedback_timer = null;
  }
});
