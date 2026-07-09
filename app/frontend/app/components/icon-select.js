import Component from '@ember/component';
import LingoLinq from '../app';
import { reads } from '@ember/object/computed';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Component.extend({
  tagName: 'div',
  classNames: ['icon-select'],
  content: null,
  action: function() { return this; },
  _selection: reads('selection'),
  init: function() {
    this._super(...arguments);
  },
  iconUrls: LingoLinq.iconUrls,
  set_extra_urls: observer('selection', function() {
    if(this.get('selection')) {
      var _this = this;
      var i = new Image();
      i.onload = function() {
        var url = _this.get('selection');
        var urls = [].concat(_this.get('extra_urls') || []);
        urls.push(url);
        urls = urls.uniq();
        _this.set('extra_urls', urls);
        _this.set('selection_preview', url);
      };
      i.onerror = function() {
        _this.set('selection_preview', null);
      };
      i.src = this.get('selection');
    }
  }),
  included_icon_urls: computed('extra_urls', 'iconUrls', function() {
    var urls = this.get('extra_urls') || [];
    var icons = this.iconUrls;
    var res = [];
    urls.forEach(function(url) {
      if(url && !icons.find(function(i) { return i.url == url; })) {
        res.push(url);
      }
    });
    return res;
  }),
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
    pick: function(url) {
      this.set('selection_picked', true);
      this.set('_selection', url);
      var callback = this.get('action');
      callback(url);
    }
  }
});
