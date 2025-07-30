describe('Log', function() {
  beforeEach(function() {
    Ember.testing = true;
    LingoLinq.reset();
  });
  
  describe("minutes", function() {
    it("should not error on empty value", function() {
      var log = LingoLinq.store.createRecord('log', {});
      expect(log.get('minutes')).toEqual(0);
    });
    it("should return filename if found in URL path, ignoring query params", function() {
      var log = LingoLinq.store.createRecord('log', {duration: 100});
      expect(log.get('minutes')).toEqual(2);
      log.set('duration', 300);
      expect(log.get('minutes')).toEqual(5);
    });
  });
});
