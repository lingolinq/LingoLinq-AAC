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
  searchable: false,
  search_placeholder: null,
  // Opt-in grid listbox (register month/year). Do NOT name this `layout` —
  // Ember classic uses `layout` for the compiled template.
  grid: false,
  gridColumns: 3,
  /* Opt-in scroll controls inside the listbox (registration year picker). Opt-in rather
     than automatic because every other BoundSelect in the app shares this component and
     most of their lists are short enough that two extra rows would be pure clutter. */
  scroll_buttons: false,

  isOpen: false,
  searchQuery: '',

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

  isGrid: computed('grid', function() {
    return !!this.get('grid');
  }),

  gridColsClass: computed('grid', 'gridColumns', function() {
    if(!this.get('grid')) { return ''; }
    return 'bound-select--cols-' + this._gridColumnCount();
  }),

  /** Build a render-friendly content list that includes divider rows
   *  (rendered as <li class="bound-select__divider">). Each divider
   *  item gets an internal _isDivider flag so the template can branch
   *  cleanly. Grid mode drops empty-id placeholders so month/year
   *  cells are the real values only. */
  renderContent: computed('content', 'searchable', 'searchQuery', 'grid', function() {
    const content = this.get('content') || [];
    const searchable = this.get('searchable');
    const query = searchable ? (this.get('searchQuery') || '').toLowerCase().trim() : '';
    const grid = !!this.get('grid');
    return content.map(function(c) {
      if (c && c.divider) {
        return { _isDivider: true, label: c.label || '' };
      }
      return c;
    }).filter(function(c) {
      if (grid && c && !c._isDivider && (c.id === '' || c.id == null)) { return false; }
      if (!query) { return true; }
      if (!c || c._isDivider) { return false; }
      return (c.name || '').toLowerCase().indexOf(query) !== -1 ||
        String(c.id || '').toLowerCase().indexOf(query) !== -1;
    });
  }),

  close() {
    this.set('isOpen', false);
    this.set('searchQuery', '');
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

  /** Focus the active option when the dropdown opens. See
   *  docs/styling-recurring-problems.md #11 for context. */
  _focusInitialControl() {
    if (!this.element) { return; }
    const list = this.element.querySelector('.bound-select__list');
    if (!list) { return; }
    const search = list.querySelector('.bound-select__search-input');
    if (search && typeof search.focus === 'function') {
      this._focusWithoutScrolling(search);
      return;
    }
    const selected = list.querySelector('.bound-select__option--selected');
    const target = selected || list.querySelector('.bound-select__option');
    if (target && typeof target.focus === 'function') { this._focusWithoutScrolling(target); }
  },

  /** Return focus to the trigger so Tab nav resumes from the dropdown. */
  _focusTrigger() {
    if (!this.element) { return; }
    const trigger = this.element.querySelector('.bound-select__trigger');
    if (trigger && typeof trigger.focus === 'function') { this._focusWithoutScrolling(trigger); }
  },

  _focusWithoutScrolling(element) {
    try {
      element.focus({ preventScroll: true });
    } catch (e) {
      element.focus();
    }
  },

  _gridColumnCount() {
    var cols = parseInt(this.get('gridColumns'), 10);
    if(!cols || cols < 2) { return 3; }
    return cols;
  },

  /** Next option index for a grid listbox. Horizontal keys move one
   *  cell; vertical keys move by column count and wrap in-column. */
  _gridNextIndex(current, key, columns, length) {
    if(length <= 0) { return 0; }
    var i = current;
    if(i < 0 || i >= length) { i = 0; }
    var cols = columns > 0 ? columns : 3;
    if(key === 'ArrowRight') { return i < length - 1 ? i + 1 : 0; }
    if(key === 'ArrowLeft') { return i > 0 ? i - 1 : length - 1; }
    if(key === 'ArrowDown') {
      var down = i + cols;
      if(down < length) { return down; }
      return i % cols;
    }
    if(key === 'ArrowUp') {
      var up = i - cols;
      if(up >= 0) { return up; }
      var col = i % cols;
      return col + Math.floor((length - 1 - col) / cols) * cols;
    }
    return i;
  },

  actions: {
    stopPropagation(ev) {
      if (ev && ev.stopPropagation) { ev.stopPropagation(); }
    },
    toggle(ev) {
      if (ev && ev.stopPropagation) { ev.stopPropagation(); }
      // In a modal, one physical click reaches this toggle TWICE (raw_events
      // synthesizes a pass-through click for Ember-5 co-located modal components,
      // and the browser's own native click fires too), which would open the
      // dropdown then instantly re-close it. Collapse a duplicate toggle from the
      // same gesture. Scoped to the toggle only, so it never affects choose/close.
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      if (this._lastToggleAt != null && (now - this._lastToggleAt) < 250) { return; }
      this._lastToggleAt = now;
      this.toggleProperty('isOpen');
      if (this.get('isOpen')) {
        const self = this;
        scheduleOnce('afterRender', this, function() { self._focusInitialControl(); });
      }
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
        self.set('searchQuery', '');
        if (typeof callback === 'function') {
          callback(id);
        }
      });
      scheduleOnce('afterRender', this, function() {
        self.close();
        self._focusTrigger();
      });
    },
    /** Scroll the open listbox by roughly one screen. A switch or eye-gaze user has no
     *  wheel and cannot drag a scrollbar, so without these the list is unreachable past
     *  its first screen of options.
     *
     *  `scrollTop` is assigned DIRECTLY rather than through
     *  `scrollBy({behavior: 'smooth'})`: smooth scrolling settles asynchronously, so the
     *  value this handler leaves behind is not the value the next read sees. */
    scroll_list(direction) {
      if(!this.element) { return; }
      const list = this.element.querySelector('.bound-select__list');
      if(!list) { return; }
      /* A page-like jump that keeps a row of context. The floor matters when
         `clientHeight` is 0 — a list rendered but not laid out — where a purely
         proportional step would be a silent no-op. */
      const step = Math.max(48, Math.round(list.clientHeight * 0.8));
      list.scrollTop = list.scrollTop + ((direction === 'up' ? -1 : 1) * step);
    },
    /** Arrow/Enter/Escape navigation on a focused option. */
    option_keydown(item, ev) {
      if (!ev || !ev.key) { return; }
      const key = ev.key;
      const isGrid = !!this.get('grid');
      const navKeys = isGrid
        ? ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']
        : ['ArrowDown', 'ArrowUp', 'Home', 'End'];
      if (navKeys.indexOf(key) !== -1) {
        ev.preventDefault();
        const target = ev.target;
        const list = target ? target.closest('.bound-select__list') : null;
        if (!list) { return; }
        const items = Array.from(list.querySelectorAll('.bound-select__option:not(.bound-select__option--disabled)'));
        const i = items.indexOf(target);
        let next = i;
        if (isGrid && (key === 'ArrowDown' || key === 'ArrowUp' || key === 'ArrowLeft' || key === 'ArrowRight')) {
          next = this._gridNextIndex(i, key, this._gridColumnCount(), items.length);
        } else if (key === 'ArrowDown') { next = i < items.length - 1 ? i + 1 : 0; }
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
        this._focusTrigger();
      }
    },
    list_keydown(ev) {
      if (!ev || !ev.key) { return; }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        this.close();
        this._focusTrigger();
      }
    },
    /** Keyboard on the search input. Letter keys must NOT preventDefault
     *  (that is what made "Search languages..." untypeable: the <ul>
     *  keydown used to go through ctrlAction, which always preventDefaults).
     *  ArrowDown / Enter / Escape match modern-select. */
    search_keydown(ev) {
      if (ev && ev.stopPropagation) { ev.stopPropagation(); }
      if (!ev || !ev.key) { return; }
      const key = ev.key;
      if (key === 'ArrowDown') {
        ev.preventDefault();
        if (!this.element) { return; }
        const first = this.element.querySelector('.bound-select__option:not(.bound-select__option--disabled)');
        if (first && typeof first.focus === 'function') { this._focusWithoutScrolling(first); }
      } else if (key === 'Enter') {
        ev.preventDefault();
        if (!this.element) { return; }
        const first = this.element.querySelector('.bound-select__option:not(.bound-select__option--disabled)');
        if (first) { first.click(); }
      } else if (key === 'Escape') {
        ev.preventDefault();
        this.close();
        this._focusTrigger();
      }
    }
  },

  init() {
    this._super(...arguments);
    var self = this;
    // List/search keydown must NOT go through ctrlAction: that helper always
    // calls preventDefault(), which blocks typing in the search input.
    // Assigned in init (not didInsertElement) so {{on}} binds a real function.
    this.onListKeydown = function(ev) {
      self.send('list_keydown', ev);
    };
    this.onSearchKeydown = function(ev) {
      self.send('search_keydown', ev);
    };
    // Stable handlers (same pattern as modern-select). The old ctrlAction
    // helper called preventDefault then *dropped* the event before send(),
    // so toggle/choose never got stopPropagation — clicks bubbled into
    // modal-dialog / form parents and could immediately undo the open.
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          if (evt.stopPropagation) { evt.stopPropagation(); }
          // Keep the event on the args list so actions like toggle/choose
          // can also stopPropagation defensively.
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
    this.ctrlActionEventValue = function(actionName, targetProp) {
      return function(event) {
        var value = event && event.target ? event.target[targetProp] : undefined;
        self.send(actionName, value);
      };
    };
  },

});
