describe('speecher', function() {
  beforeEach(function() {
    Ember.testing = true;
    LingoLinq.reset();
    speecher.audio = {};
    speecher.scope = window;
  });
  
  afterEach(function() {
    speecher.scope = window;
  });
  
  describe("speak_text", function() {
    it("should not error unexpectedly on bad input", function() {
      var spoken = false;
      stub(speechSynthesis, 'speak', function() { spoken = true; });
      expect(function() { speecher.speak_text(null); }).not.toThrow();
      expect(spoken).toEqual(false);
      expect(function() { speecher.speak_text(1234); }).not.toThrow();
      expect(spoken).toEqual(true);
    });
    it("should trigger speech synthesis", function() {
      var spoken = null;
      stub(speechSynthesis, 'speak', function(u) { spoken = u.text; });
      expect(function() { speecher.speak_text("hippo"); }).not.toThrow();
      expect(spoken).toEqual("hippo");
    });
    it("should cancel any existing text utterances", function() {
      var spoken = null;
      var cancelled = false;
      stub(speechSynthesis, 'speak', function(u) { spoken = u.text; });
      stub(speechSynthesis, 'cancel', function() { cancelled = true; });
      speecher.speak_text("hippo");
      expect(cancelled).toEqual(true);
      expect(spoken).toEqual("hippo");
    });
  });
  
  describe("set_voice", function() {
    it("should not error if set_voice has not been called", function() {
      stub(speechSynthesis, 'speak', function() { });
      expect(function() { speecher.speak_text("hippo"); }).not.toThrow();
    });
    it("should set pitch and volume based on settings", function() {
      speecher.set_voice({volume: 0.5, pitch: 2.0});
      expect(speecher.volume).toEqual(0.5);
      expect(speecher.pitch).toEqual(2.0);
    });
  });
  
  describe("speak_audio", function() {
    var audio = null;
    beforeEach(function() {
      audio = fakeAudio();
      stub(speecher, 'find_or_create_element', function() {
        return [audio];
      });
    });
    it("should not error unexpectedly on bad input", function() {
      speecher.speak_audio(null);
      expect(speecher.audio.text).toEqual(audio);
      expect(audio.listenersAdded).toEqual(true);
      expect(audio.listenersRemoved).not.toEqual(true);
    });
    it("should trigger audio", function() {
      speecher.speak_audio("http://sound.com/boom.mp3");
      waitsFor(function() { return audio.playCalled; })
      runs(function() {
        expect(speecher.audio.text).toEqual(audio);
        expect(audio.pauseCalled).toEqual(true);
        expect(audio.playCalled).toEqual(true);
        expect(audio.listenersAdded).toEqual(true);
        expect(audio.listenersRemoved).not.toEqual(true);
      });
    });
    it("should not error unexpectedly when it can't find the sound element on the page", function() {
      stub(speecher, 'find_or_create_element', function() {
        return [];
      });
      expect(function() { speecher.speak_audio("http://sound.com/thank_you.mp3"); }).not.toThrow();
      expect(speecher.audio.text).toEqual(null);
    });
    it("should rewind sound in case re-playing the same sound again", function() {
      expect(audio.currentTime).not.toEqual(0);
      speecher.speak_audio("http://sound.com/boom.mp3");
      waitsFor(function() { return audio.playCalled; })
      runs(function() {
        expect(speecher.audio.text).toEqual(audio);
        expect(audio.pauseCalled).toEqual(true);
        expect(audio.playCalled).toEqual(true);
        expect(audio.currentTime).toEqual(0);
        expect(audio.listenersAdded).toEqual(true);
        expect(audio.listenersRemoved).not.toEqual(true);
      });
    });
    it("should cancel any existing text or foreground audio", function() {
      var audio2 = fakeAudio();
      var audio3 = fakeAudio();
      var cancelled = false;
      speecher.audio.text = audio2;
      speecher.audio.background = audio3;
      stub(speechSynthesis, 'cancel', function() { cancelled = true; });
      speecher.speak_audio("http://sound.com/laugh.mp3");
      expect(audio.listenersAdded).toEqual(true);
      expect(audio.listenersRemoved).not.toEqual(true);
      expect(audio2.pauseCalled).toEqual(true);
      expect(audio2.listenersRemoved).toEqual(true);
      expect(cancelled).toEqual(true);
      expect(audio3.pauseCalled).not.toEqual(true);
      expect(audio3.listenersRemoved).not.toEqual(true);
    });
  });
  
  describe("speak_background_audio", function() {
    var audio = null;
    beforeEach(function() {
      audio = fakeAudio();
      stub(speecher, 'find_or_create_element', function() {
        return [audio];
      });
    });
    it("should not error unexpectedly on bad input", function() {
      speecher.speak_background_audio(null);
      expect(speecher.audio.background).toEqual(audio);
      expect(audio.listenersAdded).toEqual(true);
      expect(audio.listenersRemoved).not.toEqual(true);
    });
    it("should trigger audio", function() {
      speecher.speak_background_audio("http://sound.com/boom.mp3");
      waitsFor(function() { return audio.playCalled; })
      runs(function() {
        expect(speecher.audio.background).toEqual(audio);
        expect(audio.pauseCalled).toEqual(true);
        expect(audio.playCalled).toEqual(true);
        expect(audio.listenersAdded).toEqual(true);
        expect(audio.listenersRemoved).not.toEqual(true);
      });
    });
    it("should cancel any existing background audio", function() {
      var audio2 = fakeAudio();
      speecher.audio.background = audio2;
      speecher.speak_background_audio("http://sound.com/laugh.mp3");
      expect(audio.listenersAdded).toEqual(true);
      expect(audio.listenersRemoved).not.toEqual(true);
      expect(audio2.pauseCalled).toEqual(true);
      expect(audio2.listenersRemoved).toEqual(true);
    });

    it("should not cancel text or foreground audio", function() {
      var audio2 = fakeAudio();
      var audio3 = fakeAudio();
      var cancelled = false;
      speecher.audio.text = audio2;
      speecher.audio.background = audio3;
      stub(speechSynthesis, 'cancel', function() { cancelled = true; });
      speecher.speak_background_audio("http://sound.com/laugh.mp3");
      expect(audio.listenersAdded).toEqual(true);
      expect(audio.listenersRemoved).not.toEqual(true);
      expect(audio2.pauseCalled).not.toEqual(true);
      expect(audio2.listenersRemoved).not.toEqual(true);
      expect(cancelled).toEqual(false);
      expect(audio3.pauseCalled).toEqual(true);
      expect(audio3.listenersRemoved).toEqual(true);
    }); 
  });
  
  describe("speak_collection", function() {
    it("should queue list of foreground audio or text events", function() {
      var called = false;
      stub(speecher, 'next_speak', function() { called = true; });
      speecher.speak_collection([{}, {}]);
      expect(speecher.speaks).not.toEqual(null);
      expect(speecher.speaks.length).toEqual(2);
      expect(called).toEqual(true);
    });
    it("should cancel any foreground audio or text, but not background", function() {
      var fg = fakeAudio();
      var bg = fakeAudio();
      speecher.audio.text = fg;
      speecher.audio.background = bg;
      var called = false;
      stub(speecher, 'next_speak', function() { called = true; });
      speecher.speak_collection([]);
      expect(speecher.audio.text).toEqual(null);
      expect(speecher.audio.background).not.toEqual(null);
      expect(fg.listenersRemoved).toEqual(true);
      expect(bg.listenersRemoved).not.toEqual(true);
    });
    it("should run through the full list of speaks", function() {
      audio = fakeAudio();
      stub(speecher, 'find_or_create_element', function() {
        return [audio];
      });

      var words = [];
      var scope = {};
      polyfillSpeechSynthesis(scope);
      speecher.scope = scope;
      stub(scope.speechSynthesis, 'speak', function(u) { words.push(u.text); u.trigger('end'); });
      speecher.speak_collection([{text: "halo"}, {sound: "http://sounds.com/cookie.mp3"}, {text: "snow"}]);
      waitsFor(function() { return audio.playCalled; })
      runs(function() {
        expect(words).toEqual(['halo']);
        expect(speecher.audio.text).toEqual(audio);
        expect(audio.playCalled).toEqual(true);
        expect(speecher.speaks.length).toEqual(1);
        speecher.speak_end_handler();
        expect(words).toEqual(['halo', 'snow']);
        expect(speecher.speaks.length).toEqual(0);
      });
    });
  });
  describe("load_beep", function() {
    it("should reject if no beep found", function() {
      var failed = false;
      speecher.load_beep().then(function() { }, function() {
        failed = true;
      });
      waitsFor(function() { return failed; });
    });
    
    it("should perform a lookup if the beep element is found", function() {
      var $div = Ember.$("<div/>").attr('id', 'beep').attr('rel', 'http://www.pic.com/pic.png');
      Ember.$("body").append($div);
      stub(persistence, 'find_url', function(url) {
        if(url == 'http://www.pic.com/pic.png') {
          return Ember.RSVP.resolve("abc");
        } else {
          return Ember.RSVP.reject();
        }
      });
      var resolved = false;
      speecher.load_beep().then(function() {
        resolved = true;
      });
      waitsFor(function() { return resolved; });
      runs(function() {
        expect($div[0].src).toEqual('abc');
        $div.detach();
      });
    });

  });
});
