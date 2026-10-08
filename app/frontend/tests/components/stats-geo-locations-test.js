import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  stub
} from 'frontend/tests/helpers/jasmine';
import 'frontend/tests/helpers/ember_helper';
import EmberObject from '@ember/object';
import LingoLinq from '../../app';
import app_state from '../../utils/app_state';

describe('StatsGeoLocationsComponent', 'component:stats/geo-locations', function() {
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
    var c = testOwner.factoryFor('component:stats/geo-locations').create({
      usage_stats: EmberObject.create({geo_locations: [{id: '1', geo: {latitude: 1, longitude: 2}}]})
    });
    var elem = document.createElement('div');
    stub(c, 'get', function(key) { return key == 'element' ? elem : EmberObject.prototype.get.call(c, key); });
    c.draw();
    return waited;
  };

  it("should not draw the location map when location maps are off", function() {
    expect(draw({})).toEqual(false);
  });

  it("should draw the location map when location maps are on", function() {
    expect(draw({location_maps: true})).toEqual(true);
  });
});
