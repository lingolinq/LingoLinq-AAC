import modal from '../utils/modal';
import LingoLinq from '../app';

export default modal.ModalController.extend({
  opening: function() {
    var integration = LingoLinq.store.createRecord('integration', {
      custom_integration: true,
      user_id: this.get('model.user.id')
    });
    this.set('status', null);
    this.set('integration', integration);
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
    save: function() {
      var _this = this;
      _this.set('status', {saving: true});
      var integration = this.get('integration');
      if(!integration.get('with_button_url')) {
        integration.set('button_webhook_url', null);
        integration.set('button_webhook_local', null);
      }
      if(!integration.get('with_board_url')) {
        integration.set('board_render_url', null);
      }
      var hooks = [];
      integration.save().then(function(res) {
        modal.close({created: true});
        modal.open('integration-details', {integration: integration});
      }, function(err) {
        _this.set('status', {error: true});
      });
    }
  }
});
