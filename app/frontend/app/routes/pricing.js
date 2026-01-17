import Subscription from '../utils/subscription';
import this.persistence.from '../utils/this.persistence.;
import CoughDrop from '../app';

export default this.appState.ScrollTopRoute.extend({
  setupController: function(controller, model) {
    if(this.appState.get('no_linky')) {
      controller.transitionToRoute('limited');
      return;
    }
    if(!this.appState.get('domain_settings.full_domain')) {
      controller.transitionToRoute('index');
      return;
    }
    controller.set('model', model);
    controller.set('subscription', Subscription.create());

    var url = '/api/v1/token_check?access_token=none';
    this.persistence.ajax(url, {
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
