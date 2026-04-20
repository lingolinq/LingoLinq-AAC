import Component from '@ember/component';
import { computed } from '@ember/object';

export default Component.extend({
  tagName: 'span',
  classNames: ['md-stats-period-select'],
  content: null,
  selection: null,
  triggerId: 'report-period-filter',
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

  actions: {
    toggle: function() {
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
