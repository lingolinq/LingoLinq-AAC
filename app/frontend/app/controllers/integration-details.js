import modal from '../utils/modal';
import LingoLinq from '../app';

export default modal.ModalController.extend({
  opening: function() {
    this.get('model.integration').reload();
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
    delete_integration: function() {
      var _this = this;
      modal.open('confirm-delete-integration', {integration: this.get('model.integration')}).then(function(res) {
        if(res.deleted) {
          _this.get('model.user').check_integrations(true);
        }
      });
    }
  }
});
