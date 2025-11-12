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

describe('Video', function() {
  describe('filename', function() {
    it("should not error on empty value", function() {
      var video = LingoLinq.store.createRecord('video', {});
      expect(video.get('filename')).toEqual('video');
    });
    it("should return filename if found in URL path, ignoring query params", function() {
      var video = LingoLinq.store.createRecord('video', {url: 'http://www.videos.com/video.avi'});
      expect(video.get('filename')).toEqual('video.avi');
      video.set('url', 'http://www.videos.com/video.mp4?id=1234');
      expect(video.get('filename')).toEqual('video.mp4');
      video.set('url', 'http://www.videos.com/video.php?id=3456');
      expect(video.get('filename')).toEqual('video');
    });
    it("should provide readable string for data URIs", function() {
      var video = LingoLinq.store.createRecord('video', {url: 'data:video/avi;abababa'});
      expect(video.get('filename')).toEqual('embedded video');
    });
  });

  describe('check_for_editable_license', function() {
    it('should return correct values', function() {
      var video = LingoLinq.store.createRecord('video');
      video.check_for_editable_license();
      expect(video.get('license.uneditable')).toEqual(undefined);
      video.set('license', {});
      video.check_for_editable_license();
      expect(video.get('license.uneditable')).toEqual(undefined);
      video.set('id', 12);
      video.check_for_editable_license();
      expect(video.get('license.uneditable')).toEqual(true);
      video.set('permissions', {edit: true});
      video.set('license', {});
      video.check_for_editable_license();
      expect(video.get('license.uneditable')).toEqual(undefined);
    });
  });

  describe('clean_license', function() {
    it('should update attributes', function() {
      var video = LingoLinq.store.createRecord('video');
      video.set('license', {source_link: 'http://www.example.com'});
      expect(video.get('license.source_url')).toEqual(undefined);
      video.clean_license();
      expect(video.get('license.source_url')).toEqual('http://www.example.com');
    });
  });

  describe('best_url', function() {
    it('should return the best url', function() {
      var video = LingoLinq.store.createRecord('video');
      expect(video.get('best_url')).toEqual(undefined);
      video.set('url', 'http://www.example.com/video.avi');
      expect(video.get('best_url')).toEqual('http://www.example.com/video.avi');
      video.set('data_url', 'data:stuff');
      expect(video.get('best_url')).toEqual('data:stuff');
      video.set('url', null);
      expect(video.get('best_url')).toEqual('data:stuff');
    });
  });

  describe('checkForDataURL', function() {
    it('should check for data url on change', function() {
      var searched = false;
      stub(persistence, 'online', false);
      stub(persistence, 'find_url', function(url, type) {
        searched = true;
        return RSVP.resolve('data:stuff');
      });
      var video = LingoLinq.store.createRecord('video');
      expect(searched).toEqual(false);
      video.set('url', 'http://www.example.com');
      waitsFor(function() { return searched; });
      runs();
    });
  });
});
