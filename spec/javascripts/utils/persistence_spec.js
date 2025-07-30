describe("persistence", function() {
  var app = null;
  var dbman;
  beforeEach(function() {
    Ember.testing = true;
    LingoLinq.reset();
    app = {
      register: function(key, obj, args) {
        app.registered = (key == 'lingolinq:persistence' && obj == persistence && args.singleton == true);
      },
      inject: function(component, name, key) {
        if(name == 'persistence' && key == 'lingolinq:persistence') {
          app.injections.push(component);
        }
      },
      injections: []
    };
    stashes.set('current_mode', 'default');
    app_state.set('currentBoardState', null);
    app_state.set('sessionUser', null);
    stub(speecher, 'load_beep', function() { return Ember.RSVP.resolve({}); });
    persistence.sidebar_boards = [];
    dbman = capabilities.dbman;
    capabilities.dbman = fake_dbman();
  });
  afterEach(function() {
    capabilities.dbman = dbman;
  });
  
  var board = null;
  function push_board(callback) {
    db_wait(function() {
      LingoLinq.store.push('board', {
        id: '1234',
        name: 'Best Board'
      });
      var record = null;
      LingoLinq.store.find('board', '1234').then(function(res) {
        record = res;
      });
      var _this = this;
      waitsFor(function() { return record; });
      runs(function() {
        board = record;
        Ember.run(_this, callback);
      });
    });
  }

  describe("setup", function() {
    it("should properly inject settings", function() {
      persistence.setup({}, app);
      expect(app.registered).toEqual(true);
      expect(app.injections).toEqual(['model', 'controller', 'view', 'route']);
    });
    it("should default last_sync to zero", function() {
      db_wait(function() {
        persistence.remove('settings', {storageId: 'lastSync'}, 'lastSync').then(function() {
          setTimeout(function() {
            persistence.setup({}, app);
          }, 10);
        });
        waitsFor(function() { return persistence.get('last_sync_at') == 0 });
      });
    });
    it("should check for last_sync if set", function() {
      db_wait(function() {
        persistence.store('settings', {last_sync: 12345}, 'lastSync').then(function() {
          setTimeout(function() {
            persistence.setup({}, app);
          }, 50);
        });
        waitsFor(function() { return persistence.get('last_sync_at') == 12345; });
      });
    });
  });

  describe("find", function() {
    it("should error if db isn't ready", function() {
      var ready = lingoLinqExtras.get('ready');
      lingoLinqExtras.set('ready', false);
      var res = persistence.find('bob', 'ok');
      var error = null;
      res.then(function() { debugger; }, function(err) {
        error = err;
      });
      waitsFor(function() { return error; });
      runs(function() {
        lingoLinqExtras.set('ready', ready);
        expect(error.error).toEqual("extras not ready");
      });
    });
    it("should return a promise", function() {
      var res = persistence.find('bob', 'ok');
      expect(res.then).not.toEqual(null);
      res.then(null, function() { });
    });
    it("should fail on invalid store types", function() {
      db_wait(function() {
        var error = null;
        persistence.find('bob', 'ok').then(function() { }, function(err) {
          error = err;
        });
        waitsFor(function() { return error; });
        runs(function() {
          expect(error.error).toEqual("invalid type: bob");
        });
      });
    });
    it("should return the found result", function() {
      db_wait(function() {
        var rnd = persistence.temporary_id();
        var record = null;
        var obj = {
          raw: {hat: rnd},
          storageId: 'hat'
        };
        lingoLinqExtras.storage.store('settings', obj, 'hat').then(function() {
          setTimeout(function() {
            persistence.find('settings', 'hat').then(function(res) {
              record = res;
            });
          }, 10);
        });
        waitsFor(function() { return record; });
        runs(function() {
          expect(record.hat).toEqual(rnd);
        });
      });
    });
    it("should not return the found result if too old", function() {
      db_wait(function() {
        var rnd = persistence.temporary_id();
        var record = null;
        var ids = {
          raw: {ids: []},
          storageId: 'importantIds'
        };
        var obj = {
          raw: {hat: rnd},
          storageId: 'hat',
          persisted: 1234
        };
        lingoLinqExtras.storage.store('settings', obj, 'hat').then(function() {
          setTimeout(function() {
            lingoLinqExtras.storage.store('settings', ids, 'importantIds').then(function() {
              setTimeout(function() {
                persistence.find('settings', 'hat').then(null, function(res) {
                  record = res;
                });
              }, 10);
            });
          }, 10);
        });
        waitsFor(function() { return record; });
        runs(function() {
          expect(record.error).toEqual("record not found");
        });
      });
    });
    it("should return the found result if too old but marked as important", function() {
      db_wait(function() {
        var rnd = persistence.temporary_id();
        var record = null;
        var obj = {
          raw: {hat: rnd},
          storageId: 'hat',
          persisted: 1234
        };
        var ids = {
          raw: {ids: ['settings_hat']},
          storageId: 'importantIds'
        };
        lingoLinqExtras.storage.store('settings', obj, 'hat').then(function() {
          setTimeout(function() {
            lingoLinqExtras.storage.store('settings', ids, 'importantIds').then(function() {
              setTimeout(function() {
                persistence.find('settings', 'hat').then(function(res) {
                  record = res;
                });
              }, 10);
            });
          }, 10);
        });
        waitsFor(function() { return record; });
        runs(function() {
          expect(record.hat).toEqual(rnd);
        });
      });
    });
  });

  describe("remember_access", function() {
    it("should stash only known accesses", function() {
      stashes.persist('recent_boards', []);
      persistence.remember_access('find', 'board', 'bob/cool');
      expect(stashes.get('recent_boards')).toEqual([{id: 'bob/cool'}]); 
      persistence.remember_access('find', 'board', '1234');
      expect(stashes.get('recent_boards')).toEqual([{id: 'bob/cool'}]); 
      persistence.remember_access('find', 'image', '2345');
      expect(stashes.get('recent_boards')).toEqual([{id: 'bob/cool'}]); 
      persistence.remember_access('find', 'board', 'bob/cool2');
      expect(stashes.get('recent_boards')).toEqual([{id: 'bob/cool2'}, {id: 'bob/cool'}]); 
      persistence.remember_access('find', 'board', 'bob/cool2');
      expect(stashes.get('recent_boards')).toEqual([{id: 'bob/cool2'}, {id: 'bob/cool'}]); 
    });
  });

  describe("find_recent", function() {
    it("should return a promise", function() {
      var res = persistence.find_recent();
      expect(res.then).not.toEqual(null);
      res.then(null, function() { });
    });
    it("should look up local copies of recent boards", function() {
      var found = [];
      var stored = []
      stub(lingoLinqExtras.storage, 'find', function(store, key) {
        found.push(key);
        return Ember.RSVP.resolve({raw: {id: key}});
      });
      stub(LingoLinq.store, 'push', function(store, obj) {
        stored.push(obj);
        return obj;
      });
      stashes.persist('recent_boards', [{id: 1}, {id: 'abc'}]);
      persistence.find_recent('board');
      waitsFor(function() { return found.length == 2 && stored.length == 2; });
      runs(function() {
        expect(found).toEqual([1, 'abc']);
        expect(stored).toEqual([{id: 1}, {id: 'abc'}]);
      });
    });
    it("should reject on anything other than boards", function() {
      var error = null;
      persistence.find_recent('image').then(null, function(err) { error = err; });
      waitsFor(function() { return error; });
      runs(function() {
        expect(error.error).toEqual("unsupported type: image");
      });
    });
  });

  describe("find_changed", function() {
    it("should call extras.find_changed", function() {
      db_wait(function() {
        var called = false;
        stub(lingoLinqExtras.storage, 'find_changed', function() {
          called = true;
        });
        persistence.find_changed();
        expect(called).toEqual(true);
      });
    });
    it("should return an empty list of db isn't initialized", function() {
      var ready = lingoLinqExtras.get('ready');
      lingoLinqExtras.set('ready', false);
      var called = false;
      stub(lingoLinqExtras.storage, 'find_changed', function() {
        called = true;
      });
      var list = null;
      persistence.find_changed().then(function(res) { list = res; }, function() { debugger; });
      waitsFor(function() { return list; });
      runs(function() {
        expect(list).toEqual([]);
        expect(called).toEqual(false);
      });
      lingoLinqExtras.set('ready', ready);
    });
    it("should return the list of changed, added and deleted records");
  });

  describe("remove", function() {
    it("should no longer find a removed record", function() {
      db_wait(function() {
        var rnd = Math.random() + "_" + (new Date()).toString();
        var found = null, not_found = null;
        persistence.store('settings', {ok: rnd}, 'check').then(function() {
          setTimeout(function() {
            persistence.find('settings', 'check').then(function(res) {
              found = res;
              persistence.remove('settings', {}, 'check').then(function() {
                setTimeout(function() {
                  persistence.find('settings', 'check').then(function(res) {
                    not_found = res;
                  } ,function() {
                    not_found = true;
                  });
                }, 50);
              });
            });
          }, 50);
        });
        waitsFor(function() { return found && not_found; });
        runs(function() {
          expect(found.ok).toEqual(rnd);
          expect(not_found).toEqual(true);
        });
      });
    });
  });
  
  describe("store", function() {
    it("should store a record", function() {
      db_wait(function() {
        var rnd = Math.random() + "_" + (new Date()).toString();
        var found = null;
        persistence.store('settings', {ok: rnd}, 'check').then(function() {
          setTimeout(function() {
            persistence.find('settings', 'check').then(function(res) {
              found = res;
            });
          }, 50);
        });
        waitsFor(function() { return found; });
        runs(function() {
          expect(found.ok).toEqual(rnd);
        });
      });
    });
    
    it("should not reject (but log an error) on a failed storage attempt", function() {
      db_wait(function() {
        stub(lingoLinqExtras.storage, 'store', function(store, record, key) {
          return Ember.RSVP.reject({});
        });
        var rnd = Math.random() + "_" + (new Date()).toString();
        var found = null;
        persistence.errors = [];
        persistence.store('settings', {ok: rnd}, 'check').then(function() {
          found = true;
        });
        waitsFor(function() { return found && persistence.errors.length > 0; });
        runs(function() {
          var error = persistence.errors[0];
          expect(error.message).toEqual("Failed to store object");
          expect(error.store).toEqual("settings");
          expect(error.key).toEqual("check");
        });
      });
    });
    
    it("should store images and sounds for stored board records", function() {
      db_wait(function() {
        var record = {
          board: {
            id: '1234',
            key: 'tmp/bread',
            name: "my picture" + Math.random()
          },
          images: [{
            id: '2345',
            url: 'data:image/png;base64,00000' + Math.random()
          }, {
            id: '3456',
            url: 'data:image/png;base64,00001' + Math.random()
          }],
          sounds: [{
            id: '4567',
            url: 'data:audio/mp3;base64,00002' + Math.random()
          }, {
            id: '5678',
            url: 'data:audio/mp3;base64,00003' + Math.random()
          }]
        };
        var rnd = Math.random() + "_" + (new Date()).toString();
        var found = [];
        persistence.log = [];
        persistence.store('board', record);
        waitsFor(function() { return persistence.log.length == 5; });
        runs(function() {
          persistence.find('board', record.board.id).then(function(res) {
            found.push(res);
          });
          persistence.find('image', record.images[0].id).then(function(res) {
            found.push(res);
          });
          persistence.find('image', record.images[1].id).then(function(res) {
            found.push(res);
          });
          persistence.find('sound', record.sounds[0].id).then(function(res) {
            found.push(res);
          });
          persistence.find('sound', record.sounds[1].id).then(function(res) {
            found.push(res);
          });
        });
        waitsFor(function() { return found.length == 5; });
        runs(function() {
          expect(found.find(function(r) { return r.id == record.board.id })).not.toEqual(null);
          expect(found.find(function(r) { return r.id == record.board.id }).name).toEqual(record.board.name);
          expect(found.find(function(r) { return r.id == record.images[0].id })).not.toEqual(null);
          expect(found.find(function(r) { return r.id == record.images[0].id }).url).toEqual(record.images[0].url);
          expect(found.find(function(r) { return r.id == record.images[1].id })).not.toEqual(null);
          expect(found.find(function(r) { return r.id == record.images[1].id }).url).toEqual(record.images[1].url);
          expect(found.find(function(r) { return r.id == record.sounds[0].id })).not.toEqual(null);
          expect(found.find(function(r) { return r.id == record.sounds[0].id }).url).toEqual(record.sounds[0].url);
          expect(found.find(function(r) { return r.id == record.sounds[1].id })).not.toEqual(null);
          expect(found.find(function(r) { return r.id == record.sounds[1].id }).url).toEqual(record.sounds[1].url);
        });
      });
    });
  });
  describe("store_url", function() {
    it("should return a promise", function() {
      var res = persistence.store_url("data:bacon");
      expect(res.then).not.toEqual(null);
    });
    
    it("should resolve immediately on a data_uri", function() {
      var done = false;
      var res = persistence.store_url("data:bacon").then(function() {
        done = true;
      });
      waitsFor(function() { return done; });
    });
    
    it("should make an API call to proxy the URL", function() {
      stub(persistence, 'ajax', function(options) {
        return Ember.RSVP.resolve({
          content_type: 'image/png',
          data: 'data:nunya'
        });
      });
      var result = null;
      persistence.store_url("http://www.example.com/pic.png", 'image').then(function(res) {
        result = res;
      });
      waitsFor(function() { return result; });
      runs(function() {
        expect(result.url).toEqual("http://www.example.com/pic.png");
        expect(result.type).toEqual("image");
        expect(result.content_type).toEqual("image/png");
        expect(result.data_uri).toEqual("data:nunya");
      });
    });
    
    it("should store the API results in the dataCache table", function() {
      db_wait(function() {
        stub(persistence, 'ajax', function(options) {
          return Ember.RSVP.resolve({
            content_type: 'image/png',
            data: 'data:nunya'
          });
        });
        var result = null;
        var record = null;
        persistence.stores = [];
        persistence.store_url("http://www.example.com/pic.png", 'image').then(function(res) {
          result = res;
        });
        waitsFor(function() { return result && persistence.stores.length > 0; });
        runs(function() {
          setTimeout(function() {
            persistence.find('dataCache', 'http://www.example.com/pic.png').then(function(res) {
              record = res;
            });
          }, 10);
        });
        waitsFor(function() { return record; });
      });
    });
    
    it("should error on a failed API call", function() {
      db_wait(function() {
        stub(persistence, 'ajax', function(options) {
          return Ember.RSVP.reject({error: "bacon"});
        });
        var result = null;
        persistence.store_url("http://www.example.com/pic.png", 'image').then(function() { debugger }, function(res) {
          result = res;
        });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result.error).toEqual('URL lookup failed during proxy');
        });
      });
    });
    it("should error on a failed data storage", function() {
      stub(persistence, 'ajax', function(options) {
        return Ember.RSVP.resolve({
          content_type: 'image/png',
          data: 'data:nunya'
        });
      });
      stub(persistence, 'store', function() {
        return Ember.RSVP.reject({error: "no no"});
      });
      var result = null;
      persistence.store_url("http://www.example.com/pic.png", 'image').then(null, function(res) {
        result = res;
      });
      waitsFor(function() { return result; });
      runs(function() {
        expect(result.error).toEqual("saving to data cache failed");
      });
    });
  });

  describe("sync", function() {
    describe("sync_status", function() {
    });
  });
