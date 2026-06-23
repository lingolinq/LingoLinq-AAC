import Component from '@ember/component';
import { computed } from '@ember/object';
import { next } from '@ember/runloop';
import { htmlSafe } from '@ember/template';
import i18n from '../utils/i18n';

export default Component.extend({
  classNames: ['label-chips'],
  classNameBindings: ['hasFocus:label-chips--focused', 'isDragging:label-chips--dragging'],

  value: '',
  currentInput: '',
  inputId: null,
  placeholder: null,
  hasFocus: false,
  editingIndex: null,
  editingValue: '',
  showChips: true,
  showInput: true,
  /** Index of the chip currently being dragged. Null when no drag is in
   *  flight. Bound to the chip template so the source chip can render in
   *  a faded "ghost" state and the drop targets can highlight as you
   *  drag over them. */
  draggingIndex: null,
  /** Index of the chip currently under the cursor during a drag. Drives
   *  a `--drop-target` modifier on the hovered chip so the user gets a
   *  clear "I'll land here" hint. Reset on dragend / drop / drag leave. */
  dropTargetIndex: null,
  isDragging: computed('draggingIndex', function() {
    var idx = this.get('draggingIndex');
    return idx !== null && idx !== undefined;
  }),
  /** Optional map of `label.toLowerCase() -> { fill, border, type }` so chips
   *  render in their part-of-speech color (matching the preview buttons)
   *  instead of the default mint pill. Caller is responsible for
   *  populating the map (see create-board-new.js _lookup_label_colors). */
  colors: null,

  init() {
    this._super(...arguments);
    if(!this.get('inputId')) {
      this.set('inputId', 'label-chips-input-' + Math.floor(Math.random() * 1e9));
    }
    if(!this.get('placeholder')) {
      this.set('placeholder', i18n.t('labels_chip_placeholder', "Type a word and press Enter (or paste a list)"));
    }

    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
  },

  chips: computed('value', function() {
    var str = this.get('value') || '';
    if(typeof str !== 'string') { str = '' + str; }
    return str.split(/\n|,/).map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
  }),

  chip_items: computed('value', 'colors', function() {
    var chips = this.get('chips') || [];
    var colors = this.get('colors') || {};
    var counts = {};
    chips.forEach(function(c) {
      var key = (c || '').toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    });
    return chips.map(function(c) {
      var key = (c || '').toLowerCase();
      var color = colors[key];
      var bg_style = null;
      var has_color = false;
      if(color && color.fill) {
        var s = 'background: ' + color.fill + ';';
        if(color.border) { s += ' border-color: ' + color.border + ';'; }
        bg_style = htmlSafe(s);
        has_color = true;
      }
      return {
        value: c,
        is_duplicate: counts[key] > 1,
        bg_style: bg_style,
        has_color: has_color
      };
    });
  }),

  _emit(chips, currentInput) {
    var newValue = chips.join('\n');
    if(currentInput && currentInput.length) {
      newValue = newValue.length ? newValue + '\n' + currentInput : currentInput;
    }
    var onChange = this.get('onChange');
    if(onChange) {
      onChange(newValue);
    }
  },

  _commitCurrentInput() {
    var input = (this.get('currentInput') || '').trim();
    if(!input.length) { return; }
    var chips = (this.get('chips') || []).slice();
    input.split(/\n|,/).forEach(function(part) {
      var trimmed = part.trim();
      if(trimmed.length) { chips.push(trimmed); }
    });
    this.set('currentInput', '');
    this._emit(chips, '');
  },

  editInputId: computed('inputId', function() {
    return (this.get('inputId') || 'label-chips') + '-edit';
  }),

  _focusEditInput() {
    var _this = this;
    next(function() {
      var elt = document.getElementById(_this.get('editInputId'));
      if(elt) {
        elt.focus();
        try { elt.select(); } catch(e) { }
      }
    });
  },

  actions: {
    inputChanged(value) {
      this.set('currentInput', value);
    },

    handleKeydown(event) {
      var key = event.key;
      if(key === 'Enter' || key === ',') {
        event.preventDefault();
        event.stopPropagation();
        this._commitCurrentInput();
      } else if(key === 'Backspace' && !(this.get('currentInput') || '').length) {
        var chips = (this.get('chips') || []).slice();
        if(chips.length) {
          chips.pop();
          this._emit(chips, '');
          event.preventDefault();
        }
      }
    },

    handlePaste(event) {
      var clipboard = event.clipboardData || window.clipboardData;
      var text = clipboard && clipboard.getData('text');
      if(!text) { return; }
      if(text.indexOf('\n') === -1 && text.indexOf(',') === -1 && text.indexOf('\t') === -1) {
        return;
      }
      event.preventDefault();
      var parts = text.split(/\n|,|\t/).map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
      if(!parts.length) { return; }
      var chips = (this.get('chips') || []).slice().concat(parts);
      this._emit(chips, this.get('currentInput') || '');
    },

    handleBlur() {
      this.set('hasFocus', false);
      this._commitCurrentInput();
    },

    handleFocus() {
      this.set('hasFocus', true);
    },

    removeChipAt(index, event) {
      if(event && event.stopPropagation) { event.stopPropagation(); }
      var chips = (this.get('chips') || []).slice();
      chips.splice(index, 1);
      this._emit(chips, this.get('currentInput') || '');
      var elt = document.getElementById(this.get('inputId'));
      if(elt) { elt.focus(); }
    },

    focusInput(event) {
      if(event && event.target && event.target.closest && event.target.closest('.label-chips__chip-remove')) {
        return;
      }
      if(event && event.target && event.target.closest && event.target.closest('.label-chips__chip')) {
        return;
      }
      var elt = document.getElementById(this.get('inputId'));
      if(elt) { elt.focus(); }
    },

    startEdit(index, event) {
      if(event && event.stopPropagation) { event.stopPropagation(); }
      var chips = this.get('chips') || [];
      var current = chips[index] || '';
      this.set('editingIndex', index);
      this.set('editingValue', current);
      this._focusEditInput();
    },

    editInputChanged(value) {
      this.set('editingValue', value);
    },

    commitEdit() {
      var index = this.get('editingIndex');
      if(index === null || index === undefined) { return; }
      var chips = (this.get('chips') || []).slice();
      var newValue = (this.get('editingValue') || '').trim();
      if(newValue.length === 0) {
        chips.splice(index, 1);
      } else {
        chips[index] = newValue;
      }
      this.set('editingIndex', null);
      this.set('editingValue', '');
      this._emit(chips, this.get('currentInput') || '');
    },

    cancelEdit() {
      this.set('editingIndex', null);
      this.set('editingValue', '');
    },

    editKeydown(event) {
      var key = event.key;
      if(key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        this.send('commitEdit');
      } else if(key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.send('cancelEdit');
      }
    },

    chipDragStart(index, event) {
      // Editing chips can't be dragged — the input would lose focus and the
      // edit value would be lost. Bail out so the browser doesn't initiate
      // a drag from inside the edit input either.
      if(this.get('editingIndex') !== null && this.get('editingIndex') !== undefined) {
        if(event && event.preventDefault) { event.preventDefault(); }
        return;
      }
      this.set('draggingIndex', index);
      if(event && event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        // Setting any data is required by Firefox for the drag to start.
        try { event.dataTransfer.setData('text/plain', String(index)); } catch(e) { }
      }
    },

    chipDragOver(index, event) {
      // preventDefault on dragover is what tells the browser this is a
      // valid drop target — without it, drop never fires.
      if(event && event.preventDefault) { event.preventDefault(); }
      if(event && event.stopPropagation) { event.stopPropagation(); }
      if(event && event.dataTransfer) { event.dataTransfer.dropEffect = 'move'; }
      if(this.get('dropTargetIndex') !== index) {
        this.set('dropTargetIndex', index);
      }
    },

    chipDragLeave(index, event) {
      // Only clear the highlight when leaving the chip we last marked as
      // the drop target — dragenter on a sibling chip will set a new index
      // before this fires for the previous one, so the simple equality
      // check avoids flicker.
      if(this.get('dropTargetIndex') === index) {
        this.set('dropTargetIndex', null);
      }
    },

    chipDrop(targetIndex, event) {
      if(event && event.preventDefault) { event.preventDefault(); }
      if(event && event.stopPropagation) { event.stopPropagation(); }
      var sourceIndex = this.get('draggingIndex');
      this.set('draggingIndex', null);
      this.set('dropTargetIndex', null);
      if(sourceIndex === null || sourceIndex === undefined) { return; }
      if(sourceIndex === targetIndex) { return; }
      var chips = (this.get('chips') || []).slice();
      if(sourceIndex < 0 || sourceIndex >= chips.length) { return; }
      if(targetIndex < 0 || targetIndex >= chips.length) { return; }
      // Splice the source chip out and re-insert it at the target position.
      // This produces a "drop into" reorder (rather than a swap) so dragging
      // the 5th chip onto the 1st makes the 5th become the 1st and the
      // others shift down — what users expect from a chip list reorder.
      var moved = chips.splice(sourceIndex, 1)[0];
      chips.splice(targetIndex, 0, moved);
      this._emit(chips, this.get('currentInput') || '');
    },

    chipDragEnd() {
      this.set('draggingIndex', null);
      this.set('dropTargetIndex', null);
    }
  }
});
