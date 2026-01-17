import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import persistence from '../utils/persistence';
import i18n from '../utils/i18n';

export default Controller.extend({
  persistence: service(),

  title: "Forgot Password",
  actions: {
    submitKey: function() {
      var name = this.get('name');
      var _this = this;
      this.persistence.ajax('/api/v1/forgot_password', {
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
  }
});
