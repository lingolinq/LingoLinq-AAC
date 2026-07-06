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
import { fakeRecorder, queryLog, stubNavigatorGetUserMedia, fakeMediaRecorder } from 'frontend/tests/helpers/ember_helper';
import RSVP from 'rsvp';
import contentGrabbers from '../../utils/content_grabbers';
import editManager from '../../utils/edit_manager';
import app_state from '../../utils/app_state';
import modal from '../../utils/modal';
import Utils from '../../utils/misc';
import EmberObject from '@ember/object';

describe('soundGrabber', function() {
  var soundGrabber;
  var navigator = window.navigator;
  var wav_data_uri = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

  var controller = null;
  var button = null;
  var recorder = fakeRecorder();

  beforeEach(function() {
    soundGrabber = contentGrabbers.soundGrabber;
    contentGrabbers.unlink();
    var obj = EmberObject.create({
    });
    controller = EmberObject.extend({
      send: function(message) {
        this.sentMessages[message] = arguments;
      },
      model: EmberObject.create({id: '456'})
    }).create({
      'currentUser': EmberObject.create({user_name: 'bob', profile_url: 'http://www.bob.com/bob'}),
      sentMessages: {},
      licenseOptions: [],
      'board': obj
    });
    app_state.set('currentUser', controller.get('currentUser'));
    stub(app_state, 'controller', controller);
    stub(editManager, 'controller', obj);
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
      button.set('sound', {id: 1, check_for_editable_license:function() { checked = true; }});
      stub(button, 'findContentLocally', function() {
        return RSVP.resolve();
      });
      soundGrabber.setup(button, controller);
      waitsFor(function() { return checked; });
      runs(function() {
        expect(soundGrabber.controller).toEqual(controller);
        expect(soundGrabber.button).toEqual(button);
      });
    });
  });

  describe('clearing', function() {
    it('should clear uploaded or recorded sounds properly', function() {
      soundGrabber.setup(button, controller);
      controller.set('sound_preview', {});
      soundGrabber.clear_sound_work();
      expect(controller.get('sound_preview')).toEqual(null);

      var mr = fakeRecorder();
      mr.state = 'recording';
      controller.set('sound_recording', {media_recorder: mr});
      soundGrabber.clear();
      expect(mr.stopped).toEqual(true);
      expect(controller.get('sound_recording').recording).toEqual(false);
    });
  });

  describe('license tracking', function() {
    it('should return correctly license type when set, defaulting to private', function() {
      soundGrabber.setup(button, controller);
      expect(controller.get('sound_preview.license')).toEqual(undefined);
      controller.set('sound_preview', {});
      expect(controller.get('sound_preview.license.type')).toEqual('private');
      controller.set('sound_preview', {license: {type: 'abc'}});
      expect(controller.get('sound_preview.license.type')).toEqual('abc');
    });
    it('should set default license settings on sound_preview when it changes', function() {
      soundGrabber.setup(button, controller);
      expect(controller.get('sound_preview')).toEqual(undefined);
      controller.set('sound_preview', {});
      expect(controller.get('sound_preview.license.author_name')).toEqual('bob');
      expect(controller.get('sound_preview.license.author_url')).toMatch(/\/bob$/);
    });
  });

  describe('file selection', function() {
    it('should set data from the provided file on the controller', function() {
      soundGrabber.setup(button, controller);
      var file = new window.Blob([0], {type: 'audio/wav'});
      file.name = "bob.wav";
      soundGrabber.file_selected(file);
      waitsFor(function() { return controller.get('sound_preview'); });
      runs(function() {
        expect(controller.get('sound_preview.name')).toEqual('bob.wav');
        expect(controller.get('sound_preview.url')).toEqual('data:audio/wav;base64,MA==');
      });
    });
  });

  describe('recording sound', function() {
    beforeEach(function() {
      stub(window, 'MediaRecorder', function(stream) {
        return fakeMediaRecorder(stream);
      });
    });

    it('should initialize recording process', function() {
      soundGrabber.setup(button, controller);
      var called = false;
      stubNavigatorGetUserMedia({
        onLegacyCall: function(args) {
          called = args.audio === true;
        }
      });
      soundGrabber.record_sound();
      waitsFor(function() { return called; });
      runs(function() {
        expect(called).toEqual(true);
      });
    });
    it('should toggle recording on and off', function() {
      soundGrabber.setup(button, controller);
      var mr = fakeRecorder();
      mr.state = 'recording';
      controller.set('sound_recording', {media_recorder: mr, recording: true});

      soundGrabber.toggle_recording_sound('stop');
      expect(mr.stopped).toEqual(true);
      expect(mr.started).not.toEqual(true);
      expect(controller.get('sound_recording').recording).toEqual(false);
      mr.state = 'inactive';

      soundGrabber.toggle_recording_sound('start');
      waitsFor(function() { return mr.started; });
      runs(function() {
        expect(mr.started).toEqual(true);
        expect(controller.get('sound_recording').recording).toEqual(true);
      });
    });

    it('should trigger the native recording if possible on toggle_recording_sound', function() {
      soundGrabber.setup(button, controller);
      var mr = fakeRecorder();
      mr.state = 'recording';
      controller.set('sound_recording', null);

      var called = false;
      stub(soundGrabber, 'native_record_sound', function() {
        called = true;
      });
      stub(contentGrabbers, 'capture_types', function() {
        return {audio: true};
      });
      navigator.getUserMedia = undefined;
      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = undefined;
      }
      stub(navigator, 'device', {
        capture: {
          captureAudio: function() { }
        }
      });

      soundGrabber.toggle_recording_sound('start');
      waitsFor(function() { return called; });
      runs();
    });

    it('should set data on the controller when recording is finished', function() {
      function MR2(stream) {
        this.stream = stream;
        var events = {};
        this.addEventListener = function(key, callback) {
          events[key] = callback;
        };
        this.trigger = function(key, data) {
          if(events[key]) {
            events[key](data);
          }
        };
      }
      var stash = window.MediaRecorder;
      window.MediaRecorder = MR2;
      soundGrabber.setup(button, controller);

      var stream = fakeRecorder();
      stubNavigatorGetUserMedia({ stream: stream });
      soundGrabber.record_sound();

      waitsFor(function() { return controller.get('sound_recording.media_recorder'); });
      runs(function() {
        var mr = controller.get('sound_recording.media_recorder');
        expect(mr.stream).toEqual(stream);
        expect(controller.get('sound_recording.stream')).toEqual(stream);

        var blob = new window.Blob([0], {type: 'audio/webm'});
        mr.trigger('dataavailable', {data: blob});
        expect(controller.get('sound_recording.blob')).toEqual(blob);

        mr.trigger('recordingdone');
      });
      waitsFor(function() { return controller.get('sound_preview'); });
      runs(function() {
        expect(controller.get('sound_preview.url')).toEqual("data:audio/webm;base64,MA==");
        expect(controller.get('sound_preview.name')).toEqual("Recorded sound");
        window.MediaRecorder = stash;
      });
    });
  });

  describe('save_pending', function() {
    it('should save image_preview if defined');
    it('should save image license settings only if changed');
  });

  describe('applying provided sound', function() {
    it('should do nothing if there isn\'t a sound_preview', function() {
      soundGrabber.select_sound_preview();
      expect((queryLog[queryLog.length - 1] || {}).method).not.toEqual('POST');
    });
    it('should create a new sound record correctly', function() {
      soundGrabber.setup(button, controller);
      controller.set('sound_preview', {url: '/beep.mp3'});
      var button_set = false;
      stub(editManager, 'change_button', function(id, args) {
        if(id == '456' && args.sound_id == '123') { button_set = true; }
      });
      queryLog.defineFixture({
        method: 'POST',
        type: 'sound',
        compare: function(s) { return s.get('url') == '/beep.mp3'; },
        response: RSVP.resolve({sound: {id: '123', url: '/beep.mp3'}})
      });
      soundGrabber.select_sound_preview();
      waitsFor(function() { return controller.get('model.sound'); });
      runs(function() {
        expect(controller.get('model.sound.id')).toEqual('123');
        expect(controller.get('model.sound.url')).toEqual('/beep.mp3');
        expect(button_set).toEqual(true);
        expect(controller.get('sound_preview')).toEqual(null);
      });
    });

    it('should use license provided on preview if specified', function() {
      soundGrabber.setup(button, controller);
      controller.set('sound_preview', {url: '/beep.mp3', license: {type: 'Cool', author_name: 'Bob'}});
      var correct_license = false;
      stub(editManager, 'change_button', function(id, args) { });
      queryLog.defineFixture({
        method: 'POST',
        type: 'sound',
        compare: function(s) {
          correct_license = s.get('license.type') == 'Cool' && s.get('license.author_name') == "Bob";
          return s.get('url') == '/beep.mp3';
        },
        response: RSVP.resolve({sound: {id: '123', url: '/beep.mp3'}})
      });
      soundGrabber.select_sound_preview();
      waitsFor(function() { return correct_license; });
      runs();
    });
    it('should use license defined by user if none specified on the preview', function() {
      soundGrabber.setup(button, controller);
      controller.set('sound_preview', {url: '/beep.mp3'});
      var correct_license = false;
      stub(editManager, 'change_button', function(id, args) { });
      queryLog.defineFixture({
        method: 'POST',
        type: 'sound',
        compare: function(s) {
          correct_license = s.get('license.type') == 'private' && s.get('license.author_name') == 'bob';
          return s.get('url') == '/beep.mp3';
        },
        response: RSVP.resolve({sound: {id: '123', url: '/beep.mp3'}})
      });
      soundGrabber.select_sound_preview();
      waitsFor(function() { return correct_license; });
      runs();
    });

    it('should take the preview as an argument if specified', function() {
      var sound = null;
      stub(contentGrabbers, 'save_record', function(s) {
        sound = s;
        return RSVP.resolve(EmberObject.create());
      });
      soundGrabber.select_sound_preview({
        url: wav_data_uri,
        name: "sound.wav",
        transcription: 'hello my friend'
      });
      waitsFor(function() { return sound; });
      runs(function() {
        expect(sound.get('url')).toEqual(wav_data_uri);
        expect(sound.get('name')).toEqual('sound.wav');
        expect(sound.get('transcription')).toEqual('hello my friend');
        expect(sound.get('duration')).toEqual(0.000023);
        expect(sound.get('license')).toEqual({copyright_notice_url: null});
      });
    });

    it('should include the transcription if defined', function() {
      var sound = null;
      stub(contentGrabbers, 'save_record', function(s) {
        sound = s;
        return RSVP.resolve(EmberObject.create());
      });
      soundGrabber.select_sound_preview({
        url: wav_data_uri,
        name: "sound.wav",
        transcription: 'hello my friend'
      });
      waitsFor(function() { return sound; });
      runs(function() {
        expect(sound.get('url')).toEqual(wav_data_uri);
        expect(sound.get('name')).toEqual('sound.wav');
        expect(sound.get('transcription')).toEqual('hello my friend');
        expect(sound.get('duration')).toEqual(0.000023);
        expect(sound.get('license')).toEqual({copyright_notice_url: null});
      });
    });
  });

  describe("play_audio", function() {
    it('should toggle playing correctly', function() {
      var callbacks = {};
      var elem = {
        addEventListener: function(event, callback) {
          callbacks[event] = callback;
        },
        currentTime: 0,
        paused: false,
        pause: function() {
          elem.paused = true;
          if(callbacks['paused']) { callbacks['paused'](); }
        },
        play: function() {
          elem.paused = false;
          elem.currentTime = 5;
          setTimeout(function() {
            if(!elem.paused) {
              elem.paused = true;
              if(callbacks['ended']) {
                callbacks['ended']();
              }
            }
          }, 50);
        }
      };
      stub(soundGrabber, 'find_element', function(id) {
        expect(id).toEqual('bacon');
        return elem;
      });
      var sound = EmberObject.create({id: 'bacon'});
      soundGrabber.play_audio(sound);
      expect(sound.get('playing')).toEqual(true);
      expect(elem.currentTime).toEqual(5);
      expect(elem.paused).toEqual(false);
      soundGrabber.play_audio(sound);
      expect(sound.get('playing')).toEqual(false);
      expect(elem.paused).toEqual(true);
      soundGrabber.play_audio(sound);
      expect(sound.get('playing')).toEqual(true);
      expect(elem.currentTime).toEqual(5);
      expect(elem.paused).toEqual(false);
      waitsFor(function() { return elem.paused; });
      runs(function() {
        expect(sound.get('playing')).toEqual(false);
      });
    });

    it('should not error when element not found', function() {
      soundGrabber.play_audio(EmberObject.create({id: 'asdf'}));
      expect(1).toEqual(1);
    });
  });

  describe("recording_selected", function() {
    it('should error on unrecognized type', function() {
      var message = null;
      stub(modal, 'error', function(m) {
        message = m;
      });
      soundGrabber.recording_selected({type: 'asdf', name: 'bacon'});
      waitsFor(function() { return message; });
      runs(function() {
        expect(message).toEqual("The file you uploaded doesn't appear to be a valid audio or zip file");
      });
    });

    it('should read the sound file', function() {
      var f = {type: 'audio/mp3'};
      var read = false;
      stub(contentGrabbers, 'read_file', function(file) {
        read = true;
        expect(file).toEqual(f);
        return RSVP.reject();
      });
      soundGrabber.recording_selected(f);
      waitsFor(function() { return read; });
      runs();
    });

    it('should call select_sound_preview on the read file', function() {
      var f = {type: 'audio/mp3', name: 'sound.mp3'};
      var read = false;
      var selected = false;
      var loading = false;
      soundGrabber.recordings_controller = EmberObject.create({upload_status: 'bacon'});
      stub(soundGrabber.recordings_controller, 'load_recordings', function() {
        loading = true;
      });
      stub(soundGrabber, 'select_sound_preview', function(opts) {
        selected = true;
        expect(opts).toEqual({
          url: 'asdf',
          name: 'sound.mp3'
        });
        return RSVP.resolve();
      });
      stub(contentGrabbers, 'read_file', function(file) {
        read = true;
        expect(file).toEqual(f);
        return RSVP.resolve({
          target: {
            result: "asdf"
          }
        });
      });
      soundGrabber.recording_selected(f);
      waitsFor(function() { return read && selected && loading; });
      runs(function() {
        expect(soundGrabber.recordings_controller.get('upload_status')).toEqual(null);
      });
    });

    it('should handle errors correctly on sound upload', function() {
      var f = {type: 'audio/mp3', name: 'sound.mp3'};
      var read = false;
      var selected = false;
      var message = null;
      stub(modal, 'error', function(m) {
        message = m;
      });
      stub(soundGrabber, 'select_sound_preview', function(opts) {
        selected = true;
        expect(opts).toEqual({
          url: 'asdf',
          name: 'sound.mp3'
        });
        return RSVP.reject();
      });
      stub(contentGrabbers, 'read_file', function(file) {
        read = true;
        expect(file).toEqual(f);
        return RSVP.resolve({
          target: {
            result: "asdf"
          }
        });
      });
      soundGrabber.recording_selected(f);
      waitsFor(function() { return read && selected; });
      runs(function() {
        expect(message).toEqual('Upload failed');
      });
    });

    it('should call upload_for_processing for zips', function() {
      var f = {type: 'application/zip', name: 'something.zip'};
      var view = null;
      stub(modal, 'open', function(v) {
        view = v;
      });
      var called = false;
      stub(contentGrabbers, 'upload_for_processing', function(file, url, opts, progressor) {
        called = true;
        expect(file).toEqual(f);
        expect(url).toEqual('/api/v1/sounds/imports');
        expect(opts).toEqual({});
        expect(progressor).not.toEqual(null);
        return RSVP.reject();
      });
      soundGrabber.recording_selected(f);
      waitsFor(function() { return called && view; });
      runs(function() {
        expect(view).toEqual('importing-recordings');
      });
    });

    it('should succeed correctly on zip uploads', function() {
      var f = {type: 'application/zip', name: 'something.zip'};
      var view = null;
      stub(modal, 'open', function(v) { view = v; });
      var message = null;
      stub(modal, 'success', function(m) { message = m; });
      soundGrabber.recordings_controller = EmberObject.create();
      var loading = false;
      stub(soundGrabber.recordings_controller, 'load_recordings', function() {
        loading = true;
      });
      var called = false;
      stub(contentGrabbers, 'upload_for_processing', function(file, url, opts, progressor) {
        called = true;
        expect(file).toEqual(f);
        expect(url).toEqual('/api/v1/sounds/imports');
        expect(opts).toEqual({});
        expect(progressor).not.toEqual(null);
        return RSVP.resolve();
      });
      soundGrabber.recording_selected(f);
      waitsFor(function() { return called && loading; });
      runs(function() {
        expect(view).toEqual('importing-recordings');
        expect(message).toEqual('Your recordings have been imported or updated!');
      });
    });
  });

  describe("native_record_sound", function() {
    it('should make the correct native call', function() {
      var called = false;
      stub(navigator, 'device', {
        capture: {
          captureAudio: function(callback) {
            called = true;
          }
        }
      });
      expect(called).toEqual(false);
      soundGrabber.native_record_sound();
      expect(called).toEqual(true);
    });

    it('should trigger file_selected on result', function() {
      var file = null;
      stub(soundGrabber, 'file_selected', function(f) {
        file = f;
      });
      stub(navigator, 'device', {
        capture: {
          captureAudio: function(callback) {
            callback([
              {name: [], localURL: 'bob.png'},
              {name: [], localURL: 'fred.mp3'}
            ]);
          }
        }
      });
      soundGrabber.native_record_sound();
      waitsFor(function() { return file; });
      runs(function() {
        expect(file.name).toEqual('bob.png');
      });
    });
  });
});
