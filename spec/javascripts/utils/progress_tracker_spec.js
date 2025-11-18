describe('progress_tracker', function() {
  var old_success_wait = progress_tracker.success_wait;
  var old_error_wait = progress_tracker.error_wait;
  beforeEach(function() {
    Ember.testing = true;
    LingoLinq.reset();
    progress_tracker.success_wait = 1;
    progress_tracker.error_wait = 1;
  });
  
  afterEach(function() {
    progress_tracker.success_wait = old_success_wait;
    progress_tracker.error_wait = old_error_wait;
  });

  describe("track", function() {
    it("should make an initial call to check", function() {
      var called = false;
      stub(progress_tracker, 'check', function(url, callback, count) {
        called = (url == "bob" && callback != null && count == 0);
      });
      progress_tracker.track({status_url: "bob"}, null);
      expect(called).toEqual(true);
    });
  });
  
  describe("check", function() {
    it("should make a progress check call", function() {
      var called = false;
      stub(persistence, 'ajax', function(url, opts) {
        called = (url == "/status" && opts.type == 'GET');
        return Ember.RSVP.defer().promise;
      });
      progress_tracker.check("/status");
      waitsFor(function() { return called; });
    });
    it("should try more than once on a failed attempt", function() {
      var calls = [], statuses = [];
      stub(persistence, 'ajax', function(url, opts) {
        calls.push([url, opts]);
        if(calls.length == 1) {
          return Ember.RSVP.reject();
        } else {
          return Ember.RSVP.defer().promise;
        }
      });
      progress_tracker.track_ids = {'abc': true};
      progress_tracker.check("/status", function(status) {
        console.log(status);
        statuses.push(status);
      }, null, 'abc');
      waitsFor(function() { return calls.length > 1; });
    });
    it("should callback an errored status after 5 failed attempts", function() {
      var calls = [], statuses = [];
      stub(persistence, 'ajax', function(url, opts) {
        calls.push([url, opts]);
        return Ember.RSVP.reject();
      });
      var error = false;
      progress_tracker.track_ids = {'abc': true};
      progress_tracker.check("/status", function(status) {
        console.log("status");
        statuses.push(status);
        if(status.status == 'errored') { error = true; }
      }, null, 'abc');
      waitsFor(function() { return error; });
      runs(function() {
        expect(calls.length).toEqual(5);
        expect(statuses.length).toEqual(1);
      });
    });
    it("should trigger a callback on every successful progress check", function() {
      var calls = [], statuses = [];
      stub(persistence, 'ajax', function(url, opts) {
        calls.push([url, opts]);
        if(calls.length < 3) {
          return Ember.RSVP.resolve({
            progress: {calls: calls.length}
          });
        } else {
          return Ember.RSVP.defer().promise;
        }
      });
      progress_tracker.track_ids = {'abc': true};
      progress_tracker.check("/status", function(status) {
        statuses.push(status);
      }, null, 'abc');
      waitsFor(function() { return calls.length == 3; });
      runs(function() {
        expect(calls.length).toEqual(3);
        expect(statuses.length).toEqual(2);
        expect(statuses[0].calls).toEqual(1);
        expect(statuses[1].calls).toEqual(2);
      });
    });
    it("should stop repeating progress checks once the progress is returned as finished", function() {
      var calls = [], statuses = [];
      stub(persistence, 'ajax', function(url, opts) {
        calls.push([url, opts]);
        if(calls.length < 3) {
          return Ember.RSVP.resolve({
            progress: {calls: calls.length}
          });
        } else {
          return Ember.RSVP.resolve({
            progress: {finished_at: "123", status: "finished"}
          });
        }
      });
      var finished = false;
      progress_tracker.track_ids = {'abc': true};
      progress_tracker.check("/status", function(status) {
        statuses.push(status);
        if(status.status == 'finished') {
          finished = true;
        }
      }, null, 'abc');
      waitsFor(function() { return finished; });
      runs(function() {
        expect(calls.length).toEqual(3);
        expect(statuses.length).toEqual(3);
        expect(statuses[0].calls).toEqual(1);
        expect(statuses[1].calls).toEqual(2);
        expect(statuses[0].finished_at).toEqual(null);
        expect(statuses[1].finished_at).toEqual(null);
        expect(statuses[2].finished_at).toEqual("123");
        expect(statuses[2].still_working).toEqual(false);
      });
    });
    it("should stop repeating progress checks if the track_id is cancelled", function() {
      var calls = [], statuses = [];
      stub(persistence, 'ajax', function(url, opts) {
        calls.push([url, opts]);
        if(calls.length == 3) {
          console.log("...");
          progress_tracker.untrack('abc');
        }
        return Ember.RSVP.resolve({
          progress: {calls: calls.length}
        });
      });
      progress_tracker.track_ids = {'abc': true};
      progress_tracker.check("/status", function(status) {
        statuses.push(status);
      }, null, 'abc');
      waitsFor(function() { return calls.length >= 3; });
      runs(function() {
        expect(calls.length).toEqual(3);
        expect(statuses.length).toEqual(3);
        expect(statuses[0].calls).toEqual(1);
        expect(statuses[1].calls).toEqual(2);
        expect(statuses[2].calls).toEqual(3);
      });
    });
  });
  
  describe("status_text", function() {
    it("should return correct text for each status", function() {
      expect(progress_tracker.status_text("pending")).toEqual("Initializing...");
      expect(progress_tracker.status_text("started")).toEqual("Processing...");
      expect(progress_tracker.status_text("finished")).toEqual("Ready!");
      expect(progress_tracker.status_text("errored")).toEqual("Error");
    });
    it("should return correct text for each sub_status", function() {
      expect(progress_tracker.status_text("started", "generating_files")).toEqual("Generating file(s)...");
      expect(progress_tracker.status_text("started", "converting_files")).toEqual("Converting file(s)");
      expect(progress_tracker.status_text("started", "uploading_files")).toEqual("Finalizing file(s)");
    });
  });
});
