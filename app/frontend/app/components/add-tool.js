import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed, observer } from '@ember/object';
import EmberObject from '@ember/object';
import $ from 'jquery';
import modal from '../utils/modal';
import Utils from '../utils/misc';

/**
 * Add Tool / Browse Tools modal component.
 * Converted from add-tool controller/template to avoid route.render() deprecation.
 */
export default Component.extend({
  modal: service('modal'),
  store: service('store'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'add-tool';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  not_ready: computed('selected_tool', 'user_parameters', function() {
    return false;
  }),

  set_user_parameters: observer('selected_tool.user_parameters', function() {
    const selected = this.get('selected_tool');
    if (!selected) { return; }
    const res = [];
    (selected.get('user_parameters') || []).forEach(function(param) {
      res.push(EmberObject.create({
        name: param.name,
        label: param.label,
        type: param.type || 'text',
        value: param.default_value,
        hint: param.hint
      }));
    });
    this.set('user_parameters', res);
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      const _this = this;
      _this.set('tools', { loading: true });
      _this.set('selected_tool', null);
      _this.set('user_parameters', []);
      Utils.all_pages('integration', { template: true }, function() {}).then(function(res) {
        const list = res.filter(function(t) { return t.get('icon_url'); });
        _this.set('tools', list);
        if (_this.get('model.tool')) {
          const tool = res.find(function(t) { return t.get('integration_key') === _this.get('model.tool'); });
          if (tool) {
            tool.reload();
            tool.set('installing', null);
            tool.set('error', null);
            _this.set('selected_tool', tool);
            _this.set('hide_list', true);
          }
        }
      }, function() {
        _this.set('tools', { error: true });
      });
    },
    closing() {},
    nothing() {},
    install() {
      const _this = this;
      _this.set('selected_tool.installing', true);
      _this.set('selected_tool.error', null);
      const integration = _this.get('store').createRecord('integration');
      integration.set('user_id', _this.get('model.user.id'));
      integration.set('integration_key', _this.get('selected_tool.integration_key'));
      const params = [];
      _this.get('user_parameters').forEach(function(param) {
        params.push($.extend({}, param));
      });
      integration.set('user_parameters', params);
      integration.save().then(function() {
        modal.close({ added: true });
      }, function(err) {
        _this.set('selected_tool.installing', null);
        _this.set('selected_tool.error', true);
        if (err && err.errors) {
          if (err.errors[0] === 'invalid user credentials') {
            _this.set('selected_tool.error', { bad_credentials: true });
          } else if (err.errors[0] === 'account credentials already in use') {
            _this.set('selected_tool.error', { credential_collision: true });
          } else if (err.errors[0] === 'invalid IFTTT Webhook URL') {
            _this.set('selected_tool.error', { bad_webhook: true });
          }
        }
      });
    },
    select_tool(tool) {
      tool.set('installing', null);
      tool.set('error', null);
      this.set('selected_tool', tool);
      if (!tool.get('permissions')) {
        tool.reload();
      }
    },
    browse() {
      this.set('selected_tool', null);
    }
  }
});
