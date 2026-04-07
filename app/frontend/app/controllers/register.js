import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import LingoLinq from '../app';
import { computed, observer } from '@ember/object';
import persistence from '../utils/persistence';

// TODO: Maybe a pretty img they can send/embed to share with users

export default Controller.extend({
  stashes: service('stashes'),
  persistence: service('persistence'),
  title: "Register",
  queryParams: ['code', 'v'],
  registration_types: LingoLinq.registrationTypes,
  triedToSave: false,
  badEmail: computed('model.email', 'triedToSave', function() {
    var email = this.get('model.email');
    return (this.get('triedToSave') && !email);
  }),
  shortPassword: computed('model.password', 'model.password2', 'triedToSave', function() {
    var password = this.get('model.password') || '';
    var password2 = this.get('model.password2');
    return (this.get('triedToSave') || password == password2) && password.length < 6;
  }),
  noName: computed('model.name', 'model.user_name', 'triedToSave', function() {
    var name = this.get('model.name');
    var user_name = this.get('model.user_name');
    return this.get('triedToSave') && !name && !user_name;
  }),
  noSpacesName: computed('model.user_name', function() {
    return !!(this.get('model.user_name') || '').match(/[\s\.'"]/);
  }),
  clear_start_code_ref: observer('model.start_code', 'start_code_ref', function() {
    if(this.get('model.start_code') && this.get('model.start_code') != this.get('start_code_ref.code')) {
      this.set('start_code_ref', null);
    }
  }),
  start_code_lookup: function() {
    var _this = this;
    _this.set('start_code', true);
    var code = this.get('model.reg_params.code');
    _this.set('model.start_code', code);
    persistence.ajax('/api/v1/start_code?code=' + encodeURIComponent(this.get('model.reg_params.code')) + '&v=' + this.get('model.reg_params.v'), {type: 'GET'}).then(function(res) {
      _this.set('start_code_ref', res);
    }, function(err) {
      
    });
  },
  actions: {
    allow_start_code: function() {
      this.set('start_code', true);
    }
  }
});
