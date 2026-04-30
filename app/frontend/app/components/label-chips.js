import Component from '@ember/component';
import { computed } from '@ember/object';
import { next } from '@ember/runloop';
import i18n from '../utils/i18n';

export default Component.extend({
  classNames: ['label-chips'],
  classNameBindings: ['hasFocus:label-chips--focused'],

  value: '',
  currentInput: '',
  inputId: null,
  placeholder: null,
  hasFocus: false,
  editingIndex: null,
  editingValue: '',

  init() {
    this._super(...arguments);
    if(!this.get('inputId')) {
      this.set('inputId', 'label-chips-input-' + Math.floor(Math.random() * 1e9));
    }
    if(!this.get('placeholder')) {
      this.set('placeholder', i18n.t('labels_chip_placeholder', "Type a word and press Enter (or paste a list)"));
    }
  },

  chips: computed('value', function() {
    var str = this.get('value') || '';
    if(typeof str !== 'string') { str = '' + str; }
    return str.split(/\n|,/).map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
  }),

  chip_items: computed('value', function() {
    var chips = this.get('chips') || [];
    var counts = {};
    chips.forEach(function(c) {
      var key = (c || '').toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    });
    return chips.map(function(c) {
      var key = (c || '').toLowerCase();
      return {
        value: c,
        is_duplicate: counts[key] > 1
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
    }
  }
});
