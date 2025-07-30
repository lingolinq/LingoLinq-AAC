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
import LingoLinqAAC from '../../app';
import $ from 'jquery';

describe('pictureGrabber', function() {
  var pictureGrabber = contentGrabbers.pictureGrabber;
  var navigator = window.navigator;

  var button = null, controller = null;
  beforeEach(function() {
    contentGrabbers.unlink();

    var obj = EmberObject.create({
      'controllers': {'application': {
        'currentUser': EmberObject.create({user_name: 'bob', profile_url: 'http://www.bob.com/bob'})
      }}
    });
    app_state.set('currentUser', obj.get('controllers.application.currentUser'));
    controller = EmberObject.extend({
      send: function(message) {
        this.sentMessages[message] = arguments;
      },
      model: EmberObject.create({id: '456'})
    }).create({
      sentMessages: {},
      licenseOptions: [],
      'controllers': {'board': obj}
    });
    button = EmberObject.extend({
      findContentLocally: function() {
        this.foundContentLocally = true;
        return RSVP.resolve(true);
      }
    }).create();
  });

  describe('setup', function() {
    it('should set controller and button attributes', function() {
      var checked = false;
      button.set('image', {id: 1, check_for_editable_license: function() { checked = true; }});
      stub(button, 'findContentLocally', function() {
        return RSVP.resolve();
      });
      pictureGrabber.setup(button, controller);
      waitsFor(function() { return checked; });
      runs(function() {
        expect(pictureGrabber.controller).toEqual(controller);
        expect(pictureGrabber.button).toEqual(button);
      });
    });
  });

  describe('clearing', function() {
    it('should clear uploaded or recorded sounds properly', function() {
      pictureGrabber.setup(button, controller);
      controller.set('image_preview', {});
      controller.set('image_search', {});
      pictureGrabber.clear_image_preview();
      expect(controller.get('image_preview')).toEqual(null);
      expect(controller.get('image_search')).not.toEqual(null);

      var mr = fakeRecorder();
      mr.state = 'recording';
      controller.set('webcam', {stream: mr});
      pictureGrabber.clear();
      expect(mr.stopped).toEqual(true);
      expect(controller.get('image_search')).toEqual(null);
      expect(controller.get('webcam')).toEqual(null);
    });
  });

  describe('dropping files', function() {
    it('should set the dropped image URL on the controller', function() {
      pictureGrabber.setup(button, controller);
      var promise = easyPromise();
      stub($, 'ajax', function(url, args) {
        if(url == "/api/v1/search/proxy?url=http%3A%2F%2Fpics.com%2Fcow.png") {
          return promise;
        }
      });

      pictureGrabber.web_image_dropped({file: {url: "http://pics.com/cow.png"}});
      waitsFor(function() { return controller.get('model.image_field'); });
      runs(function() {
        expect(controller.get('model.image_field')).toEqual("http://pics.com/cow.png");
        promise.resolve({
          data: "data:image/png;aaa===",
          content_type: "image/png"
        });
      });
//       waitsFor(function() { return controller.get('image_preview'); })
//       runs(function() {
//         expect(controller.get('image_preview.url')).toEqual("data:image/png;aaa===");
//       });
    });
  });

  describe('picking files', function() {
    it('should set data from the provided file on the controller', function() {
      pictureGrabber.setup(button, controller);
      var file = new window.Blob([0], {type: 'image/png'});
      file.name = "pic.png";
      pictureGrabber.file_selected(file);
      waitsFor(function() { return controller.get('image_preview'); });
      runs(function() {
        expect(controller.get('image_preview.name')).toEqual('pic.png');
        expect(controller.get('image_preview.url')).toEqual('data:image/png;base64,MA==');
      });
    });

    it('should trigger avatar callbacks for avatar file selection events', function() {
      var results = [];
      pictureGrabber.setup(button, controller);
      var file = new window.Blob([0], {type: 'image/png'});
      file.name = "pic.png";

      contentGrabbers.avatar_result = function(bool, str) {
        results.push([bool, str]);
      };
      stub(contentGrabbers, 'read_file', function(f) {
        expect(f).toEqual(file);
        return RSVP.resolve({
          target: {
            result: 'haha'
          }
        });
      });
      stub(pictureGrabber, 'size_image', function(str) {
        expect(str).toEqual('haha');
        return RSVP.resolve({
          url: 'data:image/png;000000',
          width: 200,
          height: 200
        });
      });
      stub(contentGrabbers, 'save_record', function(rec) {
        expect(!!rec.get('url').match(/data/)).toEqual(true);
        expect(rec.get('width')).toEqual(200);
        expect(rec.get('height')).toEqual(200);
        expect(rec.get('avatar')).toEqual(true);
        return RSVP.resolve('whatever');
      });
      pictureGrabber.file_selected(file, 'avatar');
      expect(results.length).toEqual(1);
      expect(results[0]).toEqual([true, 'loading']);

      waitsFor(function() { return results.length >= 2; });
      runs(function() {
        expect(results[1]).toEqual([true, 'whatever']);
      });
    });
  });

  // TODO: pictureGrabber.pick_preview...

  describe('image licenses', function() {
    it('should return correctly license type when set, defaulting to private', function() {
      pictureGrabber.setup(button, controller);
      expect(controller.get('image_preview.license.type')).toEqual(undefined);

      controller.set('image_preview', {license: {type: 'abc'}});
      expect(controller.get('image_preview.license.type')).toEqual('abc');
    });
    it('should set default license settings on image_preview when it changes', function() {
      pictureGrabber.setup(button, controller);
      expect(controller.get('image_preview')).toEqual(undefined);
      controller.set('image_preview', {});
      expect(controller.get('image_preview.license.author_name')).toEqual('bob');
      expect(controller.get('image_preview.license.author_url')).toMatch(/\/bob$/);
    });
  });

  describe('editing a picture', function() {
    it('should set editor mode to true', function() {
      pictureGrabber.setup(button, controller);
      controller.set('image_preview', {url: 'data:image/png'});
      pictureGrabber.edit_image_preview();
      waitsFor(function() { return controller.get('image_preview.editor'); });
      runs();
    });

    it('should stash the image on the editManager for postMessage callback', function() {
      pictureGrabber.setup(button, controller);
      controller.set('image_preview', {url: 'data:image/png'});
      pictureGrabber.edit_image_preview();
      expect(editManager.stashedImage.url).toEqual('data:image/png');
    });

    it('should generate a data-uri for remote images before trying to edit', function() {
      pictureGrabber.setup(button, controller);
      controller.set('image_preview', {url: 'http://www.picture.com'});
      stub(persistence, 'ajax', function() {
        return RSVP.resolve({content_tye: 'image/png', data: 'data:image/png'});
      });
      pictureGrabber.edit_image_preview();
      waitsFor(function() { return editManager.stashedImage; });
      runs(function() {
        expect(editManager.stashedImage.url).toEqual('data:image/png');
      });
    });
    it('should allow editing the already-set image');
  });

  describe('clear_image', function() {
    it('should have cleared the specified image', function() {
      pictureGrabber.setup(button, controller);
      controller.set('image_preview', {url: 'http://www.picture.com'});
      controller.set('model.image', 'http://www.picture.com');
      pictureGrabber.clear_image();
      expect(controller.get('model.image')).toEqual(null);
      expect(controller.get('image_preview')).toEqual(null);
    });
  });

  describe('save_pending', function() {
    it('should save image_preview if defined');
    it('should save image license settings only if changed');
  });

  describe('selecting a picture', function() {
    it('should do nothing if there isn\'t an image_preview', function() {
      queryLog.slice(0, 0);
      pictureGrabber.select_image_preview();
      expect((queryLog[queryLog.length - 1] || {}).method).not.toEqual('POST');
    });
    it('should create a new image record correctly', function() {
      pictureGrabber.setup(button, controller);
      controller.set('image_preview', {url: '/logo.png'});
      var button_set = false;
      stub(editManager, 'change_button', function(id, args) {
        if(id == '456' && args.image_id == '123') { button_set = true; }
      });
      queryLog.defineFixture({
        method: 'POST',
        type: 'image',
        compare: function(s) { return s.get('url') == '/logo.png'; },
        response: RSVP.resolve({image: {id: '123', url: '/logo.png'}})
      });
      pictureGrabber.select_image_preview();
      waitsFor(function() { return controller.get('model.image'); });
      runs(function() {
        expect(controller.get('model.image.id')).toEqual('123');
        expect(controller.get('model.image.url')).toEqual('/logo.png');
        expect(controller.get('model.image.url')).toEqual('/logo.png');
        expect(button_set).toEqual(true);
        expect(controller.get('image_preview')).toEqual(null);
      });
    });
    it('should fail creating an image if no meta information provided', function() {
      var alerted = false;
      stub(window, 'alert', function() { alerted = true; });
      pictureGrabber.setup(button, controller);
      controller.set('image_preview', {url: 'data:image/png;base64,MA=='});
      var button_set = false;
      stub(editManager, 'change_button', function(id, args) {
        if(id == '456' && args.image_id == '123') { button_set = true; }
      });
      queryLog.defineFixture({
        method: 'POST',
        type: 'image',
        compare: function(s) { return s.get('data_url') == 'data:image/png;base64,MA=='; },
        response: RSVP.resolve({image: {id: '123', url: null, pending: true}})
      });
      stub($, 'ajax', function(args) {
        if(args.url == "http://upload.com/") {
          return RSVP.resolve("");
        } else if(args.url == "/success") {
          return RSVP.resolve({
            confirmed: true,
            url: "http://pics.com/piccy.png"
          });
        }
      });
      pictureGrabber.select_image_preview();
      waitsFor(function() { return alerted; });
      runs();
    });
    it('should fail creating an image if the upload fails', function() {
      var alerted = false;
      stub(window, 'alert', function() { alerted = true; });
      pictureGrabber.setup(button, controller);
      controller.set('image_preview', {url: 'data:image/png;base64,MA=='});
      var button_set = false;
      stub(editManager, 'change_button', function(id, args) {
        if(id == '456' && args.image_id == '123') { button_set = true; }
      });
      queryLog.defineFixture({
        method: 'POST',
        type: 'image',
        compare: function(s) { return s.get('data_url') == 'data:image/png;base64,MA=='; },
        response: RSVP.resolve({image: {id: '123', url: null, pending: true}, meta: {remote_upload: {data_url: "/api", upload_url: "http://upload.com/", success_url: "/success", upload_params: {a: "1", b: "2"}}}})
      });
      stub($, 'ajax', function(args) {
        if(args.url == "http://upload.com/") {
          return RSVP.reject("");
        }
      });
      pictureGrabber.select_image_preview();
      waitsFor(function() { return alerted; });
      runs();
    });
    it('should fail creating an image if the confirmation step fails', function() {
      var alerted = false;
      stub(window, 'alert', function() { alerted = true; });
      pictureGrabber.setup(button, controller);
      controller.set('image_preview', {url: 'data:image/png;base64,MA=='});
      var button_set = false;
      stub(editManager, 'change_button', function(id, args) {
        if(id == '456' && args.image_id == '123') { button_set = true; }
      });
      queryLog.defineFixture({
        method: 'POST',
        type: 'image',
        compare: function(s) { return s.get('data_url') == 'data:image/png;base64,MA=='; },
        response: RSVP.resolve({image: {id: '123', url: null, pending: true}, meta: {remote_upload: {data_url: "/api", upload_url: "http://upload.com/", success_url: "/success", upload_params: {a: "1", b: "2"}}}})
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
      pictureGrabber.select_image_preview();
      waitsFor(function() { return alerted; });
      runs();
    });
    it('should send a pending image to the remote file storage', function() {
      pictureGrabber.setup(button, controller);
      controller.set('image_preview', {url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=='});
      var button_set = false;
      stub(editManager, 'change_button', function(id, args) {
        if(id == '456' && args.image_id == '123') { button_set = true; }
      });
      queryLog.defineFixture({
        method: 'POST',
        type: 'image',
        compare: function(s) { return s.get('data_url') == 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=='; },
        response: RSVP.resolve({image: {id: '123', url: null, pending: true}, meta: {remote_upload: {data_url: "/api", upload_url: "http://upload.com/", success_url: "/success", upload_params: {a: "1", b: "2"}}}})
      });
      stub($, 'ajax', function(args) {
        if(args.url == "http://upload.com/") {
          return RSVP.resolve("");
        } else if(args.url == "/success") {
          return RSVP.resolve({
            confirmed: true,
            url: "http://pics.com/piccy.png"
          });
        }
      });
      pictureGrabber.select_image_preview();
      waitsFor(function() { return controller.get('model.image'); });
      runs(function() {
        expect(controller.get('model.image.id')).toEqual('123');
        expect(controller.get('model.image.url')).toEqual('http://pics.com/piccy.png');
        expect(button_set).toEqual(true);
        expect(controller.get('image_preview')).toEqual(null);
      });
    });
    it('should use license provided on preview if specified', function() {
      pictureGrabber.setup(button, controller);
      controller.set('image_preview', {url: '/logo.png', license: {type: 'Uncool', author_name: 'Bob'}});
      var correct_license = false;
      stub(editManager, 'change_button', function(id, args) { });
      queryLog.defineFixture({
        method: 'POST',
        type: 'image',
        compare: function(s) {
          correct_license = s.get('license.type') == 'Uncool' && s.get('license.author_name') == "Bob";
          return s.get('url') == '/logo.png';
        },
        response: RSVP.resolve({image: {id: '123', url: '/logo.png'}})
      });
      pictureGrabber.select_image_preview();
      waitsFor(function() { return correct_license; });
      runs();
    });
    it('should use license defined by user if none specified on the preview', function() {
      pictureGrabber.setup(button, controller);
      controller.set('image_preview', {url: '/logo.png'});
      var correct_license = false;
      stub(editManager, 'change_button', function(id, args) { });
      queryLog.defineFixture({
        method: 'POST',
        type: 'image',
        compare: function(s) {
          correct_license = s.get('license.type') == 'private' && s.get('license.author_name') == 'bob';
          return s.get('url') == '/logo.png';
        },
        response: RSVP.resolve({image: {id: '123', url: '/logo.png'}})
      });
      pictureGrabber.select_image_preview();
      waitsFor(function() { return correct_license; });
      runs();
    });

    describe('save_image_preview', function() {
      var valid_image = function() {
        var canvas = document.createElement('canvas');
        return canvas.toDataURL();
      };

      it('should read content type from a data url', function() {
        pictureGrabber.setup(button, controller);
        var image = null;
        stub(contentGrabbers, 'save_record', function(img) {
          image = img;
          return RSVP.resolve();
        });
        var done = false;
        pictureGrabber.save_image_preview({
          url: valid_image(),
          license: {type: 'CC By'}
        }).then(function() { done = true; }, function() { done = true; });
        waitsFor(function() { return done; });
        runs(function() {
          expect(image).toNotEqual(null);
          expect(image.get('content_type')).toEqual('image/png');
        });
      });

      it('should find a matching license url if missing', function() {
        pictureGrabber.setup(button, controller);
        var image = null;
        stub(contentGrabbers, 'save_record', function(img) {
          image = img;
          return RSVP.resolve();
        });
        var done = false;
        pictureGrabber.save_image_preview({
          url: valid_image(),
          license: {type: 'CC By'}
        }).then(function() { done = true; }, function() { done = true; });
        waitsFor(function() { return done; });
        runs(function() {
          expect(image).toNotEqual(null);
          expect(image.get('license.copyright_notice_url')).toEqual("http://creativecommons.org/licenses/by/4.0/");
        });
      });

      it('should load the image for measuring', function() {
        pictureGrabber.setup(button, controller);
        var image = null;
        stub(contentGrabbers, 'save_record', function(img) {
          image = img;
          return RSVP.resolve();
        });
        var done = false;
        pictureGrabber.save_image_preview({
          url: valid_image(),
          license: {type: 'CC By'}
        }).then(function() { done = true; }, function() { done = true; });
        waitsFor(function() { return done; });
        runs(function() {
          expect(image).toNotEqual(null);
          expect(image.get('width')).toEqual(300);
          expect(image.get('height')).toEqual(150);
        });
      });

      it('should create and save the record on successful measurement', function() {
        pictureGrabber.setup(button, controller);
        var image = null;
        stub(contentGrabbers, 'save_record', function(img) {
          image = img;
          return RSVP.resolve();
        });
        var done = false;
        pictureGrabber.save_image_preview({
          url: valid_image(),
          license: {type: 'CC By'}
        }).then(function() { done = true; }, function() { done = true; });
        waitsFor(function() { return done; });
        runs(function() {
          expect(image).toNotEqual(null);
        });
      });
    });
  });

  describe('searching for a picture', function() {
    it('should use the field value if a data-URI', function() {
      pictureGrabber.setup(button, controller);
      pictureGrabber.find_picture("data:image/png;base64,MA==");
      waitsFor(function() { return controller.get('image_preview'); });
      runs(function() {
        expect(controller.get('image_preview.url')).toEqual("data:image/png;base64,MA==");
      });
    });

    it('should request a proxy data-URI if value is a URL', function() {
      pictureGrabber.setup(button, controller);
      stub($, 'ajax', function(url, args) {
        return RSVP.resolve({
          data: "data:image/png;aaa===",
          content_type: "image/png"
        });
      });
      pictureGrabber.find_picture("http://pics.com/cow.png");
      waitsFor(function() { return controller.get('image_preview'); });
      runs(function() {
        expect(controller.get('image_preview.url')).toEqual("data:image/png;aaa===");
      });
    });

    it('should search for results with a remote call otherwise', function() {
      var promise = null;
      stub($, 'ajax', function(url, args) {
        promise = easyPromise();
        return promise;
      });
      pictureGrabber.setup(button, controller);
      pictureGrabber.find_picture("cow");
      expect(controller.get('image_preview')).toEqual(null);
      expect(controller.get('image_search.term')).toEqual("cow");
      promise.resolve([{id: 1}, {id: 2}]);
      waitsFor(function() { return controller.get('image_search.previews'); });
      runs(function() {
        expect(controller.get('image_search.previews')).toEqual([{id:1},{id:2}]);
      });
    });

    it('should search protected libraries, including user_name reference', function() {
      controller.set('image_library', 'lessonpix');
      pictureGrabber.setup(button, controller);
      var searched = false;
      stub(pictureGrabber, 'protected_search', function(text, library, user_name, fallback) {
        searched = true;
        expect(text).toEqual('frog');
        expect(user_name).toEqual('bob');
        expect(library).toEqual('lessonpix');
        expect(fallback).toEqual(undefined);
        return RSVP.reject({});
      });
      pictureGrabber.find_picture('frog', 'bob');
      expect(searched).toEqual(true);
    });
  });

  describe('webcam snapshot', function() {
    it('should request the camera and then set the stream', function() {
      pictureGrabber.setup(button, controller);
      var called = false;
      var mediaCallback = null;
      stashes.set('last_stream_id', null);
      stub(navigator, 'getUserMedia', function(args, callback) {
        called = callback && args.video === true;
        mediaCallback = callback;
      });
      pictureGrabber.start_webcam();
      expect(called).toEqual(true);

      var stream = fakeRecorder();
      mediaCallback(stream);
      expect(controller.get('webcam.stream')).toEqual(stream);
      expect(controller.get('webcam.showing')).toEqual(true);
    });

    it("should remember the last-selected webcam if there's a list", function() {
      pictureGrabber.setup(button, controller);
      var called = false;
      var mediaCallback = null;
      stashes.set('last_stream_id', 'abcdefg');

      stub(navigator, 'getUserMedia', function(args, callback) {
        called = callback && args.video && args.video.optional && args.video.optional[0] && args.video.optional[0].sourceId == 'abcdefg';
        mediaCallback = callback;
      });
      pictureGrabber.start_webcam();
      expect(called).toEqual(true);

      var stream = fakeRecorder();
      mediaCallback(stream);
      expect(controller.get('webcam.stream')).toEqual(stream);
      expect(controller.get('webcam.showing')).toEqual(true);
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
      pictureGrabber.setup(button, controller);
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
      pictureGrabber.start_webcam();
      expect(video_id).toEqual(null);

      var stream = fakeRecorder();
      mediaCallback(stream);
      expect(controller.get('webcam.stream')).toEqual(stream);
      expect(controller.get('webcam.showing')).toEqual(true);
      waitsFor(function() { return controller.get('webcam.video_streams'); });
      runs(function() {
        expect(controller.get('webcam.video_streams').length).toEqual(3);
        expect(controller.get('webcam.video_streams').mapBy('id')).toEqual(['aaa', 'ccc', 'ddd']);

        pictureGrabber.swap_streams();
        mediaCallback(stream);
        expect(video_id).toEqual('ccc');
        expect(stashes.get('last_stream_id')).toEqual('ccc');

        pictureGrabber.swap_streams();
        mediaCallback(stream);
        expect(video_id).toEqual('ddd');
        expect(stashes.get('last_stream_id')).toEqual('ddd');

        pictureGrabber.swap_streams();
        mediaCallback(stream);
        expect(video_id).toEqual('aaa');
        expect(stashes.get('last_stream_id')).toEqual('aaa');

        pictureGrabber.swap_streams();
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
      pictureGrabber.setup(button, controller);
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
      pictureGrabber.start_webcam();
      expect(video_id).toEqual('ccc');

      var stream = fakeRecorder();
      mediaCallback(stream);
      expect(controller.get('webcam.stream')).toEqual(stream);
      expect(controller.get('webcam.showing')).toEqual(true);
      waitsFor(function() { return controller.get('webcam.video_streams'); });
      runs(function() {
        expect(controller.get('webcam.video_streams').length).toEqual(3);
        expect(controller.get('webcam.video_streams').mapBy('id')).toEqual(['aaa', 'ccc', 'ddd']);

        pictureGrabber.swap_streams();
        mediaCallback(stream);
        expect(video_id).toEqual('ddd');
        expect(stashes.get('last_stream_id')).toEqual('ddd');

        pictureGrabber.swap_streams();
        mediaCallback(stream);
        expect(video_id).toEqual('aaa');
        expect(stashes.get('last_stream_id')).toEqual('aaa');

        pictureGrabber.swap_streams();
        mediaCallback(stream);
        expect(video_id).toEqual('ccc');
        expect(stashes.get('last_stream_id')).toEqual('ccc');

        pictureGrabber.swap_streams();
        mediaCallback(stream);
        expect(video_id).toEqual('ddd');
        expect(stashes.get('last_stream_id')).toEqual('ddd');
      });
    });

    it('should correctly toggle the webcam', function() {
      stub(document, 'querySelector', function(lookup) {
        if(lookup == '#webcam_canvas') {
          return fakeCanvas();
        }
      });
      pictureGrabber.setup(button, controller);
      controller.set('image_preview', {});
      controller.set('webcam', {snapshot: true, stream: fakeRecorder()});
      expect(controller.get('webcam.stream')).not.toEqual(null);
      pictureGrabber.toggle_webcam();
      expect(controller.get('image_preview')).toEqual(null);
      expect(controller.get('webcam.snapshot')).toEqual(false);
      expect(controller.get('webcam.stream')).not.toEqual(null);

      pictureGrabber.toggle_webcam();
      expect(controller.get('image_preview.url')).toEqual('picture');
      expect(controller.get('webcam.snapshot')).toEqual(true);
      expect(controller.get('image_preview.editor')).toEqual(null);
    });

    it('should stop the webcam on clear', function() {
      pictureGrabber.setup(button, controller);
      var mr = fakeRecorder();
      mr.state = 'recording';
      controller.set('webcam', {stream: mr});
      pictureGrabber.clear();
      expect(mr.stopped).toEqual(true);
      expect(controller.get('webcam')).toEqual(null);
    });
  });

  describe('size_image', function() {
    var small = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH4AIMFB0sPB1WqQAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAAA+klEQVR42u3b0QnAIAxF0ej+O+sEfohiwJwzwoPbQEsjAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACKaibYMmwpEPbCsKlAxGFXgXAnDtsKRBz2raGbADzhMq6HjV0QEAgIBBAICAQEAg94BbnmQyEuCHjC5VwR2wpEJHYVCP4HEQjHodgSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAr0yqXwscCyzAvgAAAABJRU5ErkJggg==";
    var bigger = "data:image/png;base64,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";

    it('should resolve with an image object', function() {
      queue_promise(pictureGrabber.size_image(small).then(function(res) {
        expect(res.width).toEqual(200);
        expect(res.url).toNotEqual(null);
      }, function() { expect(true).toEqual(false); }));
    });

    it('should do nothing if a url', function() {
      queue_promise(pictureGrabber.size_image("http://www.example.com/pic.png").then(function(res) {
        expect(res.url).toEqual("http://www.example.com/pic.png");
        expect(res.width).toEqual(undefined);
      }, function() { expect(true).toEqual(false); }));
    });

    it('should resize if a data uri larger than the default size', function() {
      queue_promise(pictureGrabber.size_image(bigger).then(function(res) {
        expect(res.width).toEqual(300);
        expect(res.url).toNotEqual(null);
      }, function() { expect(true).toEqual(false); }));
    });

    it('should not resize if a data uri smaller than the default size', function() {
      queue_promise(pictureGrabber.size_image(small).then(function(res) {
        expect(res.width).toEqual(200);
        expect(res.url).toNotEqual(null);
      }, function() { expect(true).toEqual(false); }));
    });
  });

  describe('save_image', function() {
    it('should create and save an image record for the data uri', function() {
      queryLog.defineFixture({
        method: 'POST',
        type: 'image',
        compare: function(s) { debugger; return s.get('data_url') == 'data:image/png;base64,MA=='; },
        response: RSVP.resolve({image: {id: '123', url: null, pending: true}})
      });
      stub(contentGrabbers, 'save_record', function(img) {
        return RSVP.resolve(img);
      });
      var record = null;
      pictureGrabber.save_image('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==').then(function(res) {
        record = res;
      }, function(err) {
        debugger;
      });
      waitsFor(function() { return record; });
      runs(function() {
        expect(record.get('height')).toEqual(5);
        expect(record.get('content_type')).toEqual('image/png');
        expect(record.get('url')).toNotEqual(undefined);
      });
    });
  });

  describe('word_art', function() {
    it('should set the correct parameters', function() {
      var controller = EmberObject.create();
      editManager.controller = controller;
      contentGrabbers.pictureGrabber.controller = controller;
      contentGrabbers.pictureGrabber.word_art('bacon');
      expect(editManager.stashedImage).toEqual({word: 'bacon'});
      expect(editManager.controller.get('image_preview')).toEqual({
        editor: true,
        word_editor: true,
        license: {
          type: 'CC By',
          copyright_notice_url: 'https://creativecommons.org/licenses/by/3.0/us/',
          author_name: 'LingoLinq-AAC',
          author_url: 'https://www.lingolinq.com',
          uneditable: true
        }
      });
      expect(controller.get('image_preview')).toEqual({
        editor: true,
        word_editor: true,
        license: {
          type: 'CC By',
          copyright_notice_url: 'https://creativecommons.org/licenses/by/3.0/us/',
          author_name: 'LingoLinq-AAC',
          author_url: 'https://www.lingolinq.com',
          uneditable: true
        }
      });
    });
  });

  describe("picture_search", function() {
    it('should call the correct library lookup', function() {
      var library = null;
      stub(contentGrabbers.pictureGrabber, 'open_symbols_search', function(str) {
        library = 'open_symbols';
        return RSVP.resolve([]);
      });
      stub(contentGrabbers.pictureGrabber, 'flickr_search', function(str) {
        library = 'flickr';
        return RSVP.resolve([]);
      });
      stub(contentGrabbers.pictureGrabber, 'public_domain_image_search', function(str) {
        library = 'public_domain';
        return RSVP.resolve([]);
      });
      stub(contentGrabbers.pictureGrabber, 'pixabay_search', function(str, type) {
        library = 'pixabay_' + type;
        return RSVP.resolve([]);
      });
      stub(contentGrabbers.pictureGrabber, 'protected_search', function(str, lib) {
        library = 'protected_' + lib;
        return RSVP.resolve([]);
      });
      stub(contentGrabbers.pictureGrabber, 'openclipart_search', function(str) {
        library = 'openclipart';
        return RSVP.resolve([]);
      });
      contentGrabbers.pictureGrabber.picture_search('chicken_nuggets', 'bacon');
      expect(library).toEqual('open_symbols');
      contentGrabbers.pictureGrabber.picture_search('flickr', 'bacon');
      expect(library).toEqual('flickr');
      contentGrabbers.pictureGrabber.picture_search('public_domain', 'bacon');
      expect(library).toEqual('public_domain');
      contentGrabbers.pictureGrabber.picture_search('pixabay_photos', 'bacon');
      expect(library).toEqual('pixabay_photo');
      contentGrabbers.pictureGrabber.picture_search(null, 'bacon');
      expect(library).toEqual('open_symbols');
      contentGrabbers.pictureGrabber.picture_search('pixabay_vectors', 'bacon');
      expect(library).toEqual('pixabay_vector');
      contentGrabbers.pictureGrabber.picture_search('lessonpix', 'bacon');
      expect(library).toEqual('protected_lessonpix');
      contentGrabbers.pictureGrabber.picture_search('openclipart', 'bacon');
      expect(library).toEqual('openclipart');
      contentGrabbers.pictureGrabber.picture_search('open_symbols', 'bacon');
      expect(library).toEqual('open_symbols');
    });

    it('should pass user_name and fallback parameters to protected_search', function() {
      var called = false;
      stub(contentGrabbers.pictureGrabber, 'protected_search', function(text, library, user_name, fallback) {
        called = true;
        expect(text).toEqual('rabbit');
        expect(user_name).toEqual('stacey');
        expect(library).toEqual('lessonpix');
        expect(fallback).toEqual(true);
      });
      contentGrabbers.pictureGrabber.picture_search('lessonpix', 'rabbit', 'stacey', true);
      expect(called).toEqual(true);
    });
  });

  describe("protected_search", function() {
    it('should make the correct query', function() {
      var u = LingoLinqAAC.store.createRecord('user', {user_token: 'token'});
      LingoLinqAAC.store.createRecord('image');
      app_state.set('currentUser', u);
      stub(persistence, 'ajax', function(url, opts) {
        expect(url).toEqual("/api/v1/search/protected_symbols?library=somewhere&q=hat&user_name=");
        return RSVP.resolve([
          {a: 1, image_url: '/api/v1/users/something/lessonpix'},
          {b: 1, image_url: '/api/v1/users/something/lessonpix2'}
        ]);
      });
      var result = null;
      contentGrabbers.pictureGrabber.protected_search('hat', 'somewhere').then(function(res) {
        result = res;
      });
      waitsFor(function() { return result; });
      runs(function() {
        expect(result).toEqual([
          {a: 1, image_url: '/api/v1/users/something/lessonpix?user_token=token'},
          {b: 1, image_url: '/api/v1/users/something/lessonpix2?user_token=token'}
        ]);
      });
    });

    it('should error on error', function() {
      stub(persistence, 'ajax', function(url, opts) {
        return RSVP.reject();
      });
      var error = null;
      contentGrabbers.pictureGrabber.protected_search('heart', 'chicken').then(null, function(err) {
        error = err;
      });
      waitsFor(function() { return error; });
      runs(function() {
        expect(error).toEqual('invalid search');
      });
    });

    it('should include user_name if defined', function() {
      var u = LingoLinqAAC.store.createRecord('user', {user_token: 'token'});
      LingoLinqAAC.store.createRecord('image');
      app_state.set('currentUser', u);
      stub(persistence, 'ajax', function(url, opts) {
        expect(url).toEqual("/api/v1/search/protected_symbols?library=somewhere&q=hat&user_name=jason");
        return RSVP.resolve([
          {a: 1, image_url: '/api/v1/users/something/lessonpix'},
          {b: 1, image_url: '/api/v1/users/something/lessonpix2'}
        ]);
      });
      var result = null;
      contentGrabbers.pictureGrabber.protected_search('hat', 'somewhere', 'jason').then(function(res) {
        result = res;
      });
      waitsFor(function() { return result; });
      runs(function() {
        expect(result).toEqual([
          {a: 1, image_url: '/api/v1/users/something/lessonpix?user_token=token'},
          {b: 1, image_url: '/api/v1/users/something/lessonpix2?user_token=token'}
        ]);
      });
    });

    it('should fall back to the default search on error if fallback is allowed', function() {
      var u = LingoLinqAAC.store.createRecord('user', {user_token: 'token'});
      LingoLinqAAC.store.createRecord('image');
      app_state.set('currentUser', u);
      stub(persistence, 'ajax', function(url, opts) {
        expect(url).toEqual("/api/v1/search/protected_symbols?library=somewhere&q=hat&user_name=jason");
        return RSVP.reject();
      });
      stub(contentGrabbers.pictureGrabber, 'open_symbols_search', function(text) {
        expect(text).toEqual('hat');
        return RSVP.resolve([
          {a: 1, image_url: 'http://www.example.com/pic.png'}
        ]);
      });
      var result = null;
      contentGrabbers.pictureGrabber.protected_search('hat', 'somewhere', 'jason', true).then(function(res) {
        result = res;
      });
      waitsFor(function() { return result; });
      runs(function() {
        expect(result).toEqual([
          {a: 1, image_url: 'http://www.example.com/pic.png'}
        ]);
      });
    });

    it('should not fall back if fallback is not allowed', function() {
      var u = LingoLinqAAC.store.createRecord('user', {user_token: 'token'});
      LingoLinqAAC.store.createRecord('image');
      app_state.set('currentUser', u);
      stub(persistence, 'ajax', function(url, opts) {
        expect(url).toEqual("/api/v1/search/protected_symbols?library=somewhere&q=hat&user_name=jason");
        return RSVP.reject();
      });
      var result = null;
      contentGrabbers.pictureGrabber.protected_search('hat', 'somewhere', 'jason', false).then(function(res) {
        result = res;
      }, function(err) { result = err; });
      waitsFor(function() { return result; });
      runs(function() {
        expect(result).toEqual('invalid search');
      });
    });
  });
});
