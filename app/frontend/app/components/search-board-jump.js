import Component from '@ember/component';
import { computed } from '@ember/object';
import { schedule } from '@ember/runloop';
import i18n from '../utils/i18n';

/* Find-Boards page combobox. Replaces the page's "Filter Boards" input
   (search.hbs header). The trigger sits where that field was; opening it
   reveals a panel whose top input IS the page's live search field —
   typing flows up to the controller's `searchString` (via @onQueryChange),
   which re-runs the server search and repopulates the sections. The panel
   reuses the speak-mode "My Board Collection" markup/classes
   (`.md-board-collection__*`); outside a `.md-board-detail--dark` ancestor
   those classes render in their light base theme, matching this page.

   Args:
     @query           (string)              current search text (searchString)
     @onQueryChange   (fn(value))           set the query upstream
     @sections        ([{id,label_key,default_label,state,boards}])
     @onSelect        (fn(board))           navigate to the chosen board */
export default Component.extend({
  classNames: ['ub-search-jump'],

  /* Panel visibility. Toggled by the trigger; closed on outside-click,
     Escape, or selecting a board. */
  open: false,

  /* Trigger face: show the active query if there is one, otherwise the
     placeholder. Keeps the collapsed control informative. */
  trigger_label: computed('query', function() {
    var q = (this.get('query') || '').trim();
    return q || i18n.t('search_board_jump_placeholder', "Find a board…");
  }),
  has_query: computed('query', function() {
    return (this.get('query') || '').trim().length > 0;
  }),

  _onDocClick: null,

  didInsertElement: function() {
    this._super.apply(this, arguments);
    var _this = this;
    /* Capture-phase so the close fires before any inner re-render races.
       Clicks inside our own element (trigger, input, items) are ignored —
       those have their own handlers. */
    this._onDocClick = function(e) {
      if (!_this.element || _this.isDestroying || _this.isDestroyed) { return; }
      if (!_this.element.contains(e.target) && _this.get('open')) {
        _this.set('open', false);
      }
    };
    document.addEventListener('click', this._onDocClick, true);
  },

  willDestroyElement: function() {
    this._super.apply(this, arguments);
    if (this._onDocClick) {
      document.removeEventListener('click', this._onDocClick, true);
      this._onDocClick = null;
    }
  },

  _focusSearchInput: function() {
    var _this = this;
    schedule('afterRender', function() {
      if (!_this.element || _this.isDestroying || _this.isDestroyed) { return; }
      var input = _this.element.querySelector('.md-board-collection__search-input');
      if (input) { input.focus(); }
    });
  },
  init() {
    this._super(...arguments);
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


  actions: {
    toggle: function() {
      this.toggleProperty('open');
      if (this.get('open')) { this._focusSearchInput(); }
    },
    update_query: function(event) {
      var value = (event && event.target && event.target.value) || '';
      var fn = this.get('onQueryChange');
      if (typeof fn === 'function') { fn(value); }
    },
    clear_query: function() {
      var fn = this.get('onQueryChange');
      if (typeof fn === 'function') { fn(''); }
      this._focusSearchInput();
    },
    key_down: function(event) {
      if (event && event.key === 'Escape') {
        this.set('open', false);
      }
    },
    select: function(board) {
      var fn = this.get('onSelect');
      if (typeof fn === 'function' && board) { fn(board); }
      this.set('open', false);
    }
  }
});
