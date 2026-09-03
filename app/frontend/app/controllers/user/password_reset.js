import Controller from '@ember/controller';
import persistence from '../../utils/persistence';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Controller.extend({
  title: "Reset Password",
  checkPassword: observer('model.password', 'model.password2', function() {
    var pw = this.get('model.password');
    var pw2 = this.get('model.password2');
    if(!pw) {
      this.set('badPassword', {empty: true});
    } else if(pw.length < 8) {
      this.set('badPassword', {short: true});
    } else if(pw != pw2) {
      this.set('badPassword', {mismatch: true});
    } else {
      console.log('good one!');
      this.set('badPassword', null);
    }
  }),
  cantSubmit: computed('badPassword', 'password_reset.succeeded', function() {
    this.checkPassword();
    return !!(this.get('badPassword') || this.get('password_reset.succeeded'));
  }),
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
    changePassword: function() {
      var user_name = this.get('model.user_name');
      if(this.get('badPassword')) { return; }
      var token = this.get('model.reset_token');
      var _this = this;
      this.set('password_reset', {pending: true});
      persistence.ajax('/api/v1/users/' + user_name, {
        type: 'POST',
        data: {
          '_method': 'PUT',
          'reset_token': token,
          'user': {
            'password': this.get('model.password')
          }
        }
      }).then(function(data) {
        _this.set('password_reset.pending', false);
        _this.set('password_reset.succeeded', true);
      }, function() {
        _this.set('password_reset.pending', false);
        _this.set('password_reset.failed', true);
      });
    }
  }
});
