import Component from '@ember/component';
import { computed } from '@ember/object';

export default Component.extend({
  tagName: 'span',
  classNames: ['md-stats-period-select'],
  content: null,
  selection: null,
  triggerId: 'report-period-filter',
  /** Optional id of a visible label element that names this trigger; falls back to aria-label when absent (e.g. compare view). */
  labelId: null,
  action: function() {},
  /** When true (e.g. compare view), do not show the currently selected option in the dropdown list */
  excludeSelectedFromList: false,

  isOpen: false,

  contentForList: computed('content', 'selection', 'excludeSelectedFromList', function() {
    var content = this.get('content') || [];
    if (!this.get('excludeSelectedFromList')) { return content; }
    var sel = this.get('selection');
    return content.filter(function(c) { return c.id !== sel; });
  }),

  selectedItem: computed('content', 'selection', function() {
    var content = this.get('content') || [];
    var sel = this.get('selection');
    return content.find(function(c) { return c.id === sel; }) || content[0] || { name: '', id: '' };
  }),

  _clickOutside: null,

  didInsertElement: function() {
    var _this = this;
    this._clickOutside = function(e) {
      if (_this.get('isOpen') && _this.element && !_this.element.contains(e.target)) {
        _this.set('isOpen', false);
      }
    };
    document.addEventListener('click', this._clickOutside);
  },

  willDestroyElement: function() {
    document.removeEventListener('click', this._clickOutside);
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
      // Collapse a duplicate toggle from one modal click (same fix as bound-select.js).
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      if (this._lastToggleAt != null && (now - this._lastToggleAt) < 250) { return; }
      this._lastToggleAt = now;
      this.toggleProperty('isOpen');
    },
    choose: function(item) {
      if (item.disabled) { return; }
      var fn = this.get('action');
      if (typeof fn === 'function') { fn(item.id); }
      this.set('isOpen', false);
    }
  }
});
