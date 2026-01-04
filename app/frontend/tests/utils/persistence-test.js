import Ember from 'ember';
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
import { queryLog, db_wait, fake_dbman } from 'frontend/tests/helpers/ember_helper';
import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import persistence from '../../utils/persistence';
import speecher from '../../utils/speecher';
import lingoLinqExtras from '../../utils/extras';
import app_state from '../../utils/app_state';
import modal from '../../utils/modal';
import stashes from '../../utils/_stashes';
import session from '../../utils/session';
import editManager from '../../utils/edit_manager';
import capabilities from '../../utils/capabilities';
import contentGrabbers from '../../utils/content_grabbers';
import LingoLinq from '../../app';
import { run as emberRun } from '@ember/runloop';
import $ from 'jquery';

describe("persistence", function() {
  var app = null;
  var dbman;
  var pictureGrabber = contentGrabbers.pictureGrabber;
  var soundGrabber = contentGrabbers.soundGrabber;
  var dbg = function() {
    debugger;
  };
  beforeEach(function() {
    app = {
      register: function(key, obj, args) {
        app.registered = (key === 'lingolinq:persistence' && obj === persistence && args.singleton === true);
      },
      inject: function(component, name, key) {
        if(name === 'persistence' && key === 'lingolinq:persistence') {
          app.injections.push(component);
        }
      },
      injections: []
    };
    stashes.set('current_mode', 'default');
    app_state.set('currentBoardState', null);
    app_state.set('sessionUser', null);
    stub(speecher, 'load_beep', function() { return RSVP.resolve({}); });
    dbman = capabilities.dbman;
    capabilities.dbman = fake_dbman();
  });
  afterEach(function() {
    capabilities.dbman = dbman;
  });

  var board = null;
  function push_board(callback) {
    db_wait(function() {
      LingoLinq.store.push({data: {type: 'board', id: '1234', attributes: {
        id: '1234',
        name: 'Best Board'
      }}});
      var record = null;
      LingoLinq.store.find('board', '1234').then(function(res) {
        record = res;
      });
      var _this = this;
      waitsFor(function() { return record; });
      runs(function() {
        board = record;
        emberRun(_this, callback);
      });
    });
  }

  describe("setup", function() {
    it("should properly inject settings", function() {
      persistence.setup(app);
      expect(app.registered).toEqual(true);
      expect(app.injections).toEqual(['model', 'controller', 'view', 'route']);
    });
    it("should default last_sync to one", function() {
      db_wait(function() {
        persistence.set('last_sync_at', 12345);
        persistence.remove('settings', {storageId: 'lastSync'}, 'lastSync').then(function() {
          setTimeout(function() {
            persistence.setup(app);
            lingoLinqExtras.set('ready', false);
            lingoLinqExtras.set('ready', true);
          }, 10);
        });
        waitsFor(function() { return persistence.get('last_sync_at') === 1; });
        runs();
      });
    });
    it("should check for last_sync if set", function() {
      db_wait(function() {
        persistence.set('last_sync_at', 222);
        persistence.store('settings', {last_sync: 12345}, 'lastSync').then(function() {
          setTimeout(function() {
            persistence.setup(app);
          }, 100);
        });
        waitsFor(function() { return persistence.get('last_sync_at') === 12345; });
        runs();
      });
    });
  });

  describe("find", function() {
    it("should error if db isn't ready", function() {
      var ready = lingoLinqExtras.get('ready');
      lingoLinqExtras.set('ready', false);
      var res = persistence.find('bob', 'ok');
      lingoLinqExtras.advance('all');
      lingoLinqExtras.set('ready', false);
      var error = null;
      res.then(function() { dbg(); }, function(err) {
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
    it("should mark the result if too old", function() {
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
                persistence.find('settings', 'hat').then(function(res) {
                  record = res;
                });
              }, 10);
            });
          }, 10);
        });
        waitsFor(function() { return record; });
        runs(function() {
          expect(record.outdated).toEqual(true);
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
        persistence.important_ids = null;
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
          expect(record.important).toEqual(true);
          expect(record.outdated).toEqual(true);
        });
      });
    });
    it("should mark recent results as fresh", function() {
      db_wait(function() {
        var rnd = persistence.temporary_id();
        var record = null;
        var obj = {
          raw: {hat: rnd, retrieved: (new Date()).getTime()},
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
          var rec = LingoLinq.store.createRecord('board', record);
          expect(record.hat).toEqual(rnd);
          expect(rec.get('fresh')).toEqual(true);
        });
      });
    });
    it("should update freshness of results as applicable", function() {
      db_wait(function() {
        var rnd = persistence.temporary_id();
        var record = null;
        var obj = {
          raw: {hat: rnd, retrieved: ((new Date()).getTime() - (5*60*1000 - 300))},
          storageId: 'hat'
        };
        lingoLinqExtras.storage.store('settings', obj, 'hat').then(function() {
          setTimeout(function() {
            persistence.find('settings', 'hat').then(function(res) {
              record = res;
            });
          }, 10);
        });
        var refreshed = false;
        var board = null;
        waitsFor(function() { return record; });
        runs(function() {
          board = LingoLinq.store.createRecord('board', record);
          expect(record.hat).toEqual(rnd);
          expect(board.get('fresh')).toEqual(true);
          emberRun.later(function() {
            app_state.set('refresh_stamp', 1234);
            refreshed = true;
          }, 500);
        });
        waitsFor(function() { return refreshed; });
        runs(function() {
          expect(board.get('fresh')).toEqual(false);
        });
      });
    });
    it("should not mark older results as fresh", function() {
      db_wait(function() {
        var rnd = persistence.temporary_id();
        var record = null;
        var obj = {
          raw: {hat: rnd, retrieved: 1459871157678},
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
          var rec = LingoLinq.store.createRecord('board', record);
          expect(record.hat).toEqual(rnd);
          expect(rec.get('fresh')).toEqual(false);
        });
      });
    });
    it("should mark ajax-retrieved results as fresh", function() {
      db_wait(function() {
        var rnd = persistence.temporary_id();
        var record = null;

        queryLog.real_lookup = true;
        stub($, 'realAjax', function(options) {
          if(options.url === '/api/v1/boards/1234') {
            return RSVP.resolve({board: {
              id: '1234',
              name: 'Cool Board'
            }});
          } else {
            return RSVP.reject({});
          }
        });
        LingoLinq.store.findRecord('board', '1234').then(function(res) {
          record = res;
        });
        waitsFor(function() { return record; });
        runs(function() {
          expect(record.get('name')).toEqual('Cool Board');
          expect(record.get('fresh')).toEqual(true);
        });
      });
    });

    it("should mark retrieved attribute for sideloaded results", function() {
      db_wait(function() {
        var record = null;

        queryLog.real_lookup = true;
        stub($, 'realAjax', function(options) {
          if(options.url === '/api/v1/boards/1234') {
            return RSVP.resolve({board: {
              id: '1234',
              name: 'Cool Board'
            },
            images: [
              {id: '1111', url: 'http://www.image.com'}
            ]});
          } else {
            return RSVP.reject({});
          }
        });
        LingoLinq.store.findRecord('board', '1234').then(function(res) {
          record = res;
        });
        waitsFor(function() { return record; });
        runs(function() {
          expect(record.get('name')).toEqual('Cool Board');
          expect(record.get('fresh')).toEqual(true);
          var img = LingoLinq.store.peekRecord('image', '1111');
          expect(img).toNotEqual(null);
          expect(img.get('url')).toEqual('http://www.image.com');
          expect(img.get('fresh')).toEqual(true);
        });
      });
    });
  });

  describe("remember_access", function() {
    it("should stash accesses", function() {
      stashes.persist('recent_boards', []);
      persistence.remember_access('find', 'board', 'bob/cool');
      expect(stashes.get('recent_boards')).toEqual([{id: 'bob/cool'}]);
      persistence.remember_access('find', 'board', 'bob/cool2');
      expect(stashes.get('recent_boards')).toEqual([{id: 'bob/cool2'}, {id: 'bob/cool'}]);
      persistence.remember_access('find', 'board', 'bob/cool2');
      expect(stashes.get('recent_boards')).toEqual([{id: 'bob/cool2'}, {id: 'bob/cool'}]);
    });
  });

  describe("find_recent", function() {
    it("should look up local copies of recent boards", function() {
      var found = [];
      var stored = [];
      stub(lingoLinqExtras.storage, 'find_all', function(store, keys) {
        var res = [];
        keys.forEach(function(key) {
          found.push(key);
          res.push({data: {id: key, raw: {id: key}}});
        });
        return RSVP.resolve(res);
      });
      stub(LingoLinq.store, 'push', function(obj) {
        stored.push(obj);
        return obj;
      });
      stashes.persist('recent_boards', [{id: 1}, {id: 'abc'}]);
      persistence.find_recent('board');
      var stall = false;
      setTimeout(function() { stall = true; }, 100);
      waitsFor(function() { return stall && found.length >= 2 && stored.length >= 2; });
      runs(function() {
        expect(found[0]).toEqual(1);
        expect(found[1]).toEqual('abc');
        expect(stored.length).toEqual(2);
        expect(stored[0].data.id).toEqual(1);
        expect(stored[1].data.id).toEqual('abc');
      });
    });
    it("should return a promise", function() {
      var res = persistence.find_recent();
      expect(res.then).not.toEqual(null);
      res.then(null, function() { });
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
      persistence.find_changed().then(function(res) { list = res; }, function() { dbg(); });
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
          return RSVP.reject({});
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
        waitsFor(function() { return persistence.log.length === 5; });
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
        waitsFor(function() { return found.length === 5; });
        runs(function() {
          expect(found.find(function(r) { return r.id === record.board.id; })).not.toEqual(null);
          expect(found.find(function(r) { return r.id === record.board.id; }).name).toEqual(record.board.name);
          expect(found.find(function(r) { return r.id === record.images[0].id; })).not.toEqual(null);
          expect(found.find(function(r) { return r.id === record.images[0].id; }).url).toEqual(record.images[0].url);
          expect(found.find(function(r) { return r.id === record.images[1].id; })).not.toEqual(null);
          expect(found.find(function(r) { return r.id === record.images[1].id; }).url).toEqual(record.images[1].url);
          expect(found.find(function(r) { return r.id === record.sounds[0].id; })).not.toEqual(null);
          expect(found.find(function(r) { return r.id === record.sounds[0].id; }).url).toEqual(record.sounds[0].url);
          expect(found.find(function(r) { return r.id === record.sounds[1].id; })).not.toEqual(null);
          expect(found.find(function(r) { return r.id === record.sounds[1].id; }).url).toEqual(record.sounds[1].url);
        });
      });
    });
  });
  describe("store_url", function() {
    it("should return a promise", function() {
      var res = persistence.store_url("data:bacon");
      expect(res.then).not.toEqual(null);
      var error = false;
      res.then(null, function(err) {
        error = err;
      });
      waitsFor(function() { return error; });
      runs(function() {
        expect(error).toEqual('type required for storing');
      });
    });

    it("should resolve immediately on a data_uri", function() {
      var done = false;
      var res = persistence.store_url("data:bacon", 'image').then(function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs();
    });

    it("should make an API call to proxy the URL", function() {
      stub(persistence, 'ajax', function(options) {
        return RSVP.resolve({
          content_type: 'image/png',
          data: 'data:nunya'
        });
      });
      var result = null;
      db_wait(function() {
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
    });

    it("should store the API results in the dataCache table", function() {
      db_wait(function() {
        stub(persistence, 'ajax', function(options) {
          return RSVP.resolve({
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
        runs();
      });
    });

    it("should error on a failed API call", function() {
      db_wait(function() {
        stub(persistence, 'ajax', function(options) {
          return RSVP.reject({error: "bacon"});
        });
        var result = null;
        persistence.store_url("http://www.example.com/pic.png", 'image').then(function() { dbg(); }, function(res) {
          result = res;
        });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result.error).toEqual('URL lookup failed during proxy for http://www.example.com/pic.png');
        });
      });
    });
    it("should error on a failed data storage", function() {
      stub(persistence, 'ajax', function(options) {
        return RSVP.resolve({
          content_type: 'image/png',
          data: 'data:nunya'
        });
      });
      stub(persistence, 'store', function() {
        return RSVP.reject({error: "no no"});
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

    it("should normalize a url", function() {
      var url = "http://localhost/api/v1/users/123/protected_image/lessonpix/12345?user_token=asdfasdf";
      db_wait(function() {
        stub(persistence, 'ajax', function(options) {
          return RSVP.resolve({
            content_type: 'image/png',
            data: 'data:nunya'
          });
        });
        var result = null;
        var record = null;
        persistence.stores = [];
        persistence.store_url(url, 'image').then(function(res) {
          result = res;
        });
        waitsFor(function() { return result && persistence.stores.length > 0; });
        runs(function() {
          setTimeout(function() {
            persistence.find('dataCache', 'http://localhost/api/v1/users/123/protected_image/lessonpix/12345').then(function(res) {
              record = res;
            });
          }, 10);
        });
        waitsFor(function() { return record; });
        runs();
      });
    });
  });
  describe("find_url", function() {
    it('should normalize a url', function() {
      var url = "http://localhost/api/v1/users/123/protected_image/lessonpix/12345";
      db_wait(function() {
        var stored = false;
        persistence.store('dataCache', {url: url, content_type: 'image/png', data_uri: 'data:image/png;base64,a0a'}, url).then(function() { stored = true; });
        persistence.url_uncache = {};
        persistence.url_uncache[url] = true;
        waitsFor(function() { return stored; });

        var result = null;
        runs(function() {
          persistence.find_url(url + "?user_token=a7b7c_7d8e6").then(function(res) {
            result = res;
          });
        });

        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual("data:image/png;base64,a0a");
        });
      });
    });
  });

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
      var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"})._createSnapshot();
      var json = persistence.convert_model_to_json(LingoLinq.store, 'board', board);
      expect(json).not.toEqual(null);
      expect(json.board).not.toEqual(null);
      expect(!!json.board.key.match(/^tmp_.+\/cool/)).toEqual(true);
      expect(json.board.name).toEqual("My Awesome Board");
      expect(!!json.board.id.match(/^tmp_/)).toEqual(true);
    });
    it("should call mimic_server_processing if defined", function() {
      var called = false;
      var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"})._createSnapshot();
      var type = LingoLinq.store.modelFor('board');
      stub(type, 'mimic_server_processing', function(record, data) {
        called = true;
        data.cookie = true;
        return data;
      });
      var json = persistence.convert_model_to_json(LingoLinq.store, 'board', board);
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
      stub($, 'realAjax', function(options) {
        return RSVP.resolve({});
      });
      var resolved = false;
      persistence.ajax({}).then(function() {
        resolved = true;
      }, function() {
      });
      waitsFor(function() { return resolved; });
      runs();
    });
    it("should reject on non-2xx response", function() {
      stub($, 'realAjax', function(options) {
        return RSVP.reject({status: 300});
      });
      var rejected = false;
      persistence.ajax({}).then(function() {
      }, function(err) {
        rejected = true;
      });
      waitsFor(function() { return rejected; });
      runs();
    });
    it("should reject on 200 response with error and status attributes", function() {
      stub($, 'realAjax', function(options) {
        return RSVP.reject({error: "bad things", status: 400});
      });
      var rejected = false;
      persistence.ajax({}).then(function() {
      }, function() {
        rejected = true;
      });
      waitsFor(function() { return rejected; });
      runs();
    });
  });

  describe("connecting (onLine)", function() {
    it("should be online by default", function() {
      expect(persistence.get('online')).toEqual(true);
    });
//     it("should set to offline on event", function() {
//       var online = persistence.get('online');
//       $(document).trigger('offline');
//       expect(persistence.get('online')).toEqual(false);
//       persistence.set('online', online);
//     });
//     it("should set to online on event", function() {
//       var online = persistence.get('online');
//       $(document).trigger('offline');
//       expect(persistence.get('online')).toEqual(false);
//       $(document).trigger('online');
//       expect(persistence.get('online')).toEqual(true);
//       persistence.set('online', online);
//     });
  });

  describe("DSAdapter", function() {
    describe("findRecord", function() {
      it("should return a promise", function() {
        var res = LingoLinq.store.find('board', '1234');
        expect(res.then).not.toEqual(null);
      });
      it("should make an ajax query and find the record", function() {
        var promise = RSVP.resolve({board: {
          id: '987',
          name: 'Cool Board'
        }});
        queryLog.defineFixture({
          method: 'GET',
          type: 'board',
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
          stub($, 'realAjax', function(options) {
            if(options.url === '/api/v1/boards/9876') {
              return RSVP.resolve({board: {
                id: '9876',
                name: 'Cool Board'
              }});
            } else {
              return RSVP.reject({});
            }
          });
          var local = null;
          stub(persistence, 'store_eventually', function(store, obj) {
            local = obj;
            return RSVP.resolve(obj);
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
          stub($, 'realAjax', function(options) {
            ajax_called = true;
            return RSVP.reject({});
          });
          stub(persistence, 'find', function(store, key) {
            return RSVP.resolve({board: {
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

      it("should not wait for remote response nonsense when finding after getting a local result", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          persistence.set('online', true);
          var ajax_called = null;
          var defer = null;
          stub($, 'realAjax', function(options) {
            ajax_called = true;
            defer = RSVP.defer();
            return defer.promise;
          });
          stub(persistence, 'find', function(store, key) {
            return RSVP.resolve({board: {
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
            result.reload();
          });

          var second_result = null;
          waitsFor(function() { return defer; });
          runs(function() {
            expect(ajax_called).toEqual(true);
            LingoLinq.store.findRecord('board', '9876').then(function(res) {
              second_result = res;
              expect(res.get('name')).toEqual('Cool Board');
              defer.resolve({board: {
                id: '9876',
                name: 'Awesome Board'
              }});
            });
          });

          waitsFor(function() { return second_result; });
          runs(function() {
            expect(result.get('name')).toEqual('Awesome Board');
            expect(second_result.get('name')).toEqual('Awesome Board');
          });
        });
      });

      it("should use the local copy when online but getting a token error", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          persistence.set('online', true);
          var ajax_called = null;
          stub($, 'realAjax', function(options) {
            ajax_called = true;
            return RSVP.reject({responseJSON: {invalid_token: true, error: {invalid_token: true, error: 'invalid token'}}});
          });
          stub(persistence, 'find', function(store, key) {
            return RSVP.resolve({board: {
                id: '9876',
                name: 'Cool Board'
            }});
          });

          var result = null;
          var reload_result = null;
          LingoLinq.store.findRecord('board', '9876').then(function(res) {
            result = res;
          });
          waitsFor(function() { return result; });
          runs(function() {
            expect(result.get('id')).toEqual('9876');
            expect(result.get('name')).toEqual('Cool Board');
            result.reload().then(function(res) {
              reload_result = res;
            });
          });
          waitsFor(function() { return reload_result; });
          runs(function() {
            expect(ajax_called).toEqual(true);
            expect(reload_result.get('id')).toEqual('9876');
            expect(reload_result.get('name')).toEqual('Cool Board');
          });
        });
      });

      it("should skip straight to a db lookup when finding a local id", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          var ajax_called = null;
          stub($, 'realAjax', function(options) {
            ajax_called = true;
            return RSVP.reject({});
          });
          stub(persistence, 'find', function(store, key) {
            return RSVP.resolve({board: {
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
          stub($, 'realAjax', function(options) {
            ajax_called = true;
            return RSVP.reject({});
          });
          stub(persistence, 'find', function(store, key) {
            return RSVP.reject({});
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
          runs();
        });
      });
    });

    describe("createRecord", function() {
      it("should make an ajax call if online", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          stub($, 'realAjax', function(options) {
            return RSVP.reject({});
          });
          var result = null;
          var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
          board.save().then(function() { dbg(); }, function(res) {
            result = true;
          });
          waitsFor(function() { return result; });
          runs();
        });
      });

      it("should persist to the local db if successfully created online", function() {
        db_wait(function() {
          queryLog.real_lookup = true;
          var rnd = Math.random().toString();
          stub($, 'realAjax', function(options) {
            return RSVP.resolve({
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
          var obj = EmberObject.create({
          });
          var controller = EmberObject.extend({
            send: function(message) {
              this.sentMessages[message] = arguments;
            },
            model: EmberObject.create({id: '456'})
          }).create({
            'currentUser': EmberObject.create({user_name: 'bob', profile_url: 'http://www.bob.com/bob'}),
            sentMessages: {},
            licenseOptions: [],
            'board': {model: obj}
          });
          var button = EmberObject.extend({
            findContentLocally: function() {
              this.foundContentLocally = true;
              return RSVP.resolve(true);
            }
          }).create();
          pictureGrabber.setup(button, controller);
          controller.set('image_preview', {url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=='});
          var button_set = false;
          stub(editManager, 'change_button', function(id, args) {
            if(id === '456' && args.image_id === '123') { button_set = true; }
          });
          pictureGrabber.select_image_preview();

          var record = null;
          waitsFor(function() { return controller.get('model.image'); });
          runs(function() {
            expect(!!controller.get('model.image.id').match(/^tmp_/)).toEqual(true);
            expect(controller.get('model.image.url')).toEqual('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==');
            expect(controller.get('image_preview')).toEqual(null);
            setTimeout(function() {
              persistence.find('image', controller.get('model.image.id')).then(function(res) {
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
          stub($, 'realAjax', function(options) {
            return RSVP.reject({});
          });
          var result = null;
          board.set('name', 'Cool Board');
          board.save().then(function() { dbg(); }, function(res) {
            result = true;
          });
          waitsFor(function() { return result; });
          runs();
        });
      });

      it("should persist an updated record to the local db", function() {
        push_board(function() {
          queryLog.real_lookup = true;
          stub($, 'realAjax', function(options) {
            return RSVP.resolve({ board: {
              id: '1234',
              name: 'Righteous Board'
            }});
          });
          var result = null;
          board.set('name', 'Cool Board');
          board.save().then(function(res) {
            result = res;
          }, function(res) { dbg(); });

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
            emberRun.later(function() {
              record.set('name', 'My Gnarly Board');
              record.save().then(function(res) {
                expect(res.id).toEqual(record.id);
                setTimeout(function() {
                  persistence.find('board', record.id).then(function(res) {
                    final_record = res;
                  }, function() { dbg(); });
                }, 50);
              }, function() { dbg(); });
            }, 50);
          });
          waitsFor(function() { return final_record; });
          runs(function() {
            expect(final_record.id).toEqual(record.id);
            expect(final_record.name).toEqual("My Gnarly Board");
          });
        });
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
            emberRun.later(function() {
              record.set('name', 'My Gnarly Board');
              record.save().then(function(res) {
                setTimeout(function() {
                  lingoLinqExtras.storage.find('board', record.id).then(function(res) {
                    final_record = res;
                  });
                }, 50);
              }, function() { dbg(); });
            }, 50);
          });
          waitsFor(function() { return final_record; });
          runs(function() {
            expect(final_record.changed).toEqual(true);
            expect(final_record.id).toEqual(record.id);
            expect(final_record.raw.name).toEqual("My Gnarly Board");
          });
        });
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
          stub($, 'realAjax', function(options) {
            if(options.type === 'POST' && options.url === "/api/v1/boards") {
              if(options.data.board.name === "My Gnarly Board") {
                return RSVP.resolve({ board: {
                  id: '1234',
                  name: 'Righteous Board'
                }});
              }
            }
            return RSVP.reject({});
          });

          waitsFor(function() { return record; });
          runs(function() {
            expect(!!record.get('id').match(/^tmp_/)).toEqual(true);
            expect(!!record.get('key').match(/^tmp_.+\/cool/)).toEqual(true);
            expect(record.get('name')).toEqual("My Awesome Board");
            var tmp_id = record.get('id');
            emberRun.later(function() {
              persistence.set('online', true);
              record.set('name', 'My Gnarly Board');
              record.save().then(function(res) {
                setTimeout(function() {
                  persistence.find('board', res.id).then(function(res) {
                    final_record = res;
                  }, function() { dbg(); });
                }, 50);
              }, function() { dbg(); });
            }, 50);
          });
          waitsFor(function() { return final_record; });
          runs(function() {
            expect(final_record.id).toEqual('1234');
            expect(final_record.name).toEqual("Righteous Board");
          });
        });
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
          stub($, 'realAjax', function(options) {
            if(options.type === 'POST' && options.url === "/api/v1/boards") {
              if(options.data.board.name === "My Awesome Board") {
                return RSVP.resolve({ board: {
                  id: '1234',
                  name: 'Righteous Board'
                }});
              }
            } else if(options.type === 'PUT' && options.url === "/api/v1/boards/1234") {
              if(options.data.board.name === "Super Board") {
                return RSVP.resolve({ board: {
                  id: '1234',
                  name: 'Stellar Board'
                }});
              }
            }
            return RSVP.reject({});
          });

          waitsFor(function() { return record; });
          runs(function() {
            emberRun.later(function() {
              expect(record.get('id')).toEqual("1234");
              expect(record.get('name')).toEqual("Righteous Board");
              persistence.set('online', false);
              record.set('name', 'My Gnarly Board');
              record.save().then(function(res) {
                updated_record = res;
              }, function() { dbg(); });
            }, 10);
          });
          waitsFor(function() { return updated_record; });
          runs(function() {
            emberRun(function() {
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
        });
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
          stub($, 'realAjax', function(options) {
            if(options.type === 'POST' && options.url === "/api/v1/boards") {
              if(options.data.board.name === "My Gnarly Board") {
                return RSVP.resolve({ board: {
                  id: '1234',
                  name: 'Righteous Board'
                }});
              }
            }
            return RSVP.reject({});
          });
          persistence.removals = [];
          var tmp_id = null;
          var tmp_key = null;
          waitsFor(function() { return record; });
          runs(function() {
            expect(!!record.get('id').match(/^tmp_/)).toEqual(true);
            tmp_key = record.get('key');
            tmp_id = record.get('id');
            expect(!!record.get('key').match(/^tmp_.+\/cool/)).toEqual(true);
            expect(record.get('name')).toEqual("My Awesome Board");
            emberRun.later(function() {
              persistence.set('online', true);
              record.set('name', 'My Gnarly Board');
              record.save().then(function(res) {
                expect(res.get('id')).toEqual('1234');
                expect(res.get('name')).toEqual('Righteous Board');
//                 setTimeout(function() {
//                 }, 150);
              }, function() { dbg(); });
            }, 150);
          });
          waitsFor(function() { return persistence.removals.length > 0; });
          runs(function() {
            setTimeout(function() {
              persistence.find('board', tmp_id).then(function() { dbg(); }, function() {
                deleted_record = true;
              });
              persistence.find('board', tmp_key).then(function(res) {
                final_record = res;
              });
            }, 150);
          });
          waitsFor(function() { return final_record && deleted_record; });
          runs(function() {
            expect(final_record.id).toEqual('1234');
            expect(final_record.name).toEqual("Righteous Board");
          });
        });
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
          stub($, 'realAjax', function(options) {
            if(options.type === 'POST' && options.url === "/api/v1/boards") {
              if(options.data.board.name === "My Gnarly Board") {
                return RSVP.resolve({ board: {
                  id: '1234',
                  name: 'Righteous Board'
                }});
              }
            }
            return RSVP.reject({});
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
            emberRun.later(function() {
              persistence.set('online', true);
              record.set('name', 'My Gnarly Board');
              record.save().then(function(res) {
                setTimeout(function() {
                  persistence.find('board', tmp_key).then(function(res) {
                    final_record = res;
                  });
                }, 500);
              }, function() { dbg(); });
            }, 150);
          });
          waitsFor(function() { return persistence.removals.length > 0; });
          runs(function() {
            setTimeout(function() {
              if(capabilities.dbman.repo.board.length === 2) { dbg(); }
              persistence.find('board', tmp_id).then(function() { dbg(); }, function() {
                deleted_record = true;
              });
            }, 150);
          });
          waitsFor(function() { return final_record && deleted_record; });
          runs(function() {
            expect(final_record.id).toEqual('1234');
            expect(final_record.name).toEqual("Righteous Board");
          });
        });
      });
    });

    describe("deleteRecord", function() {
      it("should make an ajax call if online", function() {
        push_board(function() {
          queryLog.real_lookup = true;
          var called = false;
          stub($, 'realAjax', function(options) {
            if(options.type === 'DELETE' && options.url === '/api/v1/boards/1234') {
              called = true;
            }
            return RSVP.reject({});
          });
          var result = null;
          board.deleteRecord();
          board.save().then(function() { dbg(); }, function(res) {
            result = true;
          });
          waitsFor(function() { return result && called; });
          runs();
        });
      });

      it("should remove from the local db if successfully deleted", function() {
        push_board(function() {
          queryLog.real_lookup = true;
          var called = false;
          stub($, 'realAjax', function(options) {
            if(options.type === 'DELETE' && options.url === '/api/v1/boards/1234') {
              called = true;
            }
            return RSVP.resolve({board: {id: '1234'}});
          });
          var deleted = null;
          persistence.removals = [];
          board.deleteRecord();
          board.save().then(function(res) {
          }, function() { dbg(); });
          waitsFor(function() { return persistence.removals.length > 0; });
          runs(function() {
            setTimeout(function() {
              persistence.find('board', '1234').then(function() { dbg(); }, function() {
                deleted = true;
              });
            }, 10);
          });
          waitsFor(function() { return deleted && called; });
          runs();
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
            emberRun.later(function() {
              record_id = record.id;
              record.deleteRecord();
              record.save().then(function(res) {
              }, function() { dbg(); });
            }, 50);
          });
          waitsFor(function() { return persistence.removals.length > 0; });
          runs(function() {
            persistence.find('board', record_id).then(function(res) {
            }, function() { deleted = true; });
          });
          waitsFor(function() { return deleted; });
          runs();
        });
      });

      it("should delete from the local db and remember the delete if offline for later sync", function() {
        push_board(function() {
          queryLog.real_lookup = true;
          persistence.set('online', false);
          var deleted = null;
          persistence.removals = [];
          board.deleteRecord();
          board.save().then(function(res) {
            emberRun.later(function() {
              persistence.find('board', '1234').then(function() { dbg(); }, function() {
                deleted = true;
              });
            }, 10);
          }, function() { dbg(); });
          var found_deletion = null;
          waitsFor(function() { return deleted && persistence.removals.length > 0; });
          runs(function() {
            emberRun.later(function() {
              lingoLinqExtras.storage.find('deletion', 'board_1234').then(function() {
                found_deletion = true;
              });
            }, 10);
          });
          var marked_changed = false;
          waitsFor(function() { return found_deletion; });
          runs(function() {
            persistence.find_changed().then(function(list) {
              marked_changed = list.find(function(i) { return i.store === 'deletion' && i.data.storageId === 'board_1234'; });
            }, function(err) { dbg(); });
          });
          waitsFor(function() { return marked_changed; });
          runs();
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
          }, function() { dbg(); });
          waitsFor(function() { return persistence.removals.length > 0; });
          runs(function() {
            setTimeout(function() {
              persistence.find('board', '1234').then(function() { dbg(); }, function() {
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
          stub($, 'realAjax', function(options) {
            if(options.url === '/api/v1/users/1256') {
              return RSVP.resolve({user: {
                id: '1256',
                user_name: 'fred'
              }});
            } else if(options.url === '/api/v1/boards/1234') {
              if(options.type === 'GET') {
                return RSVP.resolve({board: {
                  id: '1234',
                  key: 'fred/cool'
                }});
              } else if(options.type === 'DELETE') {
                remotely_deleted = true;
                return RSVP.resolve({board: {id: '1234'}});
              }
            }
            return RSVP.reject({});
          });
          waitsFor(function() { return found_deletion; });

          runs(function() {
            emberRun.later(function() {
              persistence.set('online', true);
              persistence.sync(1256).then(null, function() { });
            }, 50);
          });
          waitsFor(function() { return remotely_deleted; });
          runs();
        });
      });
    });

    describe("findAll", function() {
    });
//   findAll: function(store, type, id) {
//     dbg()
//   },
    describe("findQuery", function() {
      it("should make an ajax call if online", function() {
        queryLog.real_lookup = true;

        var done = false;
        stub($, 'realAjax', function(options) {
          return RSVP.resolve({board: [
            {id: '134'}
          ]});
        });
        LingoLinq.store.query('board', {user_id: 'example', starred: true, public: true}).then(function(res) {
          done = res.content && res.content[0] && res.content[0].id === '134';
        }, function() {
          dbg();
        });
        waitsFor(function() { return done; });
        runs();
      });
      it("should handle a failed ajax call if online", function() {
        queryLog.real_lookup = true;

        var done = false;
        stub($, 'realAjax', function(options) {
          return RSVP.reject({});
        });
        LingoLinq.store.query('board', {user_id: 'example', starred: true, public: true}).then(function(res) {
          dbg();
        }, function() {
          done = true;
        });
        waitsFor(function() { return done; });
        runs();
      });

      it("should reject if offline", function() {
        queryLog.real_lookup = true;
        persistence.set('online', false);

        var ajaxed = false;
        var rejected = false;
        stub($, 'realAjax', function(options) {
          ajaxed = true;
        });
        var done;
        LingoLinq.store.query('board', {user_id: 'example', starred: true, public: true}).then(function(res) {
          done = res.content && res.content[0] && res.content[0].id === '134';
        }, function() {
          rejected = true;
        });
        waitsFor(function() { return rejected && !ajaxed; });
        runs();
      });
    });
  });
  describe('push_records', function() {
    it('should not call find if all ids already pushed', function() {
      var a = LingoLinq.store.push({data: {type: 'image', id: 'a', attributes: {id: 'a', url: 'http://www.example.com/a.png'}}});
      var b = LingoLinq.store.push({data: {type: 'image', id: 'b', attributes: {id: 'b', url: 'http://www.example.com/b.png'}}});
      var records = null;
      var called = false;
      stub(lingoLinqExtras.storage, 'find_all', function() {
        called = true;
        return RSVP.reject();
      });
      persistence.push_records('image', ['a', 'b']).then(function(res) {
        records = res;
      }, function(err) { debugger; });
      waitsFor(function() { return records; });
      runs(function() {
        expect(records).toEqual({
          a: a,
          b: b
        });
      });

    });

    it('should return combination of already-pushed and newly-retrieved records in the result', function() {
      var a = LingoLinq.store.push({data: {type: 'image', id: 'a', attributes: {id: 'a', url: 'http://www.example.com/a.png'}}});
      var b = LingoLinq.store.push({data: {type: 'image', id: 'b', attributes: {id: 'b', url: 'http://www.example.com/b.png'}}});
      var records = null;
      var called = false;
      stub(lingoLinqExtras.storage, 'find_all', function() {
        called = true;
        return RSVP.resolve([
          {data: {id: 'c', raw: {id: 'c', url: 'http://www.example.com/c.png'}}},
          {data: {id: 'd', raw: {id: 'd', url: 'http://www.example.com/d.png'}}}
        ]);
      });
      persistence.push_records('image', ['a', 'b', 'c', 'e']).then(function(res) {
        records = res;
      });
      waitsFor(function() { return records; });
      runs(function() {
        expect(records.a).toEqual(a);
        expect(records.b).toEqual(b);
        expect(records.c).not.toEqual(undefined);
        expect(records.c.get('url')).toEqual('http://www.example.com/c.png');
        expect(records.e).toEqual(undefined);
      });
    });

    it('should do a bulk lookup with the provided ids', function() {
      var a = LingoLinq.store.push({data: {type: 'image', id: 'a', attributes: {id: 'a', url: 'http://www.example.com/a.png'}}});
      var b = LingoLinq.store.push({data: {type: 'image', id: 'b', attributes: {id: 'b', url: 'http://www.example.com/b.png'}}});
      var records = null;
      var called = false;
      var called_keys = null;
      stub(lingoLinqExtras.storage, 'find_all', function(store, keys) {
        called = true;
        called_keys = keys;
        return RSVP.resolve([
          {data: {id: 'c', raw: {id: 'c', url: 'http://www.example.com/c.png'}}},
          {data: {id: 'd', raw: {id: 'd', url: 'http://www.example.com/d.png'}}}
        ]);
      });
      persistence.push_records('image', ['a', 'b', 'c', 'e']).then(function(res) {
        records = res;
      });
      waitsFor(function() { return records; });
      runs(function() {
        expect(records.a).toEqual(a);
        expect(records.b).toEqual(b);
        expect(records.c).not.toEqual(undefined);
        expect(records.c.get('url')).toEqual('http://www.example.com/c.png');
        expect(records.e).toEqual(undefined);
        expect(called_keys).toEqual(['a', 'b', 'c', 'e']);
      });
    });

    it('should reject on find error', function() {
      var a = LingoLinq.store.push({data: {type: 'image', id: 'a', attributes: {id: 'a', url: 'http://www.example.com/a.png'}}});
      var b = LingoLinq.store.push({data: {type: 'image', id: 'b', attributes: {id: 'b', url: 'http://www.example.com/b.png'}}});
      var called_keys = null;
      stub(lingoLinqExtras.storage, 'find_all', function(store, keys) {
        called_keys = keys;
        return RSVP.reject();
      });
      var errored = false;
      persistence.push_records('image', ['a', 'b', 'c', 'e']).then(null, function(err) {
        errored = true;
      });
      waitsFor(function() { return errored; });
      runs(function() {
        expect(called_keys).toEqual(['a', 'b', 'c', 'e']);
      });
    });

    it('should not include extra records returned via find_all', function() {
      var a = LingoLinq.store.push({data: {type: 'image', id: 'a', attributes: {id: 'a', url: 'http://www.example.com/a.png'}}});
      var b = LingoLinq.store.push({data: {type: 'image', id: 'b', attributes: {id: 'b', url: 'http://www.example.com/b.png'}}});
      var records = null;
      var called = false;
      stub(lingoLinqExtras.storage, 'find_all', function() {
        called = true;
        return RSVP.resolve([
          {data: {id: 'c', raw: {id: 'c', url: 'http://www.example.com/c.png'}}},
          {data: {id: 'd', raw: {id: 'd', url: 'http://www.example.com/d.png'}}}
        ]);
      });
      persistence.push_records('image', ['a', 'b', 'c', 'e']).then(function(res) {
        records = res;
      });
      waitsFor(function() { return records; });
      runs(function() {
        expect(records.a).toEqual(a);
        expect(records.b).toEqual(b);
        expect(records.c).not.toEqual(undefined);
        expect(records.c.get('url')).toEqual('http://www.example.com/c.png');
        expect(records.e).toEqual(undefined);
        expect(records.d).toEqual(undefined);
      });
    });
  });

  describe("known_missing", function() {
    it("should flag results from push_records", function() {
      var done = false;
      persistence.push_records('image', ['a', 'b', 'c']).then(function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(persistence.known_missing).toNotEqual(null);
        expect(persistence.known_missing['image']).toEqual({a: true, b: true, c: true});
      });
    });

    it("should flag failed finds", function() {
      var done = false;
      persistence.find('image', 'asdf').then(null, function() { done = true; });
      waitsFor(function() { return done; });
      runs(function() {
        expect(persistence.known_missing).toNotEqual(null);
        expect(persistence.known_missing.image).toEqual({asdf: true});
      });
    });

    it("should stop lookup on a known_missing find", function() {
      var done = false;
      var queried = false;
      persistence.known_missing = {image: {asdf: true}};
      stub(lingoLinqExtras.storage, 'find', function(store, id) {
        if(store == 'image' && id == 'asdf') {
          queried = true;
        }
        return RSVP.reject();
      });
      persistence.find('image', 'asdf').then(null, function() { done = true; });
      waitsFor(function() { return done; });
      runs(function() {
        expect(queried).toEqual(false);
      });
    });

    it("should clear the record type on store", function() {
      persistence.known_missing = {image: {asdf: true}};
      var done = false;
      persistence.store('image', {
        image: {id: 'asdf'}
      }, 'asdf').then(function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(persistence.known_missing).toNotEqual(null);
        expect(persistence.known_missing.image).toEqual({});
      });
    });
  });

  describe("check_for_needs_sync", function() {
    beforeEach(function() {
      persistence.set('last_sync_stamp_check', null);
      persistence.set('last_sync_event_at', null);
      persistence.set('last_sync_stamp_interval', null);
      persistence.set('last_sync_stamp', null);
      persistence.set('last_sync_at', null);
      persistence.set('syncing', null);
      persistence.set('auto_sync', true);
    });
    afterEach(function() {
      persistence.set('last_sync_stamp_check', null);
      persistence.set('last_sync_event_at', null);
      persistence.set('last_sync_stamp_interval', null);
      persistence.set('last_sync_stamp', null);
      persistence.set('last_sync_at', null);
      persistence.set('syncing', null);
      stashes.set('auth_settings', null);
    });

    it("should get called when online status changes", function() {
      persistence.set('online', false);
      stub(LingoLinq, 'sync_testing', true);
      stashes.set('auth_settings', {});
      var called = false;
      stub(persistence, 'check_for_needs_sync', function(force) { called = !!force; });
      persistence.set('online', true);
      waitsFor(function() { return called; });
      runs();
    });

    it("should not sync if last_sync_event_at is sooner than the user's interval", function() {
      stub(session, 'restore', function() { });
      persistence.set('online');
      stub(persistence, 'sync', function() {
        return RSVP.reject();
      });
      stub(persistence, 'ajax', function(url, opts) {
        return RSVP.reject();
      });
      stub(Ember, 'testing', false);
      stashes.set('auth_settings', {});
      persistence.set('last_sync_event_at', (new Date()).getTime() - 100);
      persistence.set('last_sync_stamp_interval', 10000);
      persistence.set('last_sync_at', (new Date()).getTime() - 100);
      var res = persistence.check_for_needs_sync();
      expect(res).toEqual(false);
    });

    it("should sync if force is true", function() {
      lingoLinqExtras.ready = true;
      stub(session, 'restore', function() { });
      persistence.set('online');
      stub(persistence, 'sync', function() {
        return RSVP.reject();
      });
      stub(persistence, 'ajax', function(url, opts) {
        return RSVP.reject();
      });
      stub(Ember, 'testing', false);
      stashes.set('auth_settings', {});
      persistence.set('last_sync_event_at', (new Date()).getTime() - 100);
      persistence.set('last_sync_stamp_interval', 10000);
      persistence.set('last_sync_at', (new Date()).getTime() - 100);
      var res = persistence.check_for_needs_sync(true);
      expect(res).toEqual(true);
    });

    it("should not sync if offline", function() {
      stub(persistence, 'sync', function() {
        return RSVP.reject();
      });
      stub(persistence, 'ajax', function(url, opts) {
        return RSVP.reject();
      });
      stub(Ember, 'testing', false);
      stashes.set('auth_settings', {});
      persistence.set('last_sync_event_at', 2);
      persistence.set('last_sync_stamp_interval', 10000);
      persistence.set('last_sync_at', 1);
      persistence.set('online', false);
      var res = persistence.check_for_needs_sync();
      expect(res).toEqual(false);
    });

    it("should not sync if already syncing", function() {
      stub(persistence, 'sync', function() {
        return RSVP.reject();
      });
      stub(persistence, 'ajax', function(url, opts) {
        return RSVP.reject();
      });
      stub(Ember, 'testing', false);
      stashes.set('auth_settings', {});
      persistence.set('last_sync_event_at', 2);
      persistence.set('last_sync_stamp_interval', 10000);
      persistence.set('last_sync_at', 1);
      persistence.set('syncing', true);
      var res = persistence.check_for_needs_sync();
      expect(res).toEqual(false);
    });

    it("should sync if it's been a long time since syncing", function() {
      var called = false;
      stub(persistence, 'sync', function() {
        called = true;
        return RSVP.reject();
      });
      stub(persistence, 'ajax', function(url, opts) {
        return RSVP.reject();
      });
      stub(Ember, 'testing', false);
      stashes.set('auth_settings', {});
      persistence.set('last_sync_event_at', 2);
      persistence.set('last_sync_stamp_interval', 10000);
      persistence.set('last_sync_at', 1);
      var res = persistence.check_for_needs_sync();
      expect(res).toEqual(true);
      expect(called).toEqual(true);
    });

    it("should sync if force is called and there's a last_sync_stamp", function() {
      var called = false;
      stub(persistence, 'sync', function() {
        return RSVP.reject();
      });
      stub(persistence, 'ajax', function(url, opts) {
        called = true;
        return RSVP.reject();
      });
      stub(Ember, 'testing', false);
      stashes.set('auth_settings', {});
      persistence.set('last_sync_stamp_interval', 10000);
      persistence.set('last_sync_at', (new Date()).getTime() - 100);
      persistence.set('last_sync_stamp', 'asdf');
      var res = persistence.check_for_needs_sync();
      waitsFor(function() { return called; });
      runs(function() {
        expect(res).toEqual(true);
      });
    });

    it("should not sync if there's not last_sync_stamp", function() {
      var called = false;
      stub(persistence, 'sync', function() {
        return RSVP.reject();
      });
      stub(persistence, 'ajax', function(url, opts) {
        called = true;
        return RSVP.reject();
      });
      stub(Ember, 'testing', false);
      stashes.set('auth_settings', {});
      persistence.set('last_sync_stamp_interval', 10000);
      persistence.set('last_sync_at', (new Date()).getTime() - 100);
      persistence.set('last_sync_stamp', null);
      var res = persistence.check_for_needs_sync();
      expect(res).toEqual(false);
    });

    it("should check remotely for a matching sync stamp", function() {
      var called = false;
      var url = null;
      stub(persistence, 'sync', function() {
        return RSVP.reject();
      });
      stub(persistence, 'ajax', function(u, opts) {
        url = u;
        called = true;
        return RSVP.reject();
      });
      stub(Ember, 'testing', false);
      stashes.set('auth_settings', {});
      persistence.set('last_sync_stamp_interval', 10000);
      persistence.set('last_sync_at', (new Date()).getTime() - 100);
      persistence.set('last_sync_stamp', 'asdf');
      var res = persistence.check_for_needs_sync();
      waitsFor(function() { return called; });
      runs(function() {
        expect(res).toEqual(true);
        expect(url).toEqual('/api/v1/users/self/sync_stamp');
      });
    });

    it("should not sync if it finds a matching remote sync stamp", function() {
      var called = false;
      var sync_called = false;
      stub(persistence, 'sync', function() {
        sync_called = true;
        return RSVP.reject();
      });
      stub(persistence, 'ajax', function(u, opts) {
        called = true;
        if(u == '/api/v1/users/self/sync_stamp') {
          return RSVP.resolve({sync_stamp: 'asdf'});
        }
        return RSVP.reject();
      });
      stub(Ember, 'testing', false);
      stashes.set('auth_settings', {});
      persistence.set('last_sync_stamp_interval', 10000);
      persistence.set('last_sync_at', (new Date()).getTime() - 100);
      persistence.set('last_sync_stamp', 'asdf');
      var res = persistence.check_for_needs_sync(true);
      var sleeper = false;
      waitsFor(function() { return called; });
      runs(function() {
        expect(res).toEqual(true);
        setTimeout(function() { sleeper = true; }, 1000);
      });
      waitsFor(function() { return sleeper; });
      runs(function() {
        expect(sync_called).toEqual(false);
      });
    });

    it("should sync if it finds an updated remote sync stamp", function() {
      var called = false;
      var sync_called = false;
      stub(persistence, 'sync', function() {
        sync_called = true;
        return RSVP.reject();
      });
      stub(persistence, 'ajax', function(u, opts) {
        called = true;
        if(u == '/api/v1/users/self/sync_stamp') {
          return RSVP.resolve({sync_stamp: 'jkl'});
        }
        return RSVP.reject();
      });
      stub(Ember, 'testing', false);
      stashes.set('auth_settings', {});
      persistence.set('last_sync_stamp_interval', 10000);
      persistence.set('last_sync_at', (new Date()).getTime() - 100);
      persistence.set('last_sync_stamp', 'asdf');
      var res = persistence.check_for_needs_sync(true);
      waitsFor(function() { return sync_called; });
      runs(function() {
        expect(res).toEqual(true);
        expect(called).toEqual(true);
      });
    });

    it("should not auto-sync if auto_sync is set to false", function() {
      persistence.set('auto_sync', false);

      var sync_called = false;
      stub(persistence, 'sync', function() {
        sync_called = true;
        return RSVP.reject();
      });

      stub(Ember, 'testing', false);
      stashes.set('auth_settings', {});
      persistence.set('last_sync_stamp_interval', 10000);
      persistence.set('last_sync_at', (new Date()).getTime() - 100);
      persistence.set('last_sync_stamp', 'asdf');
      var res = persistence.check_for_needs_sync(true);
      expect(res).toEqual(false);

      persistence.set('auto_sync', null);
      var res = persistence.check_for_needs_sync(true);
      expect(res).toEqual(false);

      persistence.set('auto_sync', true);
      var res = persistence.check_for_needs_sync(true);
      expect(res).toEqual(true);
    });
  });

  describe("decrypt_json", function() {
    it("should have specs", function() {
      expect('test').toEqual('todo');
    })
  });

  describe("remote_json", function() {
    it("should have specs", function() {
      expect('test').toEqual('todo');
    });
  });
  describe("decrypt_json", function() {
    it("should have specs", function() {
      expect('test').toEqual('todo');
    });

    it("should decrypt encrypted results", function() {
      expect('test').toEqual('todo');
    });
  });
});


