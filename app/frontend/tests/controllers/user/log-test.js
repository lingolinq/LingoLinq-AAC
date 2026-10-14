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
import EmberObject from '@ember/object';
import LingoLinq from '../../../app';
import app_state from '../../../utils/app_state';

describe('UserLogController', 'controller:user-log', function() {
  it("should exist", function() {
    expect(this).not.toEqual(null);
    expect(this).not.toEqual(window);
  });
});

describe('UserLogController location map', 'controller:user-log', function() {
  var testOwner;
  beforeEach(function() {
    testOwner = this.owner;
  });
  afterEach(function() {
    app_state.set('currentUser', null);
  });

  var draw = function(flags) {
    var waited = false;
    stub(LingoLinq.Visualizations, 'wait', function() { waited = true; });
    app_state.set('currentUser', EmberObject.create({feature_flags: flags}));
    var controller = testOwner.factoryFor('controller:user/log').create({
      user: EmberObject.create({preferences: {geo_logging: true}}),
      model: EmberObject.create({geo: {latitude: 1, longitude: 2}})
    });
    controller.draw_charts();
    return waited;
  };

  it("should not draw the location map when location maps are off", function() {
    expect(draw({})).toEqual(false);
  });

  it("should draw the location map when location maps are on", function() {
    expect(draw({location_maps: true})).toEqual(true);
  });
});
// import Ember from 'ember';
// 
// export default EmberObjectController.extend({
//   title: function() {
//     return "Log Details";
//   }.property('user_name'),
//   needs: 'user',
//   actions: {
//     lam_export: function() {
//       window.open('/api/v1/logs/' + this.get('id') + '/lam?nonce=' + this.get('nonce'));
//     },
//     toggle_notes: function(id, action) {
//       this.get('model').toggle_notes(id);
//       if(action == 'add') {
//         emberRun.later(function() {
//           $("input[data-event_id='" + id + "']").focus().select();
//         }, 200);
//       }
//     },
//     add_note: function(event_id) {
//       var val = $("input[data-event_id='" + event_id + "']").val();
//       if(val) {
//         this.get('model').add_note(event_id, val);
//       }
//       $("input[data-event_id='" + event_id + "']").val("");
//     }
//   }
// });