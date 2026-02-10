import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { htmlSafe } from '@ember/template';
import LingoLinq from '../app';
import modal from '../utils/modal';

/**
 * User Status Modal Component
 *
 * Converted from modals/user-status template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  persistence: service('persistence'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/user-status';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  state_class: computed('model.user.org_status', function() {
    const state = this.get('model.user.org_status.state');
    return htmlSafe('glyphicon glyphicon-' + (state || ''));
  }),

  state: computed('model.user.org_status', function() {
    if (!this.get('model.user')) { return null; }
    const user = this.get('model.user');
    let state = LingoLinq.user_statuses.find(function(s) { return s.id === user.org_status.state; });
    if (this.get('model.organization.status_overrides')) {
      state = this.get('model.organization.status_overrides').find(function(s) { return s.id === user.org_status.state; });
    }
    return (state && state.label) || this.get('model.user.org_status.state');
  }),

  statuses: computed('model.organization.status_overrides', function() {
    const res = [];
    (this.get('model.organization.status_overrides') || LingoLinq.user_statuses || []).forEach(function(s) {
      if (s.on && s.label) {
        res.push({
          id: s.id,
          label: s.label,
          glyph: htmlSafe('glyphicon glyphicon-' + s.id)
        });
      }
    });
    return res;
  }),

  current_status: computed('status', 'statuses', function() {
    const list = this.get('statuses') || [];
    const status = this.get('status') || {};
    let res = list.find(function(s) { return s.id === status.state; });
    res = res || list[0];
    return res;
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.set('editing', false);
      this.set('save_status', null);
      const orgStatus = this.get('model.user.org_status') || {};
      this.set('status', Object.assign({}, orgStatus));
      this.set('status_note', orgStatus.note || '');
    },
    closing() {},
    choose(id) {
      let status = this.get('status') || {};
      status = Object.assign({}, status, { state: id });
      this.set('status', status);
    },
    edit() {
      this.set('editing', !this.get('editing'));
    },
    update() {
      const _this = this;
      _this.set('save_status', { loading: true });
      let status = Object.assign({}, _this.get('status') || {});
      status.note = _this.get('status_note');
      _this.get('persistence').ajax('/api/v1/organizations/' + _this.get('model.organization.id') + '/status/' + _this.get('model.user.id'), {
        type: 'POST',
        data: { status: status }
      }).then(function() {
        _this.set('save_status', null);
        _this.set('model.user.org_status', Object.assign({}, status));
        modal.close({ status: status });
      }, function() {
        _this.set('save_status', { error: true });
      });
    }
  }
});
