import {
  describe,
  it,
  xit,
  expect,
  beforeEach,
  afterEach,
  waitsFor,
  runs,
  stub
} from 'frontend/tests/helpers/jasmine';
import { fake_dbman } from 'frontend/tests/helpers/ember_helper';
import RSVP from 'rsvp';
import contentGrabbers from '../../utils/content_grabbers';
import EmberObject from '@ember/object';
import persistence from '../../utils/persistence';
import app_state from '../../utils/app_state';
import editManager from '../../utils/edit_manager';
import stashes from '../../utils/_stashes';
import progress_tracker from '../../utils/progress_tracker';
import { run as emberRun, later } from '@ember/runloop';

describe("contentGrabbers", function() {
  var button, controller;
  var pictureGrabber, soundGrabber, boardGrabber, linkGrabber;

  beforeEach(function() {
    pictureGrabber = contentGrabbers.pictureGrabber;
    soundGrabber = contentGrabbers.soundGrabber;
    boardGrabber = contentGrabbers.boardGrabber;
    linkGrabber = contentGrabbers.linkGrabber;
    stashes.flush();
    var obj = EmberObject.create({
      sentMessages: {},
      send: function(message) {
        this.sentMessages[message] = arguments;
      }
    });
    controller = EmberObject.extend({
      send: function(message) {
        this.sentMessages[message] = arguments;
      }
    }).create({
      'currentUser': EmberObject.create({user_name: 'bob'}),
      sentMessages: {},
      id: '456',
      licenseOptions: [],
      'board': obj
    });
    stub(app_state, 'controller', controller);
    stub(editManager, 'controller', obj);
    button = EmberObject.extend({
      findContentLocally: function() {
        this.foundContentLocally = true;
        return RSVP.resolve(true);
      }
    }).create();
    contentGrabbers.setup(button, controller);
    contentGrabbers.board_controller = controller.get('board');
  });

  describe("setup", function() {
    it("should setup all three sub-grabbers", function() {
      expect(pictureGrabber.controller).toEqual(controller);
      expect(soundGrabber.controller).toEqual(controller);
      expect(boardGrabber.controller).toEqual(controller);
      expect(pictureGrabber.button).toEqual(button);
      expect(soundGrabber.button).toEqual(button);
      expect(boardGrabber.button).toEqual(button);
    });

  });

  describe("clear", function() {
    it("should clear all three sub-grabbers", function() {
      controller.set('image_search', {});
      controller.set('sound_recording', {recording: true, media_recorder: {state: 'recording', stop: function() {}}});
      controller.set('foundBoards', {});
      contentGrabbers.clear();
      expect(controller.get('image_search')).toEqual(null);
      expect(controller.get('sound_recording.recording')).toEqual(false);
      expect(controller.get('foundBoards')).toEqual(null);
    });
  });

  describe("unlink", function() {
    it("should unlink all three sub-grabbers", function() {
      contentGrabbers.unlink();
      expect(pictureGrabber.controller).toEqual(null);
      expect(soundGrabber.controller).toEqual(null);
      expect(boardGrabber.controller).toEqual(null);
      expect(pictureGrabber.button).toEqual(null);
      expect(soundGrabber.button).toEqual(null);
      expect(boardGrabber.button).toEqual(null);
    });
  });

  describe("save_record", function() {
    it("should return a promise", function() {
      var obj = EmberObject.extend({
        save: function() { return RSVP.reject(); }
      }).create();
      var res = contentGrabbers.save_record(obj);
      expect(res.then).not.toEqual(null);
      res.then(null, function() {});
    });

    it("should save a data-uri attribute for later processing if set", function() {
      var obj = EmberObject.extend({
        save: function() { return RSVP.defer().promise; }
      }).create({
        url: "data:image/png;..."
      });
      var res = contentGrabbers.save_record(obj);
      expect(obj.get('url')).toEqual("data:image/png;...");
      expect(obj.get('data_url')).toEqual("data:image/png;...");
    });

    it("should save the record", function() {
      var defer = RSVP.defer();
      var save_called = false;
      var obj = EmberObject.extend({
        save: function() { save_called = true; return defer.promise; }
      }).create({
        url: "data:image/png;..."
      });
      var res = contentGrabbers.save_record(obj);
      expect(save_called).toEqual(true);
      expect(obj.get('url')).toEqual("data:image/png;...");
      expect(obj.get('data_url')).toEqual("data:image/png;...");
      defer.resolve(obj);
      res.then(function(result) {
        expect(result).toEqual(obj);
      });

      waitsFor(function() { return obj.get('url'); });
      runs(function() {
        expect(obj.get('data_url')).toEqual("data:image/png;...");
        expect(obj.get('url')).toEqual("data:image/png;...");
      });
    });

    it("should call upload_to_remote if returned result is pending", function() {
      var defer = RSVP.defer();
      var save_called = false;
      var obj = EmberObject.extend({
        save: function() { save_called = true; return defer.promise; }
      }).create({
        url: "data:image/png;...",
        pending: true
      });
      stub(persistence, 'meta', function(model, obj) {
        return {remote_upload: {a: 2}};
      });

      var uploadArgs = null;
      stub(contentGrabbers, 'upload_to_remote', function(args) {
        uploadArgs = args;
        return RSVP.defer().promise;
      });
      var res = contentGrabbers.save_record(obj);
      defer.resolve(obj);

      waitsFor(function() { return uploadArgs; });
      runs(function() {
        expect(uploadArgs.data_url).toEqual("data:image/png;...");
        expect(uploadArgs.a).toEqual(2);
      });
    });

    it("should error if no metadata (remote upload parameters) are provided", function() {
      var defer = RSVP.defer();
      var save_called = false;
      var obj = EmberObject.extend({
        save: function() { save_called = true; return defer.promise; }
      }).create({
        url: "data:image/png;...",
        pending: true
      });
      var rejected = false;
      stub(persistence, 'meta', function(model, obj) {
        return null;
      });

      var uploadArgs = null;
      stub(contentGrabbers, 'upload_to_remote', function(args) {
        uploadArgs = args;
        return RSVP.defer().promise;
      });
      var res = contentGrabbers.save_record(obj);
      defer.resolve(obj);
      res.then(null, function() {
        rejected = true;
      });

      waitsFor(function() { return rejected; });
      runs();
    });

    it("should error on failed save", function() {
      var defer = RSVP.defer();
      var obj = EmberObject.extend({
        save: function() { return defer.promise; }
      }).create({
        url: "data:image/png;...",
        pending: true
      });

      var res = contentGrabbers.save_record(obj);
      defer.reject({'123': 'abc'});

      var rejection = null;
      res.then(null, function(arg) { rejection = arg; });

      waitsFor(function() { return rejection; });
      runs(function() {
        expect(rejection).toEqual({'error': 'record failed to save', 'ref': {'123': "abc"}});
      });
    });

    it("should error on failed remote upload", function() {
      var defer = RSVP.defer();
      var defer2 = RSVP.defer();
      var save_called = false;
      var obj = EmberObject.extend({
        save: function() { save_called = true; return defer.promise; }
      }).create({
        url: "data:image/png;...",
        pending: true
      });
      stub(persistence, 'meta', function(model, obj) {
        return {remote_upload: {a: 2}};
      });
      stub(contentGrabbers, 'upload_to_remote', function(args) {
        later(function() {
          defer2.reject({
            abc: "123"
          });
        });
        return defer2.promise;
      });
      var res = contentGrabbers.save_record(obj);
      defer.resolve(obj);

      var rejection = null;
      res.then(null, function(arg) { rejection = arg; });

      waitsFor(function() { return rejection; });
      runs(function() {
        expect(rejection).toEqual({abc: "123"});
      });
    });

    it("should resolve on successful pending upload process, returning the original object", function() {
      var defer = RSVP.defer();
      var defer2 = RSVP.defer();
      var save_called = false;
      var obj = EmberObject.extend({
        save: function() { save_called = true; return defer.promise; }
      }).create({
        url: "data:image/png;...",
        pending: true
      });
      stub(persistence, 'meta', function(model, obj) {
        return {remote_upload: {a: 2}};
      });

      stub(contentGrabbers, 'upload_to_remote', function(args) {
        return defer2.promise;
      });
      var res = contentGrabbers.save_record(obj);
      defer.resolve(obj);

      defer2.resolve({
        confirmed: true,
        url: "http://pics.example.com/pic.png"
      });

      waitsFor(function() { return obj.get('pending') === false; });
      runs(function() {
        expect(obj.get('pending')).toEqual(false);
        expect(obj.get('url')).toEqual("http://pics.example.com/pic.png");
      });
    });

    it("should request proxied data url for records with a url but no data url", function() {
      var defer = RSVP.defer();
      var defer2 = RSVP.defer();
      var save_called = false;
      var obj = EmberObject.extend({
        save: function() { save_called = true; return defer.promise; }
      }).create({
        url: "http://www.example.com/pic.png",
        pending: true
      });
      stub(persistence, 'meta', function(model, obj) {
        return {remote_upload: {a: 2}};
      });
      stub(persistence, 'ajax', function(url, opts) {
        if(url == '/api/v1/search/proxy?url=' + encodeURIComponent('http://www.example.com/pic.png')) {
          return RSVP.resolve({
            data: "data:image/png;..."
          });
        } else {
          return RSVP.reject();
        }
      });

      stub(contentGrabbers, 'upload_to_remote', function(args) {
        expect(args.data_url).toEqual('data:image/png;...');
        expect(args.a).toEqual(2);
        return defer2.promise;
      });
      var res = contentGrabbers.save_record(obj);
      defer.resolve(obj);

      defer2.resolve({
        confirmed: true,
        url: "http://pics.example.com/pic2.png"
      });

      waitsFor(function() { return obj.get('pending') === false; });
      runs(function() {
        expect(obj.get('pending')).toEqual(false);
        expect(obj.get('url')).toEqual("http://pics.example.com/pic2.png");
      });
    });
  });

  describe("picture_search", function() {
    xit("should search for pcs symbols correctly", function() {
    });
    xit("should search for symbolstix symbols correctly", function() {
    });
  });

  describe("upload_to_remote", function() {
    it("should return a promise", function() {
      var params = {
        upload_params: {},
        upload_url: "/upload",
        success_url: "/success",
        data_url: "data:image/png;..."
      };
      var res = contentGrabbers.upload_to_remote(params);
      expect(res.then).not.toEqual(null);
      res.then(null, function() { });
    });
    it("should generate a valid FormData object and use it to make an ajax call", function() {
      var upload_args = null;
      stub(persistence, 'ajax', function(args) {
        upload_args = args;
        return RSVP.reject();
      });
      var params = {
        upload_params: {},
        upload_url: "/upload",
        success_url: "/success",
        data_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=="
      };
      var res = contentGrabbers.upload_to_remote(params);
      res.then(null, function() { });

      waitsFor(function() { return upload_args; });
      runs(function() {
        expect(upload_args.url).toEqual("/upload");
        expect(upload_args.type).toEqual("POST");
        expect(upload_args.data instanceof window.FormData).toEqual(true);
        expect(upload_args.processData).toEqual(false);
        expect(upload_args.contentType).toEqual(false);
      });
    });
    it("should call the success_url on successful upload", function() {
      var upload_args = null, success_args = null;
      stub(persistence, 'ajax', function(args) {
        if(args.url == '/upload') {
          upload_args = args;
          return RSVP.resolve();
        } else if(args.url == '/success') {
          success_args = args;
          return RSVP.resolve({happy: true});
        }
      });
      var params = {
        upload_params: {},
        upload_url: "/upload",
        success_url: "/success",
        data_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=="
      };
      var res = contentGrabbers.upload_to_remote(params);
      var resolution = null;
      res.then(function(data) { resolution = data; }, function() { });

      waitsFor(function() { return resolution; });
      runs(function() {
        expect(success_args.type).toEqual('GET');
        expect(resolution.happy).toEqual(true);
      });
    });
    it("should reject on bad ajax upload", function() {
      var upload_args = null, success_args = null;
      stub(persistence, 'ajax', function(args) {
        if(args.url == '/upload') {
          upload_args = args;
          return RSVP.reject();
        }
      });
      var params = {
        upload_params: {},
        upload_url: "/upload",
        success_url: "/success",
        data_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=="
      };
      var res = contentGrabbers.upload_to_remote(params);
      var failed = null;
      res.then(function(data) { }, function() { failed = true; });

      waitsFor(function() { return failed; });
      runs();
    });
    it("should reject on bad success callback", function() {
      var upload_args = null, success_args = null;
      stub(persistence, 'ajax', function(args) {
        if(args.url == '/upload') {
          upload_args = args;
          return RSVP.resolve();
        } else if(args.url == '/success') {
          success_args = args;
          return RSVP.reject({happy: true});
        }
      });
      var params = {
        upload_params: {},
        upload_url: "/upload",
        success_url: "/success",
        data_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=="
      };
      var res = contentGrabbers.upload_to_remote(params);
      var failed = null;
      res.then(function(data) { }, function() { failed = true; });

      waitsFor(function() { return failed; });
      runs();
    });
  });

  describe("file_dropped", function() {
    beforeEach(function() {
      stub(contentGrabbers, 'check_for_dropped_file', function() {});
    });

    it("should set droppedFile", function() {
      var file = {a: 1};
      contentGrabbers.board_controller = controller.get('board');
      contentGrabbers.file_dropped('abc', 'image', file);
      expect(contentGrabbers.droppedFile.type).toEqual('image');
      expect(contentGrabbers.droppedFile.file).toEqual(file);
    });
    it("should trigger the button dialog, which will then check for a dropped file", function() {
      var file = {a: 1};
      contentGrabbers.board_controller = controller.get('board');
      contentGrabbers.file_dropped('abc', 'image', file);
      expect(controller.get('board').sentMessages['buttonSelect']).not.toEqual(null);
    });
  });

  describe("file_pasted", function() {
    it("should call file_selected with the first matching image", function() {
      var image = null;
      var i1 = {type: 'video/mp4'};
      var i2 = {type: 'image/png'};
      stub(i2, 'getAsFile', function() { return 'asdfasdf'; });
      stub(pictureGrabber, 'file_selected', function(r) {
        image = r;
      });
      contentGrabbers.file_pasted('image', [
        i1, i2
      ]);
      expect(image).toEqual('asdfasdf');
    });
  });

  describe("check_for_dropped_file", function() {
    it("should call the correct handler for the dropped file/link type", function() {
      contentGrabbers.droppedFile = {
        file: {url: "happy"}
      };
      var callee = null;
      stub(pictureGrabber, 'web_image_dropped', function() {
        callee = 'pictureGrabber.web_image_dropped';
      });
      stub(pictureGrabber, 'file_selected', function() {
        callee = 'pictureGrabber.file_selected';
      });
      stub(soundGrabber, 'file_selected', function() {
        callee = 'soundGrabber.file_selected';
      });
      contentGrabbers.check_for_dropped_file();
      expect(callee).toEqual('pictureGrabber.web_image_dropped');

      contentGrabbers.droppedFile = {
        type: 'image',
        file: {}
      };
      contentGrabbers.check_for_dropped_file();
      expect(callee).toEqual('pictureGrabber.file_selected');

      contentGrabbers.droppedFile = {
        type: 'sound',
        file: {}
      };
      contentGrabbers.check_for_dropped_file();
      expect(callee).toEqual('soundGrabber.file_selected');
    });
  });

  describe("file_selected", function() {
    var files = [{
        type: 'image/png'
      }, {
        type: 'audio/mp3'
      }];
    it("should look for the first image or audio, but only handle one", function() {
      var callees = [];
      stub(pictureGrabber, 'file_selected', function(image) {
        callees.push({type: 'image', file: image});
      });
      stub(soundGrabber, 'file_selected', function(image) {
        callees.push({type: 'sound', file: image});
      });
      contentGrabbers.file_selected('image', files);
      expect(callees).toEqual([{type: 'image', file: files[0]}]);
      callees = [];
      contentGrabbers.file_selected('sound', files);
      expect(callees).toEqual([{type: 'sound', file: files[1]}]);
    });
    it("should alert with error messages", function() {
      var alert_message = null;
      stub(window, 'alert', function(message) {
        alert_message = message;
      });
      contentGrabbers.file_selected('image', []);
      expect(alert_message).toEqual("No valid image found");
      contentGrabbers.file_selected('sound', []);
      expect(alert_message).toEqual("No valid sound found");
      contentGrabbers.file_selected('bacon', []);
      expect(alert_message).toEqual("bad file");
    });
    it("should treat audio files with empty or video MIME as sounds by extension", function() {
      var chosen = [];
      stub(soundGrabber, 'file_selected', function(file) {
        chosen.push(file);
      });
      stub(window, 'alert', function() { });
      var emptyMp3 = {type: '', name: 'beep.mp3'};
      contentGrabbers.file_selected('sound', [emptyMp3]);
      expect(chosen).toEqual([emptyMp3]);
      chosen = [];
      var m4aAsVideo = {type: 'video/mp4', name: 'clip.m4a'};
      contentGrabbers.file_selected('sound', [m4aAsVideo]);
      expect(chosen).toEqual([m4aAsVideo]);
      chosen = [];
      var wavOctet = {type: 'application/octet-stream', name: 'drum.wav'};
      contentGrabbers.file_selected('sound', [wavOctet]);
      expect(chosen).toEqual([wavOctet]);
    });
    it("should still reject non-audio files for sound upload", function() {
      var called = false;
      stub(soundGrabber, 'file_selected', function() {
        called = true;
      });
      var alert_message = null;
      stub(window, 'alert', function(message) {
        alert_message = message;
      });
      contentGrabbers.file_selected('sound', [{type: 'image/png', name: 'pic.png'}]);
      expect(called).toEqual(false);
      expect(alert_message).toEqual("No valid sound found");
    });

    it("should call recording_selected when appropriate", function() {
      var file = null;
      var i1 = {type: 'application/zip', name: 'something.zip'};
      var i2 = {type: 'audio/mp3', name: 'something.mp3'};
      var i3 = {type: 'image/png', name: 'something.png'};
      stub(soundGrabber, 'recording_selected', function(r) {
        file = r;
      });
      contentGrabbers.file_selected('recording', [
        i1, i2
      ]);
      expect(file.name).toEqual('something.zip');
      contentGrabbers.file_selected('recording', [
        i2, i1
      ]);
      expect(file.name).toEqual('something.zip');
      contentGrabbers.file_selected('recording', [
        i2, i3
      ]);
      expect(file.name).toEqual('something.mp3');
      contentGrabbers.file_selected('recording', [
        i3
      ]);
      expect(file).toEqual(null);
    });
  });

  describe("content_dropped", function() {
    it("should call file_dropped if a picture (link) was dropped", function() {
      stashes.set('current_mode', 'edit');
      app_state.set('currentBoardState', {});
      expect(app_state.get('edit_mode')).toEqual(true);

      var args = null;
      stub(contentGrabbers, 'file_dropped', function() {
        args = [];
        for(var idx = 0; idx < arguments.length; idx++) {
          args.push(arguments[idx]);
        }
      });
      contentGrabbers.content_dropped('abc', {
        files: [],
        items: [{}, {
          getAsString: function(callback) {
            callback("bob");
          }
        }],
        types: ["", "text/uri-list"]
      });
      waitsFor(function() { return args; });
      runs(function() {
        expect(args).toEqual(['abc', 'image', {url: 'bob'}]);
      });
    });
    it("should call file_dropped for image or audio file objects", function() {
      stashes.set('current_mode', 'edit');
      app_state.set('currentBoardState', {});
      expect(app_state.get('edit_mode')).toEqual(true);

      var args = null;
      stub(contentGrabbers, 'file_dropped', function() {
        args = [];
        for(var idx = 0; idx < arguments.length; idx++) {
          args.push(arguments[idx]);
        }
      });
      contentGrabbers.content_dropped('abc', {
        files: [{type: ""}, {
          type: 'image/png'
        }]
      });
      expect(args).toEqual(['abc', 'image', {type: 'image/png'}]);

      contentGrabbers.content_dropped('abc', {
        files: [{type: ""}, {
          type: 'audio/mp3'
        }]
      });
      expect(args).toEqual(['abc', 'sound', {type: 'audio/mp3'}]);
    });
    it("should do nothing when not in edit mode", function() {
      stashes.set('current_mode', 'default');
      expect(app_state.get('edit_mode')).toEqual(false);

      var args = null;
      stub(contentGrabbers, 'file_dropped', function() {
        args = arguments;
      });
      contentGrabbers.content_dropped('abc', {
        files: [{type: ""}, {
          type: 'image/png'
        }]
      });
      expect(args).toEqual(null);
    });
    it("should alert for unrecognized drop types", function() {
      var message = null;
      stub(window, 'alert', function(m) { message = m; });
      stashes.set('current_mode', 'edit');
      app_state.set('currentBoardState', {});
      expect(app_state.get('edit_mode')).toEqual(true);
      contentGrabbers.content_dropped('abc', {files: [], items: []});
      expect(message).toEqual("Unrecognized drop type");

      contentGrabbers.content_dropped('abc', {
        files: [{type: ""}]
      });
      expect(message).toEqual("No valid images or sounds found");

      contentGrabbers.content_dropped('abc', {
        files: [],
        items: [{}],
        types: []
      });
      expect(message).toEqual("Unrecognized drop type");
    });
  });

  describe("read_file", function() {
    it("should return a promise", function() {
      var blob = new window.Blob([0], {type: 'image/png'});
      expect(contentGrabbers.read_file(blob).then).not.toEqual(null);
    });
    it("should read file contents and return them as a data URI", function() {
      var blob = new window.Blob([0], {type: 'image/png'});
      var data_returned = false;
      contentGrabbers.read_file(blob).then(function(data) {
        data_returned = data.target.result == "data:image/png;base64,MA==";
      });
      waitsFor(function() { return data_returned; });
      runs();
    });
  });

  describe("upload_for_processing", function() {
    it('should read the file', function() {
      var f = {name: 'file.txt', type: 'text/zip'};
      stub(contentGrabbers, 'read_file', function(file) {
        expect(file).toEqual(f);
        return RSVP.reject({a: 1});
      });
      var p = contentGrabbers.upload_for_processing(f, 'api/url', {a: 2}, EmberObject.create());
      var result = null;
      var error = null;
      p.then(function(res) { result = res; }, function(err) { error = err; });
      waitsFor(function() { return error; });
      runs(function() {
        expect(error).toEqual({a: 1});
      });
    });

    it('should post to the URL', function() {
      var f = {name: 'file.txt', type: 'text/zip'};
      stub(contentGrabbers, 'read_file', function(file) {
        expect(file).toEqual(f);
        return RSVP.resolve({
          target: {
            result: 'asdf'
          }
        });
      });
      stub(persistence, 'ajax', function(url, opts) {
        expect(url).toEqual('api/url');
        expect(opts).toEqual({
          type: 'POST',
          data: {a: 2}
        });
        return RSVP.reject({b: 1});
      });
      var p = contentGrabbers.upload_for_processing(f, 'api/url', {a: 2}, EmberObject.create());
      var result = null;
      var error = null;
      p.then(function(res) { result = res; }, function(err) { error = err; });
      waitsFor(function() { return error; });
      runs(function() {
        expect(error).toEqual({b: 1});
      });
    });

    it('should call upload_to_remote', function() {
      var f = {name: 'file.txt', type: 'text/zip'};
      stub(contentGrabbers, 'read_file', function(file) {
        expect(file).toEqual(f);
        return RSVP.resolve({
          target: {
            result: 'asdf'
          }
        });
      });
      stub(persistence, 'ajax', function(url, opts) {
        expect(url).toEqual('api/url');
        expect(opts).toEqual({
          type: 'POST',
          data: {a: 2}
        });
        return RSVP.resolve({remote_upload: {}});
      });
      stub(contentGrabbers, 'upload_to_remote', function(opts) {
        expect(opts).toEqual({data_url: 'asdf', success_method: 'POST'});
        return RSVP.resolve({progress: {c: 1}});
      });
      stub(progress_tracker, 'track', function(progress, callback) {
        expect(progress).toEqual({c: 1});
        callback({status: 'errored'});
      });
      var prog = EmberObject.create();
      var p = contentGrabbers.upload_for_processing(f, 'api/url', {a: 2}, prog);
      var result = null;
      var error = null;
      p.then(function(res) { result = res; }, function(err) { error = err; });
      waitsFor(function() { return error; });
      runs(function() {
        expect(prog.get('status')).toEqual({errored: true});
        expect(error).toEqual({error: 'processing failed'});
      });
    });

    it('should track progress', function() {
      var f = {name: 'file.txt', type: 'text/zip'};
      stub(contentGrabbers, 'read_file', function(file) {
        expect(file).toEqual(f);
        return RSVP.resolve({
          target: {
            result: 'asdf'
          }
        });
      });
      stub(persistence, 'ajax', function(url, opts) {
        expect(url).toEqual('api/url');
        expect(opts).toEqual({
          type: 'POST',
          data: {a: 2}
        });
        return RSVP.resolve({remote_upload: {}});
      });
      stub(contentGrabbers, 'upload_to_remote', function(opts) {
        expect(opts).toEqual({data_url: 'asdf', success_method: 'POST'});
        return RSVP.resolve({progress: {c: 1}});
      });
      stub(progress_tracker, 'track', function(progress, callback) {
        expect(progress).toEqual({c: 1});
        callback({status: 'finished', result: 'winning'});
      });
      var prog = EmberObject.create();
      var p = contentGrabbers.upload_for_processing(f, 'api/url', {a: 2}, prog);
      var result = null;
      var error = null;
      p.then(function(res) { result = res; }, function(err) { error = err; });
      waitsFor(function() { return result; });
      runs(function() {
        expect(prog.get('status')).toEqual({finished: true});
        expect(result).toEqual('winning');
      });
    });

    it('should return a promise', function() {
      var f = {name: 'file.txt', type: 'text/zip'};
      stub(contentGrabbers, 'read_file', function(file) {
        expect(file).toEqual(f);
        return RSVP.reject({a: 1});
      });
      var p = contentGrabbers.upload_for_processing(f, 'api/url', {a: 2}, EmberObject.create());
      expect(p).not.toEqual(null);
      expect(p.then).not.toEqual(null);
      p.then(null, function() { });
    });
  });
});
