import LingoLinq from '../../app';
import modal from '../../utils/modal';
import BoardHierarchy from '../../utils/board_hierarchy';
import i18n from '../../utils/i18n';
import stashes from '../../utils/_stashes';
import app_state from '../../utils/app_state';
import persistence from '../../utils/persistence';
import progress_tracker from '../../utils/progress_tracker';
import { computed } from '@ember/object';
import { htmlSafe } from '@ember/template';

export default modal.ModalController.extend({
  opening: function() {
    this.set('editing', false);
    this.set('save_status', null);
    this.set('status', Object.assign({}, this.get('model.user.org_status') || {}));
  },
  state_class: computed('model.user.org_status', function() {
    return htmlSafe("glyphicon glyphicon-" + this.get('model.user.org_status.state'));
  }),
  state: computed('model.user.org_status', function() {
    if(!this.get('model.user')) { return null; }
    var user = this.get('model.user');
    var state = LingoLinq.user_statuses.find(function(s) { return s.id == user.org_status.state; });
    if(this.get('model.organization.status_overrides')) {
      state = this.get('model.organization.status_overrides').find(function(s) { return s.id == user.org_status.state; });
    }
    return (state && state.label) || this.get('model.user.org_status.state');
  }),
  statuses: computed('model.organization.status_overrides', function() {
    var res = [];
    (this.get('model.organization.status_overrides') || LingoLinq.user_statuses).forEach(function(s) {
      if(s.on && s.label) {
        res.push({
          id: s.id,
          label: s.label,
          glyph: htmlSafe('glyphicon glyphicon-' + s.id)
        })
      }
    });
    return res;
  }),
  current_status: computed('status', 'statuses', function() {
    var list = this.get('statuses');
    var status = this.get('status');
    var res = list.find(function(s) { return s.id == status.state; });
    res = res || list[0];
    return res;
  }),
  actions: {
    choose: function(id) {
      var status = this.get('status') || {};
      status.state = id;
      status = Object.assign({}, status);
      this.set('status', status);
    },
    edit: function() {
      this.set('editing', !this.get('editing'));
    },
    update: function() {
      var _this = this;
      _this.set('save_status', {loading: true});
      var status = _this.get('status') || {};
      status.note = _this.get('status_note');
      persistence.ajax('/api/v1/organizations/' + _this.get('model.organization.id') + '/status/' + _this.get('model.user.id'), {
        type: 'POST',
        data: {
          status: _this.get('status')
        }
      }).then(function(res) {
        _this.set('save_status', null);
        _this.set('model.user.org_status', Object.assign({}, status));
        modal.close({status: status});
      }, function(err) {
        _this.set('save_status', {error: true});
      })
    }
  }
});
