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
import LingoLinq from '../../app';
import persistence from '../../utils/persistence';


describe('Logging in', function() {
//   it("should show error message if browser token not available", function() {
//     stub(persistence, 'ajax', function() { debugger });
//     persistence.set('browserToken', null);
//     visit('/login');
//     var done = false;
//     setTimeout(function() { done = true; }, 500);
//     waitsFor(function() { return done && find('#login_form').length > 0; });
//     runs(function() {
//       expect(find('#login_form button').text()).toMatch(/Not Connected/);
//       expect(!!find('#login_form button').attr('disabled')).toEqual(true);
//     });
//   });
  
//   it("should allow logging in if browser token is returned", function() {
//     stub(persistence, 'ajax', function() { debugger; });
//     persistence.set('browserToken', 'asdf');
//     visit('/login');
//     var done = false;
//     setTimeout(function() { done = true; }, 500);
//     waitsFor(function() { return done && find('#login_form').length > 0; });
//     runs(function() {
//       expect(find('#login_form button').text()).toMatch(/Sign In/);
//       expect(!!find('#login_form button').attr('disabled')).toEqual(false);
//     });
//   });
});
