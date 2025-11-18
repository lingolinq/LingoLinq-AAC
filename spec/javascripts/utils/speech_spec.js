describe('speech', function() {
  var scope = {};
  beforeEach(function() {
    Ember.testing = true;
    LingoLinq.reset();
    polyfillSpeechSynthesis(scope);
  });
  
  describe("SpeechSynthesis", function() {
    it("should respond to documented attributes", function() {
      expect(scope.SpeechSynthesis).not.toEqual(undefined);
      expect(scope.SpeechSynthesisUtterance).not.toEqual(undefined);
      expect(scope.speechSynthesis).not.toEqual(undefined);
      var speech = scope.speechSynthesis;
      expect(speech.speaking).toEqual(false);
      expect(speech.pending).toEqual(false);
      expect(speech.paused).toEqual(false);
      expect(speech.voiceList.length).toEqual(1);
      expect(speech.voiceList[0].voiceURI).toEqual("voice:speak_js");
    });
    
    it("should respond to documented method calls", function() {
      expect(scope.speechSynthesis.speak).not.toEqual(undefined);
      expect(scope.speechSynthesis.speak.call).not.toEqual(undefined);
      expect(scope.speechSynthesis.cancel).not.toEqual(undefined);
      expect(scope.speechSynthesis.cancel.call).not.toEqual(undefined);
      expect(scope.speechSynthesis.pause).not.toEqual(undefined);
      expect(scope.speechSynthesis.pause.call).not.toEqual(undefined);
      expect(scope.speechSynthesis.resume).not.toEqual(undefined);
      expect(scope.speechSynthesis.resume.call).not.toEqual(undefined);
    });
  });
  
  describe("SpeechSynthesisUtterance", function() {
    it("should respond to documented attributes", function() {
      var utterance = new scope.SpeechSynthesisUtterance("ok", "en", "robot", 1.0, 0.9, 0.8);
      expect(utterance.text).toEqual("ok");
      expect(utterance.lang).toEqual("en");
      expect(utterance.voiceURI).toEqual("robot");
      expect(utterance.volume).toEqual(1.0);
      expect(utterance.rate).toEqual(0.9);
      expect(utterance.pitch).toEqual(0.8);
    });
    it("should respond to documented method calls", function() {
      var utterance = new scope.SpeechSynthesisUtterance("ok", "en", "robot", 1.0, 0.9, 0.8);
      expect(utterance.addEventListener).not.toEqual(undefined);
    });
    it("should trigger expected events when initiated", function() {
      var called = false;
      var start_triggered = false, end_triggered = false;
      var utterance = new scope.SpeechSynthesisUtterance("ok cool");
      stub(window, 'speak', function(text, opts) {
        called = true;
        expect(text).toEqual("ok cool");
        expect(opts.amplitude).toEqual(100);
        expect(opts.pitch).toEqual(50);
        expect(opts.speed).toEqual(175);
        expect(opts.event).not.toEqual(undefined);
      });
      utterance.addEventListener('start', function() {
        start_triggered = true;
      });
      utterance.addEventListener('end', function() {
        end_triggered = true;
      });
      scope.speechSynthesis.speak(utterance);
      expect(called).toEqual(true);
      expect(scope.speechSynthesis.speaking).toEqual(true);
      expect(start_triggered).toEqual(true);
      expect(end_triggered).toEqual(false);
      utterance.trigger('end');
      expect(scope.speechSynthesis.speaking).toEqual(false);
      expect(start_triggered).toEqual(true);
      expect(end_triggered).toEqual(true);
    });
  });
});
