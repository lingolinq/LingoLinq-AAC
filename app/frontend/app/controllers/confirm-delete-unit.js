import modal from '../utils/modal';
import persistence from '../utils/persistence';

export default modal.ModalController.extend({
  opening: function() {
    this.set('status', null);
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
    confirm: function() {
      var _this = this;
      var unit = this.get('model.unit');
      _this.set('status', {removing: true})
      if(this.get('model.lesson')) {
        persistence.ajax('/api/v1/lessons/' + _this.get('model.lesson.id') + '/unassign', {type: 'POST', data: {organization_unit_id: _this.get('model.unit.id')}}).then(function() {
          _this.set('model.lesson', null);
          modal.close({deleted: true});
        }, function(err) {
          _this.set('status', {error: true});
        });
      } else {
        unit.deleteRecord();
        unit.save().then(function(res) {
          modal.close({deleted: true});
        }, function() {
          _this.set('status', {error: true});
        });  
      }
    }
  }
});
