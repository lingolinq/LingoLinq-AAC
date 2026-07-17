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
import boundClasses from '../../utils/bound_classes';
import Button from '../../utils/button';

describe('boundClasses', function() {
  describe("setup", function() {
    it("should set up a clean instance", function() {
      boundClasses.classes = null;
      boundClasses.setup();
      waitsFor(function() { return boundClasses.classes && boundClasses.classes['__'] === true; });
      runs();
    });
    it("should remove prior sheets on each setup call", function() {
      boundClasses.setup();
      var count = document.head.getElementsByTagName('style').length;
      expect(count).toBeGreaterThan(0);
      for(var idx = 0; idx < 100; idx++) {
        boundClasses.setup();
      }
      expect(document.head.getElementsByTagName('style').length).toEqual(count);
    });
  });
  describe("keyfiy", function() {
    it("should error as expected on empty value", function() {
      expect(function() {boundClasses.keyify(); }).toThrow("need button");
    });
    it("should generate consistent values", function() {
      var button = Button.create();
      expect(boundClasses.keyify(button)).toEqual('b_');
      button.set('background_color', '#fff');
      expect(boundClasses.keyify(button)).toEqual('b__fff');
      button.set('background_color', '#rgba(255, 255, 255, 0.5)');
      expect(boundClasses.keyify(button)).toEqual('b__rgba_255__255__255__0_5_');
      var button2 = Button.create({background_color: '#rgba(255, 255, 255, 0.5)', label: 'hat'});
      expect(boundClasses.keyify(button2)).toEqual('b__rgba_255__255__255__0_5_');
      button.set('border_color', '#000');
      expect(boundClasses.keyify(button)).toEqual('b__rgba_255__255__255__0_5_');
    });
    it("should generate unique values based on specified attributes only", function() {
      var button = Button.create();
      expect(boundClasses.keyify(button)).toEqual('b_');
      button.set('background_color', '#fff');
      expect(boundClasses.keyify(button)).toEqual('b__fff');
      button.set('background_color', '#rgba(255, 255, 255, 0.5)');
      // TODO: normalize whitespace
      expect(boundClasses.keyify(button)).toEqual('b__rgba_255__255__255__0_5_');
      button.set('background_color', '#rgba(255, 250, 255, 0.5)');
      expect(boundClasses.keyify(button)).toEqual('b__rgba_255__250__255__0_5_');
      button.set('background_color', '#rgba(255,  250,  255, 0.5)');
      expect(boundClasses.keyify(button)).toEqual('b__rgba_255___250___255__0_5_');
      button.set('label', 'hard');
      button.set('load_board', {});
      expect(boundClasses.keyify(button)).toEqual('b__rgba_255___250___255__0_5_');
    });
  });
  describe("add_classes", function() {
    it("should error as expected on no button passed", function() {
      expect(function() {boundClasses.add_classes(); }).toThrow("need button");
    });
    it("should add classes based on keyify attributes", function() {
      var button = Button.create({'background_color': '#fff'});
      boundClasses.add_classes(button);
      expect(button.get('display_class')).toEqual('button b__fff');
    });
    it("should automatically add classes to button objects", function() {
      var button = Button.create({'background_color': '#fff'});
      expect(button.get('display_class')).toEqual('button b__fff');
    });
    it("should update classes automatically when button attributes change", function() {
      var button = Button.create({'background_color': '#fff'});
      expect(button.get('display_class')).toEqual('button b__fff');
      button.set('background_color', '#000');
      expect(button.get('display_class')).toEqual('button b__000');
      button.set('border_color', '#000');
      expect(button.get('display_class')).toEqual('button b__000');
      button.set('empty', true);
      expect(button.get('display_class')).toEqual('button b__000 empty');
      button.set('empty', false);
      button.set('hidden', true);
      expect(button.get('display_class')).toEqual('button b__000 hidden_button');
    });
  });
  describe("add_rule", function() {
    it("should error as expected on no button", function() {
      expect(function() {boundClasses.add_rule(); }).toThrow("need button");
    });
    it("should return false if setup has not been called yet", function() {
      var button = Button.create();
      boundClasses.classes = null;
      expect(boundClasses.add_rule(button)).toEqual(false);
      boundClasses.setup(true);
      waitsFor(function() { return boundClasses.classes && boundClasses.classes['__'] === true; });
      runs(function() {
        expect(boundClasses.add_rule(button)).toEqual(true);
      });
    });
    it("should parse various coloring styles", function() {
      boundClasses.setup();
      var button = Button.create({background_color: '#fff'});
      expect(boundClasses.classes[boundClasses.keyify(button)]).toEqual(['outline-color: rgb(204, 204, 204);--btn-ring-color: rgb(204, 204, 204);background-color: rgb(255, 255, 255);--btn-bg: rgb(255, 255, 255);color: rgb(0, 0, 0);', '', 'rgb(191, 191, 191)', 'rgb(242, 242, 242)', 'rgb(0, 0, 0)']);
      button.set('background_color', '#aabbcc');
      expect(boundClasses.classes[boundClasses.keyify(button)]).toEqual(['outline-color: rgb(106, 136, 166);--btn-ring-color: rgb(106, 136, 166);background-color: rgb(170, 187, 204);--btn-bg: rgb(170, 187, 204);color: rgb(0, 0, 0);', '', 'rgb(92, 123, 154)', 'rgb(154, 174, 194)', 'rgb(0, 0, 0)']);
      button.set('background_color', 'green');
      expect(boundClasses.classes[boundClasses.keyify(button)]).toEqual(['outline-color: rgb(0, 26, 0);--btn-ring-color: rgb(0, 26, 0);background-color: rgb(0, 128, 0);--btn-bg: rgb(0, 128, 0);color: rgb(255, 255, 255);', '', 'rgb(0, 0, 0)', 'rgb(0, 102, 0)', 'rgb(255, 255, 255)']);
      button.set('background_color', 'rgb(255,255,255)');
      expect(boundClasses.classes[boundClasses.keyify(button)]).toEqual(['outline-color: rgb(204, 204, 204);--btn-ring-color: rgb(204, 204, 204);background-color: rgb(255, 255, 255);--btn-bg: rgb(255, 255, 255);color: rgb(0, 0, 0);', '', 'rgb(191, 191, 191)', 'rgb(242, 242, 242)', 'rgb(0, 0, 0)']);
      button.set('background_color', 'rgba(255,255,255,0.5)');
      expect(boundClasses.classes[boundClasses.keyify(button)]).toEqual(['outline-color: rgba(204, 204, 204, 0.5);--btn-ring-color: rgba(204, 204, 204, 0.5);background-color: rgba(255, 255, 255, 0.5);--btn-bg: rgba(255, 255, 255, 0.5);color: rgb(0, 0, 0);', '', 'rgba(191, 191, 191, 0.5)', 'rgba(242, 242, 242, 0.5)', 'rgb(0, 0, 0)']);
    });
    it("should add CSS rules to the style object", function() {
      boundClasses.setup();
      var button = Button.create({background_color: '#fff'});
      expect(boundClasses.classes[boundClasses.keyify(button)]).toEqual(['outline-color: rgb(204, 204, 204);--btn-ring-color: rgb(204, 204, 204);background-color: rgb(255, 255, 255);--btn-bg: rgb(255, 255, 255);color: rgb(0, 0, 0);', '', 'rgb(191, 191, 191)', 'rgb(242, 242, 242)', 'rgb(0, 0, 0)']);
      var styles = document.head.getElementsByTagName('style');
      var style = styles[styles.length - 1];
      expect(style.getAttribute('data-for-board')).toEqual('true');
      var found_rule = false;
      var key = boundClasses.keyify(button);
      for(var idx = 0; idx < style.sheet.rules.length; idx++) {
        var rule = style.sheet.rules[idx];
        if(rule.selectorText == (".button." + key)) {
          expect(rule.style.cssText).toMatch(/background-color: rgb\(255, 255, 255\)/);
          expect(rule.style.cssText).toMatch(/color: rgb\(0, 0, 0\)/);
          found_rule = true;
        }
      }
      expect(found_rule).toEqual(true);
    });
  });
});
