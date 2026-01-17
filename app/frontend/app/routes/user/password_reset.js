import Route from '@ember/routing/route';
import RSVP from 'rsvp';
import persistence from '../../utils/persistence';
import i18n from '../../utils/i18n';

export default Route.extend({
  title: "Reset Password",
  model: function(params) {
    var user = this.modelFor('user');
    user.set('subroute_name', i18n.t('reset_password', 'reset password'));
    return new RSVP.Promise(function(resolve, reject) {
      persistence.ajax('/api/v1/users/' + user.get('user_name') + '/password_reset', {
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
