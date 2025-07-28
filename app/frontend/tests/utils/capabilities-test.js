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
import { db_wait } from 'frontend/tests/helpers/ember_helper';
import RSVP from 'rsvp';
import capabilities from '../../utils/capabilities';
import { run as emberRun } from '@ember/runloop';

describe("capabilities", function() {
  describe("volume_check", function() {
    it("should return a rejecting promise by default", function() {
      stub(window, 'plugin', null);
      var done = false;
      capabilities.volume_check().then(null, function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs();
    });

    it("should return the value passed by the plugin", function() {
      var attempts = 0;
      stub(window, 'plugin', {
        volume: {
          getVolume: function(callback) {
            attempts++;
            if(attempts == 1) {
              callback(100);
            } else {
              callback(0.5);
            }
          }
        }
      });
      var result = null;
      capabilities.volume_check().then(function(res) {
        result = res;
      });
      waitsFor(function() { return result == 100; });
      runs(function() {
        capabilities.volume_check().then(function(res) {
          result = res;
        });
      });
      waitsFor(function() { return result == 0.5; });
      runs();
    });
  });

  describe('silent_mode', function() {
    it('should return a promise', function() {
      var res = capabilities.silent_mode();
      expect(res.then).toNotEqual(undefined);
    });

    it('should resolve false if plugin not found', function() {
      stub(window, 'cordova', {});
      var done = false;
      capabilities.silent_mode().then(function(res) {
        done = true;
        expect(res).toEqual(false);
      });
      waitsFor(function() { return done; });
      runs();
    });

    it('should resolve true if muted', function() {
      stub(window, 'cordova', {plugins: {SilentMode: {
        isMuted: function(yes, no) {
          yes();
        }
      }}});
      var done = false;
      capabilities.silent_mode().then(function(res) {
        done = true;
        expect(res).toEqual(true);
      });
      waitsFor(function() { return done; });
      runs();
    });

    it('should resolve false if not muted', function() {
      stub(window, 'cordova', {plugins: {SilentMode: {
        isMuted: function(yes, no) {
          no();
        }
      }}});
      var done = false;
      capabilities.silent_mode().then(function(res) {
        done = true;
        expect(res).toEqual(false);
      });
      waitsFor(function() { return done; });
      runs();
    });
  });

  describe("setup_database", function() {

    it("should try flushing databases on error", function() {
      db_wait(function() {
        var db_req = { };
        var attempt = 0;
        var deleted_databases = [];
        var other = "coughDropStorage::bacon===abcdefg";
        var db_key = null;
        stub(capabilities, 'db', undefined);
        stub(capabilities.idb, 'open', function(key, revision) {
          db_key = key;
          attempt++;
          var evt = {
            attempt: attempt
          };
          emberRun.later(function() {
            db_req.onerror(evt);
            if(attempt == 2) {
              expect(deleted_databases).toEqual([key]);
            } else if(attempt == 4) {
              expect(deleted_databases).toEqual([key, other]);
            }
          }, 10);
          return db_req;
        });
        waitsFor(function() { return attempt >= 4; });
        runs(function() {
          expect(deleted_databases).toEqual([db_key, other]);
          expect((capabilities.dbman.db_error_event || {}).attempt >= 3).toEqual(true);
        });
        stub(capabilities.idb, 'webkitGetDatabaseNames', function() {
          var res = {};
          emberRun.later(function() {
            res.onsuccess({
              target: {
                result: [other]
              }
            });
          }, 10);
          return res;
        });
        stub(capabilities.idb, 'deleteDatabase', function(key) {
          deleted_databases.push(key);
        });
        capabilities.setup_database();
      });
    });
  });

  describe("sharing", function() {
    describe('available', function() {
      it('should timeout if sharing types not returned', function() {
        stub(window, 'plugins', {
          socialsharing: {
            canShareVia: function(type, str, header, img, url, success, error) {
            }
          }
        });
        var valids = null;
        capabilities.sharing.available().then(function(list) {
          valids = list;
        });
        waitsFor(function() { return valids; });
        runs(function() {
          expect(valids).toEqual([]);
        });
      });
      it('should return valid sharing types only', function() {
        stub(window, 'cordova', {
          plugins: {
            clipboard: {
              copy: function() { }
            }
          }
        });
        stub(window, 'plugins', {
          socialsharing: {
            canShareVia: function(type, str, header, img, url, success, error) {
              if(type == 'facebook' || type == 'instagram') {
                success();
              } else {
                error();
              }
            }
          }
        });
        var valids = null;
        capabilities.sharing.available().then(function(list) {
          valids = list;
        });
        waitsFor(function() { return valids; });
        runs(function() {
          expect(valids).toEqual(['email', 'generic', 'clipboard', 'facebook', 'instagram']);
        });
      });
    });
    describe('share', function() {
      it('should call correct sharing options', function() {
        var copied_message = null;
        var errored = false;
        var success = false;

        capabilities.sharing.share('clipboard', 'hello', null, null).then(function() {
          success = true;
        }, function() {
          errored = true;
        });
        expect(errored).toEqual(true);
        errored = false; success = false;

        capabilities.sharing.share('email', 'hello', 'http://www.example.com', 'http://www.example.com/image.png').then(function() {
          success = true;
        }, function() {
          errored = true;
        });
        expect(errored).toEqual(true);
        errored = false; success = false;

        stub(window, 'cordova', {
          plugins: { clipboard: { copy: function(str) {
            copied_message = str;
          } } }
        });
        stub(window, 'plugins', {
          socialsharing: {
            shareViaEmail: function(subject, message, a, b, c, url, success, error) {
              success();
            },
            share: function(subject, message, image, url, success, error) {
              error();
            },
            shareVia(app, subject, message, image, url, success, error) {
              if(app == 'facebook') {
                success();
              } else {
                error();
              }
            }
          }
        });

        capabilities.sharing.share('clipboard', 'hello', null, null).then(function() {
          success = true;
        }, function() {
          errored = true;
        });
        expect(success).toEqual(true);
        errored = false; success = false;

        capabilities.sharing.share('email', 'hello', 'http://www.example.com', 'http://www.example.com/image.png').then(function() {
          success = true;
        }, function() {
          errored = true;
        });
        expect(success).toEqual(true);
        errored = false; success = false;

        capabilities.sharing.share('generic', 'hello', 'http://www.example.com', 'http://www.example.com/image.png').then(function() {
          success = true;
        }, function() {
          errored = true;
        });
        expect(success).toEqual(true);
        errored = false; success = false;

        capabilities.sharing.share('facebook', 'hello', 'http://www.example.com', 'http://www.example.com/image.png').then(function() {
          success = true;
        }, function() {
          errored = true;
        });
        expect(success).toEqual(true);
        errored = false; success = false;

        capabilities.sharing.share('instagram', 'hello', 'http://www.example.com', 'http://www.example.com/image.png').then(function() {
          success = true;
        }, function() {
          errored = true;
        });
        expect(success).toEqual(true);
        errored = false; success = false;
      });
    });
  });

  describe("sensors", function() {
    it("should track orientation", function() {
      capabilities.last_orientation = null;
      if(!window.DeviceOrientationEvent) { window.DeviceOrientationEvent = {}; }
      capabilities.sensor_listen();
      var e = new window.CustomEvent('deviceorientation');
      e.alpha = 1;
      e.beta = 2;
      e.gamma = 3;
      window.dispatchEvent(e);
      expect(capabilities.last_orientation.alpha).toEqual(1);
      expect(capabilities.last_orientation.beta).toEqual(2);
      expect(capabilities.last_orientation.gamma).toEqual(3);
      expect(capabilities.last_orientation.layout).toNotEqual(null);
    });

    it('should track volume', function() {
      var callback = null;
      stub(window, 'plugin', {
        volume: {
          setVolumeChangeCallback: function(cb) {
            callback = cb;
          }
        }
      });
      capabilities.last_volume = null;
      capabilities.sensor_listen();
      expect(callback).toNotEqual(null);
      callback(75);
      expect(capabilities.last_volume).toEqual(75);
    });

    it("should track ambient light", function() {
      var callback = null;
      stub(window, 'cordova', {
        exec: function(cb, err, klass, method, args) {
          if(klass == 'LingoLinqMisc') {
            callback = cb;
          }
        }
      });
      capabilities.last_lux = null;
      capabilities.sensor_listen();
      waitsFor(function() { return callback; });
      runs(function() {
        callback("1200");
        expect(capabilities.last_lux).toEqual(1200);
      });
    });

    it("should track brightness", function() {
      var callback = null;
      stub(window, 'cordova', {
        plugins: {
          brightness: {
            getBrightness: function(cb) {
              callback = cb;
            }
          }
        }
      });
      capabilities.last_brightness = null;
      capabilities.sensor_listen();
      waitsFor(function() { return callback; });
      runs(function() {
        callback("75");
        expect(capabilities.last_brightness).toEqual(75);
      });
    });

    it("should track ambient light in the browser if possible", function() {
      var sensor = null;
      function LightSensor() {
        this.start = function() { };
        sensor = this;
      }
      stub(window, 'LightSensor', LightSensor);
      capabilities.sensor_listen();
      expect(sensor).toNotEqual(null);
      capabilities.last_lux = null;
      sensor.onchange({reading: {illuminance: 6200}});
      expect(capabilities.last_lux).toEqual(6200);
    });

    it("should track ambient light in the browser if possible with window event", function() {
      capabilities.last_lux = null;
      var e = new window.CustomEvent('devicelight');
      e.lux = 510;
      window.dispatchEvent(e);
      expect(capabilities.last_lux).toEqual(510);
    });
  });

  describe("ssid", function() {
    it('should have specs');
  });

  describe("capabilities.storage", function() {
    describe("list_files", function() {
      it('should return a promise', function() {
        stub(capabilities.storage, 'assert_directory', function(name) {
          expect(name).toEqual('bacon');
          return RSVP.reject();
        });
        var res = capabilities.storage.list_files('bacon');
        expect(res.then).toNotEqual(undefined);
      });

      it('should use the cordova mechanism if defined, handling errors', function() {
        stub(window, 'cordova', {
          exec: function(success, err, klass, method, args) {
            if(klass == 'LingoLinqMisc' && method == 'listFiles') {
              expect(klass).toEqual('LingoLinqMisc');
              expect(method).toEqual('listFiles');
              expect(args).toEqual([{dir: 'asdfasdf/bacon/'}]);
              err();
            } else {
              err();
            }
          },
          file: {
            dataDirectory: 'file://asdfasdf/'
          }
        });
        var error = null;
        capabilities.storage.list_files('bacon').then(null, function(err) {
          error = true;
        });
        waitsFor(function() { return error; });
        runs();
      });

      it('should use the cordova mechanism if defined, handling success', function() {
        stub(window, 'cordova', {
          exec: function(success, err, klass, method, args) {
            if(klass == 'LingoLinqMisc' && method == 'listFiles') {
              expect(klass).toEqual('LingoLinqMisc');
              expect(method).toEqual('listFiles');
              expect(args).toEqual([{dir: 'asdfasdf/bacon/'}]);
              success({files: ['a.png', 'b.png']});
            } else {
              err();
            }
          },
          file: {
            dataDirectory: 'file://asdfasdf/'
          }
        });
        var result = null;
        capabilities.storage.list_files('bacon').then(function(res) {
          result = res;
        });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual(['a.png', 'b.png']);
        });
      });

      it('should list all files in the directory', function() {
        stub(capabilities.storage, 'assert_directory', function(dirname) {
          expect(dirname).toEqual('bacon');
          return RSVP.resolve({
            createReader: function() {
              return {
                readEntries: function(cb) {
                  cb([
                    {isFile: true, name: 'a.png'},
                    {isFile: true, name: 'b.gif'},
                    {isFile: false}
                  ]);
                }
              };
            }
          });
        });
        var result = null;
        capabilities.storage.list_files('bacon').then(function(res) { result = res; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual(['a.png', 'b.gif']);
        });
      });

      it('should include file size counts if specified', function() {
        stub(capabilities.storage, 'assert_directory', function(dirname) {
          expect(dirname).toEqual('bacon');
          return RSVP.resolve({
            createReader: function() {
              return {
                readEntries: function(cb) {
                  cb([
                    {isFile: true, name: 'a.png', size: 12},
                    {isFile: true, name: 'b.gif', getMetadata: function(cb) { cb({size: 123}); } },
                    {isFile: false}
                  ]);
                }
              };
            }
          });
        });
        var result = null;
        capabilities.storage.list_files('bacon', true).then(function(res) { result = res; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual(['a.png', 'b.gif']);
          expect(result.size).toEqual(135);
        });
      });

      it('should exclude zero-size files if size is checked', function() {
        stub(capabilities.storage, 'assert_directory', function(dirname) {
          expect(dirname).toEqual('bacon');
          return RSVP.resolve({
            createReader: function() {
              return {
                readEntries: function(cb) {
                  cb([
                    {isFile: true, name: 'a.png', size: 12},
                    {isFile: true, name: 'b.gif', getMetadata: function(cb) { cb({size: 123}); } },
                    {isFile: true, name: 'c.gif', getMetadata: function(cb) { cb({size: 0}); } },
                    {isFile: true, name: 'd.png', size: 0},
                    {isFile: false}
                  ]);
                }
              };
            }
          });
        });
        var result = null;
        capabilities.storage.list_files('bacon', true).then(function(res) { result = res; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual(['a.png', 'b.gif']);
          expect(result.size).toEqual(135);
        });
      });

      it('should recurse one level deeper', function() {
        stub(capabilities.storage, 'assert_directory', function(dirname) {
          expect(dirname).toEqual('bacon');
          return RSVP.resolve({
            createReader: function() {
              return {
                readEntries: function(cb) {
                  cb([
                    {isFile: true, name: 'a.png', size: 12},
                    {isFile: true, name: 'b.gif', getMetadata: function(cb) { cb({size: 123}); } },
                    {isFile: true, name: 'c.gif', getMetadata: function(cb) { cb({size: 0}); } },
                    {isFile: true, name: 'd.png', size: 0},
                    {isFile: false},
                    {isDirectory: true, createReader: function() {
                      return {
                        readEntries: function(cb) {
                          cb([
                            {isFile: true, name: 'e.png', size: 12},
                            {isFile: true, name: 'f.gif', getMetadata: function(cb) { cb({size: 123}); } },
                            {isFile: true, name: 'g.gif', getMetadata: function(cb) { cb({size: 0}); } },
                            {isFile: true, name: 'h.png', size: 0},
                          ]);
                        }
                      };
                    }}
                  ]);
                }
              };
            }
          });
        });
        var result = null;
        capabilities.storage.list_files('bacon', true).then(function(res) { result = res; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual(['a.png', 'b.gif', 'e.png', 'f.gif']);
          expect(result.size).toEqual(270);
        });
      });

      it('should not recurse two levels deeper', function() {
        stub(capabilities.storage, 'assert_directory', function(dirname) {
          expect(dirname).toEqual('bacon');
          return RSVP.resolve({
            createReader: function() {
              return {
                readEntries: function(cb) {
                  cb([
                    {isFile: true, name: 'a.png', size: 12},
                    {isFile: true, name: 'b.gif', getMetadata: function(cb) { cb({size: 123}); } },
                    {isFile: true, name: 'c.gif', getMetadata: function(cb) { cb({size: 0}); } },
                    {isFile: true, name: 'd.png', size: 0},
                    {isFile: false},
                    {isDirectory: true, createReader: function() {
                      return {
                        readEntries: function(cb) {
                          cb([
                            {isFile: true, name: 'e.png', size: 12},
                            {isFile: true, name: 'f.gif', getMetadata: function(cb) { cb({size: 123}); } },
                            {isFile: true, name: 'g.gif', getMetadata: function(cb) { cb({size: 0}); } },
                            {isFile: true, name: 'h.png', size: 0},
                            {isDirectory: true, createReader: function() {
                              return {
                                readEntries: function(cb) {
                                  cb([
                                    {isFile: true, name: 'i.png', size: 12},
                                    {isFile: true, name: 'j.gif', getMetadata: function(cb) { cb({size: 123}); } },
                                    {isFile: true, name: 'k.gif', getMetadata: function(cb) { cb({size: 0}); } },
                                    {isFile: true, name: 'l.png', size: 0},
                                  ]);
                                }
                              };
                            }}
                          ]);
                        }
                      };
                    }}
                  ]);
                }
              };
            }
          });
        });
        var result = null;
        capabilities.storage.list_files('bacon', true).then(function(res) { result = res; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual(['a.png', 'b.gif', 'e.png', 'f.gif']);
          expect(result.size).toEqual(270);
        });
      });
    });

    describe("status", function() {
      it('should return a promise', function() {
        var res = capabilities.storage.status();
        expect(res.then).toNotEqual(undefined);
      });

      it('should resolve correctly on mobile apps', function() {
        stub(window, 'resolveLocalFileSystemUrl', true);
        stub(window, 'cordova', {file: {dataDirectory: true}});
        var result = null;
        capabilities.storage.status().then(function(r) { result = r; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual({available: true, requires_confirmation: false});
        });
      });

      it('should resolve correctly on windows/node', function() {
        stub(window, 'file_storage', {});
        var result = null;
        capabilities.storage.status().then(function(r) { result = r; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual({available: true, requires_confirmation: false});
        });
      });

      it('should resolve correctly if file system is available', function() {
        if(window.TEMPORARY === undefined) { stub(window, 'TEMPORARY', 1); }
        stub(window, 'cd_request_file_system', function(type, amount, success, err) {
          expect(type).toEqual(window.TEMPORARY);
          expect(amount).toEqual(100);
          success();
        });
        stub(window, 'cd_persistent_storage', {
          requestQuota: function() { },
          queryUsageAndQuota: function(success, err) {
            success(10, 100);
          }
        });
        var result = null;
        capabilities.storage.status().then(function(r) { result = r; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual({available: true, requires_confirmation: false});
        });
      });

      it('should resolve correctly if file system is available but not requested', function() {
        if(window.TEMPORARY  === undefined) { stub(window, 'TEMPORARY', 1); }
        stub(window, 'cd_request_file_system', function(type, amount, success, err) {
          expect(type).toEqual(window.TEMPORARY);
          expect(amount).toEqual(100);
          success();
        });
        stub(window, 'cd_persistent_storage', {
          requestQuota: function() { },
          queryUsageAndQuota: function(success, err) {
            success(0, 0);
          }
        });
        var result = null;
        capabilities.storage.status().then(function(r) { result = r; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual({available: true, requires_confirmation: true});
        });
      });

      it('should resolve correctly if file system is not available due to incognito', function() {
        if(window.TEMPORARY === undefined) { stub(window, 'TEMPORARY', 1); }
        stub(window, 'cd_request_file_system', function(type, amount, success, err) {
          expect(type).toEqual(window.TEMPORARY);
          expect(amount).toEqual(100);
          err();
        });
        stub(window, 'cd_persistent_storage', {
          requestQuota: function() { },
          queryUsageAndQuota: function(success, err) {
          }
        });
        var result = null;
        capabilities.storage.status().then(function(r) { result = r; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual({available: false});
        });
      });

      it('should resolve correctly if no file system is available', function() {
        stub(window, 'cd_request_file_system', null);
        var result = null;
        capabilities.storage.status().then(function(r) { result = r; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual({available: false});
        });
      });
    });

    describe("clear", function() {
      it('should return a promise', function() {
        stub(capabilities.storage, 'all_files', function() { return RSVP.reject(); });
        var res = capabilities.storage.clear();
        expect(res.then).toNotEqual(undefined);
      });

      it('should error if all_files is not available', function() {
        stub(capabilities.storage, 'all_files', function() { return RSVP.reject(); });
        var error = null;
        capabilities.storage.clear().then(null, function(err) { error = true; });
        waitsFor(function() { return error; });
        runs();
      });

      it('should error if a file cannot be removed', function() {
        capabilities.cached_dirs = {a: 1};
        stub(capabilities.storage, 'all_files', function() { return RSVP.resolve([
          {name: 'a.gif', dir: 'image'},
          {name: 'b.gif', dir: 'image'}
        ]); });
        stub(capabilities.storage, 'remove_file', function(dir, name) {
          return RSVP.reject();
        });
        var error = null;
        capabilities.storage.clear().then(null, function(err) { error = true; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(capabilities.cached_dirs).toEqual({a: 1});
        });
      });

      it('should clear the cache if any files were deleted', function() {
        capabilities.cached_dirs = {a: 1};
        stub(capabilities.storage, 'all_files', function() { return RSVP.resolve([
          {name: 'a.gif', dir: 'image'},
          {name: 'b.gif', dir: 'image'}
        ]); });
        stub(capabilities.storage, 'remove_file', function(dir, name) {
          if(name == 'a.gif') { return RSVP.resolve(); }
          else { return RSVP.reject(); }
        });
        var error = null;
        capabilities.storage.clear().then(null, function(err) { error = true; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(capabilities.cached_dirs).toEqual({});
        });
      });

      it('should not clear the cache if no files were deleted', function() {
        capabilities.cached_dirs = {a: 1};
        stub(capabilities.storage, 'all_files', function() { return RSVP.reject(); });
        var error = null;
        capabilities.storage.clear().then(null, function(err) { error = true; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(capabilities.cached_dirs).toEqual({a: 1});
        });
      });

      it('should succeed and clear the cache if all files were deleted', function() {
        capabilities.cached_dirs = {a: 1};
        stub(capabilities.storage, 'all_files', function() { return RSVP.resolve([
          {name: 'a.gif', dir: 'image'},
          {name: 'b.gif', dir: 'image'}
        ]); });
        stub(capabilities.storage, 'remove_file', function(dir, name) {
          return RSVP.resolve();
        });
        var result = null;
        capabilities.storage.clear().then(function(res) { result = res; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual(2);
        });
      });
    });

    describe("all_files", function() {
      it('should return a promise', function() {
        stub(capabilities.storage, 'root_entry', function() {
          return RSVP.reject();
        });
        var res = capabilities.storage.all_files();
        expect(res.then).toNotEqual(undefined);
      });

      it('should reject on root_entry failure', function() {
        stub(capabilities.storage, 'root_entry', function() {
          return RSVP.reject();
        });
        var error = null;
        capabilities.storage.all_files().then(null, function(err) { error = true; });
        waitsFor(function() { return error; });
        runs();
      });

      it('should reject on readEntries failure for main directory', function() {
        stub(capabilities.storage, 'root_entry', function() {
          return RSVP.resolve({
            createReader: function() {
              return {
                readEntries: function(success, err) { err(); }
              };
            }
          });
        });
        var error = null;
        capabilities.storage.all_files().then(null, function(err) { error = true; });
        waitsFor(function() { return error; });
        runs();
      });

      it('should reject on list_files error for sub directory', function() {
        stub(capabilities.storage, 'root_entry', function() {
          return RSVP.resolve({
            createReader: function() {
              return {
                readEntries: function(success, err) {
                  success([
                    {isDirectory: false},
                    {isDirectory: true, name: 'image'},
                    {isDirectory: true, name: 'sound'}
                  ]);
                }
              };
            }
          });
        });
        stub(capabilities.storage, 'list_files', function(dir, include_size) {
          expect(include_size).toEqual(true);
          return RSVP.reject();
        });
        var error = null;
        capabilities.storage.all_files().then(null, function(err) { error = true; });
        waitsFor(function() { return error; });
        runs();
      });

      it('should resolve with a list of all files, including total size', function() {
        stub(capabilities.storage, 'root_entry', function() {
          return RSVP.resolve({
            createReader: function() {
              return {
                readEntries: function(success, err) {
                  success([
                    {isDirectory: false},
                    {isDirectory: true, name: 'image'},
                    {isDirectory: true, name: 'sound'}
                  ]);
                }
              };
            }
          });
        });
        stub(capabilities.storage, 'list_files', function(dir, include_size) {
          expect(include_size).toEqual(true);
          if(dir == 'image') {
            var list = ['a.gif', 'b.png'];
            list.size = 123;
            return RSVP.resolve(list);
          } else if(dir == 'sound') {
            var list = ['c.mp3', 'd.wav'];
            list.size = 765;
            return RSVP.resolve(list);
          } else {
            return RSVP.reject();
          }
        });
        var result = null;
        capabilities.storage.all_files().then(function(res) { result = res; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual([
            {dir: 'image', name: 'a.gif'},
            {dir: 'image', name: 'b.png'},
            {dir: 'sound', name: 'c.mp3'},
            {dir: 'sound', name: 'd.wav'}]);
          expect(result.size).toEqual(888);
        });
      });
    });

    describe("assert_directory", function() {
      beforeEach(function() {
        capabilities.cached_dirs = {};
      });

      it('should return a promise', function() {
        var res = capabilities.storage.assert_directory('asdf');
        expect(res.then).toNotEqual(undefined);
      });

      it('should return the cached value if defined', function() {
        capabilities.cached_dirs['image/1234'] = {};
        var result = null;
        capabilities.storage.assert_directory('image', '123456.pic.png').then(function(res) { result = res; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual({});
        });
      });

      it('should check the cached subdir if defined', function() {
        var called = false;
        capabilities.cached_dirs = {};
        capabilities.cached_dirs['image'] = {
          getDirectory: function(key, opts, success, err) {
            expect(key).toEqual('1234');
            expect(opts).toEqual({create: true});
            called = true;
            err();
          }
        };
        var error = null;
        capabilities.storage.assert_directory('image', '123456.pic.png').then(null, function(res) { error = true; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(called).toEqual(true);
        });
      });

      it('should lookup the subdir from root if defined', function() {
        var called = false;
        stub(capabilities.storage, 'root_entry', function() {
          return RSVP.resolve({
            getDirectory: function(key, opts, success, err) {
              expect(key).toEqual('image');
              expect(opts).toEqual({create: true});
              called = true;
              err();
            }
          });
        });
        var called = false;
        var error = null;
        capabilities.storage.assert_directory('image', '123456.pic.png').then(null, function(res) { error = true; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(called).toEqual(true);
        });
      });

      it('should reject if the subdir is not found for the filename specified', function() {
        var called = false;
        stub(capabilities.storage, 'root_entry', function() {
          return RSVP.resolve({
            getDirectory: function(key, opts, success, err) {
              expect(key).toEqual('image');
              expect(opts).toEqual({create: true});
              success({
                getDirectory: function(key, opts, success, err) {
                  called = true;
                  expect(key).toEqual('1234');
                  expect(opts).toEqual({create: true});
                  err();
                }
              });
            }
          });
        });
        var called = false;
        var error = null;
        capabilities.storage.assert_directory('image', '123456.pic.png').then(null, function(res) { error = true; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(called).toEqual(true);
        });
      });

      it('should return the main dir if the filename is not specified', function() {
        var called = false;
        stub(capabilities.storage, 'root_entry', function() {
          return RSVP.resolve({
            getDirectory: function(key, opts, success, err) {
              expect(key).toEqual('image');
              expect(opts).toEqual({create: true});
              success({a: 1});
            }
          });
        });
        var result = null;
        capabilities.storage.assert_directory('image').then(function(res) { result = res; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual({a: 1});
        });
      });

      it('should reject if root_entry fails', function() {
        stub(capabilities.storage, 'root_entry', function() {
          return RSVP.reject();
        });
        var error = null;
        capabilities.storage.assert_directory('image', '123456.pic.png').then(null, function(res) { error = true; });
        waitsFor(function() { return error; });
        runs();
      });
    });

    describe("fix_url", function() {
      it('should return the url as-is by default', function() {
        stub(window, 'resolveLocalFileSystemURL', null);
        expect(capabilities.storage.fix_url('asdf')).toEqual('asdf');
      });

      it('should return the url as-is if is starts with the dataDirectory prefix', function() {
        stub(window, 'resolveLocalFileSystemURL', true);
        stub(window, 'cordova', {file: {dataDirectory: 'datastuff'}});
        expect(capabilities.storage.fix_url('asdf')).toEqual('asdf');
        expect(capabilities.storage.fix_url('datastuff/asdf')).toEqual('datastuff/asdf');
      });

      it('should replace the url with the current dataDirectory value if it does not match', function() {
        stub(window, 'resolveLocalFileSystemURL', true);
        stub(window, 'cordova', {file: {dataDirectory: 'datastuff/Application/new'}});
        expect(capabilities.storage.fix_url('asdf')).toEqual('asdf');
        expect(capabilities.storage.fix_url('datastuff/asdf')).toEqual('datastuff/asdf');
        expect(capabilities.storage.fix_url('datastuff/Application/old/asdf')).toEqual('datastuff/Application/new/asdf');

      });

      it('should return the url as-is if it does not match the dataDirectory or the replaceable prefix', function() {
        stub(window, 'resolveLocalFileSystemURL', true);
        stub(window, 'cordova', {file: {dataDirectory: 'datastuff/Application/new'}});
        expect(capabilities.storage.fix_url('asdf')).toEqual('asdf');
        expect(capabilities.storage.fix_url('datastuff/asdf')).toEqual('datastuff/asdf');
        expect(capabilities.storage.fix_url('datastuff/Application/old/asdf')).toEqual('datastuff/Application/new/asdf');
        expect(capabilities.storage.fix_url('datastuff/Somewhere/old/asdf')).toEqual('datastuff/Somewhere/old/asdf');
      });
    });

    describe("get_file_url", function() {
      it('should return a promise', function() {
        stub(capabilities.storage, 'assert_directory', function() { return RSVP.reject(); });
        var res = capabilities.storage.get_file_url('image', 'bob.png');
        expect(res.then).toNotEqual(undefined);
      });

      it('should reject on failed assert_directory', function() {
        stub(capabilities.storage, 'assert_directory', function() { return RSVP.reject(); });
        var error = null;
        capabilities.storage.get_file_url('image', 'bob.png').then(null, function() { error = true; });
        waitsFor(function() { return error; });
        runs();
      });

      it('should reject on failed getFile', function() {
        var called = false;
        stub(capabilities.storage, 'assert_directory', function() {
          return RSVP.resolve({
            getFile: function(filename, opts, success, err) {
              expect(filename).toEqual('bob.png');
              expect(opts).toEqual({create: false});
              called = true;
              err();
            }
          });
        });
        var error = null;
        capabilities.storage.get_file_url('image', 'bob.png').then(null, function() { error = true; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(called).toEqual(true);
        });
      });

      it('should return the file URL if found', function() {
        var called = false;
        stub(capabilities.storage, 'assert_directory', function() {
          return RSVP.resolve({
            getFile: function(filename, opts, success, err) {
              expect(filename).toEqual('bob.png');
              expect(opts).toEqual({create: false});
              called = true;
              success({
                toURL: function() { return "file:///cool.png"; }
              });
            }
          });
        });
        var result = null;
        capabilities.storage.get_file_url('image', 'bob.png').then(function(res) { result = res; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual("file:///cool.png");
        });
      });
    });

    describe("write_file", function() {
      it('should return a promise', function() {
        stub(capabilities.storage, 'assert_directory', function() { return RSVP.reject(); });
        var res = capabilities.storage.write_file('image', '12345.png', {a: 1});
        expect(res.then).toNotEqual(undefined);
      });

      it('should reject on failed assert_directory', function() {
        stub(capabilities.storage, 'assert_directory', function() { return RSVP.reject(); });
        var error = null;
        capabilities.storage.write_file('image', '12345.png', {a: 1}).then(null, function() { error = true; });
        waitsFor(function() { return error; });
        runs();
      });

      it('should reject on failed getFile', function() {
        var called = false;
        stub(capabilities.storage, 'assert_directory', function() {
          return RSVP.resolve({
            getFile: function(filename, opts, success, err) {
              called = true;
              expect(filename).toEqual('12345.png');
              expect(opts).toEqual({create: true});
              err();
            }
          });
        });
        var error = null;
        capabilities.storage.write_file('image', '12345.png', {a: 1}).then(null, function() { error = true; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(called).toEqual(true);
        });
      });

      it('should reject on failed createWriter', function() {
        var called = false;
        stub(capabilities.storage, 'assert_directory', function() {
          return RSVP.resolve({
            getFile: function(filename, opts, success, err) {
              expect(filename).toEqual('12345.png');
              expect(opts).toEqual({create: true});
              success({
                toURL: function() { return "file:///file.png"; },
                createWriter: function(success, error) {
                  called = true;
                  error();
                }
              });
            }
          });
        });
        var error = null;
        capabilities.storage.write_file('image', '12345.png', {a: 1}).then(null, function() { error = true; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(called).toEqual(true);
        });
      });

      it('should reject on failed write process - onerror event', function() {
        var called = false;
        stub(capabilities.storage, 'assert_directory', function() {
          return RSVP.resolve({
            getFile: function(filename, opts, success, err) {
              expect(filename).toEqual('12345.png');
              expect(opts).toEqual({create: true});
              success({
                toURL: function() { return "file:///file.png"; },
                createWriter: function(success, error) {
                  var writer = {
                    write: function(blob) {
                      called = true;
                      expect(blob).toEqual({a: 1});
                      writer.onerror();
                    }
                  };
                  success(writer);
                }
              });
            }
          });
        });
        var error = null;
        capabilities.storage.write_file('image', '12345.png', {a: 1}).then(null, function() { error = true; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(called).toEqual(true);
        });
      });

      it('should resolve on successful write', function() {
        var called = false;
        stub(capabilities.storage, 'assert_directory', function() {
          return RSVP.resolve({
            getFile: function(filename, opts, success, err) {
              expect(filename).toEqual('12345.png');
              expect(opts).toEqual({create: true});
              success({
                toURL: function() { return "file:///file.png"; },
                createWriter: function(success, error) {
                  var writer = {
                    write: function(blob) {
                      called = true;
                      expect(blob).toEqual({a: 1});
                      writer.onwriteend();
                    }
                  };
                  success(writer);
                }
              });
            }
          });
        });
        var result = null;
        capabilities.storage.write_file('image', '12345.png', {a: 1}).then(function(res) { result = res; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(called).toEqual(true);
          expect(result).toEqual('file:///file.png');
        });
      });

      it('should convert to an array buffer on android', function() {
        var called = false;
        var blob = new window.Blob([1, 2, 3], {type: 'image/png'});
        stub(capabilities, 'system', 'Android');
        stub(capabilities.storage, 'assert_directory', function() {
          return RSVP.resolve({
            getFile: function(filename, opts, success, err) {
              expect(filename).toEqual('12345.png');
              expect(opts).toEqual({create: true});
              success({
                toURL: function() { return "file:///file.png"; },
                createWriter: function(success, error) {
                  var writer = {
                    write: function(b) {
                      called = true;
                      expect(b instanceof ArrayBuffer).toEqual(true);
                      writer.onwriteend();
                    }
                  };
                  success(writer);
                }
              });
            }
          });
        });
        var result = null;
        capabilities.storage.write_file('image', '12345.png', blob).then(function(res) { result = res; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(called).toEqual(true);
          expect(result).toEqual('file:///file.png');
        });
      });
    });

    describe("remove_file", function() {
      it('should return a promise', function() {
        stub(capabilities.storage, 'assert_directory', function() { return RSVP.reject(); });
        var res = capabilities.storage.remove_file('image', 'bob.png');
        expect(res.then).toNotEqual(undefined);
      });

      it('should reject on failed assert_directory', function() {
        var called = false;
        stub(capabilities.storage, 'assert_directory', function() { called = true; return RSVP.reject(); });
        var error = null;
        capabilities.storage.remove_file('image', 'bob.png').then(null, function() { error = true; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(called).toEqual(true);
        });
      });

      it('should reject on failed getFile', function() {
        var called = false;
        stub(capabilities.storage, 'assert_directory', function() {
          return RSVP.resolve({
            getFile: function(fn, opts, success, err) {
              called = true;
              expect(fn).toEqual('bob.png');
              expect(opts).toEqual({});
              err();
            }
          });
        });
        var error = null;
        capabilities.storage.remove_file('image', 'bob.png').then(null, function() { error = true; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(called).toEqual(true);
        });
      });

      it('should reject on failed remove', function() {
        var called = false;
        stub(capabilities.storage, 'assert_directory', function() {
          return RSVP.resolve({
            getFile: function(fn, opts, success, err) {
              expect(fn).toEqual('bob.png');
              expect(opts).toEqual({});
              success({
                toURL: function() { return "file:///file.png"; },
                remove: function(success, err) {
                  called = true;
                  err();
                }
              });
            }
          });
        });
        var error = null;
        capabilities.storage.remove_file('image', 'bob.png').then(null, function() { error = true; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(called).toEqual(true);
        });
      });

      it('should resolve with the file url on successful remove', function() {
        var called = false;
        stub(capabilities.storage, 'assert_directory', function() {
          return RSVP.resolve({
            getFile: function(fn, opts, success, err) {
              expect(fn).toEqual('bob.png');
              expect(opts).toEqual({});
              success({
                toURL: function() { return "file:///file.png"; },
                remove: function(success, err) {
                  called = true;
                  success();
                }
              });
            }
          });
        });
        var result = null;
        capabilities.storage.remove_file('image', 'bob.png').then(function(res) { result = res; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(called).toEqual(true);
          expect(result).toEqual("file:///file.png");
        });
      });
    });

    describe("root_entry", function() {
      it("should return a promise", function() {
        var res = capabilities.storage.root_entry();
        expect(res.then).toNotEqual(undefined);
      });
      beforeEach(function() {
        capabilities.root_dir_entry = null;
      });

      describe("on mobile", function() {
        it('should resolve if already cached', function() {
          stub(window, 'resolveLocalFileSystemURL', function(dir, success, err) { });
          stub(window, 'cordova', {file: {dataDirectory: 'data/stuff'}});
          capabilities.root_dir_entry = {a: 1};
          var result = null;
          capabilities.storage.root_entry().then(function(res) { result = res; });
          waitsFor(function() { return result; });
          runs(function() {
            expect(result).toEqual({a: 1});
          });
        });

        it('should reject if root entry not available', function() {
          var called = false;
          stub(window, 'resolveLocalFileSystemURL', function(dir, success, err) {
            expect(dir).toEqual('data/stuff');
            called = true;
            err();
          });
          stub(window, 'cordova', {file: {dataDirectory: 'data/stuff'}});
          var error = null;
          capabilities.storage.root_entry().then(null, function(res) { error = true; });
          waitsFor(function() { return error; });
          runs(function() {
            expect(called).toEqual(true);
          });
        });

        it('should resolve if root entry available', function() {
          var called = false;
          stub(window, 'resolveLocalFileSystemURL', function(dir, success, err) {
            expect(dir).toEqual('data/stuff');
            called = true;
            success({b: 1});
          });
          stub(window, 'cordova', {file: {dataDirectory: 'data/stuff'}});
          var result = null;
          capabilities.storage.root_entry().then(function(res) { result = res; });
          waitsFor(function() { return result; });
          runs(function() {
            expect(called).toEqual(true);
            expect(result).toEqual({b: 1});
          });
        });
      });

      describe("on windows", function() {
        it('should resolve if already cached', function() {
          stub(window, 'file_storage', {root: function(success, err) { } });
          capabilities.root_dir_entry = {a: 1};
          var result = null;
          capabilities.storage.root_entry().then(function(res) { result = res; });
          waitsFor(function() { return result; });
          runs(function() {
            expect(result).toEqual({a: 1});
          });
        });

        it('should reject if root not available', function() {
          var called = false;
          stub(window, 'file_storage', {root: function(success, err) { called = true; err({c: 1}); } });
          var error = null;
          capabilities.storage.root_entry().then(null, function(res) { error = true; });
          waitsFor(function() { return error; });
          runs(function() {
            expect(called).toEqual(true);
          });
        });

        it('should resolve if root available', function() {
          stub(window, 'file_storage', {root: function(success, err) { success({c: 1}); } });
          var result = null;
          capabilities.storage.root_entry().then(function(res) { result = res; });
          waitsFor(function() { return result; });
          runs(function() {
            expect(result).toEqual({c: 1});
          });
        });
      });

      describe("on browser", function() {
        it('should reject on failed queryUsageAndQuota', function() {
          var called = false;
          stub(window, 'cd_request_file_system', {});
          stub(window, 'cd_persistent_storage', {
            requestQuota: function() { },
            queryUsageAndQuota: function(success, err) {
              called = true;
              err();
            }
          });
          var error = null;
          capabilities.storage.root_entry().then(null, function() { error = true; });
          waitsFor(function() { return error; });
          runs(function() {
            expect(called).toEqual(true);
          });
        });

        it('should resolve with cached root dir if cached and enough storage', function() {
          var called = false;
          stub(capabilities, 'root_dir_entry', {a: 1});
          stub(window, 'cd_request_file_system', {});
          stub(window, 'cd_persistent_storage', {
            requestQuota: function() { },
            queryUsageAndQuota: function(success, err) {
              called = true;
              success(0, 100*1024*1024);
            }
          });
          var result = null;
          capabilities.storage.root_entry().then(function(res) { result = res; });
          waitsFor(function() { return result; });
          runs(function() {
            expect(called).toEqual(true);
            expect(result).toEqual({a: 1});
          });
        });

        it('should retrieve the root dir if not cached but enough storage', function() {
          var called = false;
          if(!window.PERSISTENT) { stub(window, 'PERSISTENT', 1); }
          stub(window, 'cd_request_file_system', function(type, size, success, err) {
            expect(type).toEqual(window.PERSISTENT);
            expect(size).toEqual(100*1024*1024);
            called = true;
            success({
              root: {b: 1}
            });
          });
          stub(window, 'cd_persistent_storage', {
            requestQuota: function() { },
            queryUsageAndQuota: function(success, err) {
              success(0, 100*1024*1024);
            }
          });
          var result = null;
          capabilities.storage.root_entry().then(function(res) { result = res; });
          waitsFor(function() { return result; });
          runs(function() {
            expect(called).toEqual(true);
            expect(result).toEqual({b: 1});
          });
        });

        it('should reject getting the root dir if there is an error', function() {
          var called = false;
          if(!window.PERSISTENT) { stub(window, 'PERSISTENT', 1); }
          stub(window, 'cd_request_file_system', function(type, size, success, err) {
            expect(type).toEqual(window.PERSISTENT);
            expect(size).toEqual(100*1024*1024);
            called = true;
            err();
          });
          stub(window, 'cd_persistent_storage', {
            requestQuota: function() { },
            queryUsageAndQuota: function(success, err) {
              success(0, 100*1024*1024);
            }
          });
          var error = null;
          capabilities.storage.root_entry().then(null, function(res) { error = true; });
          waitsFor(function() { return error; });
          runs(function() {
            expect(called).toEqual(true);
          });
        });

        it('should request more quota if there is not at least 50 Mb free', function() {
          var called = false;
          var called2 = false;
          if(!window.PERSISTENT) { stub(window, 'PERSISTENT', 1); }
          stub(window, 'cd_request_file_system', function(type, size, success, err) {
            expect(type).toEqual(window.PERSISTENT);
            expect(size).toEqual(150*1024*1024);
            called = true;
            success({
              root: {b: 1}
            });
          });
          stub(window, 'cd_persistent_storage', {
            requestQuota: function(size, success, err) {
              called2 = true;
              expect(size).toEqual(150*1024*1024);
              success(150*1024*1024);
            },
            queryUsageAndQuota: function(success, err) {
              success(75*1024*1024, 100*1024*1024);
            }
          });
          var result = null;
          capabilities.storage.root_entry().then(function(res) { result = res; });
          waitsFor(function() { return result; });
          runs(function() {
            expect(called).toEqual(true);
            expect(called2).toEqual(true);
            expect(result).toEqual({b: 1});
          });
        });

        it('should reject on failed request for more quota', function() {
          var called = false;
          if(!window.PERSISTENT) { stub(window, 'PERSISTENT', 1); }
          stub(window, 'cd_request_file_system', function(type, size, success, err) {
          });
          stub(window, 'cd_persistent_storage', {
            requestQuota: function(size, success, err) {
              called = true;
              expect(size).toEqual(150*1024*1024);
              err();
            },
            queryUsageAndQuota: function(success, err) {
              success(75*1024*1024, 100*1024*1024);
            }
          });
          var error = null;
          capabilities.storage.root_entry().then(null, function(res) { error = true; });
          waitsFor(function() { return error; });
          runs(function() {
            expect(called).toEqual(true);
          });
        });
      });

      it('should reject on none of those set', function() {
        stub(window, 'file_system', null);
        stub(window, 'cordova', null);
        stub(window, 'cd_persistent_storage', null);
        var error = null;
        capabilities.storage.root_entry().then(null, function(res) { error = res; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(error).toEqual({error: 'not enabled'});
        });
      });
    });
  });
});
