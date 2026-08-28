import {
  describe,
  it,
  expect,
  waitsFor,
  runs,
  stub
} from 'frontend/tests/helpers/jasmine';
import { fakeAudio } from 'frontend/tests/helpers/ember_helper';
import { stashesTarget, appStateTarget } from '../helpers/service-stub';
import utterance from '../../utils/utterance';
import speecher from '../../utils/speecher';
import stashes from '../../utils/_stashes';
import LingoLinq from '../../app';
import EmberObject from '@ember/object';

function utteranceController() {
  return LingoLinq._utteranceTestController;
}

function stashesForTest() {
  return stashesTarget();
}

function appStateForTest() {
  return appStateTarget();
}

function modifierPartNeedsFlag(part) {
  if (!part || part === ':native-keyboard') { return false; }
  if (part.match(/^\+/)) { return true; }
  if (part.match(/^:/)) {
    var action = LingoLinq.find_special_action && LingoLinq.find_special_action(part);
    if (action && (action.modifier || action.completion || action.inline)) {
      return true;
    }
    if (!action && part.match(/^:(plural|singular|complete|predict|space|paste)/)) {
      return true;
    }
  }
  return false;
}

function prepareRawButton(button) {
  var b = Object.assign({}, button);
  var parts = [];
  if (b.vocalization) {
    parts = parts.concat(b.vocalization.split(/\s*&&\s*/));
  }
  if (b.label && !b.vocalization) {
    parts = parts.concat(b.label.split(/\s*&&\s*/));
  }
  parts.forEach(function(part) {
    if (modifierPartNeedsFlag(part)) {
      b.specialty_with_modifiers = true;
    }
  });
  if (typeof utterance.specialty_button === 'function') {
    utterance.specialty_button(b);
  }
  return b;
}

function setRawButtons(buttons) {
  var prepared = buttons.map(prepareRawButton);
  utterance.set('rawButtonList', prepared);
  if (typeof utterance.set_button_list === 'function') {
    utterance.set_button_list();
  }
}

function addButtonForTest(button) {
  return utterance.add_button(prepareRawButton(button));
}

