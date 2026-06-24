import modal from '../utils/modal';
import LingoLinq from '../app';
import progress_tracker from '../utils/progress_tracker';
import persistence from '../utils/persistence';

export default modal.ModalController.extend({
  opening: function() {
    this.test();
  },
  test: function() {
    var webhook = this.get('model.webhook');
    webhook.set('testing', {waiting: true});
    persistence.ajax('/api/v1/webhooks/' + webhook.get('id') + '/test', {
      type: 'POST'
    }).then(function(data) {
      if(data.progress) {
        progress_tracker.track(data.progress, function(event) {
          if(event.status == 'errored') {
            webhook.set('testing', {error: true});
          } else if(event.status == 'finished') {
            webhook.set('testing', {done: true, result: event.result});
          }
        });
      } else {
        webhook.set('testing', {error: true});
      }
    }, function(err) {
      webhook.set('testing', {error: true});
    });
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
    test: function() {
      this.test();
    }
  }
});