//   syncing: function() {
//     return this.get('sync_status') == 'syncing';
//   }.property('sync_status'),
//   sync_failed: function() {
//     return this.get('sync_status') == 'failed';
//   }.property('sync_status'),
//   sync_succeeded: function() {
//     return this.get('sync_status') == 'succeeded';
//   }.property('sync_status'),
//   sync: function(force) {
//     this.set('sync_status', 'syncing');
  describe("temporary_id", function() {
    it("should generate a valid unique id", function() {
      var a = persistence.temporary_id();
      expect(a).not.toEqual(null);
      expect(!!a.match(/^tmp_/)).toEqual(true);
      var b = persistence.temporary_id();
      var c = persistence.temporary_id();
      expect(a).not.toEqual(b);
      expect(a).not.toEqual(c);
      expect(b).not.toEqual(c);
    });
  });
  describe("convert_model_to_json", function() {
    it("should serialize a record", function() {
      var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
      var json = persistence.convert_model_to_json(CoughDrop.store, LingoLinq.Board, board);
      expect(json).not.toEqual(null);
      expect(json.board).not.toEqual(null);
      expect(!!json.board.key.match(/^tmp_.+\/cool/)).toEqual(true);
      expect(json.board.name).toEqual("My Awesome Board");
      expect(!!json.board.id.match(/^tmp_/)).toEqual(true);
    });
    it("should call mimic_server_processing if defined", function() {
      var called = false;
      var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
      stub(LingoLinq.Board, 'mimic_server_processing', function(record, data) {
        called = true;
        data.cookie = true;
        return data;
      });
      var json = persistence.convert_model_to_json(CoughDrop.store, LingoLinq.Board, board);
      expect(json).not.toEqual(null);
      expect(json.board).not.toEqual(null);
      expect(json.board.key).toEqual('ok/cool');
      expect(json.board.name).toEqual("My Awesome Board");
      expect(json.cookie).toEqual(true);
      expect(!!json.board.id.match(/^tmp_/)).toEqual(true);
    });
  });

  describe("offline_reject", function() {
    it("should return a promise", function() {
      var promise = persistence.offline_reject();
      expect(promise.then).not.toEqual(null);
      var res = null;
      promise.then(function() {
        res = {};
      }, function(err) {
        res = err;
      });
      waitsFor(function() { return res; });
      runs(function() {
        expect(res.error).toEqual("not online");
        expect(res.offline).toEqual(true);
      });
    });
  });

  describe("ajax", function() {
    it("should resolve on 200 response", function() {
      stub(Ember.$, 'realAjax', function(options) {
        return Ember.RSVP.resolve({});
      });
      var resolved = false;
      persistence.ajax({}).then(function() {
        resolved = true;
      }, function() {
      });
      waitsFor(function() { return resolved; });
    });
    it("should reject on non-2xx response", function() {
      stub(Ember.$, 'realAjax', function(options) {
        return Ember.RSVP.reject({status: 300});
      });
      var rejected = false;
      persistence.ajax({}).then(function() {
      }, function() {
        rejected = true;
      });
      waitsFor(function() { return rejected; });
    });
    it("should reject on 200 response with error and status attributes", function() {
      stub(Ember.$, 'realAjax', function(options) {
        return Ember.RSVP.reject({error: "bad things", status: 400});
      });
      var rejected = false;
      persistence.ajax({}).then(function() {
      }, function() {
        rejected = true;
      });
      waitsFor(function() { return rejected; });
    });
  });

  describe("connecting (onLine)", function() {
    it("should be online by default", function() {
      expect(persistence.get('online')).toEqual(true);
    });
    it("should call sync when changing to online", function() {
      LingoLinq.sync_testing = true;
      var online = persistence.get('online');
      var called = false;
      stub(persistence, 'sync', function() {
        called = true;
      });
      persistence.set('online', false);
      expect(called).toEqual(false);
      persistence.set('online', true);
      waitsFor(function() { return called; })
      persistence.set('online', online);
      LingoLinq.sync_testing = false;
    });
//     it("should set to offline on event", function() {
//       var online = persistence.get('online');
//       Ember.$(document).trigger('offline');
//       expect(persistence.get('online')).toEqual(false);
//       persistence.set('online', online);
//     });
//     it("should set to online on event", function() {
//       var online = persistence.get('online');
//       Ember.$(document).trigger('offline');
//       expect(persistence.get('online')).toEqual(false);
//       Ember.$(document).trigger('online');
//       expect(persistence.get('online')).toEqual(true);
//       persistence.set('online', online);
//     });
  });

  describe("DSAdapter", function() {
    describe("find", function() {
      it("should return a promise", function() {
        var res = LingoLinq.store.find('board', '1234');
        expect(res.then).not.toEqual(null);
      });
      it("should make an ajax query and find the record", function() {
        var promise = Ember.RSVP.resolve({board: {
          id: '987',
          name: 'Cool Board'
        }});
        queryLog.defineFixture({
          method: 'GET',
          type: LingoLinq.Board,
          response: promise,
          id: "987"
        });
        var result = null;
        LingoLinq.store.find('board', '987').then(function(res) {
          result = res;
        });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result.get('name')).toEqual('Cool Board');
        });
      });
      it("should persist the record to the local db", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          stub(Ember.$, 'realAjax', function(options) {
            if(options.url == '/api/v1/boards/9876') {
              return Ember.RSVP.resolve({board: {
                id: '9876',
                name: 'Cool Board'
              }});
            } else {
              return Ember.RSVP.reject({});
            }
          });
          var local = null;
          stub(persistence, 'store_eventually', function(store, obj) {
            local = obj;
            return Ember.RSVP.resolve(obj);
          });
          
          var result = null;
          LingoLinq.store.find('board', '9876').then(function(res) {
            result = res;
          });
          waitsFor(function() { return result; });
          runs(function() {
            expect(local).not.toEqual(null);
            expect(local.board.name).toEqual("Cool Board");
          });
        });
      });
      
      it("should skip straight to a db lookup when offline", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          persistence.set('online', false);
          var ajax_called = null;
          stub(Ember.$, 'realAjax', function(options) {
            ajax_called = true;
            return Ember.RSVP.reject({});
          });
          stub(persistence, 'find', function(store, key) {
            return Ember.RSVP.resolve({board: {
                id: '9876',
                name: 'Cool Board'
            }});
          });
          
          var result = null;
          LingoLinq.store.find('board', '9876').then(function(res) {
            result = res;
          });
          waitsFor(function() { return result; });
          runs(function() {
            expect(ajax_called).toEqual(null);
            expect(result.get('id')).toEqual('9876');
            expect(result.get('name')).toEqual('Cool Board');
          });
        });
      });
      
      it("should skip straight to a db lookup when finding a local id", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          var ajax_called = null;
          stub(Ember.$, 'realAjax', function(options) {
            ajax_called = true;
            return Ember.RSVP.reject({});
          });
          stub(persistence, 'find', function(store, key) {
            return Ember.RSVP.resolve({board: {
                id: 'tmp_abcd',
                name: 'Cool Board'
            }});
          });
          
          var result = null;
          LingoLinq.store.find('board', 'tmp_abcd').then(function(res) {
            result = res;
          });
          waitsFor(function() { return result; });
          runs(function() {
            expect(ajax_called).toEqual(null);
            expect(result.get('id')).toEqual('tmp_abcd');
            expect(result.get('name')).toEqual('Cool Board');
          });
        });
      });
      
      it("should reject if offline and not found in the local db", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          persistence.set('online', false);
          var ajax_called = null;
          stub(Ember.$, 'realAjax', function(options) {
            ajax_called = true;
            return Ember.RSVP.reject({});
          });
          stub(persistence, 'find', function(store, key) {
            return Ember.RSVP.reject({});
          });
          
          var result = null;
          LingoLinq.store.find('board', '8765').then(null, function(res) {
            result = res;
          });
          waitsFor(function() { return result; });
          runs(function() {
            expect(ajax_called).toEqual(null);
            expect(result.error).toEqual("not online");
          });
        });
      });
      
      it("should find a locally-created record while offline", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          persistence.set('online', false);
          var record = null;
          var found_record = null;

          var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
          board.save().then(function(res) {
            record = res;
          });
          
          waitsFor(function() { return record; });
          runs(function() {
            setTimeout(function() {
              persistence.find('board', record.id).then(function(res) {
                found_record = res;
              });
            }, 50);
          });
          waitsFor(function() { return found_record; });
        });
      });
    });

    describe("createRecord", function() {
      it("should make an ajax call if online", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          stub(Ember.$, 'realAjax', function(options) {
            return Ember.RSVP.reject({});
          });
          var result = null;
          var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
          board.save().then(function() { debugger; }, function(res) {
            result = true;
          });
          waitsFor(function() { return result; });
        });
      });
      
      it("should persist to the local db if successfully created online", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          var rnd = Math.random().toString();
          stub(Ember.$, 'realAjax', function(options) {
            return Ember.RSVP.resolve({
              board: {id: '1', key: 'ok/cool', name: "My Awesome Board" + rnd}
            });
          });
          var result = null;
          var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
          persistence.log = [];
          board.save().then(function(res) {
            result = res;
          });
          waitsFor(function() { return result && persistence.log.length > 0; });
          var raw = null;
          runs(function() {
            setTimeout(function() {
              expect(result.get('name')).toEqual("My Awesome Board" + rnd);
              lingoLinqExtras.storage.find('board', 'ok/cool').then(function(res) {
                raw = res;
              });
            }, 10);
          });
          waitsFor(function() { return raw; });
          runs(function() {
            var record = raw.raw;
            expect(raw.changed).toEqual(false);
            expect(record.id).toEqual('1');
            expect(record.name).toEqual("My Awesome Board" + rnd);
          });
        });
      });
      
      it("should store a version locally if offline", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          persistence.set('online', false);
          var record = null;
          var found_record = null;

          var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
          board.save().then(function(res) {
            record = res;
          });
          
          waitsFor(function() { return record; });
          runs(function() {
            setTimeout(function() {
              persistence.find('board', record.id).then(function(res) {
                found_record = res;
              });
            }, 50);
          });
          waitsFor(function() { return found_record; });
          runs(function() {
            expect(!!found_record.id.match(/^tmp_/)).toEqual(true);
            expect(!!found_record.key.match(/^tmp_.+\/cool/)).toEqual(true);
            expect(found_record.name).toEqual("My Awesome Board");
          });
        });
      });

      it("should mark a locally-created record as changed for later sync", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          persistence.set('online', false);
          var record = null;
          var found_record = null;

          var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
          board.save().then(function(res) {
            record = res;
          });
          
          var raw = null;
          waitsFor(function() { return record; });
          runs(function() {
            expect(!!record.get('key').match(/^tmp_.+\/cool/)).toEqual(true);
            setTimeout(function() {
              lingoLinqExtras.storage.find('board', record.get('key')).then(function(res) {
                raw = res;
              });
            }, 50);
          });
          waitsFor(function() { return raw; });
          runs(function() {
            expect(raw.changed).toEqual(true);
          });
        });
      });
      
      it("should store an image uploaded locally if offline", function() { 
        db_wait(function() {
          queryLog.real_lookup = true;
          persistence.set('online', false);
          var obj = Ember.Object.create({
            'controllers': {'application': {
              'currentUser': Ember.Object.create({user_name: 'bob', profile_url: 'http://www.bob.com/bob'})
            }}
          });
          var controller = Ember.Object.extend({
            send: function(message) {
              this.sentMessages[message] = arguments;
            },
            model: Ember.Object.create()
          }).create({
            sentMessages: {},
            id: '456',
            licenseOptions: [],
            'controllers': {'board': obj}
          });
          var button = Ember.Object.extend({
            findContentLocally: function() {
              this.foundContentLocally = true;
              return Ember.RSVP.resolve(true);
            }
          }).create();
          pictureGrabber.setup(button, controller);
          controller.set('image_preview', {url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=='});
          var button_set = false;
          stub(editManager, 'change_button', function(id, args) { 
            if(id == '456' && args.image_id == '123') { button_set = true; }
          });
          pictureGrabber.select_image_preview();
          
          var record = null;
          waitsFor(function() { return controller.get('image'); });
          runs(function() {
            expect(!!controller.get('image.id').match(/^tmp_/)).toEqual(true);
            expect(controller.get('image.url')).toEqual('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==');
            expect(controller.get('image_preview')).toEqual(null);
            setTimeout(function() {
              persistence.find('image', controller.get('image.id')).then(function(res) {
                record = res;
              });
            }, 50);
          });
          waitsFor(function() { return record; });
          runs(function() {
            expect(!!record.id.match(/^tmp_/)).toEqual(true);
            expect(record.url).toEqual('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==');
          });
        });
      });
    });

    describe("updateRecord", function() {
      it("should make an ajax call if online", function() {
        push_board(function() {
          queryLog.real_lookup = true;
          stub(Ember.$, 'realAjax', function(options) {
            return Ember.RSVP.reject({});
          });
          var result = null;
          board.set('name', 'Cool Board');
          board.save().then(function() { debugger; }, function(res) {
            result = true;
          });
          waitsFor(function() { return result; });
        });
      });
      
      it("should persist an updated record to the local db", function() {
        push_board(function() {
          queryLog.real_lookup = true;
          stub(Ember.$, 'realAjax', function(options) {
            return Ember.RSVP.resolve({ board: {
              id: '1234',
              name: 'Righteous Board'
            }});
          });
          var result = null;
          board.set('name', 'Cool Board');
          board.save().then(function(res) { 
            result = res;
          }, function(res) { debugger });
          
          var record = null;
          waitsFor(function() { return result; });
          runs(function() {
            setTimeout(function() {
              persistence.find('board', '1234').then(function(res) {
                record = res;
              });
            }, 50);
          });
          waitsFor(function() { return record; });
          runs(function() {
            expect(record.name).toEqual("Righteous Board");
          });
        });
      });
      
      it("should update a locally-created record that hasn't been persisted yet", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          persistence.set('online', false);
          var record = null;
          var final_record = null;

          var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
          board.save().then(function(res) {
            record = res;
          });
          
          waitsFor(function() { return record; });
          runs(function() {
            expect(!!record.get('id').match(/^tmp_/)).toEqual(true);
            expect(!!record.get('key').match(/^tmp_.+\/cool/)).toEqual(true);
            expect(record.get('name')).toEqual("My Awesome Board");
            Ember.run.later(function() {
              record.set('name', 'My Gnarly Board');
              record.save().then(function(res) {
                setTimeout(function() {
                  persistence.find('board', record.id).then(function(res) {
                    final_record = res;
                  }, function() { debugger });
                }, 50);
              }, function() { debugger });
            }, 50);
          });
          waitsFor(function() { return final_record; });
          runs(function() {
            expect(final_record.id).toEqual(record.id);
            expect(final_record.name).toEqual("My Gnarly Board");
          });
        })
      });
      
      it("should mark a locally-updated record as changed for later sync", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          persistence.set('online', false);
          var record = null;
          var final_record = null;

          var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
          board.save().then(function(res) {
            record = res;
          });
          
          waitsFor(function() { return record; });
          runs(function() {
            expect(!!record.get('id').match(/^tmp_/)).toEqual(true);
            expect(!!record.get('key').match(/^tmp_.+\/cool/)).toEqual(true);
            expect(record.get('name')).toEqual("My Awesome Board");
            Ember.run.later(function() {
              record.set('name', 'My Gnarly Board');
              record.save().then(function(res) {
                setTimeout(function() {
                  lingoLinqExtras.storage.find('board', record.id).then(function(res) {
                    final_record = res;
                  });
                }, 50);
              }, function() { debugger });
            }, 50);
          });
          waitsFor(function() { return final_record; });
          runs(function() {
            expect(final_record.changed).toEqual(true)
            expect(final_record.id).toEqual(record.id);
            expect(final_record.raw.name).toEqual("My Gnarly Board");
          });
        })
      });
      
      it("should ajax-create a locally-created record if updating and now online", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          persistence.set('online', false);
          var record = null;
          var final_record = null;

          var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
          board.save().then(function(res) {
            record = res;
          });
          stub(Ember.$, 'realAjax', function(options) {
            if(options.type == 'POST' && options.url == "/api/v1/boards") {
              if(JSON.parse(options.data).board.name == "My Gnarly Board") {
                return Ember.RSVP.resolve({ board: {
                  id: '1234',
                  name: 'Righteous Board'
                }});
              }
            }
            return Ember.RSVP.reject({});
          });
          
          waitsFor(function() { return record; });
          runs(function() {
            expect(!!record.get('id').match(/^tmp_/)).toEqual(true);
            expect(!!record.get('key').match(/^tmp_.+\/cool/)).toEqual(true);
            expect(record.get('name')).toEqual("My Awesome Board");
            var tmp_id = record.get('id');
            Ember.run.later(function() {
              persistence.set('online', true);
              record.set('name', 'My Gnarly Board');
              record.save().then(function(res) {
                setTimeout(function() {
                  persistence.find('board', res.id).then(function(res) {
                    final_record = res;
                  });
                }, 50);
              }, function() { debugger });
            }, 50);
          });
          waitsFor(function() { return final_record; });
          runs(function() {
            expect(final_record.id).toEqual('1234');
            expect(final_record.name).toEqual("Righteous Board");
          });
        })
      });
      it("should ajax-update a remotely-created, locally-updated record if updating and now online", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          var record = null;
          var updated_record = null;
          var final_record = null;

          var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
          board.save().then(function(res) {
            record = res;
          });
          stub(Ember.$, 'realAjax', function(options) {
            if(options.type == 'POST' && options.url == "/api/v1/boards") {
              if(JSON.parse(options.data).board.name == "My Awesome Board") {
                return Ember.RSVP.resolve({ board: {
                  id: '1234',
                  name: 'Righteous Board'
                }});
              }
            } else if(options.type == 'PUT' && options.url == "/api/v1/boards/1234") {
              if(JSON.parse(options.data).board.name == "Super Board") {
                return Ember.RSVP.resolve({ board: {
                  id: '1234',
                  name: 'Stellar Board'
                }});
              }
            }
            return Ember.RSVP.reject({});
          });
          
          waitsFor(function() { return record; });
          runs(function() {
            Ember.run.later(function() {
              expect(record.get('id')).toEqual("1234");
              expect(record.get('name')).toEqual("Righteous Board");
              persistence.set('online', false);
              record.set('name', 'My Gnarly Board');
              record.save().then(function(res) {
                updated_record = res;
              }, function() { debugger });
            }, 10)
          });
          waitsFor(function() { return updated_record; });
          runs(function() {
            Ember.run(function() {
              expect(updated_record.get('id')).toEqual("1234");
              expect(updated_record.get('name')).toEqual("My Gnarly Board");
              persistence.set('online', true);
              updated_record.set('name', 'Super Board');
              updated_record.save().then(function(res) {
                final_record = res;
              });
            });
          });
          waitsFor(function() { return final_record; });
          runs(function() {
            expect(final_record.get('id')).toEqual('1234');
            expect(final_record.get('name')).toEqual("Stellar Board");
          });
        })
      });

      it("should delete the temporary record once successfully persisted to the server", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          persistence.set('online', false);
          var record = null;
          var final_record = null;
          var deleted_record = null;

          var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
          board.save().then(function(res) {
            record = res;
          });
          stub(Ember.$, 'realAjax', function(options) {
            if(options.type == 'POST' && options.url == "/api/v1/boards") {
              if(JSON.parse(options.data).board.name == "My Gnarly Board") {
                return Ember.RSVP.resolve({ board: {
                  id: '1234',
                  name: 'Righteous Board'
                }});
              }
            }
            return Ember.RSVP.reject({});
          });
          persistence.removals = [];
          var tmp_id = null;
          waitsFor(function() { return record; });
          runs(function() {
            expect(!!record.get('id').match(/^tmp_/)).toEqual(true);
            var tmp_key = record.get('key');
            tmp_id = record.get('id');
            expect(!!record.get('key').match(/^tmp_.+\/cool/)).toEqual(true);
            expect(record.get('name')).toEqual("My Awesome Board");
            Ember.run.later(function() {
              persistence.set('online', true);
              record.set('name', 'My Gnarly Board');
              record.save().then(function(res) {
                setTimeout(function() {
                  persistence.find('board', tmp_key).then(function(res) {
                    final_record = res;
                  });
                }, 150);
              }, function() { debugger });
            }, 150);
          });
          waitsFor(function() { return persistence.removals.length > 0; });
          runs(function() {
            setTimeout(function() {
              persistence.find('board', tmp_id).then(function() { debugger }, function() {
                deleted_record = true;
              });
            }, 150);
          });
          waitsFor(function() { return final_record && deleted_record; });
          runs(function() {
            expect(final_record.id).toEqual('1234');
            expect(final_record.name).toEqual("Righteous Board");
          });
        })
      });
      
      it("should still allow finding by the temporary board key after persisted remotely", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          persistence.set('online', false);
          var record = null;
          var final_record = null;
          var deleted_record = null;

          var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
          board.save().then(function(res) {
            record = res;
          });
          stub(Ember.$, 'realAjax', function(options) {
            if(options.type == 'POST' && options.url == "/api/v1/boards") {
              if(JSON.parse(options.data).board.name == "My Gnarly Board") {
                return Ember.RSVP.resolve({ board: {
                  id: '1234',
                  name: 'Righteous Board'
                }});
              }
            }
            return Ember.RSVP.reject({});
          });
          
          waitsFor(function() { return record; });
          var tmp_id = null;
          persistence.removals = [];
          runs(function() {
            expect(!!record.get('id').match(/^tmp_/)).toEqual(true);
            var tmp_key = record.get('key');
            tmp_id = record.get('id');
            expect(!!record.get('key').match(/^tmp_.+\/cool/)).toEqual(true);
            expect(record.get('name')).toEqual("My Awesome Board");
            Ember.run.later(function() {
              persistence.set('online', true);
              record.set('name', 'My Gnarly Board');
              record.save().then(function(res) {
                setTimeout(function() {
                  persistence.find('board', tmp_key).then(function(res) {
                    final_record = res;
                  });
                }, 500);
              }, function() { debugger });
            }, 150);
          });
          waitsFor(function() { return persistence.removals.length > 0; });
          runs(function() {
            setTimeout(function() {
              if(capabilities.dbman.repo.board.length == 2) { debugger }
              persistence.find('board', tmp_id).then(function() { debugger }, function() {
                deleted_record = true;
              });
            }, 150);
          });
          waitsFor(function() { return final_record && deleted_record; });
          runs(function() {
            expect(final_record.id).toEqual('1234');
            expect(final_record.name).toEqual("Righteous Board");
          });
        })
      });
    });

    describe("deleteRecord", function() {
      it("should make an ajax call if online", function() {
        push_board(function() {
          queryLog.real_lookup = true;
          var called = false;
          stub(Ember.$, 'realAjax', function(options) {
            if(options.type == 'DELETE' && options.url == '/api/v1/boards/1234') {
              called = true;
            }
            return Ember.RSVP.reject({});
          });
          var result = null;
          board.deleteRecord();
          board.save().then(function() { debugger; }, function(res) {
            result = true;
          });
          waitsFor(function() { return result && called; });
        });
      });
      
      it("should remove from the local db if successfully deleted", function() {
        push_board(function() {
          queryLog.real_lookup = true;
          var called = false;
          stub(Ember.$, 'realAjax', function(options) {
            if(options.type == 'DELETE' && options.url == '/api/v1/boards/1234') {
              called = true;
            }
            return Ember.RSVP.resolve({board: {id: '1234'}});
          });
          var deleted = null;
          persistence.removals = [];
          board.deleteRecord();
          board.save().then(function(res) {
            result = true;
          }, function() { debugger });
          waitsFor(function() { return persistence.removals.length > 0; });
          runs(function() {
            setTimeout(function() {
              persistence.find('board', '1234').then(function() { debugger; }, function() {
                deleted = true;
              });
            }, 10);
          });
          waitsFor(function() { return deleted && called; });
        });
      });
      
      it("should delete a locally-created record", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          persistence.set('online', false);
          var record = null;
          var deleted = null;

          persistence.removals = [];
          var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
          board.save().then(function(res) {
            record = res;
          });
          
          var record_id = null;
          waitsFor(function() { return record; });
          runs(function() {
            expect(!!record.get('id').match(/^tmp_/)).toEqual(true);
            expect(!!record.get('key').match(/^tmp_.+\/cool/)).toEqual(true);
            expect(record.get('name')).toEqual("My Awesome Board");
            Ember.run.later(function() {
              record_id = record.id;
              record.deleteRecord();
              record.save().then(function(res) {
              }, function() { debugger });
            }, 50);
          });
          waitsFor(function() { return persistence.removals.length > 0; });
          runs(function() {
            persistence.find('board', record_id).then(function(res) {
              final_record = res;
            }, function() { deleted = true; });
          });
          waitsFor(function() { return deleted; });
        })
      });
      
      it("should delete from the local db and remember the delete if offline for later sync", function() {
        push_board(function() {
          queryLog.real_lookup = true;
          persistence.set('online', false);
          var deleted = null;
          persistence.removals = [];
          board.deleteRecord();
          board.save().then(function(res) {
            Ember.run.later(function() {
              persistence.find('board', '1234').then(function() { debugger; }, function() {
                deleted = true;
              });
            }, 10);
            result = true;
          }, function() { debugger });
          var found_deletion = null;
          waitsFor(function() { return deleted && persistence.removals.length > 0; });
          runs(function() {
            Ember.run.later(function() {
              lingoLinqExtras.storage.find('deletion', 'board_1234').then(function() {
                found_deletion = true;
              });
            }, 10);
          });
          var marked_changed = false;
          waitsFor(function() { return found_deletion; });
          runs(function() {
            persistence.find_changed().then(function(list) {
              marked_changed = list.find(function(i) { return i.store == 'deletion' && i.data.storageId == 'board_1234'; });
            }, function(err) { debugger });
          });
          waitsFor(function() { return marked_changed; });
        });
      });
      
      it("should delete from the server when sync is finally called", function() {
        push_board(function() {
          queryLog.real_lookup = true;
          persistence.set('online', false);
          var deleted = null;
          persistence.removals = [];
          board.deleteRecord();
          board.save().then(function(res) {
            result = true;
          }, function() { debugger });
          waitsFor(function() { return persistence.removals.length > 0; });
          runs(function() {
            setTimeout(function() {
              persistence.find('board', '1234').then(function() { debugger; }, function() {
                deleted = true;
              });
            }, 50);
          });
          var found_deletion = null;
          waitsFor(function() { return deleted && persistence.removals.length > 0; });
          runs(function() {
            setTimeout(function() {
              lingoLinqExtras.storage.find('deletion', 'board_1234').then(function() {
                found_deletion = true;
              });
            }, 50);
          });

          var remotely_deleted = false;
          stub(Ember.$, 'realAjax', function(options) {
            if(options.url == '/api/v1/users/1256') {
              return Ember.RSVP.resolve({user: {
                id: '1256',
                user_name: 'fred'
              }});
            } else if(options.url == '/api/v1/boards/1234') {
              if(options.type == 'GET') {
                return Ember.RSVP.resolve({board: {
                  id: '1234',
                  key: 'fred/cool'
                }});
              } else if(options.type == 'DELETE') {
                remotely_deleted = true;
                return Ember.RSVP.resolve({board: {id: '1234'}});
              }
            }
            return Ember.RSVP.reject({});
          });
          waitsFor(function() { return found_deletion; });
          
          runs(function() {
            Ember.run.later(function() {
              persistence.set('online', true);
              persistence.sync(1256).then(null, function() { });
            }, 50);
          });
          waitsFor(function() { return remotely_deleted; });
        });
      });
    });

    describe("findAll", function() {
    });
