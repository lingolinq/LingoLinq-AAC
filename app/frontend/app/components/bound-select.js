import Component from '@ember/component';
import { computed } from '@ember/object';
import { next, run, scheduleOnce } from '@ember/runloop';

/**
 * Drop-in replacement that preserves the existing bound-select API
 * (content / selection / action / select_class / select_id / prompt /
 * divider items) but renders a modern <button> trigger + <ul> listbox
 * instead of a native <select>. This eliminates Bootstrap-styled
 * <select>s across the project in one place — every existing
 * {{bound-select ...}} usage automatically picks up the new look,
 * and the open dropdown is a real DOM list (not a browser-rendered
 * native popup), so it can be fully styled.
 *
 * Supports dividers: items with `divider: true` start a new section
 * with an optional `label` rendered above the following items.
 */
export default Component.extend({
  tagName: 'span',
  content: null,
  selection: null,
  prompt: null,
  action: function() {},

  // Aliases for the bound-select-style attribute names used across
  // the codebase. We forward these to the rendered button.
  select_class: '',
  select_id: '',

  // Used by some callers to display a slimmer trigger in tight UI.
  short: false,

  isOpen: false,

  /** Explicit label set when user chooses an option; ensures trigger updates even if parent re-render overwrites selection. */
  _chosenLabel: null,

  selectableContent: computed('content', function() {
    const content = this.get('content') || [];
    return content.filter(function(c) { return !c.divider; });
  }),

  selectedItem: computed('content', 'selection', 'selectableContent', function() {
    const list = this.get('selectableContent') || [];
    const sel = this.get('selection');
    if (sel == null || sel === '') { return null; }
    return list.find(function(c) { return c.id === sel || String(c.id) === String(sel); }) || null;
  }),

  triggerLabel: computed('_chosenLabel', 'selectedItem', 'prompt', function() {
    const chosen = this.get('_chosenLabel');
    if (chosen != null && chosen !== '') { return chosen; }
    const item = this.get('selectedItem');
    if (item && item.name != null) { return item.name; }
    return this.get('prompt') || '- Select -';
  }),

  showPlaceholder: computed('selectedItem', '_chosenLabel', function() {
    return !this.get('selectedItem') && (this.get('_chosenLabel') == null || this.get('_chosenLabel') === '');
  }),

  /** Build a render-friendly content list that includes divider rows
   *  (rendered as <li class="bound-select__divider">). Each divider
   *  item gets an internal _isDivider flag so the template can branch
   *  cleanly. */
  renderContent: computed('content', function() {
    const content = this.get('content') || [];
    return content.map(function(c) {
      if (c && c.divider) {
        return { _isDivider: true, label: c.label || '' };
      }
      return c;
    });
  }),

  close() {
    this.set('isOpen', false);
  },

  _clickOutside: null,

  didInsertElement() {
    this._super(...arguments);
    const self = this;
    const handler = function(ev) {
      const root = self.element && self.element.querySelector('.bound-select');
      if (root && ev.target && root.contains(ev.target)) { return; }
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

  actions: {
    stopPropagation(ev) {
      if (ev && ev.stopPropagation) { ev.stopPropagation(); }
    },
    toggle(ev) {
      if (ev && ev.stopPropagation) { ev.stopPropagation(); }
      this.toggleProperty('isOpen');
    },
    choose(item, ev) {
      if (ev && ev.stopPropagation) { ev.stopPropagation(); }
      if (!item || item._isDivider || item.disabled) { return; }
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
      });
    }
  }
});
