import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import modal from '../../utils/modal';
import i18n from '../../utils/i18n';

export default Controller.extend({
  persistence: service('persistence'),
  detail: null,
  loadError: false,
  savingPriority: false,

  actions: {
    setPriority(priority) {
      var detail = this.get('detail');
      if (!detail || !detail.id) {
        return;
      }
      var _this = this;
      this.set('savingPriority', true);
      this.get('persistence').ajax('/api/v1/beta_feedback/' + encodeURIComponent(detail.id), {
        type: 'PATCH',
        contentType: 'application/json; charset=UTF-8',
        data: JSON.stringify({ beta_feedback: { priority: priority || '' } }),
        dataType: 'json'
      }).then(function(json) {
        _this.set('savingPriority', false);
        _this.set('detail', json.beta_feedback);
      }).catch(function() {
        _this.set('savingPriority', false);
        modal.error(i18n.t('beta_feedback_priority_save_failed', "Could not update feedback priority."));
      });
    }
  }
});
