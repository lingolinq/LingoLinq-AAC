import Route from '@ember/routing/route';
import RSVP from 'rsvp';
import i18n from '../../utils/i18n';
import { inject as service } from '@ember/service';

export default Route.extend({
  persistence: service('persistence'),
  title: "Reset Password",
  model: function(params) {
    var _this = this;
    var user = this.modelFor('user');
    user.set('subroute_name', i18n.t('reset_password', 'reset password'));
    return new RSVP.Promise(function(resolve, reject) {
      _this.persistence.ajax('/api/v1/users/' + user.get('user_name') + '/password_reset', {
        type: 'POST',
        data: {code: params.code}
      }).then(function(data) {
        data.user_name = user.get('user_name');
        resolve(data);
      }, function() {
        resolve({confirmed: false});
      });
    });
  }
});
