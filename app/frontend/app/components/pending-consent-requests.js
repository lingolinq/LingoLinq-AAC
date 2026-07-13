import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import persistence from '../utils/persistence';
import i18n from '../utils/i18n';
import modal from '../utils/modal';

export default Component.extend({
  appState: service('app-state'),
  tagName: '',
  responding_id: null,

  pending_requests: computed('user.pending_supervisor_requests', function() {
    return this.get('user.pending_supervisor_requests') || [];
  }),

  has_pending: computed('pending_requests.length', function() {
    return (this.get('pending_requests.length') || 0) > 0;
  }),

  _respond: function(request_id, action) {
    var _this = this;
    _this.set('responding_id', request_id);

    persistence.ajax('/api/v1/supervisor_relationships/' + request_id + '/consent_response', {
      type: 'POST',
      data: {
        action: action
      }
    }).then(function() {
      _this.set('responding_id', null);
      // Remove from local list
      var requests = (_this.get('pending_requests') || []).filter(function(r) {
        return r.id !== request_id;
      });
      _this.set('user.pending_supervisor_requests', requests);
      // Reload user
      if (_this.get('user') && _this.get('user').reload) {
        _this.get('user').reload();
      }
      if (action === 'approve') {
        modal.success(i18n.t('supervision_approved', "Supervision access has been approved."));
      } else {
        modal.success(i18n.t('supervision_denied', "Supervision request has been denied."));
      }
    }, function() {
      _this.set('responding_id', null);
      modal.error(i18n.t('consent_response_error', "There was an error processing your response. Please try again."));
    });
  },
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
    approve: function(request_id) {
      this._respond(request_id, 'approve');
    },
    deny: function(request_id) {
      this._respond(request_id, 'deny');
    }
  }
});
