import modal from '../utils/modal';

export default modal.ModalController.extend({
  opening: function() {
    this.set('model.error', null);
    this.set('model.updating', null);
    this.set('model.retiring', null);
    this.set('model.deleting', null);
    this.set('retirable', this.get('model.goal.active'));
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
    delete_goal: function() {
      var _this = this;
      _this.set('model.updating', true);
      _this.set('model.deleting', true);
      var goal = _this.get('model.goal');
      goal.deleteRecord();
      goal.save().then(function() {
        modal.close({updated: true});
      }, function() {
        _this.set('model.updating', false);
        _this.set('model.deleting', false);
        _this.set('model.error', true);
      });
    },
    retire_goal: function() {
      var _this = this;
      _this.set('model.updating', true);
      _this.set('model.retiring', true);
      var goal = _this.get('model.goal');
      goal.set('active', false);
      goal.save().then(function() {
        modal.close({updated: true});
      }, function() {
        _this.set('model.updating', false);
        _this.set('model.retiring', false);
        _this.set('model.error', true);
      });
    }
  }
});
