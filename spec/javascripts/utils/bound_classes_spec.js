describe('boundClasses', function() {
  beforeEach(function() {
    Ember.testing = true;
    LingoLinq.reset();
  });
  
  describe("setup", function() {
    it("should set up a clean instance", function() {
      boundClasses.setup();
      expect(boundClasses.classes).toEqual({'__': true});
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
      expect(function() {boundClasses.keyify() }).toThrow("need button");
    });
    it("should generate consistent values", function() {
      var button = LingoLinq.Button.create();
      expect(boundClasses.keyify(button)).toEqual('b___');
      button.set('background_color', '#fff');
      expect(boundClasses.keyify(button)).toEqual('b____fff');
      button.set('background_color', '#rgba(255, 255, 255, 0.5)');
      expect(boundClasses.keyify(button)).toEqual('b____rgba_255__255__255__0_5_');
      var button2 = LingoLinq.Button.create({background_color: '#rgba(255, 255, 255, 0.5)', label: 'hat'});
      expect(boundClasses.keyify(button2)).toEqual('b____rgba_255__255__255__0_5_');
      button.set('border_color', '#000');
      expect(boundClasses.keyify(button)).toEqual('b__000___rgba_255__255__255__0_5_');
    });
    it("should generate unique values based on specified attributes only", function() {
      var button = LingoLinq.Button.create();
      expect(boundClasses.keyify(button)).toEqual('b___');
      button.set('background_color', '#fff');
      expect(boundClasses.keyify(button)).toEqual('b____fff');
      button.set('background_color', '#rgba(255, 255, 255, 0.5)');
      // TODO: normalize whitespace
      expect(boundClasses.keyify(button)).toEqual('b____rgba_255__255__255__0_5_');
      button.set('background_color', '#rgba(255, 250, 255, 0.5)');
      expect(boundClasses.keyify(button)).toEqual('b____rgba_255__250__255__0_5_');
      button.set('background_color', '#rgba(255,  250,  255, 0.5)');
      expect(boundClasses.keyify(button)).toEqual('b____rgba_255___250___255__0_5_');
      button.set('label', 'hard');
      button.set('load_board', {});
      expect(boundClasses.keyify(button)).toEqual('b____rgba_255___250___255__0_5_');
    });
  });
  describe("add_classes", function() {
    it("should error as expected on no button passed", function() {
      expect(function() {boundClasses.add_classes() }).toThrow("need button");
    });
    it("should add classes based on keyify attributes", function() {
      var button = LingoLinq.Button.create({'background_color': '#fff'});
      boundClasses.add_classes(button);
      expect(button.get('display_class')).toEqual('button b____fff');
    });
    it("should automatically add classes to button objects", function() {
      var button = LingoLinq.Button.create({'background_color': '#fff'});
      expect(button.get('display_class')).toEqual('button b____fff');
    });
    it("should update classes automatically when button attributes change", function() {
      var button = LingoLinq.Button.create({'background_color': '#fff'});
      expect(button.get('display_class')).toEqual('button b____fff');
      button.set('background_color', '#000');
      expect(button.get('display_class')).toEqual('button b____000');
      button.set('border_color', '#000');
      expect(button.get('display_class')).toEqual('button b__000___000');
      button.set('empty', true);
      expect(button.get('display_class')).toEqual('button b__000___000 empty');
      button.set('empty', false);
      button.set('hidden', true);
      expect(button.get('display_class')).toEqual('button b__000___000 hidden_button');
    });
  });
  describe("add_rule", function() {
    it("should error as expected on no button", function() {
      expect(function() {boundClasses.add_rule() }).toThrow("need button");
    });
    it("should return false if setup has not been called yet", function() {
      var button = LingoLinq.Button.create();
      boundClasses.classes = null;
      expect(boundClasses.add_rule(button)).toEqual(false);
      boundClasses.setup();
      expect(boundClasses.add_rule(button)).toEqual(true);
    });
    it("should parse various coloring styles", function() {
      boundClasses.setup();
      var button = LingoLinq.Button.create({background_color: '#fff'});
      expect(boundClasses.classes[boundClasses.keyify(button)]).toEqual(['background-color: rgb(255, 255, 255);color: rgb(0, 0, 0);', 'background-color: rgb(242, 242, 242);']);
      button.set('background_color', '#aabbcc');
      expect(boundClasses.classes[boundClasses.keyify(button)]).toEqual(['background-color: rgb(170, 187, 204);color: rgb(0, 0, 0);', 'background-color: rgb(154, 174, 194);']);
      button.set('background_color', 'green');
      expect(boundClasses.classes[boundClasses.keyify(button)]).toEqual(['background-color: rgb(0, 128, 0);color: rgb(255, 255, 255);', 'background-color: rgb(0, 102, 0);']);
      button.set('background_color', 'rgb(255,255,255)');
      expect(boundClasses.classes[boundClasses.keyify(button)]).toEqual(['background-color: rgb(255, 255, 255);color: rgb(0, 0, 0);', 'background-color: rgb(242, 242, 242);']);
      button.set('background_color', 'rgba(255,255,255,0.5)');
      expect(boundClasses.classes[boundClasses.keyify(button)]).toEqual(['background-color: rgba(255, 255, 255, 0.5);color: rgb(0, 0, 0);', 'background-color: rgba(242, 242, 242, 0.5);']);
    });
    it("should add CSS rules to the style object", function() {
      boundClasses.setup();
      var button = LingoLinq.Button.create({background_color: '#fff'});
      expect(boundClasses.classes[boundClasses.keyify(button)]).toEqual(['background-color: rgb(255, 255, 255);color: rgb(0, 0, 0);', 'background-color: rgb(242, 242, 242);']);
      var styles = document.head.getElementsByTagName('style');
      var style = styles[styles.length - 1];
      expect(style.getAttribute('data-for-board')).toEqual('true');
      var found_rule = false;
      var key = boundClasses.keyify(button);
      for(var idx = 0; idx < style.sheet.rules.length; idx++) {
        var rule = style.sheet.rules[idx];
        if(rule.selectorText == (".button." + key)) {
          expect(rule.style.cssText).toEqual('color: rgb(0, 0, 0); background-color: rgb(255, 255, 255);');
          found_rule = true;
        }
      }
      expect(found_rule).toEqual(true);
    });
  });
});
