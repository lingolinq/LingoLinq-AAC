import Route from '@ember/routing/route';
import Subscription from '../../utils/subscription';
import i18n from '../../utils/i18n';
import { inject as service } from '@ember/service';

export default Route.extend({
  persistence: service('persistence'),
  appState: service('app-state'),
  model: function() {
    var user = this.modelFor('user');
    user.set('subroute_name', i18n.t('subscription', 'subscription'));
    return user;
  },
  setupController: function(controller, model) {
    var _this = this;
    controller.set('model', model);
    controller.set('extras_status', null);
    controller.set('show_premium_symbols', false);
    if(!model.get('permissions.edit') && controller.get('confirmation')) {
      controller.set('subscription', {loading: true});
      this.persistence.ajax('/api/v1/users/' + model.get('user_name') + '?confirmation=' + controller.get('confirmation'), {type: 'GET'}).then(function(res) {
        if(res.user && res.user.subscription) {
          model.set('subscription', res.user.subscription);
          controller.set('subscription', Subscription.create({user: model, code: controller.get('code')}));
          controller.set('subscription.confirmation', controller.get('confirmation'));
        } else {
          controller.set('subscription', {error: true});
        }
      }, function(err) {
        controller.set('subscription', {error: true});
      });
    } else {
      controller.set('subscription', Subscription.create({user: model, code: controller.get('code')}));
    }
    Subscription.init();
    if(this.appState.get('currentUser.expired_or_grace_period')) {
      controller.send('show_options');
    }
  }
});
