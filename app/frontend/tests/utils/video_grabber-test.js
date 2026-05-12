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
import contentGrabbers from '../../utils/content_grabbers';
import editManager from '../../utils/edit_manager';
import persistence from '../../utils/persistence';
import app_state from '../../utils/app_state';
import stashes from '../../utils/_stashes';
import EmberObject from '@ember/object';
import $ from 'jquery';

describe('videoGrabber', function() {
  var videoGrabber = contentGrabbers.videoGrabber;
  var navigator = window.navigator;

  var button = null, controller = null;
  beforeEach(function() {
    contentGrabbers.unlink();

    var user = EmberObject.create({user_name: 'bob', profile_url: 'http://www.bob.com/bob'});
    app_state.set('currentUser', user);
    controller = EmberObject.extend({
      send: function(message) {
        this.sentMessages[message] = arguments;
      },
      model: EmberObject.create({id: '456'})
    }).create({
      sentMessages: {},
      licenseOptions: [],
    });
  });

  describe('setup', function() {
    it('should set controller', function() {
      var checked = false;
      videoGrabber.setup(controller);
      expect(videoGrabber.controller).toEqual(controller);
    });
  });

  describe('clearing', function() {
    it('should clear uploaded or recorded sounds properly', function() {
      videoGrabber.setup(controller);
      controller.set('video_preview', {});
      controller.set('video_recording', {});
      videoGrabber.clear_video_work();
      expect(controller.get('video_preview')).toEqual(null);
      expect(controller.get('video_recording')).toEqual(null);

      var mr = fakeRecorder();
      mr.state = 'recording';
      controller.set('video_recording', {stream: mr});
      videoGrabber.clear();
      expect(mr.stopped).toEqual(true);
      expect(controller.get('video_preview')).toEqual(null);
    });
  });

  describe('picking files', function() {
    it('should set data from the provided file on the controller', function() {
      videoGrabber.setup(controller);
      var file = new window.Blob([0], {type: 'video/mp4'});
      file.name = "vid.mp4";
      videoGrabber.file_selected(file);
      waitsFor(function() { return controller.get('video_preview'); });
      runs(function() {
        expect(controller.get('video_preview.name')).toEqual('vid.mp4');
        expect(controller.get('video_preview.url')).toEqual('data:video/mp4;base64,MA==');
      });
    });
  });

  describe('video licenses', function() {
    it('should return correctly license type when set, defaulting to private', function() {
      videoGrabber.setup(controller);
      expect(controller.get('video_preview.license.type')).toEqual(undefined);

      controller.set('video_preview', {license: {type: 'abc'}});
      expect(controller.get('video_preview.license.type')).toEqual('abc');
    });
    it('should set default license settings on image_preview when it changes', function() {
      videoGrabber.setup(controller);
      expect(controller.get('video_preview')).toEqual(undefined);
      controller.set('video_preview', {});
      expect(controller.get('video_preview.license.author_name')).toEqual('bob');
      expect(controller.get('video_preview.license.author_url')).toMatch(/\/bob$/);
    });
  });

  describe('save_pending', function() {
    it('should save video_preview if defined');
    it('should save video license settings only if changed');
  });

  describe('selecting a video', function() {
    it('should do nothing if there isn\'t a video_preview', function() {
      queryLog.slice(0, 0);
      videoGrabber.select_video_preview();
      expect((queryLog[queryLog.length - 1] || {}).method).not.toEqual('POST');
    });
    it('should create a new video record correctly', function() {
      videoGrabber.setup(controller);
      stub(videoGrabber, 'measure_duration', function() { return RSVP.resolve({duration: 12}); });
      controller.set('video_preview', {url: '/video.mp4'});
      queryLog.defineFixture({
        method: 'POST',
        type: 'video',
        compare: function(s) { return s.get('url') == '/video.mp4'; },
        response: RSVP.resolve({video: {id: '123', url: '/video.mp4'}})
      });
      videoGrabber.select_video_preview();
      waitsFor(function() { return controller.get('video'); });
      runs(function() {
        expect(controller.get('video.id')).toEqual('123');
        expect(controller.get('video.url')).toEqual('/video.mp4');
        expect(controller.sentMessages['video_ready'][1]).toEqual('123');
        expect(controller.get('video_preview')).toEqual(null);
      });
    });

    it('should fail creating a video if no meta information provided', function() {
      var alerted = false;
      var message = null;
      stub(window, 'alert', function(msg) { message = msg; alerted = true; });
      videoGrabber.setup(controller);
      controller.set('video_preview', {url: 'data:video/mp4;base64,MA=='});
      var button_set = false;
      queryLog.defineFixture({
        method: 'POST',
        type: 'video',
        compare: function(s) { return s.get('data_url') == 'data:video/mp4;base64,MA=='; },
        response: RSVP.resolve({image: {id: '123', url: null, pending: true}})
      });
      stub($, 'ajax', function(args) {
        if(args.url == "http://upload.com/") {
          return RSVP.resolve("");
        } else if(args.url == "/success") {
          return RSVP.resolve({
            confirmed: true,
            url: "http://vids.com/viddy.mp4"
          });
        }
      });
      videoGrabber.select_video_preview();
      waitsFor(function() { return alerted; });
      runs(function() {
        expect(message).toEqual('upload failed: video calculation failed');
      });
    });

    it('should fail creating a video if the upload fails', function() {
      var alerted = false;
      var message = null;
      stub(window, 'alert', function(msg) { message = msg; alerted = true; });
      videoGrabber.setup(controller);
      stub(videoGrabber, 'measure_duration', function() { return RSVP.resolve({duration: 12}); });
      controller.set('video_preview', {url: 'data:video/mp4;base64,MA=='});
      queryLog.defineFixture({
        method: 'POST',
        type: 'video',
        compare: function(s) { return s.get('data_url') == 'data:video/mp4;base64,MA=='; },
        response: RSVP.resolve({video: {id: '123', url: null, pending: true}, meta: {remote_upload: {data_url: "/api", upload_url: "http://upload.com/", success_url: "/success", upload_params: {a: "1", b: "2"}}}})
      });
      stub($, 'ajax', function(args) {
        if(args.url == "http://upload.com/") {
          return RSVP.reject("");
        }
      });
      videoGrabber.select_video_preview();
      waitsFor(function() { return alerted; });
      runs(function() {
        expect(message).toEqual('upload failed: upload failed');
      });
    });

    it('should fail creating a video if the confirmation step fails', function() {
      var alerted = false;
      var message = null;
      stub(window, 'alert', function(msg) { message = msg; alerted = true; });
      videoGrabber.setup(controller);
      stub(videoGrabber, 'measure_duration', function() { return RSVP.resolve({duration: 12}); });
      controller.set('video_preview', {url: 'data:video/mp4;base64,MA=='});
      queryLog.defineFixture({
        method: 'POST',
        type: 'video',
        compare: function(s) { return s.get('data_url') == 'data:video/mp4;base64,MA=='; },
        response: RSVP.resolve({video: {id: '123', url: null, pending: true}, meta: {remote_upload: {data_url: "/api", upload_url: "http://upload.com/", success_url: "/success", upload_params: {a: "1", b: "2"}}}})
      });
      stub($, 'ajax', function(args) {
        if(args.url == "http://upload.com/") {
          return RSVP.resolve("");
        } else if(args.url == "/success") {
          return RSVP.resolve({
            confirmed: false
          });
        }
      });
      videoGrabber.select_video_preview();
      waitsFor(function() { return alerted; });
      runs(function() {
        expect(message).toEqual('upload failed: upload not confirmed');
      });
    });

    it('should send a pending video to the remote file storage', function() {
      videoGrabber.setup(controller);
      controller.set('video_preview', {url: 'data:video/mp4;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=='});
      stub(videoGrabber, 'measure_duration', function() { return RSVP.resolve({duration: 12}); });
      queryLog.defineFixture({
        method: 'POST',
        type: 'video',
        compare: function(s) { return s.get('data_url') == 'data:video/mp4;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=='; },
        response: RSVP.resolve({video: {id: '123', url: null, pending: true}, meta: {remote_upload: {data_url: "/api", upload_url: "http://upload.com/", success_url: "/success", upload_params: {a: "1", b: "2"}}}})
      });
      stub($, 'ajax', function(args) {
        if(args.url == "http://upload.com/") {
          return RSVP.resolve("");
        } else if(args.url == "/success") {
          return RSVP.resolve({
            confirmed: true,
            url: "http://vids.com/viddy.png"
          });
        }
      });
      videoGrabber.select_video_preview();
      waitsFor(function() { return controller.get('video'); });
      runs(function() {
        expect(controller.get('video.id')).toEqual('123');
        expect(controller.get('video.url')).toEqual('http://vids.com/viddy.png');
        expect(controller.get('video_preview')).toEqual(null);
      });
    });

    it('should use license provided on preview if specified', function() {
      videoGrabber.setup(controller);
      controller.set('video_preview', {url: '/video.mp4', license: {type: 'Uncool', author_name: 'Bob'}});
      stub(videoGrabber, 'measure_duration', function() { return RSVP.resolve({duration: 12}); });
      var correct_license = false;
      queryLog.defineFixture({
        method: 'POST',
        type: 'video',
        compare: function(s) {
          correct_license = s.get('license.type') == 'Uncool' && s.get('license.author_name') == "Bob";
          return s.get('url') == '/video.mp4';
        },
        response: RSVP.resolve({video: {id: '123', url: '/video.mp4'}})
      });
      videoGrabber.select_video_preview();
      waitsFor(function() { return correct_license; });
      runs();
    });

    it('should use license defined by user if none specified on the preview', function() {
      videoGrabber.setup(controller);
      stub(videoGrabber, 'measure_duration', function() { return RSVP.resolve({duration: 12}); });
      controller.set('video_preview', {url: '/video.mp4'});
      var correct_license = false;
      queryLog.defineFixture({
        method: 'POST',
        type: 'video',
        compare: function(s) {
          correct_license = s.get('license.type') == 'private' && s.get('license.author_name') == 'bob';
          return s.get('url') == '/video.mp4';
        },
        response: RSVP.resolve({video: {id: '123', url: '/video.mp4'}})
      });
      videoGrabber.select_video_preview();
      waitsFor(function() { return correct_license; });
      runs();
    });
  });

  describe('webcam', function() {
    it('should request the camera and then set the stream', function() {
      videoGrabber.setup(controller);
      var called = false;
      var mediaCallback = null;
      stashes.set('last_stream_id', null);
      stub(navigator, 'getUserMedia', function(args, callback) {
        called = callback && args.video === true;
        mediaCallback = callback;
      });
      videoGrabber.record_video();
      expect(called).toEqual(true);

      var stream = fakeRecorder();
      stub(videoGrabber, 'setup_media_recorder', function(stream, options) { return fakeMediaRecorder(stream, options); });
      stub(window, 'URL', {
        createObjectURL: function() { return 'stuff://cool'; }
      });
      stub(window, 'enumerateMediaDevices', function() { return RSVP.resolve([]); });
      mediaCallback(stream);
      expect(controller.get('video_recording.stream')).toEqual(stream);
    });

    it("should remember the last-selected webcam if there's a list", function() {
      videoGrabber.setup(controller);
      var called = false;
      var mediaCallback = null;
      stashes.set('last_stream_id', 'abcdefg');

      stub(navigator, 'getUserMedia', function(args, callback) {
        called = callback && args.video && args.video.optional && args.video.optional[0] && args.video.optional[0].sourceId == 'abcdefg';
        mediaCallback = callback;
      });
      videoGrabber.record_video();
      expect(called).toEqual(true);

      var stream = fakeRecorder();
      stub(videoGrabber, 'setup_media_recorder', function(stream, options) { return fakeMediaRecorder(stream, options); });
      stub(window, 'URL', {
        createObjectURL: function() { return 'stuff://cool'; }
      });
      stub(window, 'enumerateMediaDevices', function() { return RSVP.resolve([]); });
      mediaCallback(stream);
      expect(controller.get('video_recording.stream')).toEqual(stream);
    });

    it("should correctly swap between streams", function() {
      stub(window, 'enumerateMediaDevices', function() {
        return RSVP.resolve([
          {kind: 'videoinput', id: 'aaa', label: 'cam 1'},
          {kind: 'audioinput', id: 'bbb', label: 'mic 1'},
          {kind: 'videoinput', id: 'ccc', label: 'cam 2'},
          {kind: 'videoinput', id: 'ddd', label: 'cam 3'}
        ]);
      });
      videoGrabber.setup(controller);
      var called = false;
      var mediaCallback = null;
      stashes.set('last_stream_id', null);
      var video_id = null;
      stub(navigator, 'getUserMedia', function(args, callback) {
        video_id = null;
        if(args.video && args.video.optional && args.video.optional[0] && args.video.optional[0].sourceId) {
          video_id = args.video.optional[0].sourceId;
        }
        mediaCallback = callback;
      });
      videoGrabber.record_video();
      expect(video_id).toEqual(null);

      var stream = fakeRecorder();
      stub(videoGrabber, 'setup_media_recorder', function(stream, options) { return fakeMediaRecorder(stream, options); });
      stub(window, 'URL', {
        createObjectURL: function() { return 'stuff://cool'; }
      });
      mediaCallback(stream);
      expect(controller.get('video_recording.stream')).toEqual(stream);
      waitsFor(function() { return controller.get('video_recording.video_streams'); });
      runs(function() {
        expect(controller.get('video_recording.video_streams').length).toEqual(3);
        expect(controller.get('video_recording.video_streams').mapBy('id')).toEqual(['aaa', 'ccc', 'ddd']);

        videoGrabber.swap_streams();
        mediaCallback(stream);
        expect(video_id).toEqual('ccc');
        expect(stashes.get('last_stream_id')).toEqual('ccc');

        videoGrabber.swap_streams();
        mediaCallback(stream);
        expect(video_id).toEqual('ddd');
        expect(stashes.get('last_stream_id')).toEqual('ddd');

        videoGrabber.swap_streams();
        mediaCallback(stream);
        expect(video_id).toEqual('aaa');
        expect(stashes.get('last_stream_id')).toEqual('aaa');

        videoGrabber.swap_streams();
        mediaCallback(stream);
        expect(video_id).toEqual('ccc');
        expect(stashes.get('last_stream_id')).toEqual('ccc');
      });
    });

    it("should correctly swap between streams even when starting on a different-than-first stream", function() {
      stub(window, 'enumerateMediaDevices', function() {
        return RSVP.resolve([
          {kind: 'videoinput', id: 'aaa', label: 'cam 1'},
          {kind: 'audioinput', id: 'bbb', label: 'mic 1'},
          {kind: 'videoinput', id: 'ccc', label: 'cam 2'},
          {kind: 'videoinput', id: 'ddd', label: 'cam 3'}
        ]);
      });
      videoGrabber.setup(controller);
      var called = false;
      var mediaCallback = null;
      stashes.set('last_stream_id', 'ccc');
      var video_id = null;
      stub(navigator, 'getUserMedia', function(args, callback) {
        video_id = null;
        if(args.video && args.video.optional && args.video.optional[0] && args.video.optional[0].sourceId) {
          video_id = args.video.optional[0].sourceId;
        }
        mediaCallback = callback;
      });
      videoGrabber.record_video();
      expect(video_id).toEqual('ccc');

      var stream = fakeRecorder();
      stub(videoGrabber, 'setup_media_recorder', function(stream, options) { return fakeMediaRecorder(stream, options); });
      stub(window, 'URL', {
        createObjectURL: function() { return 'stuff://cool'; }
      });
      mediaCallback(stream);
      expect(controller.get('video_recording.stream')).toEqual(stream);
      waitsFor(function() { return controller.get('video_recording.video_streams'); });
      runs(function() {
        expect(controller.get('video_recording.video_streams').length).toEqual(3);
        expect(controller.get('video_recording.video_streams').mapBy('id')).toEqual(['aaa', 'ccc', 'ddd']);

        videoGrabber.swap_streams();
        mediaCallback(stream);
        expect(video_id).toEqual('ddd');
        expect(stashes.get('last_stream_id')).toEqual('ddd');

        videoGrabber.swap_streams();
        mediaCallback(stream);
        expect(video_id).toEqual('aaa');
        expect(stashes.get('last_stream_id')).toEqual('aaa');

        videoGrabber.swap_streams();
        mediaCallback(stream);
        expect(video_id).toEqual('ccc');
        expect(stashes.get('last_stream_id')).toEqual('ccc');

        videoGrabber.swap_streams();
        mediaCallback(stream);
        expect(video_id).toEqual('ddd');
        expect(stashes.get('last_stream_id')).toEqual('ddd');
      });
    });

    it('should stop the webcam on clear', function() {
      videoGrabber.setup(controller);
      var mr = fakeRecorder();
      mr.state = 'recording';
      controller.set('video_recording', {stream: mr});
      videoGrabber.clear();
      expect(mr.stopped).toEqual(true);
    });
  });
});
