import EmberObject from '@ember/object';
import $ from 'jquery';
import modal from '../utils/modal';
import Utils from '../utils/misc';
import LingoLinq from '../app';
import { observer } from '@ember/object';

export default modal.ModalController.extend({
  opening: function() {
    var _this = this;
    _this.set('tools', {loading: true});
    _this.set('selected_tool', null);
    _this.set('user_parameters', []);
    Utils.all_pages('integration', {template: true}, function(partial) {
    }).then(function(res) {
      var list = res.filter(function(t) { return t.get('icon_url'); });
      _this.set('tools', list);
      if(_this.get('model.tool')) {
        var tool = res.find(function(t) { return t.get('integration_key') == _this.get('model.tool'); });
        if(tool) {
          tool.reload();
          tool.set('installing', null);
          tool.set('error', null);
          _this.set('selected_tool', tool);
          _this.set('hide_list', true);
        }
      }
    }, function(err) {
      _this.set('tools', {error: true});
    });
  },
  set_user_parameters: observer('selected_tool.user_parameters', function() {
    var res = [];
    (this.get('selected_tool.user_parameters') || []).forEach(function(param) {
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
    install: function() {
      var _this = this;
      _this.set('selected_tool.installing', true);
      _this.set('selected_tool.error', null);
      var integration = LingoLinq.store.createRecord('integration');
      integration.set('user_id', _this.get('model.user.id'));
      integration.set('integration_key', _this.get('selected_tool.integration_key'));
      var params = [];
      _this.get('user_parameters').forEach(function(param) {
        params.push($.extend({}, param));
      });
      integration.set('user_parameters', params);
      integration.save().then(function(res) {
        modal.close({added: true});
      }, function(err) {
        _this.set('selected_tool.installing', null);
        _this.set('selected_tool.error', true);
        if(err && err.errors) {
          if(err.errors[0] == 'invalid user credentials') {
            _this.set('selected_tool.error', {bad_credentials: true});
          } else if(err.errors[0] == 'account credentials already in use') {
            _this.set('selected_tool.error', {credential_collision: true});
          } else if(err.errors[0] == 'invalid IFTTT Webhook URL') {
            _this.set('selected_tool.error', {bad_webhook: true});
          }
        }
      });
    },
    select_tool: function(tool) {
      tool.set('installing', null);
      tool.set('error', null);
      this.set('selected_tool', tool);
      if(!tool.get('permissions')) {
        tool.reload();
      }
    },
    browse: function() {
      this.set('selected_tool', null);
    }
  }
});
