import Subscription from '../utils/subscription';
import app_state from '../utils/app_state';
import persistence from '../utils/persistence';
import CoughDrop from '../app';

export default app_state.ScrollTopRoute.extend({
  setupController: function(controller, model) {
    if(app_state.get('no_linky')) {
      controller.transitionToRoute('limited');
      return;
    }
    if(!app_state.get('domain_settings.full_domain')) {
      controller.transitionToRoute('index');
      return;
    }
    controller.set('model', model);
    controller.set('subscription', Subscription.create());

    var url = '/api/v1/token_check?access_token=none';
    persistence.ajax(url, {
      type: 'GET'
    }).then(function(data) {
      if(data.sale !== undefined) {
        CoughDrop.sale = parseInt(data.sale, 10) || false;
        controller.get('subscription').reset();
      }
    }, function(data) {
      if(data.sale !== undefined) {
        CoughDrop.sale = parseInt(data.sale, 10) || false;
        controller.get('subscription').reset();
      }
    });

    Subscription.init();
  }
});
