describe('utterance', function() {
  var controller = null;
  beforeEach(function() {
    Ember.testing = true;
    LingoLinq.reset();
    stashes.flush();
    stashes.setup();
    controller = Ember.Object.extend({
      vocalize: function() {
        this.vocalized = true;
      }
    }).create();
    utterance.scope = window;
    utterance.setup(controller);
  });
  
  afterEach(function() {
    utterance.scope = window;
  });
  
  describe("setup", function() {
    it("should set the controller", function() {
      expect(utterance.controller).toEqual(controller);
    });
    it("should retrieve the raw list from the stash", function() {
      stashes.persist('working_vocalization', [{}, {}]);
      utterance.setup(controller);
      expect(utterance.get('rawButtonList')).toEqual(stashes.get('working_vocalization'));
    });
    it("should keep observe currentUser and keep speecher's voice settings up-to-date", function() {
      var user = Ember.Object.create({
        preferences: {device: {voice: {pitch: 2.0, volume: 3.0}}}
      })
      app_state.set('currentUser', user);
      expect(speecher.volume).toEqual(3.0);
      expect(speecher.pitch).toEqual(2.0);
      user.set('preferences.device.voice', {pitch: 3.0, volume: 2.0});
      expect(speecher.volume).toEqual(2.0);
      expect(speecher.pitch).toEqual(3.0);
      user.set('preferences.device.voice.volume', 1.0);
      expect(speecher.volume).toEqual(1.0);
      expect(speecher.pitch).toEqual(3.0);
    });
    it("should set the controller's buttonList attribute", function() {
      stashes.persist('working_vocalization', [{}, {}]);
      utterance.setup(controller);
      expect(utterance.get('rawButtonList')).toEqual(stashes.get('working_vocalization'));
      expect(app_state.get('button_list').length).toEqual(stashes.get('working_vocalization').length);
    });
  });

  describe("set_button_list", function() {
    it("should compute a valid buttonList", function() {
      var buttons = [
        {label: "how"}, {label: "are"}, {label: "you"}
      ];
      utterance.set('rawButtonList', buttons)
      expect(app_state.get('button_list').mapProperty('label')).toEqual(buttons.mapProperty('label'));
    });
    it("should set buttonList to the controller and stash", function() {
      var buttons = [
        {label: "how"}, {label: "are"}, {label: "you"}
      ];
      utterance.set('rawButtonList', buttons)
      expect(utterance.get('rawButtonList')).toEqual(buttons);
      expect(app_state.get('button_list')[0].label).toEqual('how');
      expect(app_state.get('button_list')[1].label).toEqual('are');
      expect(app_state.get('button_list')[2].label).toEqual('you');
      expect(stashes.get('working_vocalization')).toEqual(buttons);
    });
    it("should properly handle + and : notations", function() {
      var buttons = [
        {label: "how", in_progress: true}, {vocalization: "+ever"}, {label: "are"}, {label: "you", in_progress: true}, {label: "+r"}, {label: "hippo"}, {vocalization: ":plural"}
      ];
      utterance.set('rawButtonList', buttons)
      var computed = app_state.get('button_list');
      expect(computed.length).toEqual(4);
      expect(computed[0].label).toEqual("however");
      expect(computed[1].label).toEqual("are");
      expect(computed[2].label).toEqual("your");
      expect(computed[3].label).toEqual("hippos");

      utterance.set('rawButtonList', [{label: "cow"}, {label: ":bacon"}, {label: "hippos"}, {vocalization: ":singular"}, {label: "+tank"}]);
      var computed = app_state.get('button_list');
      expect(computed.length).toEqual(3);
      expect(computed[0].label).toEqual("cow");
      expect(computed[1].label).toEqual("hippo");
      expect(computed[2].label).toEqual("tank");

      utterance.set('rawButtonList', [{label: "horse"}, {label: "+c"}, {label: "+a"}, {label: "+n"}, {vocalization: ":plural"}]);
      var computed = app_state.get('button_list');
      expect(computed.length).toEqual(2);
      expect(computed[0].label).toEqual("horse");
      expect(computed[1].label).toEqual("cans");

      utterance.set('rawButtonList', [{label: "+c"}, {label: "+a"}, {label: "+n"}, {vocalization: ":plural"}]);
      var computed = app_state.get('button_list');
      expect(computed.length).toEqual(1);
      expect(computed[0].label).toEqual("cans");

      utterance.set('rawButtonList', [{label: "+c"}, {label: "+a"}, {label: "+n"}, {vocalization: ":complete", completion: "cantankerous"}]);
      var computed = app_state.get('button_list');
      expect(computed.length).toEqual(1);
      expect(computed[0].label).toEqual("cantankerous");
    });
  });
  
  describe("modify_button", function() {
    it("should return a valid button object", function() {
      var result = utterance.modify_button({label: "cow"}, {label: "hat"});
      expect(result.label).toEqual("cow");
      expect(result.modified).toEqual(true);
      expect(result.modifications.length).toEqual(1);
    });
    it("should work even if there is no original button", function() {
      var result = utterance.modify_button(null, {label: "+s"});
      expect(result.label).toEqual("s");
      expect(result.modified).toEqual(true);
      expect(result.modifications.length).toEqual(1);
    });
    it("should handle + notation, even multiple times", function() {
      var result = utterance.modify_button({label: "cow", in_progress: true}, {vocalization: "+s"});
      expect(result.label).toEqual("cows");
      expect(result.modified).toEqual(true);
      expect(result.modifications.length).toEqual(1);
      result = utterance.modify_button(result, {label: "+zoo"});
      expect(result.label).toEqual("cowszoo");
      expect(result.modified).toEqual(true);
      expect(result.modifications.length).toEqual(2);
    });
    it("should allow starting with + notation", function() {
      var result = utterance.modify_button(null, {vocalization: "+s"});
      expect(result.label).toEqual("s");
      expect(result.modified).toEqual(true);
      expect(result.modifications.length).toEqual(1);
    });
    it("should pluralize properly", function() {
      var result = utterance.modify_button({label: "cow"}, {vocalization: ":plural"});
      expect(result.label).toEqual("cows");
      expect(result.modified).toEqual(true);
      expect(result.modifications.length).toEqual(1);
    });
    it("should singularize properly", function() {
      var result = utterance.modify_button({label: "cows"}, {vocalization: ":singular"});
      expect(result.label).toEqual("cow");
      expect(result.modified).toEqual(true);
      expect(result.modifications.length).toEqual(1);
    });
  });
  
  describe("add_button", function() {
    it("should add the button to the list, controller and stash", function() {
      var b = {label: "occupy"};
      utterance.add_button(b);
      expect(utterance.get('rawButtonList').length).toEqual(1);
      expect(utterance.get('rawButtonList')[0]).toEqual({label: 'occupy'});
      expect(app_state.get('button_list').length).toEqual(1);
      expect(app_state.get('button_list')[0].label).toEqual(b.label);
      expect(stashes.get('working_vocalization')).toEqual([b]);
    });

    it("should add return the last modified button", function() {
      var b = {label: "occupy"};
      res = utterance.add_button(b);
      res.label.should == "occupy";
      
      var b2 = {label: "try"}
      res = utterance.add_button(b);
      res.label.should == "try";
      
      var b2 = {label: ":plural"}
      res = utterance.add_button(b);
      res.label.should == "tries";
    });
  });
  
  describe("speak_button", function() {
    it("should speak text", function() {
      var spoken = null;
      stub(speecher, 'speak_text', function(text) {
        spoken = text;
      });
      utterance.speak_button({label: "noun"});
      expect(spoken).toEqual("noun");
      utterance.speak_button({vocalization: "broken"});
      expect(spoken).toEqual("broken");
    });
    it("should speak a button's utterance, not label, if both are set", function() {
      var spoken = null;
      stub(speecher, 'speak_text', function(text) {
        spoken = text;
      });
      utterance.speak_button({label: "happy", vocalization: "I am happy"});
      expect(spoken).toEqual("I am happy");
    });
    it("should play audio", function() {
      var played = null;
      stub(speecher, 'speak_audio', function(url) {
        played = url;
      });
      utterance.speak_button({label: "happy", vocalization: "I am happy", sound: "http://sound.com/jump.mp3"});
      expect(played).toEqual("http://sound.com/jump.mp3");
    });
  });
  
  describe("speak_text", function() {
    it("should speak text", function() {
      var spoken = null;
      stub(speecher, 'speak_text', function(text) {
        spoken = text;
      });
      utterance.speak_text("I am glad");
      expect(spoken).toEqual("I am glad");
    });
  });
  
  describe("alert", function() {
    it("should play a beep sound", function() {
      var spoken = null;
      stub(speecher, 'beep', function() {
        spoken = 'beep';
      });
      utterance.alert();
      expect(spoken).toEqual("beep");
    });
  });
  
  describe("clear", function() {
    it("should clear the buttonList everywhere", function() {
      utterance.set('rawButtonList', [{}, {}]);
      expect(app_state.get('button_list').length).toBeGreaterThan(0);
      expect(stashes.get('working_vocalization').length).toBeGreaterThan(0);
      utterance.clear();
      expect(utterance.get('rawButtonList')).toEqual([]);
      expect(app_state.get('button_list').length).toEqual(0);
      expect(stashes.get('working_vocalization').length).toEqual(0);
    });
    it("should log a clear event", function() {
      var logged = false;
      stub(stashes, 'log', function(obj) { logged = obj.action == 'clear'; });
      utterance.clear();
      expect(logged).toEqual(true);
    });
  });
  
  describe("backspace", function() {
    it("should remove the last button", function() {
      utterance.set('rawButtonList', [{label: "cow"}, {label: "fries"}]);
      utterance.backspace();
      expect(utterance.get('rawButtonList').length).toEqual(1);
      expect(utterance.get('rawButtonList')[0]).toEqual({label: "cow"});
      utterance.backspace();
      expect(utterance.get('rawButtonList').length).toEqual(0);
      utterance.backspace();
      expect(utterance.get('rawButtonList').length).toEqual(0);
    });
    it("should remove modification if last button was a + or : notation", function() {
      utterance.set('rawButtonList', [{label: "cow"}, {label: "hippos"}, {vocalization: ":singular"}, {label: "+tank"}]);
      expect(app_state.get('button_list')[1].label).toEqual("hippo");
      expect(app_state.get('button_list')[2].label).toEqual("tank");
      utterance.backspace();
      expect(app_state.get('button_list')[1].label).toEqual("hippo");
      utterance.backspace();
      expect(app_state.get('button_list')[1].label).toEqual("hippos");
      utterance.backspace();
      expect(app_state.get('button_list')[1]).toEqual(null);
    });
    it("should update the stash and controller", function() {
      utterance.set('rawButtonList', [{label: "cow"}, {label: "hippos"}, {vocalization: ":singular"}, {label: "+tank"}]);
      expect(app_state.get('button_list')[1].label).toEqual("hippo");
      expect(app_state.get('button_list')[2].label).toEqual("tank");
      utterance.backspace();
      utterance.backspace();
      expect(app_state.get('button_list')[1].label).toEqual("hippos");
      expect(stashes.get('working_vocalization')[1].label).toEqual("hippos");
    });
    it("should log a backspace event", function() {
      var logged = false;
      stub(stashes, 'log', function(obj) { logged = obj.action == 'backspace'; });
      utterance.backspace();
      expect(logged).toEqual(true);
    });
  });
  
  describe("set_and_say_buttons", function() {
    it("should update the raw list, and the controller and stash", function() {
      var buttons = [{label: "smart"}, {label: "lad"}];
      utterance.set_and_say_buttons(buttons);
      expect(utterance.get('rawButtonList')).toEqual(buttons);
      expect(app_state.get('button_list').length).toEqual(buttons.length);
      expect(app_state.get('button_list')[0].label).toEqual(buttons[0].label);
      expect(app_state.get('button_list')[1].label).toEqual(buttons[1].label);
      expect(stashes.get('working_vocalization')).toEqual(buttons);
    });
    
    it("should vocalize the new button list", function() {
      var buttons = [{label: "smart"}, {label: "lad"}];
      utterance.set_and_say_buttons(buttons);
      expect(controller.vocalized).toEqual(true);
    });
  });
  
  describe("vocalize_list", function() {
    it("should log the utterance", function() {
      stub(speecher, 'speak_collection', function() { });
      var log = null;
      stub(stashes, 'log', function(obj) {
        log = obj;
      });
      var buttons = [
        {label: "how"}, {vocalization: "+ever"}, {label: "are"}, {label: "you"}, {label: "+r"}, {label: "hippo"}, {vocalization: ":plural"}
      ];
      utterance.set('rawButtonList', buttons)
      utterance.vocalize_list();
      expect(log).not.toEqual(null);
      expect(log.text).toEqual("how ever are you r hippos");
      expect(log.buttons.length).toEqual(6);
    });
    it("should generate a list of items for speech synthesis", function() {
      var items = null;
      stub(speecher, 'speak_collection', function(arg) { items = arg; });
      var buttons = [
        {label: "how"}, {vocalization: "+ever"}, {label: "are"}, {label: "you"}, {label: "+r"}, {label: "hippo"}, {vocalization: ":plural"}
      ];
      utterance.set('rawButtonList', buttons)
      utterance.vocalize_list();
      expect(items.length).toEqual(1);
      expect(items[0].text).toEqual("how ever are you r hippos");
    });
  });
  
  describe("test_voice", function() {
    it("should generate a test utterance using the provided settings", function() {
      var correct = false;
      var scope = {};
      polyfillSpeechSynthesis(scope);
      utterance.scope = scope;
      stub(scope.speechSynthesis, 'speak', function(u) {
        correct = u.pitch == 1.3 && u.volume == 2.0 && u.rate == 1.1;
      });
      utterance.test_voice("", 1.1, 1.3, 2.0);
      expect(correct).toEqual(true);
    });
    
    it("should correct for bad values", function() {
      var correct = false;
      var scope = {};
      polyfillSpeechSynthesis(scope);
      utterance.scope = scope;
      stub(scope.speechSynthesis, 'speak', function(utterance) {
        correct = utterance.pitch == 1.0 && utterance.volume == 1.0;
      });
      utterance.test_voice("hand", "crank");
      expect(correct).toEqual(true);
    });
  });
});
