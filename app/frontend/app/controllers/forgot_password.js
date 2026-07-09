import Controller from '@ember/controller';
import persistence from '../utils/persistence';
import i18n from '../utils/i18n';

export default Controller.extend({
  title: "Forgot Password",
  actions: {
    submitKey: function() {
      var name = this.get('name');
      var _this = this;
      persistence.ajax('/api/v1/forgot_password', {
        type: 'POST',
        data: {key: name}
      }).then(function(data) {
        _this.set('response', data);
      }, function(xhr, message) {
        if(message && message.error == 'not online') {
          _this.set('response', {message: i18n.t('email_not_sent_check_internet', "Email not sent, please check your internet connection.")});
        } else if(xhr && xhr.result == "Too Many Requests") {
          _this.set('response', {message: i18n.t('request_throttled', "Too many requests, please wait a few minutes and try again.")});
        } else if(xhr && xhr.result) {
          _this.set('response', xhr.result);
        } else {
          _this.set('response', {message: i18n.t('email_not_sent', "Email not sent, there was an unexpected error.")});
        }
      });
    }
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
this.ctrlActionEventValue = function(actionName, targetProp) {
  return function(event) {
    var value = event && event.target ? event.target[targetProp] : undefined;
    self.send(actionName, value);
  };
};
  },

});
