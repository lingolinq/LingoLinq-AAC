import Component from '@ember/component';
import { htmlSafe } from '@ember/template';
import { computed } from '@ember/object';

export default Component.extend({
  elem_class: computed('side_by_side', function() {
    if(this.get('side_by_side')) {
      return htmlSafe('col-sm-6');
    } else {
      return htmlSafe('col-sm-4');
    }
  }),
  // The old inline `height: 400px; overflow: auto; padding-top: 23px` belonged to
  // the bare-table layout: the padding nudged the table down to clear the
  // neighbouring chart's heading, and the fixed height gave it a scroll box.
  // `.report-chart-card` now owns both — the padding was offsetting this column
  // 23px below its neighbour, and the 400px fought the card's own height.
  elem_style: computed('right_side', function() {
    if(this.get('right_side')) {
      return htmlSafe('border-left: 1px solid #eee;');
    } else {
      return htmlSafe('');
    }
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
    word_cloud: function() {
      var fn = this.get('word_cloud');
      if (typeof fn === 'function') {
        fn();
      }
    },
    word_data: function(word) {
      var fn = this.get('word_data');
      if (typeof fn === 'function') {
        fn(word);
      }
    },
  }
});
