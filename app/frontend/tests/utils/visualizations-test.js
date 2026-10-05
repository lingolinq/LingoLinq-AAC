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
import LingoLinq from '../../app';

describe('Visualizations', function() {
  var saved = {};
  var appended = [];
  var keys = ['ready', 'initializing', 'maps_ready', 'maps_initializing', 'callbacks'];
  beforeEach(function() {
    keys.forEach(function(k) { saved[k] = LingoLinq.Visualizations[k]; LingoLinq.Visualizations[k] = undefined; });
    saved.google = window.google;
    window.google = undefined;
    appended = [];
    stub(document.body, 'appendChild', function(elem) { appended.push(elem.src || 'inline'); return elem; });
  });
  afterEach(function() {
    keys.forEach(function(k) { LingoLinq.Visualizations[k] = saved[k]; });
    window.google = saved.google;
  });

  var maps_scripts = function() {
    return appended.filter(function(src) { return src.indexOf('maps.googleapis.com') != -1; });
  };
  var chart_scripts = function() {
    return appended.filter(function(src) { return src.indexOf('gstatic.com/charts') != -1; });
  };

  it('should load only the charts loader for a chart', function() {
    LingoLinq.Visualizations.wait('pie-chart', function() { });
    expect(chart_scripts().length).toEqual(1);
    expect(maps_scripts().length).toEqual(0);
  });

  it('should load the maps script for a geo map, and not the charts loader', function() {
    LingoLinq.Visualizations.wait('geo', function() { });
    expect(maps_scripts().length).toEqual(1);
    expect(chart_scripts().length).toEqual(0);
  });

  it('should load the maps script once for two geo maps', function() {
    LingoLinq.Visualizations.wait('geo', function() { });
    LingoLinq.Visualizations.wait('geo', function() { });
    expect(maps_scripts().length).toEqual(1);
  });

  it('should not load the maps script when it is already loaded', function() {
    window.google = {maps: {}};
    var ran = false;
    LingoLinq.Visualizations.wait('geo', function() { ran = true; });
    expect(maps_scripts().length).toEqual(0);
    waitsFor(function() { return ran; });
    runs();
  });

  it('should run chart callbacks when charts are ready and geo callbacks only when maps are ready', function() {
    var ran = [];
    LingoLinq.Visualizations.wait('pie-chart', function() { ran.push('chart'); });
    LingoLinq.Visualizations.wait('geo', function() { ran.push('geo'); });
    LingoLinq.Visualizations.handle_callbacks();
    expect(ran).toEqual(['chart']);
    LingoLinq.Visualizations.handle_maps();
    expect(ran).toEqual(['chart', 'geo']);
  });
});
