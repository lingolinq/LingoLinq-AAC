import Component from '@ember/component';
import LingoLinq from '../app';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Component.extend({
  tagName: 'div',
  classNames: ['icon-select'],
  content: null,
  action: function() { return this; },
  iconUrls: LingoLinq.iconUrls,
  set_extra_urls: observer('selection', function() {
    if(this.get('selection')) {
      var _this = this;
      var i = new Image();
      i.onload = function() {
        var url = _this.get('selection');
        var urls = [].concat(_this.get('extra_urls') || []);
        urls.push(url);
        urls = [...new Set(urls)];
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
    /* Shaped like bound-select#choose and modern-select#choose, and for the same two reasons:
       WRITE THROUGH FIRST, then call the parent's action GUARDED.

       It used to set `_selection` and `selection_picked` — neither of which is read anywhere,
       including by this component's own template — and then call `action` unguarded. So the
       callback was the only thing that could make a click do anything, and when a bare
       `{{mut}}` stopped being callable under Ember 5 every thumbnail click threw
       "callback is not a function" and the picked url never reached the field.

       Setting `selection` is what the template already renders (`<input value={{this.selection}}>`)
       and what `set_extra_urls` observes to build the preview, and it propagates to the parent
       on its own — which is why bound-select and modern-select kept working with the same bare
       `{{mut}}` argument that broke this one. The guard then makes a non-callable action a
       no-op rather than an exception. Covered by tests/integration/mut-action-arg-test.js. */
    pick: function(url) {
      this.set('selection', url);
      var callback = this.get('action');
      if (typeof callback === 'function') {
        callback(url);
      }
    }
  }
});
