import Component from '@ember/component';
import { computed } from '@ember/object';
import { next, run, scheduleOnce } from '@ember/runloop';

/**
 * Dropdown that renders a custom list (not native select) so the inner
 * options can be fully styled. Same interface as bound-select for content/selection/action.
 */
export default Component.extend({
  tagName: '',
  content: null,
  selection: null,
  action: function() {},
  class: '',
  selectId: '',
  ariaLabel: '',
  placeholder: '- Select -',

  isOpen: false,

  /** Explicit label set when user chooses an option; ensures trigger updates even if parent re-render overwrites selection */
  _chosenLabel: null,

  selectedItem: computed('content', 'selection', function() {
    const content = this.get('content') || [];
    const sel = this.get('selection');
    if (sel == null || sel === '') { return null; }
    return content.find(function(c) { return c.id === sel || c.id === String(sel); }) || null;
  }),

  displayLabel: computed('selectedItem', function() {
    const item = this.get('selectedItem');
    return (item && item.name) || '';
  }),

  /** Label shown in trigger: user's choice if set, otherwise derived from selection/content */
  triggerLabel: computed('_chosenLabel', 'displayLabel', 'placeholder', function() {
    const chosen = this.get('_chosenLabel');
    if (chosen != null && chosen !== '') { return chosen; }
    return this.get('displayLabel') || this.get('placeholder');
  }),

  close() {
    this.set('isOpen', false);
  },

  _clickOutside: null,

  didInsertElement() {
    this._super(...arguments);
    const self = this;
    const handler = function(ev) {
      const id = self.get('selectId');
      const trigger = id ? document.getElementById(id) : null;
      const root = trigger ? trigger.closest('.modern-select') : null;
      if (root && ev.target && root.contains(ev.target)) {
        return;
      }
      if (self.get('isOpen')) {
        run(() => self.close());
      }
    };
    this.set('_clickOutside', handler);
    next(() => {
      document.addEventListener('click', handler, true);
    });
  },

  willDestroyElement() {
    const handler = this.get('_clickOutside');
    if (handler) {
      document.removeEventListener('click', handler, true);
    }
    this._super(...arguments);
  },

  /** Focus the currently-selected option (or the first one) when the
   *  dropdown opens, so keyboard navigation has a sensible starting
   *  point and the entire list doesn't appear "highlighted" because
   *  the browser is treating the whole <ul> as the focus target. */
  _focusActiveOption() {
    const id = this.get('selectId');
    const trigger = id ? document.getElementById(id) : null;
    const root = trigger ? trigger.closest('.modern-select') : null;
    if (!root) { return; }
    const list = root.querySelector('.modern-select__list');
    if (!list) { return; }
    const selected = list.querySelector('.modern-select__option--selected');
    const target = selected || list.querySelector('.modern-select__option');
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  },

  actions: {
    stopPropagation(ev) {
      if (ev && ev.stopPropagation) {
        ev.stopPropagation();
      }
    },
    toggle(ev) {
      if (ev && ev.stopPropagation) {
        ev.stopPropagation();
      }
      this.toggleProperty('isOpen');
      if (this.get('isOpen')) {
        const self = this;
        scheduleOnce('afterRender', this, function() {
          self._focusActiveOption();
        });
      }
    },
    choose(item, ev) {
      if (ev && ev.stopPropagation) {
        ev.stopPropagation();
      }
      const id = item.id;
      const name = (item && item.name) != null ? item.name : '';
      const callback = this.get('action');
      const self = this;
      run(() => {
        self.set('_chosenLabel', name);
        self.set('selection', id);
        if (typeof callback === 'function') {
          callback(id);
        }
      });
      scheduleOnce('afterRender', this, function() {
        this.close();
        // Return focus to the trigger so subsequent Tab nav resumes
        // from the dropdown's location instead of jumping to <body>.
        const id2 = this.get('selectId');
        const trigger = id2 ? document.getElementById(id2) : null;
        if (trigger && typeof trigger.focus === 'function') { trigger.focus(); }
      });
    },
    /** Arrow / Enter / Escape navigation on a focused option. */
    option_keydown(item, ev) {
      if (!ev || !ev.key) { return; }
      const key = ev.key;
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
        ev.preventDefault();
        const target = ev.target;
        const list = target ? target.parentElement : null;
        if (!list) { return; }
        const items = Array.from(list.querySelectorAll('.modern-select__option'));
        const i = items.indexOf(target);
        let next = i;
        if (key === 'ArrowDown') { next = i < items.length - 1 ? i + 1 : 0; }
        else if (key === 'ArrowUp') { next = i > 0 ? i - 1 : items.length - 1; }
        else if (key === 'Home')    { next = 0; }
        else if (key === 'End')     { next = items.length - 1; }
        const tgt = items[next];
        if (tgt && typeof tgt.focus === 'function') { tgt.focus(); }
      } else if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
        ev.preventDefault();
        this.send('choose', item, ev);
      } else if (key === 'Escape') {
        ev.preventDefault();
        this.close();
        const id3 = this.get('selectId');
        const trigger = id3 ? document.getElementById(id3) : null;
        if (trigger && typeof trigger.focus === 'function') { trigger.focus(); }
      }
    },
    /** Catch-all on the <ul> in case the keydown bubbles up before
     *  reaching an option (e.g. focus is on the list itself). */
    list_keydown(ev) {
      if (!ev || !ev.key) { return; }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        this.close();
        const id = this.get('selectId');
        const trigger = id ? document.getElementById(id) : null;
        if (trigger && typeof trigger.focus === 'function') { trigger.focus(); }
      }
    }
  }
});
