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

describe('MapWithGeosComponent', 'component:map-with-geos', function() {
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
    var c = testOwner.factoryFor('component:map-with-geos').create();
    var elem = document.createElement('div');
    var inner = document.createElement('div');
    inner.className = 'map_with_geo';
    elem.appendChild(inner);
    stub(c, 'get', function(key) { return key == 'element' ? elem : EmberObject.prototype.get.call(c, key); });
    c.draw();
    return {waited: waited, show_map: EmberObject.prototype.get.call(c, 'show_map')};
  };

  it("should not load or draw the map when location maps are off", function() {
    var res = draw({});
    expect(res.waited).toEqual(false);
    expect(res.show_map).toEqual(false);
  });

  it("should draw the map when location maps are on", function() {
    var res = draw({location_maps: true});
    expect(res.waited).toEqual(true);
    expect(res.show_map).toEqual(true);
  });
});
