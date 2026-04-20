import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  persistence: service('persistence'),

  model(params) {
    var id = params.feedback_id;
    return this.get('persistence').ajax('/api/v1/beta_feedback/' + encodeURIComponent(id), {
      type: 'GET',
      dataType: 'json'
    }).catch(function(xhr) {
      return { _error: xhr, beta_feedback: null };
    });
  },

  setupController(controller, model) {
    this._super(controller, model);
    if (model && model._error) {
      controller.set('loadError', true);
      controller.set('detail', null);
    } else {
      controller.set('loadError', false);
      controller.set('detail', model.beta_feedback || null);
    }
  }
});
