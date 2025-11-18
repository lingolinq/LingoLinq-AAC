describe('soundGrabber', function() {
  var controller = null;
  var button = null;
  var recorder = fakeRecorder();

  beforeEach(function() {
    Ember.testing = true;
    contentGrabbers.unlink();
    LingoLinq.reset();
    var obj = Ember.Object.create({
      'controllers': {'application': {
        'currentUser': Ember.Object.create({user_name: 'bob'})
      }}
    });
    controller = Ember.Object.extend({
      send: function(message) {
        this.sentMessages[message] = arguments;
      },
      model: Ember.Object.create()
    }).create({
      sentMessages: {},
      id: '456',
      licenseOptions: [],
      'controllers': {'board': obj}
    });
    button = Ember.Object.extend({
      findContentLocally: function() {
        this.foundContentLocally = true;
        return Ember.RSVP.resolve(true);
      }
    }).create();
  });
  
  describe('setup', function() {
    it('should set controller and button attributes', function() {
      var checked = false;
      button.set('sound', {id: 1, check_for_editable_license:function() { checked = true; }});
      stub(button, 'findContentLocally', function() {
        return Ember.RSVP.resolve();
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
      expect(controller.get('sound_preview.license')).toEqual(null);
      controller.set('sound_preview', {});
      expect(controller.get('sound_preview.license.type')).toEqual('private');
      controller.set('sound_preview', {license: {type: 'abc'}});
      expect(controller.get('sound_preview.license.type')).toEqual('abc');
    });
    it('should set default license settings on sound_preview when it changes', function() {
      soundGrabber.setup(button, controller);
      expect(controller.get('sound_preview')).toEqual(null);
      controller.set('sound_preview', {});
      expect(controller.get('sound_preview.set_license_author_name')).toEqual('bob');
      expect(controller.get('sound_preview.set_license_author_url')).toMatch(/\/bob$/);
    });
  });
  
  describe('file selection', function() {
    it('should set data from the provided file on the controller', function() {
      soundGrabber.setup(button, controller);
      var file = new Blob([0], {type: 'audio/wav'});
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
    it('should initialize recording process', function() {
      soundGrabber.setup(button, controller);
      var called = false;
      stub(navigator, 'getUserMedia', function(args, callback) {
        called = callback && args.audio == true;
      });
      soundGrabber.record_sound();
      expect(called).toEqual(true);
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
      expect(mr.started).toEqual(true);
      expect(controller.get('sound_recording').recording).toEqual(true);
    });
    it('should set data on the controller when recording is finished', function() {
      function MR2(stream) {
        this.stream = stream;
        var events = {};
        this.addEventListener = function(key, callback) {
          events[key] = callback;
        };
        this.trigger = function(key, data) {
          events[key] && events[key](data);
        };
      };
      var stash = window.MediaRecorder;
      window.MediaRecorder = MR2;
      soundGrabber.setup(button, controller);
      
      var called = false;
      var stream = fakeRecorder();
      stub(navigator, 'getUserMedia', function(args, callback) {
        called = callback && args.audio == true;
        callback(stream);
      });
      soundGrabber.record_sound();
      
      expect(called).toEqual(true);
      var mr = controller.get('sound_recording.media_recorder');
      expect(mr.stream).toEqual(stream);
      expect(controller.get('sound_recording.stream')).toEqual(stream);
      
      var blob = new Blob([0], {type: 'audio/wav'});
      mr.trigger('dataavailable', {data: blob});
      expect(controller.get('sound_recording.blob')).toEqual(blob);
      
      mr.trigger('recordingdone');
      waitsFor(function() { return controller.get('sound_preview'); });
      runs(function() {
        expect(controller.get('sound_preview.url')).toEqual("data:audio/wav;base64,MA==");
        expect(controller.get('sound_preview.name')).toEqual("Recorded sound");
      });
      
      window.MediaRecorder = stash;
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
        type: LingoLinq.Sound,
        compare: function(s) { return s.get('url') == '/beep.mp3' },
        response: Ember.RSVP.resolve({sound: {id: '123', url: '/beep.mp3'}})
      });
      soundGrabber.select_sound_preview();
      waitsFor(function() { return controller.get('sound'); });
      runs(function() {
        expect(controller.get('sound.id')).toEqual('123');
        expect(controller.get('sound.url')).toEqual('/beep.mp3');
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
        type: LingoLinq.Sound,
        compare: function(s) { 
          correct_license = s.get('license.type') == 'Cool' && s.get('license.author_name') == "Bob";
          return s.get('url') == '/beep.mp3' 
        },
        response: Ember.RSVP.resolve({sound: {id: '123', url: '/beep.mp3'}})
      });
      soundGrabber.select_sound_preview();
      waitsFor(function() { return correct_license; });
    });
    it('should use license defined by user if none specified on the preview', function() {
      soundGrabber.setup(button, controller);
      controller.set('sound_preview', {url: '/beep.mp3'});
      var correct_license = false;
      stub(editManager, 'change_button', function(id, args) { });
      queryLog.defineFixture({
        method: 'POST',
        type: LingoLinq.Sound,
        compare: function(s) {
          correct_license = s.get('license.type') == 'private' && s.get('license.author_name') == 'bob';
          return s.get('url') == '/beep.mp3' 
        },
        response: Ember.RSVP.resolve({sound: {id: '123', url: '/beep.mp3'}})
      });
      soundGrabber.select_sound_preview();
      waitsFor(function() { return correct_license; });
    });
  });
});
