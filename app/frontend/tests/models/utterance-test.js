import DS from 'ember-data';
import RSVP from 'rsvp';
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
import Button from '../../utils/button';

describe('Utterance', function() {
  it('should return best_image_url', function() {
    var u = LingoLinq.store.createRecord('utterance');

    expect(u.get('best_image_url')).toEqual(undefined);

    u.set('image_url', 'http://www.example.com/pic.png');
    expect(u.get('best_image_url')).toEqual('http://www.example.com/pic.png');

    u.set('large_image_url', 'https://www.example.com/pic.jpg');
    expect(u.get('best_image_url')).toEqual('https://www.example.com/pic.jpg');

    u.set('image_url', 'https://www.example.com/pics.jpg');
    expect(u.get('best_image_url')).toEqual('https://www.example.com/pic.jpg');

    u.set('image_url', null);
    expect(u.get('best_image_url')).toEqual('https://www.example.com/pic.jpg');
  });

  it('should correctly check_for_large_image_url', function() {
    var u = LingoLinq.store.createRecord('utterance');
    var called = false;
    stub(u, 'reload', function() {
      if(u.get('large_image_attempt') > 2) {
        u.set('large_image_url', 'http://www.example.com/pic.jpg');
      }
      called = true;
      return RSVP.resolve();
    });
    expect(u.check_for_large_image_url()).toEqual(false);

    u.set('permissions', {edit: true});
    u.set('large_image_url', 'http://www.example.com/pic.png');
    expect(u.check_for_large_image_url()).toEqual(false);

    u.set('large_image_url', null);
    expect(u.check_for_large_image_url()).toEqual(true);

    waitsFor(function() { return called; });
    runs(function() {
      expect(u.get('large_image_attempt')).toEqual(2);
      expect(u.get('large_image_url')).toEqual(null);
    });
    waitsFor(function() { return u.get('large_image_attempt') > 2; });
    runs(function() {
      expect(u.get('large_image_url')).toEqual('http://www.example.com/pic.jpg');
    });
  });
});
