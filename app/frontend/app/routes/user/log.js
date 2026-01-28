import Route from '@ember/routing/route';
import i18n from '../../utils/i18n';
import { inject as service } from '@ember/service';

export default Route.extend({
  store: service('store'),
  appState: service('app-state'),
  model: function(params) {
    var user = this.modelFor('user');
    if(user) {
      user.set('subroute_name', i18n.t('messages', 'messages'));
    }
    if(params.log_id == 'last-eval') {
      var log = this.store.createRecord('log', {});
      log.set('type', 'eval');
      log.set('author', {
        id: this.appState.get('sessionUser.id'),
        user_name: this.appState.get('sessionUser.user_name')
      });
      log.set('eval_in_memory', true);
      return log;
    } else if(params.log_id && params.log_id.match(/^profile-/)) {
      var log = this.store.createRecord('log', {});
      log.set('type', 'profile');
      log.set('user_id', user.get('id'));
      log.set('author', {
        id: this.appState.get('sessionUser.id'),
        user_name: this.appState.get('sessionUser.user_name')
      });
      log.set('guid', params.log_id.replace(/^profile-/, ''));
      log.set('eval_in_memory', true);
      return log;
    } else {
      return this.store.findRecord('log', params.log_id);
    }
  },
  setupController: function(controller, model) {
    model.set('nonce_attempt', false);
    if(!model.get('events') && !model.get('eval_in_memory')) {
      model.reload();
    }
    controller.set('user', this.modelFor('user'));
    controller.set('model', model);
  }
});
