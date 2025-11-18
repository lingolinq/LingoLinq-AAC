describe("misc", function() {
  beforeEach(function() {
    Ember.testing = true;
    LingoLinq.reset();
  });
  
  describe("handlebars helpers", function() {
    it("should support 'is' helper", function() {
      var callback = null;
      var opts = {
        types: [],
        contexts: [{}],
        fn: function() {
          callback = true;
        },
        inverse: function() {
          callback = false;
        }
      };
      Ember.Handlebars.helpers['is']("1", "1", opts);
      expect(callback).toEqual(true);
      
      opts.types = ['ID', 'ID'];
      opts.contexts = [{hat: "abc"}, {hat: "def"}];
      callback = null;
      Ember.Handlebars.helpers['is']("hat", "hat", opts);
      expect(callback).toEqual(false);

      opts.types = ['ID', 'ID'];
      opts.contexts = [{hat: "abc"}, {cat: "abc"}];
      callback = null;
      Ember.Handlebars.helpers['is']("hat", "cat", opts);
      expect(callback).toEqual(true);

      opts.types = ['', 'ID'];
      opts.contexts = [{}, {cat: "hat"}];
      callback = null;
      Ember.Handlebars.helpers['is']("hat", "cat", opts);
      expect(callback).toEqual(true);
      
      opts.types = ['ID', ''];
      opts.contexts = [{hat: "abc"}, {cat: "abc"}];
      callback = null;
      Ember.Handlebars.helpers['is']("hat", "hat", opts);
      expect(callback).toEqual(false);

      opts.types = ['ID', 'ID'];
      opts.contexts = [{hat: "abc"}, Ember.Object.create({hat: "abc"})];
      callback = null;
      Ember.Handlebars.helpers['is']("hat", "hat", opts);
      expect(callback).toEqual(true);

      opts.types = ['ID', 'ID'];
      opts.contexts = [Ember.Object.create({hat: "abc"}), {hat: "abc"}];
      callback = null;
      Ember.Handlebars.helpers['is']("hat", "hat", opts);
      expect(callback).toEqual(true);
      
      var o = Ember.Object.create({hat: "def"});
      o.set('hat', 'abc');
      opts.contexts = [o, {hat: "abc"}];
      callback = null;
      Ember.Handlebars.helpers['is']("hat", "hat", opts);
      expect(callback).toEqual(true);
    });
  });

  describe("SimpleAuth", function() {
    describe("setup", function() {
    });
    describe("load", function() {
    });
    describe("store", function() {
    });
    describe("destroy", function() {
    });
    describe("syncProperties", function() {
    });
  });
// 
// // advice for login form: http://blog.sensible.io/2013/05/23/how-to-write-a-login-form.html
// if(Ember.SimpleAuth) {
//   // see https://github.com/simplabs/ember-simple-auth/blob/master/packages/ember-simple-auth/lib/session.js
//   // override to use same store as everything else
//   // also need a way to force-check for valid token after extended delay
//   Ember.SimpleAuth.Session = Ember.SimpleAuth.Session.extend({
//     setup: function(data) {
//       data = data || {};
//       this.setProperties({
//         authToken:       data.access_token,
//         refreshToken:    (data.refresh_token || this.get('refreshToken')),
//         authTokenExpiry: (data.expires_in > 0 ? data.expires_in * 1000 : this.get('authTokenExpiry')) || 0,
//         userName:        data.user_name
//       });
//       this.store('userName');
//     },
//     load: function(property) {
//       var data = $.store.get('sessionData') || {};
//       var value = data[property];
//       if(Ember.isEmpty(value)) {
//         return undefined;
//       } else {
//         return value || '';
//       }
//     },
//     store: function(property) {
//       var data = $.store.get('sessionData') || {};
//       data[property] = this.get(property) || '';
//       $.store.set('sessionData', data);
//     },
//     destroy: function(stayPut) {
//       // TODO: make an actual call to logout server-side as well? Prolly.
//       // Or maybe do a full-on browser redirect to hard logout, see
//       // https://github.com/emberjs/data/issues/235
//       this.setProperties({
//         authToken:       undefined,
//         refreshToken:    undefined,
//         authTokenExpiry: undefined,
//         userName:        undefined
//       });
//       $.store.set('sessionData', null);
//       if(!stayPut) {
//         location.href = '/';
//       }
//     },
//     syncProperties: function() {
//       this.setProperties({
//         authToken:       this.load('authToken'),
//         refreshToken:    this.load('refreshToken'),
//         authTokenExpiry: this.load('authTokenExpiry'),
//         userName:        this.load('userName')
//       });
//       
//       if(this.get('tokenConfirmed') == null && !Ember.testing) {
//         // TODO: need graceful way to handle offline mode so user can access local boards offline
//         var _this = this;
//         if(this.get('authToken') || !this.get('browserToken')) {
//           this.set('tokenConfirmed', true);
//           persistence.ajax('/api/v1/token_check?access_token=' + this.get('authToken'), {
//             type: 'GET'
//           }).then(function(data, message, xhr) {
//             if(data.authenticated != true && _this.get('authToken')) {
//               _this.destroy(true);
//             }
//             if(data.xhr && data.xhr.getResponseHeader('BROWSER_TOKEN')) {
//               _this.set('browserToken', data.xhr.getResponseHeader('BROWSER_TOKEN'));
//             }
//           }, function(xhr, res) {
//             if(xhr && xhr.getResponseHeader('BROWSER_TOKEN')) {
//               _this.set('browserToken', xhr.getResponseHeader('BROWSER_TOKEN'));
//             }
//             if(res && res.error == "not online") {
//               return;
//             } 
//             // unexpected error
//             _this.set('tokenConfirmed', false);
//             _this.destroy(true);
//           });
//         } else {
//           _this.set('tokenConfirmed', false);
//         }
//       }
//       
//       if (!Ember.testing) {
//         Ember.run.cancel(Ember.SimpleAuth.Session._syncPropertiesTimeout);
//         Ember.SimpleAuth.Session._syncPropertiesTimeout = Ember.run.later(this, this.syncProperties, 500);
//       }
//     }
//   })
// }
  describe("resolutions", function() {
    it("should return the list of resolutions, if any", function() {
      var defers = [];
      var promises = [];
      for(var idx = 0; idx < 5; idx++) {
        var defer = Ember.RSVP.defer();
        defers.push(defer);
        promises.push(defer.promise);
      }
      var resolutions = null;
      Ember.RSVP.resolutions(promises).then(function(list) {
        resolutions = list;
      });
      
      defers[0].resolve();
      expect(resolutions).toEqual(null);
      
      defers[1].resolve();
      expect(resolutions).toEqual(null);
      
      defers[2].reject();
      expect(resolutions).toEqual(null);
      
      defers[3].reject();
      expect(resolutions).toEqual(null);
      
      defers[4].resolve();
      waitsFor(function() { return resolutions; });
      runs(function() {
        expect(resolutions.length).toEqual(3);
      });
    });
    it("should resolve immediately for an empty list of promises", function() {
      var resolved = false;
      Ember.RSVP.resolutions([]).then(function(list) {
        resolved = true;
      });
      waitsFor(function() { return resolved; });
    });
    it("should not fail when promises reject", function() {
      var defer = Ember.RSVP.defer();
      var resolved = false;
      Ember.RSVP.resolutions([defer.promise]).then(function(list) {
        resolved = list.length == 0;
      });
      defer.reject();
      waitsFor(function() { return resolved; });
    });
  });

  describe("Utils", function() {
    describe("uniq", function() {
      it("should uniqify based on a string attribute", function() {
        var list = [{a: 1}, {a: 1}, {a: 2}];
        var res = Utils.uniq(list, 'a');
        expect(res).toEqual([{a: 1}, {a: 2}]);
      });
      it("should ignore any results with no value for the attribute", function() {
        var list = [{a: 1}, {a: 1}, {a: 2}, {b: 1}, {b: 2}];
        var res = Utils.uniq(list, 'a');
        expect(res).toEqual([{a: 1}, {a: 2}]);
      });
      it("should uniqify based on a function attribute", function() {
        var list = [{a: 1}, {a: 1}, {b: 2}, {b: 3}];
        var res = Utils.uniq(list, function(i) { return i.b || (i.a * 2); });
        expect(res).toEqual([{a: 1}, {b: 3}]);
      });
    });
  });
});
