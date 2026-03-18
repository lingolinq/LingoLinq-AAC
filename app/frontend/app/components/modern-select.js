import Component from '@ember/component';
import { computed } from '@ember/object';
import { run } from '@ember/runloop';

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
  triggerLabel: computed('_chosenLabel', 'displayLabel', function() {
    const chosen = this.get('_chosenLabel');
    if (chosen != null && chosen !== '') { return chosen; }
    return this.get('displayLabel') || '';
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
      const root = id ? document.getElementById(id) : null;
      if (root && ev.target && root.contains(ev.target)) {
        return;
      }
      if (self.get('isOpen')) {
        run(self, 'close');
      }
    };
    this.set('_clickOutside', handler);
    run.next(() => {
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
      if (ev && ev.stopPropagation) {
        ev.stopPropagation();
      }
    },
    toggle(ev) {
      if (ev && ev.stopPropagation) {
        ev.stopPropagation();
      }
      this.toggleProperty('isOpen');
    },
    choose(item, ev) {
      if (ev && ev.stopPropagation) {
        ev.stopPropagation();
      }
      const id = item.id;
      const name = (item && item.name) != null ? item.name : '';
      const callback = this.get('action');
      const self = this;
      run(function() {
        self.set('_chosenLabel', name);
        self.set('selection', id);
        if (typeof callback === 'function') {
          callback(id);
        }
      });
      run.scheduleOnce('afterRender', this, function() {
        this.close();
      });
    }
  }
});
