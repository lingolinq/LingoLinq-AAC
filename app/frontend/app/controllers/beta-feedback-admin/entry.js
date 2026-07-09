import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import modal from '../../utils/modal';
import i18n from '../../utils/i18n';

export default Controller.extend({
  persistence: service('persistence'),
  detail: null,
  loadError: false,
  savingPriority: false,
  previousFeedbackId: null,
  nextFeedbackId: null,
  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
  },


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