//   findAll: function(store, type, id) {
//     debugger
//   },
    describe("findQuery", function() {
      it("should make an ajax call if online", function() {
        queryLog.real_lookup = true;
        
        var done = false;
        stub(Ember.$, 'realAjax', function(options) {
          return Ember.RSVP.resolve({board: [
            {id: '134'}
          ]});
        });
        LingoLinq.store.find('board', {user_id: 'example', starred: true, public: true}).then(function(res) {
          done = res.content && res.content[0] && res.content[0].id == '134'
        }, function() {
          debugger
        });
        waitsFor(function() { return done; });
      });
      it("should handle a failed ajax call if online", function() {
        queryLog.real_lookup = true;
        
        var done = false;
        stub(Ember.$, 'realAjax', function(options) {
          return Ember.RSVP.reject({});
        });
        LingoLinq.store.find('board', {user_id: 'example', starred: true, public: true}).then(function(res) {
          debugger
        }, function() {
          done = true
        });
        waitsFor(function() { return done; });
      });
      
      it("should reject if offline", function() {
        queryLog.real_lookup = true;
        persistence.set('online', false);
        
        var ajaxed = false;
        var rejected = false;
        stub(Ember.$, 'realAjax', function(options) {
          ajaxed = true;
        });
        LingoLinq.store.find('board', {user_id: 'example', starred: true, public: true}).then(function(res) {
          done = res.content && res.content[0] && res.content[0].id == '134'
        }, function() {
          rejected = true;
        });
        waitsFor(function() { return rejected && !ajaxed; });
      });
    });
  });
  
  describe("sync", function() {
    it("should return a promise", function() {
      var done = false;
      var res = persistence.sync(1);
      expect(persistence.get('sync_status')).toEqual('syncing');
      expect(res.then).not.toEqual(null);
      res.then(function() { done = true; }, function() { done = true; });
      waitsFor(function() { return done; })
    });
    
    it("should make sure the local db is available and error if not", function() {
      db_wait(function() {
        var error = null;
        var db = capabilities.db;
        capabilities.db = null;
        var promise = new Ember.RSVP.Promise(function(resolve, reject) {
          called = true;
          resolve({user: {id: '134', user_name: 'fred'}});
        });
        queryLog.defineFixture({
          method: 'GET',
          type: LingoLinq.User,
          response: promise,
          id: "134"
        });

        persistence.sync(134).then(function() {
          capabilities.db = db;
        }, function(str) {
          capabilities.db = db;
          error = str;
        });
        stub(modal, 'error', function() {});
        waitsFor(function() { return error; });
        runs(function() {
          expect(error).toEqual({error: "db not initialized"});
        });
      });
    });

    
    it("should try to find the specified user, which should then persist that user to the local db", function() {
      var called = false;
      var promise = new Ember.RSVP.Promise(function(resolve, reject) {
        called = true;
        resolve({user: {id: '134', user_name: 'fred'}});
      });
      queryLog.defineFixture({
        method: 'GET',
        type: LingoLinq.User,
        response: promise,
        id: "134"
      });
      var done = false;
      persistence.sync(134).then(function() { done = true; }, function() { done = true; });
      waitsFor(function() { return called && done; })
    });
    
    it("should call find_changed", function() {
      var called = false;
      stub(persistence, 'find_changed', function() {
        called = true;
        return Ember.RSVP.resolve([]);
      });
      queryLog.defineFixture({
        method: 'GET',
        type: LingoLinq.User,
        response: Ember.RSVP.resolve({user: {id: '134', user_name: 'fred'}}),
        id: "134"
      });
      var done = false;
      persistence.sync(134).then(function() { done = true; }, function() { done = true; });
      waitsFor(function() { return called && done; })
    });
    
    
    it("should save the specified user's avatar as a data-uri", function() {
      LingoLinq.all_wait = true;
      var called = false;
      stub(persistence, 'store_url', function(url, type) {
        called = (url == "http://example.com/pic.png" && type == 'image');
        return Ember.RSVP.resolve({url: "http://example.com/pic.png"});
      });
      stub(persistence, 'find_changed', function() { return Ember.RSVP.resolve([]); });
      queryLog.defineFixture({
        method: 'GET',
        type: LingoLinq.User,
        response: Ember.RSVP.resolve({user: {id: '134', user_name: 'fred', avatar_url: 'http://example.com/pic.png'}}),
        id: "134"
      });
      var done = false;
      persistence.sync(134).then(function() { done = true; }, function() { done = true; });
      waitsFor(function() { return called && done; })
    });
    
    it("should traverse all the user's boards, saving their icons and buttons and sounds", function() {
      var stores = [];
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return Ember.RSVP.resolve({url: url});
      });
      stub(persistence, 'find_changed', function() { return Ember.RSVP.resolve([]); });
      queryLog.defineFixture({
        method: 'GET',
        type: LingoLinq.User,
        response: Ember.RSVP.resolve({user: {
          id: '134', 
          user_name: 'fred', 
          avatar_url: 'http://example.com/pic.png',
          preferences: {home_board: {id: '145'}}
        }}),
        id: "134"
      });
      queryLog.defineFixture({
        method: 'GET', 
        type: LingoLinq.Board,
        response: Ember.RSVP.resolve({board: {
          id: '145',
          image_url: 'http://example.com/board.png',
          buttons: [
            {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image.png'}
          ],
          sound: [
            {id: '3', url: 'http://example.com/sound.mp3'}
          ]
        }),
        id: '145'
      })
      queryLog.defineFixture({
        method: 'GET', 
        type: LingoLinq.Board,
        response: Ember.RSVP.resolve({board: {
          id: '167',
          image_url: 'http://example.com/board.png',
          buttons: [
            {id: '1', image_id: '2'}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image2.png'}
          ]
        }),
        id: '167'
      })
      var done = false;
      persistence.sync(134).then(function() { done = true; }, function() { done = true; });
      waitsFor(function() { return stores.length == 6 && done; })
      runs(function() {
        expect(stores.find(function(u) { return u == 'http://example.com/pic.png' })).not.toEqual(null);
        expect(stores.find(function(u) { return u == 'http://example.com/board.png' })).not.toEqual(null);
        expect(stores.find(function(u) { return u == 'http://example.com/image.png' })).not.toEqual(null);
        expect(stores.find(function(u) { return u == 'http://example.com/image2.png' })).not.toEqual(null);
        expect(stores.find(function(u) { return u == 'http://example.com/sound.mp3' })).not.toEqual(null);
      });
    });
    
    it("should not get stuck in a circular reference for board links", function() {
      var stores = [];
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return Ember.RSVP.resolve({url: url});
      });
      stub(persistence, 'find_changed', function() { return Ember.RSVP.resolve([]); });
      queryLog.defineFixture({
        method: 'GET',
        type: LingoLinq.User,
        response: Ember.RSVP.resolve({user: {
          id: '134', 
          user_name: 'fred', 
          avatar_url: 'http://example.com/pic.png',
          preferences: {home_board: {id: '145'}}
        }}),
        id: "134"
      });
      queryLog.defineFixture({
        method: 'GET', 
        type: LingoLinq.Board,
        response: Ember.RSVP.resolve({board: {
          id: '145',
          image_url: 'http://example.com/board.png',
          buttons: [
            {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image.png'}
          ],
          sound: [
            {id: '3', url: 'http://example.com/sound.mp3'}
          ]
        }),
        id: '145'
      })
      queryLog.defineFixture({
        method: 'GET', 
        type: LingoLinq.Board,
        response: Ember.RSVP.resolve({board: {
          id: '167',
          image_url: 'http://example.com/board.png',
          buttons: [
            {id: '1', image_id: '2', load_board: {id: '145'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image2.png'}
          ]
        }),
        id: '167'
      })
      var done = false;
      persistence.sync(134).then(function() { done = true; }, function() { done = true; });
      waitsFor(function() { return stores.length == 6 && done; })
      runs(function() {
        expect(stores.find(function(u) { return u == 'http://example.com/pic.png' })).not.toEqual(null);
        expect(stores.find(function(u) { return u == 'http://example.com/board.png' })).not.toEqual(null);
        expect(stores.find(function(u) { return u == 'http://example.com/image.png' })).not.toEqual(null);
        expect(stores.find(function(u) { return u == 'http://example.com/image2.png' })).not.toEqual(null);
        expect(stores.find(function(u) { return u == 'http://example.com/sound.mp3' })).not.toEqual(null);
      });
    });
    
    it("should persist to the local db the list of important ids", function() {
      db_wait(function() {
        var stores = [];
        stub(persistence, 'store_url', function(url, type) {
          stores.push(url);
          console.log(url);
          return Ember.RSVP.resolve({url: url});
        });
        stub(persistence, 'find_changed', function() { return Ember.RSVP.resolve([]); });

        queryLog.defineFixture({
          method: 'GET',
          type: LingoLinq.User,
          response: Ember.RSVP.resolve({user: {
            id: '1340', 
            user_name: 'fred', 
            avatar_url: 'http://example.com/pic.png',
            preferences: {home_board: {id: '145'}}
          }}),
          id: "1340"
        });
        queryLog.defineFixture({
          method: 'GET', 
          type: LingoLinq.Board,
          response: Ember.RSVP.resolve({board: {
            id: '145',
            image_url: 'http://example.com/board.png',
            buttons: [
              {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167'}}
            ],
            grid: {
              rows: 1,
              columns: 1,
              order: [['1']]
            }
          },
            image: [
              {id: '2', url: 'http://example.com/image.png'}
            ],
            sound: [
              {id: '3', url: 'http://example.com/sound.mp3'}
            ]
          }),
          id: '145'
        })
        queryLog.defineFixture({
          method: 'GET', 
          type: LingoLinq.Board,
          response: Ember.RSVP.resolve({board: {
            id: '167',
            image_url: 'http://example.com/board.png',
            buttons: [
              {id: '1', image_id: '2', load_board: {id: '145'}}
            ],
            grid: {
              rows: 1,
              columns: 1,
              order: [['1']]
            }
          },
            image: [
              {id: '2', url: 'http://example.com/image2.png'}
            ]
          }),
          id: '167'
        })
        var ids = null;

        Ember.run.later(function() {
          persistence.sync(1340).then(function() {
            setTimeout(function() {
              persistence.find('settings', 'importantIds').then(function(res) {
                ids = res.ids;
              }, function() { id = []; });
            }, 50);
          }, function() { ids = []; });
        }, 10);
        waitsFor(function() { return ids; });
        runs(function() {
          expect(ids.length).toEqual(10);
          expect(ids.find(function(u) { return u == 'user_1340' })).not.toEqual(null);
          expect(ids.find(function(u) { return u == 'dataCache_http://example.com/pic.png' })).not.toEqual(null);
          expect(ids.find(function(u) { return u == 'image_2' })).not.toEqual(null);
          expect(ids.find(function(u) { return u == 'dataCache_http://example.com/image.png' })).not.toEqual(null);
          expect(ids.find(function(u) { return u == 'sound_3' })).not.toEqual(null);
          expect(ids.find(function(u) { return u == 'dataCache_http://example.com/sound.mp3' })).not.toEqual(null);
          expect(ids.find(function(u) { return u == 'board_167' })).not.toEqual(null);
          expect(ids.find(function(u) { return u == 'dataCache_http://example.com/image2.png' })).not.toEqual(null);
          expect(ids.find(function(u) { return u == 'board_145' })).not.toEqual(null);
          expect(ids.find(function(u) { return u == 'dataCache_http://example.com/pic.png' })).not.toEqual(null);
        });
      });
    });
    
    it("should persist to the local db the timestamp of the last sync", function() {
      db_wait(function() {
        var stores = [];
        stub(persistence, 'store_url', function(url, type) {
          stores.push(url);
          console.log(url);
          return Ember.RSVP.resolve({url: url});
        });
        stub(persistence, 'find_changed', function() { return Ember.RSVP.resolve([]); });
        queryLog.defineFixture({
          method: 'GET',
          type: LingoLinq.User,
          response: Ember.RSVP.resolve({user: {
            id: '1340', 
            user_name: 'fred', 
            avatar_url: 'http://example.com/pic.png',
            preferences: {home_board: {id: '145'}}
          }}),
          id: "1340"
        });
        queryLog.defineFixture({
          method: 'GET', 
          type: LingoLinq.Board,
          response: Ember.RSVP.resolve({board: {
            id: '145',
            image_url: 'http://example.com/board.png',
            buttons: [
              {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167'}}
            ],
            grid: {
              rows: 1,
              columns: 1,
              order: [['1']]
            }
          },
            image: [
              {id: '2', url: 'http://example.com/image.png'}
            ],
            sound: [
              {id: '3', url: 'http://example.com/sound.mp3'}
            ]
          }),
          id: '145'
        })
        queryLog.defineFixture({
          method: 'GET', 
          type: LingoLinq.Board,
          response: Ember.RSVP.resolve({board: {
            id: '167',
            image_url: 'http://example.com/board.png',
            buttons: [
              {id: '1', image_id: '2', load_board: {id: '145'}}
            ],
            grid: {
              rows: 1,
              columns: 1,
              order: [['1']]
            }
          },
            image: [
              {id: '2', url: 'http://example.com/image2.png'}
            ]
          }),
          id: '167'
        })
        var stamp = false;
        var done = false;
        persistence.sync(1340).then(function() {
          setTimeout(function() {
            persistence.find('settings', 'lastSync').then(function(res) {
              stamp = res.last_sync;
              done = true;
            }, function() { done = true; });
          }, 50);
        }, function() { done = true; });
        var ts = (new Date()).getTime() / 1000;
        waitsFor(function() { return done && (stamp > (ts - 3)); });
      });
    });
    
    it("should resolve on completion", function() {
      db_wait(function() {
        var stores = [];
        stub(persistence, 'store_url', function(url, type) {
          stores.push(url);
          console.log(url);
          return Ember.RSVP.resolve({url: url});
        });
        stub(persistence, 'find_changed', function() { return Ember.RSVP.resolve([]); });
        queryLog.defineFixture({
          method: 'GET',
          type: LingoLinq.User,
          response: Ember.RSVP.resolve({user: {
            id: '1340', 
            user_name: 'fred', 
            avatar_url: 'http://example.com/pic.png',
            preferences: {home_board: {id: '145'}}
          }}),
          id: "1340"
        });
        queryLog.defineFixture({
          method: 'GET', 
          type: LingoLinq.Board,
          response: Ember.RSVP.resolve({board: {
            id: '145',
            image_url: 'http://example.com/board.png',
            buttons: [
              {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167'}}
            ],
            grid: {
              rows: 1,
              columns: 1,
              order: [['1']]
            }
          },
            image: [
              {id: '2', url: 'http://example.com/image.png'}
            ],
            sound: [
              {id: '3', url: 'http://example.com/sound.mp3'}
            ]
          }),
          id: '145'
        })
        queryLog.defineFixture({
          method: 'GET', 
          type: LingoLinq.Board,
          response: Ember.RSVP.resolve({board: {
            id: '167',
            image_url: 'http://example.com/board.png',
            buttons: [
              {id: '1', image_id: '2', load_board: {id: '178'}}
            ],
            grid: {
              rows: 1,
              columns: 1,
              order: [['1']]
            }
          },
            image: [
              {id: '2', url: 'http://example.com/image2.png'}
            ]
          }),
          id: '167'
        })
        queryLog.defineFixture({
          method: 'GET', 
          type: LingoLinq.Board,
          response: Ember.RSVP.resolve({board: {
            id: '178',
            image_url: 'http://example.com/board.png',
            buttons: [
              {id: '1', image_id: '2', load_board: {id: '178'}}
            ],
            grid: {
              rows: 1,
              columns: 1,
              order: [['1']]
            }
          },
            image: [
              {id: '2', url: 'http://example.com/image2.png'}
            ]
          }),
          id: '178'
        })
        var done = false;
        persistence.sync(1340).then(function() {
          done = true;
        });
        waitsFor(function() { return done; });
      });
    });
    
    it("should create any newly-created records from find_changed", function() {
      db_wait(function() {
        LingoLinq.all_wait = true;
        queryLog.real_lookup = true;
        persistence.set('online', false);
        var record = null;
        var found_record = null;
        var created = null;
        
        stub(Ember.$, 'realAjax', function(options) {
          if(options.url == '/api/v1/users/1340') {
            return Ember.RSVP.resolve({user: {
              id: '1340',
              user_name: 'fred'
            }});
          } else if(options.type == 'POST' && options.url == '/api/v1/boards') {
            if(JSON.parse(options.data).board.key == found_record.key) {
              created = true;
              return Ember.RSVP.resolve({board: {
                id: '1998',
                key: 'fred/cool'
              }});
            }
          }
          return Ember.RSVP.reject({});
        });

        var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
        board.save().then(function(res) {
          record = res;
        });
        
        waitsFor(function() { return record; });
        runs(function() {
          setTimeout(function() {
            persistence.find('board', record.id).then(function(res) {
              found_record = res;
            });
          }, 50);
        });
        var done = false;
        var found_record_id = null;
        waitsFor(function() { return found_record; });
        runs(function() {
          expect(!!found_record.id.match(/^tmp_/)).toEqual(true);
          expect(!!found_record.key.match(/^tmp_.+\/cool/)).toEqual(true);
          expect(found_record.name).toEqual("My Awesome Board");
          Ember.run.later(function() {
            found_record_id = found_record.id;
            persistence.set('online', true);
            persistence.sync(1340).then(null, function() {
              done = true;
            });
          });
        });
        var removed = false;
        waitsFor(function() { return done; });
        runs(function() {
          setTimeout(function() {
            persistence.find('board', '1998').then(function(res) {
              persistence.find('board', found_record_id).then(function() { debugger; }, function() {
                removed = true;
              });
            }, function() { debugger });
          }, 50);
        });
        waitsFor(function() { return removed; });
      });
    });
    
    it("should update any changed records from find_changed", function() {
      db_wait(function() {
        LingoLinq.all_wait = true;
        queryLog.real_lookup = true;
        var record = null;
        var updated_record = null;
        var remote_updated = null;

        var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
        board.save().then(function(res) {
          record = res;
        });
        stub(Ember.$, 'realAjax', function(options) {
          if(options.type == 'GET' && options.url == "/api/v1/users/1567") {
            return Ember.RSVP.resolve({ user: {
              id: '1567',
              user_name: 'freddy'
            }});
          } else if(options.type == 'POST' && options.url == "/api/v1/boards") {
            if(JSON.parse(options.data).board.name == "My Awesome Board") {
              return Ember.RSVP.resolve({ board: {
                id: '1234',
                name: 'Righteous Board'
              }});
            }
          } else if(options.type == 'PUT' && options.url == "/api/v1/boards/1234") {
            if(JSON.parse(options.data).board.name == "My Gnarly Board") {
              remote_updated = true;
              return Ember.RSVP.resolve({ board: {
                id: '1234',
                name: 'Stellar Board'
              }});
            }
          }
          return Ember.RSVP.reject({});
        });
        
        waitsFor(function() { return record; });
        runs(function() {
          Ember.run.later(function() {
            expect(record.get('id')).toEqual("1234");
            expect(record.get('name')).toEqual("Righteous Board");
            persistence.set('online', false);
            record.set('name', 'My Gnarly Board');
            record.save().then(function() {
              setTimeout(function() {
                lingoLinqExtras.storage.find('board', '1234').then(function(res) {
                  updated_record = res;
                });
              }, 50);
            }, function() { debugger });
          }, 50)
        });
        var done = false;
        waitsFor(function() { return updated_record; });
        runs(function() {
          Ember.run.later(function() {
            expect(updated_record.raw.id).toEqual("1234");
            expect(updated_record.raw.name).toEqual("My Gnarly Board");
            expect(updated_record.changed).toEqual(true);
            persistence.set('online', true);
            persistence.sync('1567').then(function() { debugger }, function() {
              done = true;
            });
          }, 10);
        });
        var final_record = null;
        waitsFor(function() { return done && remote_updated; });
        runs(function() {
          setTimeout(function() {
            persistence.find('board', '1234').then(function(res) {
              final_record = res;
            }, function() { debugger });
          }, 50);
        });
        waitsFor(function() { return final_record; });
        runs(function() {
          expect(final_record.name).toEqual("Stellar Board");
        });
      });
    });

    it("should delete from the server when sync is finally called 2", function() {
      push_board(function() {
        LingoLinq.all_wait = true;
        queryLog.real_lookup = true;
        persistence.set('online', false);
        var deleted = null;
        board.deleteRecord();
        board.save().then(function(res) {
          setTimeout(function() {
            persistence.find('board', '1234').then(function() { debugger; }, function() {
              deleted = true;
            });
            result = true;
          }, 50);
        }, function() { debugger });
        var found_deletion = null;
        waitsFor(function() { return deleted; });
        runs(function() {
          lingoLinqExtras.storage.find('deletion', 'board_1234').then(function() {
            found_deletion = true;
          });
        });

        var remotely_deleted = false;
        stub(Ember.$, 'realAjax', function(options) {
          if(options.url == '/api/v1/users/1256') {
            return Ember.RSVP.resolve({user: {
              id: '1256',
              user_name: 'fred'
            }});
          } else if(options.url == '/api/v1/boards/1234') {
            if(options.type == 'GET') {
              return Ember.RSVP.resolve({board: {
                id: '1234',
                key: 'fred/cool'
              }});
            } else if(options.type == 'DELETE') {
              remotely_deleted = true;
              return Ember.RSVP.resolve({board: {id: '1234'}});
            }
          } else {
            return Ember.RSVP.reject({});
          }
        });
        waitsFor(function() { return found_deletion; });
        runs(function() {
          Ember.run.later(function() {
            persistence.set('online', true);
            persistence.sync(1256).then(null, function() { });
          });
        });
        waitsFor(function() { return remotely_deleted; });
      });
    });

    it("should error on failure updating a changed record", function() {
      db_wait(function() {
        LingoLinq.all_wait = true;
        queryLog.real_lookup = true;
        var record = null;
        var updated_record = null;
        var remote_updated = null;

        var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
        board.save().then(function(res) {
          record = res;
        });
        stub(Ember.$, 'realAjax', function(options) {
          if(options.type == 'GET' && options.url == "/api/v1/users/1567") {
            return Ember.RSVP.resolve({ user: {
              id: '1567',
              user_name: 'freddy',
              avatar_url: 'data:image/png;base64,a0a'
            }});
          } else if(options.type == 'GET' && options.url == "/api/v1/board/1234") {
            return Ember.RSVP.resolve({ board: {
              id: '1234',
              name: 'Righteous Board'
            }});
          } else if(options.type == 'POST' && options.url == "/api/v1/boards") {
            if(JSON.parse(options.data).board.name == "My Awesome Board") {
              return Ember.RSVP.resolve({ board: {
                id: '1234',
                name: 'Righteous Board'
              }});
            }
          } else if(options.type == 'PUT' && options.url == "/api/v1/boards/1234") {
            if(JSON.parse(options.data).board.name == "Yodeling Board") {
              remote_updated = true;
              return Ember.RSVP.reject({});
            }
          }
          debugger
          return Ember.RSVP.reject({});
        });
        
        stub(persistence, 'find_changed', function() {
          return Ember.RSVP.resolve([
            {store: 'board', data: { raw: { id: '1234', name: 'Yodeling Board' } }}
          ]);
        });
        stub(modal, 'error', function() { });
        
        waitsFor(function() { return record; });
        runs(function() {
          Ember.run.later(function() {
            expect(record.get('id')).toEqual("1234");
            expect(record.get('name')).toEqual("Righteous Board");
            persistence.set('online', false);
            record.set('name', 'My Gnarly Board');
            record.save().then(function() {
              setTimeout(function() {
                lingoLinqExtras.storage.find('board', '1234').then(function(res) {
                  updated_record = res;
                });
              }, 50);
            }, function() { debugger });
          }, 50)
        });
        var error = null;
        waitsFor(function() { return updated_record; });
        runs(function() {
          Ember.run.later(function() {
            expect(updated_record.raw.id).toEqual("1234");
            expect(updated_record.raw.name).toEqual("My Gnarly Board");
            expect(updated_record.changed).toEqual(true);
            persistence.set('online', true);
            persistence.sync('1567').then(function() { debugger }, function(err) {
              error = err;
            });
          }, 50);
        });
        var final_record = null;
        waitsFor(function() { return error; });
        runs(function() {
          setTimeout(function() {
            persistence.find('board', '1234').then(function(res) {
              final_record = res;
            }, function() { debugger });
          }, 50);
        });
        waitsFor(function() { return final_record; });
        runs(function() {
          expect(final_record.name).toEqual("My Gnarly Board");
          expect(error.error).toEqual("failed to save board 1234");
        });
      });
    });
    
    it("should error on failure creating a changed record", function() {
      db_wait(function() {
        LingoLinq.all_wait = true;
        queryLog.real_lookup = true;
        persistence.set('online', false);
        var record = null;
        var found_record = null;
        var created = null;
        
        stub(Ember.$, 'realAjax', function(options) {
          if(options.url == '/api/v1/users/1340') {
            return Ember.RSVP.resolve({user: {
              id: '1340',
              user_name: 'fred',
              avatar_url: 'data:image/png;base64,a0a'
            }});
          } else if(options.type == 'POST' && options.url == '/api/v1/boards') {
            if(JSON.parse(options.data).board.key == found_record.key) {
              created = true;
              return Ember.RSVP.reject({});
            }
          }
          return Ember.RSVP.reject({});
        });
        stub(modal, 'error', function() { });
        stub(persistence, 'find_changed', function() {
          return Ember.RSVP.resolve([
            {store: 'board', data: {raw: {id: found_record.id, key: found_record.key} }}
          ]);
        });

        var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
        board.save().then(function(res) {
          record = res;
        });
        
        waitsFor(function() { return record; });
        runs(function() {
          setTimeout(function() {
            persistence.find('board', record.id).then(function(res) {
              found_record = res;
            });
          }, 50);
        });
        var error = null;
        waitsFor(function() { return found_record; });
        runs(function() {
          expect(!!found_record.id.match(/^tmp_/)).toEqual(true);
          expect(!!found_record.key.match(/^tmp_.+\/cool/)).toEqual(true);
          expect(found_record.name).toEqual("My Awesome Board");
          Ember.run.later(function() {
            persistence.set('online', true);
            persistence.sync(1340).then(null, function(err) {
              error = err;
            });
          });
        });
        var removed = false;
        waitsFor(function() { return error; });
        runs(function() {
          expect(error.error).toEqual('failed to save board null');
        });
      });
    });
    
    it("should upload a locally-created image file during sync", function() {
      db_wait(function() {
        queryLog.real_lookup = true;
        persistence.set('online', false);
        var obj = Ember.Object.create({
          'controllers': {'application': {
            'currentUser': Ember.Object.create({user_name: 'bob', profile_url: 'http://www.bob.com/bob'})
          }}
        });
        var controller = Ember.Object.extend({
          send: function(message) {
            this.sentMessages[message] = arguments;
          },
          model: Ember.Object.create()
        }).create({
          sentMessages: {},
          id: '456',
          licenseOptions: [],
          'controllers': {'board': obj}
        });
        var button = Ember.Object.extend({
          findContentLocally: function() {
            this.foundContentLocally = true;
            return Ember.RSVP.resolve(true);
          }
        }).create();
        pictureGrabber.setup(button, controller);
        controller.set('image_preview', {url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=='});
        var button_set = false;
        stub(editManager, 'change_button', function(id, args) { 
          if(id == '456' && args.image_id == '123') { button_set = true; }
        });
        pictureGrabber.select_image_preview();
        
        var record = null;
        waitsFor(function() { return controller.get('image'); });
        runs(function() {
          expect(!!controller.get('image.id').match(/^tmp_/)).toEqual(true);
          expect(controller.get('image.url')).toEqual('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==');
          expect(controller.get('image_preview')).toEqual(null);
          setTimeout(function() {
            persistence.find('image', controller.get('image.id')).then(function(res) {
              record = res;
            });
          }, 50);
        });

        stub(Ember.$, 'realAjax', function(options) {
          if(options.url == '/api/v1/users/1340') {
            return Ember.RSVP.resolve({user: {
              id: '1340',
              user_name: 'fred',
              avatar_url: 'data:image/png;base64,a0a'
            }});
          } else if(options.type == 'POST' && options.url == '/api/v1/images') {
            created = true;
            return Ember.RSVP.resolve({image: {
              id: '1432',
              url: 'http://example.com/pic.png'
            }});
          } else if(options.type == 'GET' && options.url == '/api/v1/images/1432') {
            return Ember.RSVP.resolve({image: {
              id: '1432',
              url: 'http://example.com/pic.png'
            }});
          }
          return Ember.RSVP.reject({});
        });
        stub(persistence, 'find_changed', function() {
          return Ember.RSVP.resolve([
            {store: 'image', data: {raw: record }}
          ]);
        });

        var done = false;
        waitsFor(function() { return record; });
        runs(function() {
          Ember.run.later(function() {
            expect(!!record.id.match(/^tmp_/)).toEqual(true);
            expect(record.url).toEqual('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==');
            persistence.set('online', true)
            persistence.sync(1340).then(function() {
              done = true;
            });
          });
        });
        waitsFor(function() { return done; });
      });
    });
    
    it("should upload a locally-created sound file during sync", function() {
      db_wait(function() {
        queryLog.real_lookup = true;
        persistence.set('online', false);
        var obj = Ember.Object.create({
          'controllers': {'application': {
            'currentUser': Ember.Object.create({user_name: 'bob', profile_url: 'http://www.bob.com/bob'})
          }}
        });
        var controller = Ember.Object.extend({
          send: function(message) {
            this.sentMessages[message] = arguments;
          },
          model: Ember.Object.create()
        }).create({
          sentMessages: {},
          id: '456',
          licenseOptions: [],
          'controllers': {'board': obj}
        });
        var button = Ember.Object.extend({
          findContentLocally: function() {
            this.foundContentLocally = true;
            return Ember.RSVP.resolve(true);
          }
        }).create();
        soundGrabber.setup(button, controller);
        controller.set('sound_preview', {url: 'data:audio/mp3;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=='});
        var button_set = false;
        stub(editManager, 'change_button', function(id, args) { 
          if(id == '456' && args.sound_id == '123') { button_set = true; }
        });
        stub(window, 'Audio', function() {
          var res = {};
          function check() {
            if(res.src && res.ondurationchange) {
              res.ondurationchange();
            } else {
              setTimeout(check, 10);
            }
          }
          setTimeout(check, 10);
          return res;
        });
        soundGrabber.select_sound_preview();
        
        var record = null;
        waitsFor(function() { return controller.get('sound'); });
        runs(function() {
          expect(!!controller.get('sound.id').match(/^tmp_/)).toEqual(true);
          expect(controller.get('sound.url')).toEqual('data:audio/mp3;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==');
          expect(controller.get('sound_preview')).toEqual(null);
          setTimeout(function() {
            persistence.find('sound', controller.get('sound.id')).then(function(res) {
              record = res;
            });
          }, 50);
        });

        stub(Ember.$, 'realAjax', function(options) {
          if(options.url == '/api/v1/users/1340') {
            return Ember.RSVP.resolve({user: {
              id: '1340',
              user_name: 'fred',
              avatar_url: 'data:image/png;base64,a0a'
            }});
          } else if(options.type == 'POST' && options.url == '/api/v1/sounds') {
            created = true;
            return Ember.RSVP.resolve({sound: {
              id: '1432',
              url: 'http://example.com/pic.png'
            }});
          } else if(options.type == 'GET' && options.url == '/api/v1/sounds/1432') {
            return Ember.RSVP.resolve({sound: {
              id: '1432',
              url: 'http://example.com/pic.png'
            }});
          }
          return Ember.RSVP.reject({});
        });
        stub(persistence, 'find_changed', function() {
          return Ember.RSVP.resolve([
            {store: 'sound', data: {raw: record }}
          ]);
        });

        var done = false;
        waitsFor(function() { return record; });
        runs(function() {
          Ember.run.later(function() {
            expect(!!record.id.match(/^tmp_/)).toEqual(true);
            expect(record.url).toEqual('data:audio/mp3;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==');
            persistence.set('online', true)
            persistence.sync(1340).then(function() {
              done = true;
            });
          });
        });
        waitsFor(function() { return done; });
      });
    });
    
    it("should clear changed status of successfully-updated records on partial sync", function() {
      db_wait(function() {
        LingoLinq.all_wait = true;
        queryLog.real_lookup = true;
        var record = null;
        var updated_record = null;
        var remote_updated = null;

        var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
        board.save().then(function(res) {
          record = res;
        });
        stub(Ember.$, 'realAjax', function(options) {
          if(options.type == 'GET' && options.url == "/api/v1/users/1567") {
            return Ember.RSVP.resolve({ user: {
              id: '1567',
              user_name: 'freddy'
            }});
          } else if(options.type == 'POST' && options.url == "/api/v1/boards") {
            if(JSON.parse(options.data).board.name == "My Awesome Board") {
              return Ember.RSVP.resolve({ board: {
                id: '1234',
                name: 'Righteous Board'
              }});
            }
          } else if(options.type == 'PUT' && options.url == "/api/v1/boards/1234") {
            if(JSON.parse(options.data).board.name == "My Gnarly Board") {
              remote_updated = true;
              return Ember.RSVP.resolve({ board: {
                id: '1234',
                name: 'Stellar Board'
              }});
            }
          }
          return Ember.RSVP.reject({});
        });
        
        waitsFor(function() { return record; });
        runs(function() {
          Ember.run.later(function() {
            expect(record.get('id')).toEqual("1234");
            expect(record.get('name')).toEqual("Righteous Board");
            persistence.set('online', false);
            record.set('name', 'My Gnarly Board');
            record.save().then(function() {
              setTimeout(function() {
                lingoLinqExtras.storage.find('board', '1234').then(function(res) {
                  updated_record = res;
                });
              }, 50);
            }, function() { debugger });
          }, 50)
        });
        var done = false;
        waitsFor(function() { return updated_record; });
        runs(function() {
          Ember.run.later(function() {
            expect(updated_record.raw.id).toEqual("1234");
            expect(updated_record.raw.name).toEqual("My Gnarly Board");
            expect(updated_record.changed).toEqual(true);
            persistence.set('online', true);
            persistence.sync('1567').then(function() { debugger }, function() {
              done = true;
            });
          }, 50);
        });
        var final_record = null;
        waitsFor(function() { return done && remote_updated; });
        runs(function() {
          setTimeout(function() {
            lingoLinqExtras.storage.find('board', '1234').then(function(res) {
              final_record = res;
            }, function() { debugger });
          }, 50);
        });
        waitsFor(function() { return final_record; });
        runs(function() {
          expect(final_record.raw.name).toEqual("Stellar Board");
          expect(final_record.changed).toEqual(false);
        });
      });
    });
    it("should update all board links to sub-boards, images and sounds containing temporary identifiers as part of sync", function() {
      db_wait(function() {
        LingoLinq.all_wait = true;
        queryLog.real_lookup = true;
        

        stub(Ember.$, 'realAjax', function(options) {
          if(options.type == 'GET' && options.url == "/api/v1/users/1567") {
            return Ember.RSVP.resolve({ user: {
              id: '1567',
              user_name: 'freddy',
              avatar_url: 'data:image/png;base64,a000'
            }});
          } else if(options.type == 'POST' && options.url == "/api/v1/boards") {
            var board = JSON.parse(options.data).board;
            if(board.name == "My Awesome Board") {
              return Ember.RSVP.resolve({ board: {
                id: '1234',
                name: 'Righteous Board',
                buttons: board.buttons,
                order: board.order
              }});
            } else if(JSON.parse(options.data).board.name == "Temp Board") {
              return Ember.RSVP.resolve({ board: {
                id: '1235',
                name: 'Previously-Temp Board',
                buttons: board.buttons,
                order: board.order
              }});
            }
          } else if(options.type == 'PUT' && options.url == '/api/v1/boards/1234') {
            var res = JSON.parse(options.data).board;
            res.id = '1234';
            return Ember.RSVP.resolve({ board: res });
          } else if(options.type == 'PUT' && options.url == '/api/v1/boards/1235') {
            var res = JSON.parse(options.data).board;
            res.id = '1235';
            return Ember.RSVP.resolve({ board: res });
          } else if(options.type == 'POST' && options.url == '/api/v1/images') {
            return Ember.RSVP.resolve({ image: {
              id: '1236'
            }});
          } else if(options.type == 'POST' && options.url == '/api/v1/sounds') {
            return Ember.RSVP.resolve({ sound: {
              id: '1237'
            }});
          } else if(options.type == 'GET' && options.url == '/api/v1/images/1236') {
            return Ember.RSVP.resolve({ image: {
              id: '1236'
            }});
          } else if(options.type == 'GET' && options.url == '/api/v1/sounds/1237') {
            return Ember.RSVP.resolve({ sound: {
              id: '1237'
            }});
          }
          debugger
          return Ember.RSVP.reject({});
        });
        
        var server_board, tmp_board, tmp_image, tmp_sound;
        var new_image, new_board, new_sound;
        // create a server-side board
        var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
        board.save().then(function(res) {
          server_board = res;
        });
        
        var temps_made = false;
        waitsFor(function() { return server_board; });
        runs(function() {
          persistence.set('online', false);
          Ember.run.later(function() {
            // create a temporary image
            // create a temporary sound
            // create a temporary board
            expect(server_board.get('id')).toEqual("1234");
            expect(server_board.get('name')).toEqual("Righteous Board");
            persistence.set('online', false);
            
            var board2 = LingoLinq.store.createRecord('board', {key: 'ok/cool2', name: 'Temp Board'});
            board2.save().then(function(res) { 
              tmp_board = res; 
            });
            
            var image = LingoLinq.store.createRecord('image', {});
            image.save().then(function(res) { 
              setTimeout(function() {
                persistence.find('image', res.get('id')).then(function(res) {
                  tmp_image = res;
                });
              }, 50);
            });
            
            var sound = LingoLinq.store.createRecord('sound', {});
            sound.save().then(function(res) { 
              setTimeout(function() {
                persistence.find('sound', res.get('id')).then(function(res) {
                  tmp_sound = res;
                });
              }, 50);
            });
          }, 50)
        });
        
        var server_board_updated, tmp_board_updated;
        waitsFor(function() { return server_board && tmp_image && tmp_sound && tmp_board; });
        runs(function() {
          // update the server-side board with links to all three temporary records
          // update the temporary board with links to all three temporary records
          Ember.run(function() {
            var buttons = [
              {
                id: 1,
                image_id: tmp_image.id,
                sound_id: tmp_sound.id,
                load_board: {
                  id: tmp_board.get('id'),
                  key: tmp_board.get('key')
                }
              },
              {
                id: 2,
                load_board: {
                  id: server_board.get('id'),
                  key: server_board.get('key')
                }
              }
            ];
            var grid = {
              rows: 2,
              columns: 2,
              order: [[1, 2], [null, null]]
            };
            server_board.set('buttons', buttons);
            server_board.set('grid', grid);
            server_board.save().then(function(res) {
              setTimeout(function() {
                persistence.find('board', res.get('id')).then(function(res) {
                  server_board = res;
                  server_board_updated = true;
                });
              }, 50);
            });
            tmp_board.set('buttons', buttons);
            tmp_board.set('grid', grid);
            tmp_board.save().then(function(res) {
              setTimeout(function() {
                persistence.find('board', res.get('id')).then(function(res) {
                  tmp_board = res;
                  tmp_board_updated = true;
                });
              }, 50);
            });
          });
        });
        var synced = false;
        waitsFor(function() { return server_board_updated && tmp_board_updated; })
        runs(function() {
          var tmp_board_id = tmp_board.id;
          var tmp_image_id = tmp_image.id;
          var tmp_sound_id = tmp_sound.id;
          persistence.set('online', true);
          // stub find_changed to return the records with the server-side board first
          stub(persistence, 'find_changed', function() {
            return Ember.RSVP.resolve([
              {store: 'board', data: { raw: server_board }},
              {store: 'board', data: { raw: tmp_board }},
              {store: 'image', data: { raw: tmp_image }},
              {store: 'sound', data: { raw: tmp_sound }}
            ]);
          });
          Ember.run.later(function() {
            // call sync
            persistence.sync(1567).then(function() {
              setTimeout(function() {
                // re-lookup
                synced = true;
                persistence.find('board', server_board.id).then(function(res) {
                  server_board = res;
                  persistence.find('board', res.buttons[0].load_board.id).then(function(res) {
                    new_board = res;
                  });
                  persistence.find('image', res.buttons[0].image_id).then(function(res) {
                    new_image = res;
                  });
                  persistence.find('sound', res.buttons[0].sound_id).then(function(res) {
                    new_sound = res;
                  });
                });
                persistence.find('board', tmp_board_id).then(null, function() {
                  tmp_board = null;
                });
                persistence.find('image', tmp_image_id).then(null, function() {
                  tmp_image = null;
                });
                persistence.find('sound', tmp_sound_id).then(null, function() {
                  tmp_sound = null;
                });
              }, 50);
            }, function(err) {
              debugger
            });
          }, 50);
        });
        // make sure the temporary image has a permanent id
        // make sure the temporary sound has a permanent id
        // make sure the temporary board has a permanent id
        waitsFor(function() { return synced && !tmp_image && !tmp_sound && !tmp_board && new_image && new_sound && new_board; });
        runs(function() {
          // make sure the temporary board points to the permanent sound and image and board ids
          expect(!!new_board.buttons[0].image_id.match(/^tmp_/)).toEqual(false);
          expect(!!new_board.buttons[0].sound_id.match(/^tmp_/)).toEqual(false);
          expect(!!new_board.buttons[0].load_board.id.match(/^tmp_/)).toEqual(false);
          expect(new_board.buttons[0].image_id).toEqual(new_image.id);
          expect(new_board.buttons[0].sound_id).toEqual(new_sound.id);
          expect(new_board.buttons[0].load_board.id).toEqual(new_board.id);
          // make sure the server-side board points to the permanent sound and image and board ids
          expect(!!server_board.buttons[0].image_id.match(/^tmp_/)).toEqual(false);
          expect(!!server_board.buttons[0].sound_id.match(/^tmp_/)).toEqual(false);
          expect(!!server_board.buttons[0].load_board.id.match(/^tmp_/)).toEqual(false);
          expect(server_board.buttons[0].image_id).toEqual(new_image.id);
          expect(server_board.buttons[0].sound_id).toEqual(new_sound.id);
          expect(server_board.buttons[0].load_board.id).toEqual(new_board.id);
        });
      });
    });
    it("should delete changed stuff", function() {
      db_wait(function() {
        var board_cleared = false;
        var image_cleared = false;
        var sound_cleared = false;
        capabilities.dbman.clear('board', function() {
          board_cleared = true;
        });
        capabilities.dbman.clear('image', function() {
          image_cleared = true;
        });
        capabilities.dbman.clear('sound', function() {
          sound_cleared = true;
        });
        waitsFor(function() { return board_cleared && image_cleared && sound_cleared; })
      });
    });
  });
});

