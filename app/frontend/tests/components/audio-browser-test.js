import DS from 'ember-data';
import RSVP from 'rsvp';
import EmberObject from '@ember/object';
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
import modal from '../../utils/modal';
import Utils from '../../utils/misc';
import app_state from '../../utils/app_state';
import contentGrabbers from '../../utils/content_grabbers';
import audioBrowser from '../../components/audio-browser';
import Button from '../../utils/button';

describe('audio-browser', function() {
  var component = null;
  beforeEach(function() {
    component = this.subject();
  });

  it('should have a span tagName', function() {
    expect(component.tagName).toEqual('span');
  });

  it('should lookup sounds on load', function() {
    var callback = null;
    var defer = null;
    stub(Utils, 'all_pages', function(type, opts, cb) {
      expect(type).toEqual('sound');
      expect(opts).toEqual({user_id: 'asdf'});
      callback = cb;
      defer = RSVP.defer();
      return defer.promise;
    });
    app_state.set('currentUser', {id: 'asdf'});
    component.willInsertElement();
    expect(component.get('browse_audio')).toEqual({loading: true});
    var list = [{id: 'a'}, {id: 'b'}, {id: 'c'}, {id: 'd'}, {id: 'e'}, {id: 'f'}, {id: 'g'}, {id: 'h'}, {id: 'i'}, {id: 'j'}, {id: 'k'}, {id: 'l'}];
    waitsFor(function() { return callback; });
    runs(function() {
      expect(component.get('browse_audio')).toEqual({loading: true});
      callback(list);
    });
    waitsFor(function() { return component.get('browse_audio.results') !== undefined; });
    runs(function() {
      expect(component.get('browse_audio')).toEqual({
        results: list.slice(0, 10),
        full_results: list,
        filtered_results: list
      });
      defer.reject();
    });
    waitsFor(function() { return component.get('browse_audio.error') === true; });
    runs();
  });

  it('should return correct value for more_audio_results', function() {
    expect(component.get('more_audio_results')).toEqual(false);
    component.set('browse_audio', {results: [], filtered_results: [{}]});
    expect(component.get('more_audio_results')).toEqual(true);
    component.set('browse_audio', {results: [{}], filtered_results: [{}]});
    expect(component.get('more_audio_results')).toEqual(false);
  });

  it('should trigger filtering of browsed audio', function() {
    var called = false;
    stub(component, 'send', function(message) {
      expect(message).toEqual('filter_browsed_audio');
      called = true;
    });
    component.set('browse_audio', {filter_string: 'asdf'});
    waitsFor(function() { return called; });
    runs();
  });

  describe("filter_browsed_audio", function() {
    it('should return a filtered list', function() {
      component.set('browse_audio', {
        full_results: [
          EmberObject.create({search_string: 'hat is good'}),
          EmberObject.create({search_string: 'hat is bad'}),
          EmberObject.create({search_string: 'hat is swell'}),
          EmberObject.create({search_string: 'hat is neat'}),
          EmberObject.create({search_string: 'hat is something'}),
          EmberObject.create({search_string: 'hat is ok'}),
          EmberObject.create({search_string: 'hat is awesome'}),
          EmberObject.create({search_string: 'hat is cheese'}),
          EmberObject.create({search_string: 'splat is cool'}),
          EmberObject.create({search_string: 'hat is from'}),
          EmberObject.create({search_string: 'hat is windy'}),
          EmberObject.create({search_string: 'hat is above'}),
          EmberObject.create({search_string: 'hat is flat'}),
        ]
      });
      component.send('filter_browsed_audio', 'hat');
      expect(component.get('browse_audio.filtered_results.length')).toEqual(12);
      expect(component.get('browse_audio.results.length')).toEqual(10);
    });
  });

  describe("more_browsed_audio", function() {
    it('should add to the list', function() {
      var list = [];
      for(var idx = 0; idx < 100; idx++) {
        list.push(EmberObject.create());
      }

      component.set('browse_audio', {
        results: list.slice(0, 5),
        filtered_results: list.slice(0, 30),
        full_results: list
      });
      expect(component.get('browse_audio.results.length')).toEqual(10);
      expect(component.get('browse_audio.filtered_results.length')).toEqual(100);
      component.send('more_browsed_audio');
      expect(component.get('browse_audio.results.length')).toEqual(20);
      expect(component.get('browse_audio.filtered_results.length')).toEqual(100);
      component.send('more_browsed_audio');
      expect(component.get('browse_audio.results.length')).toEqual(30);
      expect(component.get('browse_audio.filtered_results.length')).toEqual(100);
      component.send('more_browsed_audio');
      expect(component.get('browse_audio.results.length')).toEqual(40);
      expect(component.get('browse_audio.filtered_results.length')).toEqual(100);
    });

    it('should do nothing if already fully loaded', function() {
      var list = [];
      for(var idx = 0; idx < 100; idx++) {
        list.push(EmberObject.create());
      }

      component.set('browse_audio', {
        results: list,
        filtered_results: list.slice(0, 30),
        full_results: list
      });
      expect(component.get('browse_audio.results.length')).toEqual(10);
      expect(component.get('browse_audio.filtered_results.length')).toEqual(100);
      component.send('more_browsed_audio');
      expect(component.get('browse_audio.results.length')).toEqual(20);
      expect(component.get('browse_audio.filtered_results.length')).toEqual(100);
    });
  });

  describe("select_audio", function() {
    it('should update correctly', function() {
      var called = false;
      stub(component, 'sendAction', function(message, val) {
        expect(message).toEqual('audio_selected');
        expect(val).toEqual('asdf');
        called = true;
      });
      component.set('browse_audio', {loading: true});
      component.send('select_audio', 'asdf');
      expect(component.get('browse_audio')).toEqual(null);
      waitsFor(function() { return called; });
      runs();
    });
  });
});
