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
  loading_pending: false,

  pending_requests: computed('user.pending_supervisor_requests.[]', function() {
    return this.get('user.pending_supervisor_requests') || [];
  }),

  has_pending: computed('pending_requests.length', function() {
    return (this.get('pending_requests.length') || 0) > 0;
  }),

  didInsertElement() {
    this._super(...arguments);
    this.load_pending();
  },

  load_pending: function() {
    var _this = this;
    if (!_this.get('user')) { return; }
    _this.set('loading_pending', true);
    persistence.ajax('/api/v1/supervisor_relationships?role=communicator&status=pending', {
      type: 'GET'
    }).then(function(res) {
      var rels = (res && res.supervisor_relationship) || [];
      var mapped = rels.map(function(rel) {
        var supervisor = rel.supervisor || {};
        return {
          id: rel.id,
          requester_name: supervisor.user_name || supervisor.name || '',
          requester_avatar_url: supervisor.avatar_url,
          permission_level: rel.permission_level
        };
      });
      _this.set('user.pending_supervisor_requests', mapped);
      _this.set('loading_pending', false);
    }, function() {
      _this.set('loading_pending', false);
    });
  },

  _respond: function(request_id, decision) {
    var _this = this;
    _this.set('responding_id', request_id);

    // Member PUT approve/deny — decision comes from the route, not a body `action`
    // (Rails reserves params.action for the controller action name).
    persistence.ajax('/api/v1/supervisor_relationships/' + request_id + '/' + decision, {
      type: 'PUT',
      data: {}
    }).then(function() {
      _this.set('responding_id', null);
      var requests = (_this.get('pending_requests') || []).filter(function(r) {
        return r.id !== request_id;
      });
      _this.set('user.pending_supervisor_requests', requests);
      if (_this.get('user') && _this.get('user').reload) {
        _this.get('user').reload();
      }
      if (decision === 'approve') {
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
