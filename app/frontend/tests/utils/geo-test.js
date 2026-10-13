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
import {
  fakeRecorder,
  fakeMediaRecorder,
  fakeCanvas,
  queryLog,
  easyPromise,
  queue_promise
} from 'frontend/tests/helpers/ember_helper';
import RSVP from 'rsvp';
import app_state from '../../utils/app_state';
import EmberObject from '@ember/object';
import geo from '../../utils/geo';
import stashes from '../../utils/_stashes';
import persistence from '../../utils/persistence';

describe('geo', function() {
  it("should correctly measure distances", function() {
    expect(geo.distance(40.571457,-112.0085445,40.5825151,-111.9165105)).toEqual(25818.555538053763);
    expect(geo.distance(40.5825477,-111.9178624,40.5825151,-111.9165105)).toEqual(374.75192559336193);
    expect(geo.distance(1,1,1.0001,1.0001)).toEqual(51.58885857662891);
  });

  describe("check_locations", function() {
    beforeEach(function() {
      geo.set('last_location_check', null);
    });

    it("should not request places, and should find none", function() {
      var requested = false;
      app_state.set('currentUser', EmberObject.create({user_name: 'bob'}));
      stub(persistence, 'ajax', function(url, opts) {
        requested = true;
        return RSVP.resolve([1, 2, 3]);
      });
      stashes.set('geo.latest', {coords: {latitude: 1, longitude: 1}});
      var done = null;
      geo.check_locations().then(function(res) { done = res; });
      waitsFor(function() { return done; });
      runs(function() {
        expect(done).toEqual([]);
        expect(requested).toEqual(false);
      });
    });
  });
});
