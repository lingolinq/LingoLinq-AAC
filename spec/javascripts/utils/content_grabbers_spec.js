describe("contentGrabbers", function() {
  var button, controller;
  beforeEach(function() {
    Ember.testing = true;
    LingoLinq.reset();
    stashes.flush();
    
    var obj = Ember.Object.create({
      'controllers': {'application': {
        'currentUser': Ember.Object.create({user_name: 'bob'})
      }},
      sentMessages: {},
      send: function(message) {
        this.sentMessages[message] = arguments;
      }
    });
    controller = Ember.Object.extend({
      send: function(message) {
        this.sentMessages[message] = arguments;
      }
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
    contentGrabbers.setup(button, controller);
    contentGrabbers.board_controller = controller.get('controllers.board');
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
      var obj = Ember.Object.extend({
        save: function() { return Ember.RSVP.reject(); }
      }).create();
      var res = contentGrabbers.save_record(obj);
      expect(res.then).not.toEqual(null);
      res.then(null, function() {});
    });
    
    it("should save a data-uri attribute for later processing if set", function() {
      var obj = Ember.Object.extend({
        save: function() { return Ember.RSVP.defer().promise; }
      }).create({
        url: "data:image/png;..."
      });
      var res = contentGrabbers.save_record(obj);
      expect(obj.get('url')).toEqual(null);
      expect(obj.get('data_url')).toEqual("data:image/png;...");
    });
    
    it("should save the record", function() {
      var defer = Ember.RSVP.defer();
      var save_called = false;
      var obj = Ember.Object.extend({
        save: function() { save_called = true; return defer.promise; }
      }).create({
        url: "data:image/png;..."
      });
      var res = contentGrabbers.save_record(obj);
      expect(save_called).toEqual(true);
      expect(obj.get('url')).toEqual(null);
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
      var defer = Ember.RSVP.defer();
      var save_called = false;
      var obj = Ember.Object.extend({
        save: function() { save_called = true; return defer.promise; }
      }).create({
        url: "data:image/png;...",
        pending: true
      });
      obj.store = {
        metadataFor: function() { return {remote_upload: {a: 2}}; }
      };
      
      var uploadArgs = null;
      stub(contentGrabbers, 'upload_to_remote', function(args) {
        uploadArgs = args;
        return Ember.RSVP.defer().promise;
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
      var defer = Ember.RSVP.defer();
      var save_called = false;
      var obj = Ember.Object.extend({
        save: function() { save_called = true; return defer.promise; }
      }).create({
        url: "data:image/png;...",
        pending: true
      });
      var rejected = false;
      obj.store = {
        metadataFor: function() { return null; }
      };
      
      var uploadArgs = null;
      stub(contentGrabbers, 'upload_to_remote', function(args) {
        uploadArgs = args;
        return Ember.RSVP.defer().promise;
      });
      var res = contentGrabbers.save_record(obj);
      defer.resolve(obj);
      res.then(null, function() {
        rejected = true;
      });
      
      waitsFor(function() { return rejected; });
    });
    
    it("should error on failed save", function() {
      var defer = Ember.RSVP.defer();
      var obj = Ember.Object.extend({
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
    
    it("should error or failed remote upload", function() {
      var defer = Ember.RSVP.defer();
      var defer2 = Ember.RSVP.defer();
      var save_called = false;
      var obj = Ember.Object.extend({
        save: function() { save_called = true; return defer.promise; }
      }).create({
        url: "data:image/png;...",
        pending: true
      });
      obj.store = {
        metadataFor: function() { return {remote_upload: {a: 2}}; }
      };
      
      stub(contentGrabbers, 'upload_to_remote', function(args) {
        return defer2.promise;
      });
      var res = contentGrabbers.save_record(obj);
      defer.resolve(obj);
      
      defer2.reject({
        abc: "123"
      });
      
      var rejection = null;
      res.then(null, function(arg) { rejection = arg; });
      
      waitsFor(function() { return rejection; });
      runs(function() {
        expect(rejection).toEqual({abc: "123"});
      });
    });
    
    it("should resolve on successful pending upload process, returning the original object", function() {
      var defer = Ember.RSVP.defer();
      var defer2 = Ember.RSVP.defer();
      var save_called = false;
      var obj = Ember.Object.extend({
        save: function() { save_called = true; return defer.promise; }
      }).create({
        url: "data:image/png;...",
        pending: true
      });
      obj.store = {
        metadataFor: function() { return {remote_upload: {a: 2}}; }
      };
      
      stub(contentGrabbers, 'upload_to_remote', function(args) {
        return defer2.promise;
      });
      var res = contentGrabbers.save_record(obj);
      defer.resolve(obj);
      
      defer2.resolve({
        confirmed: true,
        url: "http://pics.example.com/pic.png"
      });
      
      waitsFor(function() { return obj.get('pending') == false; });
      runs(function() {
        expect(obj.get('pending')).toEqual(false);
        expect(obj.get('url')).toEqual("http://pics.example.com/pic.png");
      });
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
        return Ember.RSVP.reject();
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
        expect(upload_args.data instanceof FormData).toEqual(true);
        expect(upload_args.processData).toEqual(false);
        expect(upload_args.contentType).toEqual(false);
      });
    });
    it("should call the success_url on successful upload", function() {
      var upload_args = null, success_args = null;
      stub(persistence, 'ajax', function(args) {
        if(args.url == '/upload') {
          upload_args = args;
          return Ember.RSVP.resolve();
        } else if(args.url == '/success') {
          success_args = args;
          return Ember.RSVP.resolve({happy: true});
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
          return Ember.RSVP.reject();
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
      res.then(function(data) { }, function() { failed = true });
      
      waitsFor(function() { return failed; });
    });
    it("should reject on bad success callback", function() {
      var upload_args = null, success_args = null;
      stub(persistence, 'ajax', function(args) {
        if(args.url == '/upload') {
          upload_args = args;
          return Ember.RSVP.resolve();
        } else if(args.url == '/success') {
          success_args = args;
          return Ember.RSVP.reject({happy: true});
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
      res.then(function(data) { }, function() { failed = true });
      
      waitsFor(function() { return failed; });
    });
  });
  
  describe("file_dropped", function() {
    it("should set droppedFile", function() {
      var file = {a: 1};
      
      contentGrabbers.file_dropped('abc', 'image', file);
      expect(contentGrabbers.droppedFile.type).toEqual('image');
      expect(contentGrabbers.droppedFile.file).toEqual(file);
    });
    it("should trigger the button dialog, which will then check for a dropped file", function() {
      var file = {a: 1};
      contentGrabbers.file_dropped('abc', 'image', file);
      expect(controller.get('controllers.board').sentMessages['buttonSelect']).not.toEqual(null);
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
  });

  describe("content_dropped", function() {
    it("should call file_dropped if a picture (link) was dropped", function() {
      app_state.set('edit_mode', true);
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
      expect(args).toEqual(['abc', 'image', {url: 'bob'}]);
    });
    it("should call file_dropped for image or audio file objects", function() {
      editManager.set('editMode', true);
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
      app_state.set('edit_mode', false);
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
      app_state.set('edit_mode', true);
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
      var blob = new Blob([0], {type: 'image/png'});
      expect(contentGrabbers.read_file(blob).then).not.toEqual(null);
    });
    it("should read file contents and return them as a data URI", function() {
      var blob = new Blob([0], {type: 'image/png'});
      var data_returned = false;
      contentGrabbers.read_file(blob).then(function(data) {
        data_returned = data.target.result == "data:image/png;base64,MA==";
      });
      waitsFor(function() { return data_returned; });
    });
  });
});
