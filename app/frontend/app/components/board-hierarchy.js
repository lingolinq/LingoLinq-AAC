import Component from '@ember/component';

export default Component.extend({
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
    toggle_board_hierarchy: function(board_id, state) {
      this.get('hierarchy').toggle(board_id, state);
    },
    select_all: function(state) {
      // Honor the passed state so the same action drives both Select All
      // (no arg / true) and Deselect All (false). Existing callers pass no
      // argument, so they keep selecting everything.
      this.get('hierarchy').set_downstream(null, 'selected', state !== false);
    },
  }
});
