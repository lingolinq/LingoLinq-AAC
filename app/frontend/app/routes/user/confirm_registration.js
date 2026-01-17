import Route from '@ember/routing/route';
import RSVP from 'rsvp';
import persistence from '../../utils/persistence';
import i18n from '../../utils/i18n';


export default Route.extend({
  title: "Confirm Registration",
  model: function(params) {
    var user = this.modelFor('user');
    user.set('subroute_name', i18n.t('confirm_registration', 'confirm registration'));
    return new RSVP.Promise(function(resolve, reject) {
      persistence.ajax('/api/v1/users/' + user.get('user_name') + '/confirm_registration', {
        type: 'POST',
        data: {code: params.code}
      }).then(function(data) {
        resolve(data);
      }, function() {
        resolve({confirmed: false});
      });
    });
  }
});
