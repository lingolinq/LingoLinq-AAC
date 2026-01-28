import Subscription from '../utils/subscription';
import LingoLinq from '../app';
import { ScrollTopRoute } from '../services/app-state';
import { inject as service } from '@ember/service';

export default ScrollTopRoute.extend({
  appState: service('app-state'),
  persistence: service('persistence'),
  setupController: function(controller, model) {
    if(this.appState.get('no_linky')) {
      controller.transitionToRoute('limited');
      return;
    }
    if(!this.appState.get('domain_settings.full_domain')) {
      this.appState.return_to_index();
      return;
    }
    controller.set('model', model);
    controller.set('subscription', Subscription.create());

    var url = '/api/v1/token_check?access_token=none';
    this.persistence.ajax(url, {
      type: 'GET'
    }).then(function(data) {
      if(data.sale !== undefined) {
        LingoLinq.sale = parseInt(data.sale, 10) || false;
        controller.get('subscription').reset();
      }
    }, function(data) {
      if(data.sale !== undefined) {
        LingoLinq.sale = parseInt(data.sale, 10) || false;
        controller.get('subscription').reset();
      }
    });

    Subscription.init();
  }
});
