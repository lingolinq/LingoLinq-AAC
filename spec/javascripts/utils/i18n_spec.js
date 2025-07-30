describe("i18n", function() {
  beforeEach(function() {
    Ember.testing = true;
    LingoLinq.reset();
  });
  
  describe("pluralize", function() {
    it("should pluralize without an inflector", function() {
      expect(i18n.pluralize).not.toEqual(null);
      expect(i18n.pluralize("cat")).toEqual("cats");
      expect(i18n.pluralize("cow")).toEqual("cows");
    });
  });
  
  describe("handlebars_helpers", function() {
    it("should format dates", function() {
      var str = Ember.templateHelpers.date();
      expect(str).toMatch(/\w+ \w+ \d+, \d+:\d+ \w+/);
      str = Ember.templateHelpers.date({});
      expect(str).toMatch(/\w+ \w+ \d+, \d+:\d+ \w+/);
      
      var date = new Date(0 + ((new Date()).getTimezoneOffset() * 1000 * 60));
      var date_string = moment(date).format("MMMM Do YYYY, h:mm a");
      expect(Ember.templateHelpers.date(date, {})).toEqual(date_string);
    });
    it("should handle date_ago", function() {
      var date = new Date();
      var str = Ember.templateHelpers.date_ago(date);
      expect(str).toEqual("a few seconds ago");
      date = new Date((new Date()).getTime() - (1000 * 60 * 5));
      str = Ember.templateHelpers.date_ago(date);
      expect(str).toEqual("5 minutes ago");
    });
    
    it("should handle t (translation)", function() {
      var str = Ember.templateHelpers.t("happiness", {});
      expect(str).toEqual({string: "happiness"});
      
      str = Ember.templateHelpers.t("%{type} cow", {hash: {type: "happy"}, hashTypes: {}});
      expect(str.string).toEqual("happy cow");

      str = Ember.templateHelpers.t("%{num} cow", {hash: {num: 0}, hashTypes: {}});
      expect(str.string).toEqual("0 cow");
    });
    it("should not escape t results", function() {
      var str = Ember.templateHelpers.t("happi<b>ness</b>", {});
      expect(str).toEqual({string: "happi<b>ness</b>"});
    });
  });
  
  describe("t", function() {
    it("should return the entered string", function() {
      expect(i18n.t('key', "I like you")).toEqual("I like you");
      expect(i18n.t('key', "I like you a lot")).toEqual("I like you a lot");
      expect(i18n.t('key', "I like you", {})).toEqual("I like you");
    });
    it("should properly handle a count argument", function() {
      expect(i18n.t('horse', "horse", {hash: {count: 1}})).toEqual("1 horse");
      expect(i18n.t('horse', "horse", {hash: {count: 0}})).toEqual("0 horses");
      expect(i18n.t('horse', "horse", {hash: {count: 2}})).toEqual("2 horses");
    });
    it("should properly substitute variables", function() {
      expect(i18n.t('crab', "The crab is %{color}", {hash: {color: "yellow"}, hashTypes: {}})).toEqual("The crab is yellow");
      expect(i18n.t('crab', "The crab is %{color}", {hash: {color: "green"}, hashTypes: {}})).toEqual("The crab is green");
      expect(i18n.t('crab', "The crab is %{color}", {})).toEqual("The crab is %{color}");
      
      var context = Ember.Object.create({crab_color: "white"})
      expect(i18n.t('crab', "The crab is %{color}", {hash: {color: "crab_color"}, hashTypes: {color: 'ID'}, hashContexts: {color: context}})).toEqual("The crab is white");
    });
  });
  
  describe("tense", function() {
    it("should properly tensify a present-participle", function() {
      expect(i18n.tense('laugh', {present_participle: true})).toEqual("laughing");
      expect(i18n.tense('know', {present_participle: true})).toEqual("knowing");
    });
    
    it("should properly tensify a simple-past", function() {
      expect(i18n.tense('laugh', {simple_past: true})).toEqual("laughed");
      expect(i18n.tense('know', {simple_past: true})).toEqual("knew");
    });

    it("should properly tensify a past-participle", function() {
      expect(i18n.tense('laugh', {past_participle: true})).toEqual("laughed");
      expect(i18n.tense('know', {past_participle: true})).toEqual("known");
    });
  });
});
