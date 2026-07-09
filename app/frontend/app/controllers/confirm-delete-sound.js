import modal from '../utils/modal';

export default modal.ModalController.extend({
  opening: function() {
    var _this = this;
    _this.set('status', null);
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
    delete_sound: function() {
      var sound = this.get('model.sound');
      var _this = this;
      _this.set('status', {deleting: true});
      sound.deleteRecord();
      sound.save().then(function() {
        _this.set('status', null);
        modal.close({deleted: true});
      }, function(err) {
        _this.set('status', {error: true});
      });
    }
  }
});
