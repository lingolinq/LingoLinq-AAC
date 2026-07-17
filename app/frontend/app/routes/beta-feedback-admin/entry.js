import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import RSVP from 'rsvp';

export default Route.extend({
  persistence: service('persistence'),

  model(params) {
    var id = params.feedback_id;
    var detail = this.get('persistence').ajax('/api/v1/beta_feedback/' + encodeURIComponent(id), {
      type: 'GET',
      dataType: 'json'
    }).catch(function(xhr) {
      return { _error: xhr, beta_feedback: null };
    });
    var nav = this.get('persistence').ajax('/api/v1/beta_feedback?sort_by=created_at&sort_order=desc&per_page=50', {
      type: 'GET',
      dataType: 'json'
    }).catch(function() {
      return { beta_feedback: [] };
    });
    return RSVP.hash({
      id: id,
      detail: detail,
      nav: nav
    });
  },

  setupController(controller, model) {
    this._super(controller, model);
    var detail = model && model.detail;
    if (detail && detail._error) {
      controller.set('loadError', true);
      controller.set('detail', null);
    } else {
      controller.set('loadError', false);
      controller.set('detail', detail && detail.beta_feedback || null);
    }
    var rows = model && model.nav && model.nav.beta_feedback || [];
    var idx = rows.findIndex(function(row) {
      return row && row.id === model.id;
    });
    controller.set('previousFeedbackId', idx > 0 ? rows[idx - 1].id : null);
    controller.set('nextFeedbackId', idx >= 0 && idx < rows.length - 1 ? rows[idx + 1].id : null);
  }
});
