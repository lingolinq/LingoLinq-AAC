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
  /** When true, render a filter input above the option list and
   *  match options by case-insensitive substring against `name`.
   *  Defaults to false so existing consumers are unaffected. */
  searchable: false,
  /** Placeholder shown in the search input when searchable. */
  searchPlaceholder: 'Search...',

  isOpen: false,

  init() {
    this._super(...arguments);
    var self = this;
    this.onToggle = function(ev) {
      self.send('toggle', ev);
    };
    this.onStopPropagation = function(ev) {
      self.send('stopPropagation', ev);
    };
    this.onListKeydown = function(ev) {
      self.send('list_keydown', ev);
    };
    this.onSearchKeydown = function(ev) {
      self.send('search_keydown', ev);
    };
    this.onChoose = function(item, ev) {
      self.send('choose', item, ev);
    };
    this.onOptionKeydown = function(item, ev) {
      self.send('option_keydown', item, ev);
    };
  },

  /** Live filter string typed into the search input. Cleared
   *  whenever the dropdown closes so reopening starts fresh. */
  searchString: '',

  /** Explicit label set when user chooses an option; ensures trigger updates even if parent re-render overwrites selection */
  _chosenLabel: null,

  selectedItem: computed('content', 'selection', function() {
    const content = this.get('content') || [];
    const sel = this.get('selection');
    if (sel == null || sel === '') { return null; }
    return content.find(function(c) {
      // Headings carry a `name` but no `id` and are never selectable.
      if (!c || c.heading) { return false; }
      return c.id === sel || c.id === String(sel);
    }) || null;
  }),

  /** Content filtered by `searchString` when searchable; otherwise
   *  returns content unchanged. Filter matches case-insensitive
   *  substring against the option `name` (with `id` as fallback for
   *  edge cases where name is missing). */
  filteredContent: computed('content', 'searchable', 'searchString', function() {
    const content = this.get('content') || [];
    if (!this.get('searchable')) { return content; }
    const q = (this.get('searchString') || '').trim().toLowerCase();
    if (!q) { return content; }
    const matched = content.filter(function(item) {
      if (!item) { return false; }
      // Headings are structure, not options — never matched on their own text.
      // They are re-inserted below, but only where options survived under them.
      if (item.heading) { return false; }
      const name = item.name != null ? String(item.name) : '';
      const id = item.id != null ? String(item.id) : '';
      return name.toLowerCase().indexOf(q) !== -1 || id.toLowerCase().indexOf(q) !== -1;
    });
    if (!content.some(function(item) { return item && item.heading; })) { return matched; }
    /* Rebuild in source order, dropping any heading whose whole group was
       filtered away — a lone heading over nothing reads as a broken row. */
    const kept = new Set(matched);
    const out = [];
    content.forEach(function(item) {
      if (!item) { return; }
      if (item.heading) {
        out.push(item);
      } else if (kept.has(item)) {
        out.push(item);
      }
    });
    return out.filter(function(item, idx) {
      if (!item.heading) { return true; }
      const next = out[idx + 1];
      return !!next && !next.heading;
    });
  }),

  displayLabel: computed('selectedItem', function() {
    const item = this.get('selectedItem');
    return (item && item.name) || '';
  }),

  /** Label shown in trigger: the user's sticky choice ONLY while it still matches
   *  the current selection (this is what lets it survive a parent re-render that
   *  doesn't change selection). Once the parent changes selection to a different
   *  option — or clears it (selection='' / null) — the chosen label is stale, so
   *  fall back to the reactive selection-derived label / placeholder. */
  triggerLabel: computed('_chosenLabel', 'selectedItem', 'placeholder', function() {
    const chosen = this.get('_chosenLabel');
    const item = this.get('selectedItem');
    const label = (item && item.name) || '';
    if (chosen != null && chosen !== '' && item && item.name === chosen) { return chosen; }
    return label || this.get('placeholder');
  }),

  close() {
    this.set('isOpen', false);
    /* Reset filter input on close so the next open starts with the
       full list. Only meaningful when searchable, but cheap to do
       unconditionally. */
    if (this.get('searchString')) { this.set('searchString', ''); }
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
    /* When searchable, the user expects to start typing immediately;
       focus the filter input rather than an option. */
    if (this.get('searchable')) {
      const search = root.querySelector('.modern-select__search-input');
      if (search && typeof search.focus === 'function') {
        search.focus();
        return;
      }
    }
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
      // Collapse a duplicate toggle from one modal click (raw_events synthetic +
      // native click both fire) that would open then instantly re-close the
      // dropdown. Scoped to the toggle only, so choose/close are untouched.
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      if (this._lastToggleAt != null && (now - this._lastToggleAt) < 250) { return; }
      this._lastToggleAt = now;
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
    /** Live update of the filter string as the user types in the
     *  search input. Only used when `searchable=true`. */
    updateSearch(value) {
      const v = value == null ? '' : String(value);
      this.set('searchString', v);
    },
    /** Keyboard handling on the search input: ArrowDown jumps focus
     *  to the first visible option; Enter selects the first match;
     *  Escape closes the dropdown. Typing characters falls through
     *  to the input's normal handling. */
    search_keydown(ev) {
      if (!ev || !ev.key) { return; }
      const key = ev.key;
      const id = this.get('selectId');
      const trigger = id ? document.getElementById(id) : null;
      const root = trigger ? trigger.closest('.modern-select') : null;
      if (key === 'ArrowDown') {
        ev.preventDefault();
        if (!root) { return; }
        const first = root.querySelector('.modern-select__option');
        if (first && typeof first.focus === 'function') { first.focus(); }
      } else if (key === 'Enter') {
        ev.preventDefault();
        if (!root) { return; }
        const first = root.querySelector('.modern-select__option');
        if (first) { first.click(); }
      } else if (key === 'Escape') {
        ev.preventDefault();
        this.close();
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
