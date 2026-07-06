import Component from '@ember/component';
import { computed } from '@ember/object';

/**
 * One chip in the board-detail speak bar, with optional ACTIVE-EDIT controls
 * (feature `sentence_bar_editing`). When editing is enabled, tapping the chip
 * selects it and reveals: ✕ remove, ‹ / › reposition (‹ hidden on the leftmost
 * chip, › on the rightmost, both hidden when there's a single chip), and ⇄ swap.
 *
 * Swap mode: tapping ⇄ highlights the chip; the parent then treats the next
 * tap on ANOTHER chip as a position swap, or a tap on a board grid button as a
 * replace. Tapping ⇄ (or the highlighted chip) again cancels.
 *
 * Accessibility: the chip is focusable and fully keyboard-operable (Enter/Space
 * select, ← / → reposition while selected, Delete/Backspace remove, s/Enter swap,
 * Escape deselect/cancel) so the reorder works without a pointer — drag-and-drop
 * is a pointer-only enhancement on top. The parent owns an aria-live region that
 * announces the result of each action.
 */
export default Component.extend({
  tagName: '',

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

  // Tap on the chip body. In swap mode this is a swap target (or cancel on the
  // held chip); otherwise it toggles selection. stop propagation so it doesn't
  // trigger the bar's whole-sentence speak.
  tap(event) {
      if(!this.get('editingEnabled')) { return; } // let the click bubble → speak
      if(event) { event.stopPropagation(); event.preventDefault(); }
      if(this.get('swapActive')) {
        this._fire('onSwapTarget', this.get('index'));
      } else {
        this._fire('onSelect', this.get('index'));
      }
  },

  remove(event) {
      if(event) { event.stopPropagation(); event.preventDefault(); }
      this._fire('onRemove', this.get('index'));
  },

  move(direction, event) {
      if(event) { event.stopPropagation(); event.preventDefault(); }
      this._fire('onMove', this.get('index'), direction);
  },

  toggleSwap(event) {
      if(event) { event.stopPropagation(); event.preventDefault(); }
      this._fire('onToggleSwap', this.get('index'));
  },

  handleKeydown(event) {
      if(!this.get('editingEnabled')) { return; }
      // Keydown on a tool button (✕ / ‹ / › / ⇄) bubbles up to this chip-level
      // handler; let the button's own click handle it and don't double-fire the
      // chip's select/swap (which broke keyboard swap mode).
      if(event && event.target && event.target.closest &&
         event.target.closest('.md-board-detail-sentence-bar__chip-tool')) { return; }
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
  // Method names must not match DOM event names on tagless components (tagName: '').
  handleDragStart(event) {
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

  handleDragOver(event) {
      if(!this.get('editingEnabled') || this.get('swapActive')) { return; }
      event.preventDefault();              // required to allow a drop
      try { event.dataTransfer.dropEffect = 'move'; } catch(e) { /* noop */ }
      this.set('drag_over', true);
  },

  handleDragLeave() {
      this.set('drag_over', false);
  },

  handleDrop(event) {
      this.set('drag_over', false);
      if(!this.get('editingEnabled') || this.get('swapActive')) { return; }
      event.preventDefault(); event.stopPropagation();
      var from = parseInt(event.dataTransfer.getData('text/plain'), 10);
      var to = this.get('index');
      if(isFinite(from) && from !== to) { this._fire('onDragMove', from, to); }
  },

  handleDragEnd() {
    this.set('dragging', false);
    this.set('drag_over', false);
  }
});
