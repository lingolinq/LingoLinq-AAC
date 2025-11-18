describe('pictureGrabber', function() {
  var button = null, controller = null;
  beforeEach(function() {
    Ember.testing = true;
    contentGrabbers.unlink();
    LingoLinq.reset();

    var obj = Ember.Object.create({
      'controllers': {'application': {
        'currentUser': Ember.Object.create({user_name: 'bob', profile_url: 'http://www.bob.com/bob'})
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
      button.set('image', {id: 1, check_for_editable_license: function() { checked = true }});
      stub(button, 'findContentLocally', function() {
        return Ember.RSVP.resolve();
      });
      pictureGrabber.setup(button, controller);
      waitsFor(function() { return checked });
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
      stub(Ember.$, 'ajax', function(url, args) {
        if(url == "/api/v1/search/proxy?url=http%3A%2F%2Fpics.com%2Fcow.png") {
          return promise;
        }
      });

      pictureGrabber.web_image_dropped({file: {url: "http://pics.com/cow.png"}});
      waitsFor(function() { return controller.get('image_field'); });
      runs(function() {
      expect(controller.get('image_field')).toEqual("http://pics.com/cow.png");
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
      var file = new Blob([0], {type: 'image/png'});
      file.name = "pic.png";
      pictureGrabber.file_selected(file);
      waitsFor(function() { return controller.get('image_preview'); });
      runs(function() {
        expect(controller.get('image_preview.name')).toEqual('pic.png');
        expect(controller.get('image_preview.url')).toEqual('data:image/png;base64,MA==');
      });
    });
  });
  
  // TODO: pictureGrabber.pick_preview...
  
  describe('image licenses', function() {
    it('should return correctly license type when set, defaulting to private', function() {
      pictureGrabber.setup(button, controller);
      expect(controller.get('image_preview.license.type')).toEqual(null);
      
      controller.set('image_preview', {license: {type: 'abc'}});
      expect(controller.get('image_preview.license.type')).toEqual('abc');
    });
    it('should set default license settings on image_preview when it changes', function() {
      pictureGrabber.setup(button, controller);
      expect(controller.get('image_preview')).toEqual(null);
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
        return Ember.RSVP.resolve({content_tye: 'image/png', data: 'data:image/png'});
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
    it('should have clear the specified image', function() {
      pictureGrabber.setup(button, controller);
      controller.set('image_preview', {url: 'http://www.picture.com'});
      controller.set('image', 'http://www.picture.com');
      pictureGrabber.clear_image();
      expect(controller.get('image')).toEqual(null);
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
        type: LingoLinq.Image,
        compare: function(s) { return s.get('url') == '/logo.png' },
        response: Ember.RSVP.resolve({image: {id: '123', url: '/logo.png'}})
      });
      pictureGrabber.select_image_preview();
      waitsFor(function() { return controller.get('image'); });
      runs(function() {
        expect(controller.get('image.id')).toEqual('123');
        expect(controller.get('image.url')).toEqual('/logo.png');
        expect(controller.get('image.url')).toEqual('/logo.png');
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
        type: LingoLinq.Image,
        compare: function(s) { return s.get('data_url') == 'data:image/png;base64,MA==' },
        response: Ember.RSVP.resolve({image: {id: '123', url: null, pending: true}})
      });
      stub(Ember.$, 'ajax', function(args) {
        if(args.url == "http://upload.com/") {
          return Ember.RSVP.resolve("");
        } else if(args.url == "/success") {
          return Ember.RSVP.resolve({
            confirmed: true,
            url: "http://pics.com/piccy.png"
          });
        }
      });
      pictureGrabber.select_image_preview();
      waitsFor(function() { return alerted; });
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
        type: LingoLinq.Image,
        compare: function(s) { return s.get('data_url') == 'data:image/png;base64,MA==' },
        response: Ember.RSVP.resolve({image: {id: '123', url: null, pending: true}, meta: {remote_upload: {data_url: "/api", upload_url: "http://upload.com/", success_url: "/success", upload_params: {a: "1", b: "2"}}}})
      });
      stub(Ember.$, 'ajax', function(args) {
        if(args.url == "http://upload.com/") {
          return Ember.RSVP.reject("");
        }
      });
      pictureGrabber.select_image_preview();
      waitsFor(function() { return alerted; });
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
        type: LingoLinq.Image,
        compare: function(s) { return s.get('data_url') == 'data:image/png;base64,MA==' },
        response: Ember.RSVP.resolve({image: {id: '123', url: null, pending: true}, meta: {remote_upload: {data_url: "/api", upload_url: "http://upload.com/", success_url: "/success", upload_params: {a: "1", b: "2"}}}})
      });
      stub(Ember.$, 'ajax', function(args) {
        if(args.url == "http://upload.com/") {
          return Ember.RSVP.resolve("");
        } else if(args.url == "/success") {
          return Ember.RSVP.resolve({
            confirmed: false
          });
        }
      });
      pictureGrabber.select_image_preview();
      waitsFor(function() { return alerted; });
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
        type: LingoLinq.Image,
        compare: function(s) { return s.get('data_url') == 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==' },
        response: Ember.RSVP.resolve({image: {id: '123', url: null, pending: true}, meta: {remote_upload: {data_url: "/api", upload_url: "http://upload.com/", success_url: "/success", upload_params: {a: "1", b: "2"}}}})
      });
      stub(Ember.$, 'ajax', function(args) {
        if(args.url == "http://upload.com/") {
          return Ember.RSVP.resolve("");
        } else if(args.url == "/success") {
          return Ember.RSVP.resolve({
            confirmed: true,
            url: "http://pics.com/piccy.png"
          });
        }
      });
      pictureGrabber.select_image_preview();
      waitsFor(function() { return controller.get('image'); });
      runs(function() {
        expect(controller.get('image.id')).toEqual('123');
        expect(controller.get('image.url')).toEqual('http://pics.com/piccy.png');
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
        type: LingoLinq.Image,
        compare: function(s) { 
          correct_license = s.get('license.type') == 'Uncool' && s.get('license.author_name') == "Bob";
          return s.get('url') == '/logo.png' 
        },
        response: Ember.RSVP.resolve({image: {id: '123', url: '/logo.png'}})
      });
      pictureGrabber.select_image_preview();
      waitsFor(function() { return correct_license; });
    });
    it('should use license defined by user if none specified on the preview', function() {
      pictureGrabber.setup(button, controller);
      controller.set('image_preview', {url: '/logo.png'});
      var correct_license = false;
      stub(editManager, 'change_button', function(id, args) { });
      queryLog.defineFixture({
        method: 'POST',
        type: LingoLinq.Image,
        compare: function(s) { 
          correct_license = s.get('license.type') == 'private' && s.get('license.author_name') == 'bob';
          return s.get('url') == '/logo.png' 
        },
        response: Ember.RSVP.resolve({image: {id: '123', url: '/logo.png'}})
      });
      pictureGrabber.select_image_preview();
      waitsFor(function() { return correct_license; });
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
      stub(Ember.$, 'ajax', function(url, args) {
        return Ember.RSVP.resolve({
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
      stub(Ember.$, 'ajax', function(url, args) {
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
  });

  describe('webcam snapshot', function() {
    it('should request the camera and then set the stream', function() {
      pictureGrabber.setup(button, controller);
      var called = false;
      var mediaCallback = null;
      stub(navigator, 'getUserMedia', function(args, callback) {
        called = callback && args.video == true;
        mediaCallback = callback;
      });
      pictureGrabber.start_webcam();
      expect(called).toEqual(true);
      
      var stream = fakeRecorder();
      mediaCallback(stream);
      expect(controller.get('webcam.stream')).toEqual(stream);
      expect(controller.get('webcam.showing')).toEqual(true);
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
  
});
