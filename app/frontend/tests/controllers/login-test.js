import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  waitsFor,
  runs,
  stub
} from 'frontend/tests/helpers/jasmine';
import { queryLog } from 'frontend/tests/helpers/ember_helper';

describe('LoginController', 'controller:login', function() {
  it("should exist", function() {
    expect(this).not.toEqual(null);
    expect(this).not.toEqual(window);
  });
});
// import Ember from 'ember';
// import capabilities from '../utils/capabilities';
// import LoginControllerMixin from 'simple-auth/mixins/login-controller-mixin';
// import i18n from '../utils/i18n';
// import stashes from '../utils/_stashes';
// 
// export default Ember.Controller.extend(LoginControllerMixin, {
//   title: "Login",
//   browserless: function() {
//     return capabilities.browserless;
//   }.property(),
//   noSubmit: function() {
//     return this.get('noSecret') || this.get('logging_in') || this.get('logged_in');
//   }.property('logging_in', 'logged_in', 'noSecret'),
//   noSecret: function() {
//     return !this.get('client_secret');
//   }.property('client_secret'),
//   actions: {
//     authenticate: function() {
//       this.set('logging_in', true);
//       var data = this.getProperties('identification', 'password', 'client_secret', 'long_token');
//       if(capabilities.browserless) {
//         data.long_token = true;
//       }
//       if (!Ember.isEmpty(data.identification) && !Ember.isEmpty(data.password)) {
//         this.set('password', null);
//         var _this = this;
//         this.get('session').authenticate('authenticator:lingolinq', data).then(function(data) {
//           stashes.flush(null, 'auth_');
//           stashes.setup();
//           _this.set('logging_in', false);
//           _this.set('logged_in', true);
//           location.href = "/";
//         }, function(err) {
//           err = err || {};
//           _this.set('logging_in', false);
//           if(err.error == "Invalid authentication attempt") {
//             _this.set('login_error', i18n.t('invalid_login', "Invalid user name or password"));
//           } else {
//             _this.set('login_error', i18n.t('login_error', "There was an unexpected problem logging in"));
//           }
//         });
//       } else {
//         this.set('login_error', i18n.t('login_required', "Username and password are both required"));
//         this.set('logging_in', false);
//       }
//     }
//   }
// });