describe('utterance', function() {
  describe("setup", function() {
    it("should set the controller", function() {
      expect(utterance.controller).toEqual(utteranceController());
    });
    it("should retrieve the raw list from the stash", function() {
      stashesForTest().persist('working_vocalization', [{}, {}]);
      utterance.setup(utteranceController());
      expect(utterance.get('rawButtonList')).toEqual(stashesForTest().get('working_vocalization'));
    });
    it("should keep observe currentUser and keep speecher's voice settings up-to-date", function() {
      var user = EmberObject.extend({
        update_voice_uri: function() { }
      }).create({
        preferences: {device: {voice: {pitch: 2.0, volume: 3.0}}}
      });
      appStateForTest().set('currentUser', user);
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
      stashesForTest().persist('working_vocalization', [{}, {}]);
      utterance.setup(utteranceController());
      expect(utterance.get('rawButtonList')).toEqual(stashesForTest().get('working_vocalization'));
      expect(appStateForTest().get('button_list').length).toEqual(stashesForTest().get('working_vocalization').length);
    });
  });

  describe("set_button_list", function() {
    it("should compute a valid buttonList", function() {
      var buttons = [
        {label: "how"}, {label: "are"}, {label: "you"}
      ];
      setRawButtons( buttons);
      expect(appStateForTest().get('button_list').map(function(b) { return b.label; })).toEqual(buttons.map(function(b) { return b.label; }));
    });
    it("should set buttonList to the controller and stash", function() {
      var buttons = [
        {label: "how"}, {label: "are"}, {label: "you"}
      ];
      setRawButtons( buttons);
      expect(utterance.get('rawButtonList').map(function(b) { return b.label; })).toEqual(buttons.map(function(b) { return b.label; }));
      expect(appStateForTest().get('button_list')[0].label).toEqual('how');
      expect(appStateForTest().get('button_list')[1].label).toEqual('are');
      expect(appStateForTest().get('button_list')[2].label).toEqual('you');
      expect(stashesForTest().get('working_vocalization').map(function(b) { return b.label; })).toEqual(buttons.map(function(b) { return b.label; }));
    });
    it("should properly handle + and : notations", function() {
      var buttons = [
        {label: "how", in_progress: true}, {vocalization: "+ever"}, {label: "are"}, {label: "you", in_progress: true}, {label: "+r"}, {label: "hippo"}, {vocalization: ":plural"}
      ];
      setRawButtons( buttons);
      var computed = appStateForTest().get('button_list');
      expect(computed.length).toEqual(4);
      expect(computed[0].label).toEqual("however");
      expect(computed[1].label).toEqual("are");
      expect(computed[2].label).toEqual("your");
      expect(computed[3].label).toEqual("hippos");

      setRawButtons( [{label: "cow"}, {label: "hippos"}, {vocalization: ":singular"}, {label: "+tank"}]);
      computed = appStateForTest().get('button_list');
      expect(computed.length).toEqual(3);
      expect(computed[0].label).toEqual("cow");
      expect(computed[1].label).toEqual("hippo");
      expect(computed[2].label).toEqual("tank");

      setRawButtons( [{label: "horse"}, {label: "+c"}, {label: "+a"}, {label: "+n"}, {vocalization: ":plural"}]);
      computed = appStateForTest().get('button_list');
      expect(computed.length).toEqual(2);
      expect(computed[0].label).toEqual("horse");
      expect(computed[1].label).toEqual("cans");

      setRawButtons( [{label: "+c"}, {label: "+a"}, {label: "+n"}, {vocalization: ":plural"}]);
      computed = appStateForTest().get('button_list');
      expect(computed.length).toEqual(1);
      expect(computed[0].label).toEqual("cans");

      setRawButtons( [{label: "+c"}, {label: "+a"}, {label: "+n"}, {vocalization: ":complete", completion: "cantankerous"}]);
      computed = appStateForTest().get('button_list');
      expect(computed.length).toEqual(1);
      expect(computed[0].label).toEqual("cantankerous");
    });

    it("should properly handle buttons with multiple actions", function() {
      var buttons = [
        {label: "how", in_progress: true}, {vocalization: "+ever&& :space"}, {label: "are", vocalization: "+we"}, {label: "you", in_progress: true}, {label: "+r&&:home &&   +s"}, {label: "hippo"}, {vocalization: ":plural"}
      ];
      setRawButtons( buttons);
      var computed = appStateForTest().get('button_list');
      expect(computed.length).toEqual(4);
      expect(computed[0].label).toEqual("however");
      expect(computed[1].label).toEqual("we");
      expect(computed[2].label).toEqual("yours");
      expect(computed[3].label).toEqual("hippos");
    });
  });

  describe("contraction", function() {
    it("should prefer an exact two-word contraction over a predictive one-word match", function() {
      // "it is" is an exact key ("it's"); "is" alone predicts "is not" ("isn't").
      // The exact two-word match must win regardless of dictionary order.
      setRawButtons([{label: "it"}, {label: "is"}]);
      var res = utterance.contraction();
      expect(res && res.label).toEqual("it's");
    });
    it("should contract he/she + is to the possessive-looking form", function() {
      setRawButtons([{label: "he"}, {label: "is"}]);
      expect((utterance.contraction() || {}).label).toEqual("he's");
      setRawButtons([{label: "she"}, {label: "is"}]);
      expect((utterance.contraction() || {}).label).toEqual("she's");
    });
    it("should still contract an exact negative like 'is not'", function() {
      setRawButtons([{label: "is"}, {label: "not"}]);
      expect((utterance.contraction() || {}).label).toEqual("isn't");
    });
    it("should still offer a predictive contraction from the last word alone", function() {
      // Only "is" typed so far -> predict the "is not" contraction.
      setRawButtons([{label: "is"}]);
      expect((utterance.contraction() || {}).label).toEqual("isn't");
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
    it("should add third-person -s to verbs via :plural", function() {
      var result = utterance.modify_button({label: "walk", part_of_speech: "verb"}, {vocalization: ":plural"});
      expect(result.label).toEqual("walks");
      expect(result.vocalization).toEqual("walks");
      expect(result.modified).toEqual(true);
    });
    it("should singularize properly", function() {
      var result = utterance.modify_button({label: "cows"}, {vocalization: ":singular"});
      expect(result.label).toEqual("cow");
      expect(result.modified).toEqual(true);
      expect(result.modifications.length).toEqual(1);
      expect(result.image).toEqual('https://opensymbols.s3.amazonaws.com/libraries/mulberry/paper.svg');
    });

    it("should use the completion image for a word completion", function() {
      // Pin button_id/mod_id so modify_button's duplicate-guard cannot
      // collide on two additions that both lack a button_id.
      var result = utterance.modify_button({label: "cow", in_progress: true, button_id: 'cow'}, {vocalization: "+s", button_id: 'plus-s', mod_id: 1});
      expect(result.label).toEqual("cows");
      expect(result.modified).toEqual(true);
      expect(result.modifications.length).toEqual(1);
      result = utterance.modify_button(result, {label: "+zoo", button_id: 'plus-zoo', mod_id: 2});
      expect(result.image).toEqual('https://opensymbols.s3.amazonaws.com/libraries/mulberry/pencil%20and%20paper%202.svg');
      expect(result.label).toEqual("cowszoo");
      expect(result.modified).toEqual(true);
      expect(result.modifications.length).toEqual(2);
      result = utterance.modify_button(result, {label: ":complete", completion: "cowszoofill", button_id: 'complete', mod_id: 3});
      expect(result.image).toEqual('https://opensymbols.s3.amazonaws.com/libraries/mulberry/paper.svg');
      expect(result.label).toEqual("cowszoofill");
    });

    it("should use the addition's image if for a word completion", function() {
      var result = utterance.modify_button({label: "cow", in_progress: true, button_id: 'cow'}, {vocalization: "+s", button_id: 'plus-s', mod_id: 1});
      expect(result.label).toEqual("cows");
      expect(result.modified).toEqual(true);
      expect(result.modifications.length).toEqual(1);
      result = utterance.modify_button(result, {label: "+zoo", button_id: 'plus-zoo', mod_id: 2});
      expect(result.image).toEqual('https://opensymbols.s3.amazonaws.com/libraries/mulberry/pencil%20and%20paper%202.svg');
      expect(result.label).toEqual("cowszoo");
      expect(result.modified).toEqual(true);
      expect(result.modifications.length).toEqual(2);
      result = utterance.modify_button(result, {label: ":complete", completion: "cowszoofill", image: "http://www.example.com/pic.png", button_id: 'complete', mod_id: 3});
      expect(result.image).toEqual('http://www.example.com/pic.png');
      expect(result.label).toEqual("cowszoofill");
    });
  });

  describe("add_button", function() {
    it("should add the button to the list, controller and stash", function() {
      var b = {label: "occupy"};
      addButtonForTest(b);
      expect(utterance.get('rawButtonList').length).toEqual(1);
      expect(utterance.get('rawButtonList')[0].label).toEqual('occupy');
      expect(appStateForTest().get('button_list').length).toEqual(1);
      expect(appStateForTest().get('button_list')[0].label).toEqual(b.label);
      expect(stashesForTest().get('working_vocalization')[0].label).toEqual('occupy');
    });

    it("should add return the last modified button", function() {
      var b = {label: "occupy"};
      var res = addButtonForTest(b);
      expect(res.label).toEqual('occupy');

      var b2 = {label: "try"};
      res = addButtonForTest(b2);
      expect(res.label).toEqual('try');

      var b3 = {label: ":plural"};
      res = addButtonForTest(b3);
      expect(res.label).toEqual('tries');
    });

    it("should support adding buttons with multiple vocalizations", function() {
      var b = {label: "occupy", vocalization: "+w&&+a"};
      var res = addButtonForTest(b);
      expect(res.label).toEqual('wa');
    });

    it("should capitalize keyboard letters and complete them with space", function() {
      appStateForTest().set('sessionUser.preference.auto_capitalize', true);
      appStateForTest().set('shift', true);
      addButtonForTest({label: "a", vocalization: "+a"});
      expect(appStateForTest().get('button_list')[0].label).toEqual("A");
      expect(appStateForTest().get('button_list')[0].vocalization).toEqual("A");

      addButtonForTest({label: "space", vocalization: ":space"});
      expect(appStateForTest().get('button_list').length).toEqual(1);
      expect(appStateForTest().get('button_list')[0].label).toEqual("A");
      expect(appStateForTest().get('button_list')[0].vocalization).toEqual("A");
      expect(appStateForTest().get('button_list')[0].in_progress).toEqual(false);
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
      setRawButtons( [{}, {}]);
      expect(appStateForTest().get('button_list').length).toBeGreaterThan(0);
      expect(stashesForTest().get('working_vocalization').length).toBeGreaterThan(0);
      utterance.clear();
      expect(utterance.get('rawButtonList')).toEqual([]);
      expect(appStateForTest().get('button_list').length).toEqual(0);
      expect(stashesForTest().get('working_vocalization').length).toEqual(0);
    });
    it("should log a clear event", function() {
      var logged = false;
      stub(stashesForTest(), 'log', function(obj) { logged = obj.action == 'clear'; });
      utterance.clear();
      expect(logged).toEqual(true);
    });
    it("should not log a clear event if specified", function() {
      var logged = false;
      stub(stashesForTest(), 'log', function(obj) { logged = obj.action == 'clear'; });
      utterance.clear({skip_logging: true});
      expect(logged).toEqual(false);
    });
  });

  describe("backspace", function() {
    it("should remove the last button", function() {
      setRawButtons( [{label: "cow"}, {label: "fries"}]);
      utterance.backspace();
      expect(utterance.get('rawButtonList').length).toEqual(1);
      expect(utterance.get('rawButtonList')[0].label).toEqual("cow");
      utterance.backspace();
      expect(utterance.get('rawButtonList').length).toEqual(0);
      utterance.backspace();
      expect(utterance.get('rawButtonList').length).toEqual(0);
    });
    it("should remove modification if last button was a + or : notation", function() {
      setRawButtons( [{label: "cow"}, {label: "hippos"}, {vocalization: ":singular"}, {label: "+tank"}]);
      expect(appStateForTest().get('button_list')[1].label).toEqual("hippo");
      expect(appStateForTest().get('button_list')[2].label).toEqual("tank");
      utterance.backspace();
      expect(appStateForTest().get('button_list')[1].label).toEqual("hippo");
      utterance.backspace();
      expect(appStateForTest().get('button_list')[1].label).toEqual("hippos");
      utterance.backspace();
      expect(appStateForTest().get('button_list')[1]).toEqual(undefined);
    });
    it("should update the stash and controller", function() {
      setRawButtons( [{label: "cow"}, {label: "hippos"}, {vocalization: ":singular"}, {label: "+tank"}]);
      expect(appStateForTest().get('button_list')[1].label).toEqual("hippo");
      expect(appStateForTest().get('button_list')[2].label).toEqual("tank");
      utterance.backspace();
      utterance.backspace();
      expect(appStateForTest().get('button_list')[1].label).toEqual("hippos");
      expect(stashesForTest().get('working_vocalization')[1].label).toEqual("hippos");
    });
    it("should log a backspace event", function() {
      var logged = false;
      stub(stashesForTest(), 'log', function(obj) { logged = obj.action == 'backspace'; });
      utterance.backspace();
      expect(logged).toEqual(true);
    });

    it('should not remove the last button if a ghost vocalization', function() {
      setRawButtons( [{label: "cow"}, {label: "fries"}]);
      utterance.set('list_vocalized', true);
      utterance.backspace();
      expect(utterance.get('rawButtonList').length).toEqual(2);
      utterance.backspace();
      expect(utterance.get('rawButtonList')[0].label).toEqual("cow");
      utterance.backspace();
      expect(utterance.get('rawButtonList').length).toEqual(0);
      utterance.backspace();
      expect(utterance.get('rawButtonList').length).toEqual(0);
    });

    it('should un-ghost the vocalization if a ghost vocalization', function() {
      setRawButtons( [{label: "cow"}, {label: "fries"}]);
      utterance.set('list_vocalized', true);
      utterance.backspace();
      expect(utterance.get('rawButtonList').length).toEqual(2);
      expect(utterance.get('list_vocalized')).toEqual(false);
    });
  });

  describe("set_and_say_buttons", function() {
    it("should update the raw list, and the controller and stash", function() {
      var buttons = [{label: "smart"}, {label: "lad"}];
      utterance.set_and_say_buttons(buttons);
      expect(utterance.get('rawButtonList')).toEqual(buttons);
      expect(appStateForTest().get('button_list').length).toEqual(buttons.length);
      expect(appStateForTest().get('button_list')[0].label).toEqual(buttons[0].label);
      expect(appStateForTest().get('button_list')[1].label).toEqual(buttons[1].label);
      expect(stashesForTest().get('working_vocalization')).toEqual(buttons);
    });

    it("should vocalize the new button list", function() {
      var buttons = [{label: "smart"}, {label: "lad"}];
      utterance.set_and_say_buttons(buttons);
      expect(utteranceController().vocalized).toEqual(true);
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
      setRawButtons( buttons);
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
      setRawButtons( buttons);
      utterance.vocalize_list();
      expect(items.length).toEqual(1);
      expect(items[0].text).toEqual("how ever are you r hippos");
    });
  });

  describe("test_voice", function() {
    it("should generate a test utterance using the provided settings", function() {
      var correct = false;
      LingoLinq.sync_testing = true;
      stub(window, 'Audio', function() { return fakeAudio(); });
      stub(speecher, 'speak_text', function(str, override, u) {
        correct = u.pitch == 1.3 && u.volume == 2.0 && u.rate == 1.1;
      });
      var scope = {};
      window.polyfillSpeechSynthesis(scope);
      utterance.scope = scope;
      if (scope.speechSynthesis) {
        stub(scope.speechSynthesis, 'speak', function(u) { if (u && u.trigger) { u.trigger('end'); } });
      }
      utterance.test_voice("", 1.1, 1.3, 2.0);
      expect(correct).toEqual(true);
    });

    it("should correct for bad values", function() {
      var correct = false;
      LingoLinq.sync_testing = true;
      stub(window, 'Audio', function() { return fakeAudio(); });
      stub(speecher, 'speak_text', function(str, override, voiceOpts) {
        correct = voiceOpts.pitch == 1.0 && voiceOpts.volume == 1.0;
      });
      var scope = {};
      window.polyfillSpeechSynthesis(scope);
      utterance.scope = scope;
      if (scope.speechSynthesis) {
        stub(scope.speechSynthesis, 'speak', function(u) { if (u && u.trigger) { u.trigger('end'); } });
      }
      utterance.test_voice("hand", "crank");
      expect(correct).toEqual(true);
    });
  });
});
