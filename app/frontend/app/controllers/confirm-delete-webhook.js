import modal from '../utils/modal';

export default modal.ModalController.extend({
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
    delete_webhook: function() {
      var _this = this;
      var webhook = this.get('model.webhook');
      webhook.deleteRecord();
      _this.set('model.deleting', true);
      webhook.save().then(function(res) {
        modal.close({deleted: true});
      }, function() {
        _this.set('model.deleting', false);
        _this.set('model.error', true);
      });
    }
  }
});
