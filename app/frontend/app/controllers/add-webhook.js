import modal from '../utils/modal';
import LingoLinq from '../app';

export default modal.ModalController.extend({
  opening: function() {
    var webhook = LingoLinq.store.createRecord('webhook', {
      user_id: this.get('model.user.id'),
      webhook_type: 'user'
    });
    this.set('status', null);
    this.set('webhook', webhook);
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
      var webhook = this.get('webhook');
      var hooks = [];
      if(webhook.get('new_session_event')) { hooks.push('new_session'); }
      if(webhook.get('new_utterance_event')) { hooks.push('new_utterance'); }
      webhook.set('webhooks', hooks);
      webhook.save().then(function(res) {
        modal.close({created: true});
      }, function(err) {
        _this.set('status', {error: true});
      });
    }
  }
});
