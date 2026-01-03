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
import persistence from '../../utils/persistence';
import stashes from '../../utils/_stashes';
import lingoLinqExtras from '../../utils/extras';
import LingoLinq from '../../app';
import { run as emberRun } from '@ember/runloop';

describe("filesystem", function() {
  var make_file = function(name) {
    var file = {
      name: name,
      createWriter: function(success, error) {
        if(LingoLinq.quota_settings.prevent_writer) {
          error("writer not allowed");
        } else {
          var writer = {
            write: function(blob) {
              file.blob = blob;
              if(LingoLinq.quota_settings.error_on_write) {
                writer.onerror("write failed");
              } else {
                writer.onwriteend("done!");
              }
            }
          };
          success(writer);
        }
      },
      remove: function(success, error) {
        if(LingoLinq.quota_settings.prevent_remove) {
          error("remove not allowed");
        } else {
          file.parent.remove_child(file);
          success("removed!");
        }
      },
      isFile: true,
      isDirectory: false,
      toURL: function() {
        return "http://www.example.com/" + name;
      }
    };
    return file;
  };
  var make_dir = function(name, children) {
    var dir = {
      getDirectory: function(key, opts, success, error) {
        if(LingoLinq.quota_settings.prevent_directory_search) {
          error("lookup not allowed");
        } else {
          var res = null;
          dir.children.forEach(function(child) {
            if(child.isDirectory && child.name == key) {
              res = child;
            }
          });
          if(!res && opts && opts.create) {
            if(LingoLinq.quota_settings.prevent_directory_creation) {
              error("creation not allowed");
            } else {
              res = make_dir(key);
              dir.add_child(res);
            }
          }
          if(res) {
            success(res);
          } else {
            error("not found");
          }
        }
      },
      getFile: function(key, opts, success, error) {
        if(LingoLinq.quota_settings.prevent_file_search) {
          error("file lookup not allowed");
        } else {
          var res = null;
          dir.children.forEach(function(child) {
            if(child.isFile && child.name == key) {
              res = child;
            }
          });
          if(!res && opts && opts.create) {
            if(LingoLinq.quota_settings.prevent_file_creation) {
              error("file creation not allowed");
            } else {
              res = make_file(key);
              dir.add_child(res);
            }
          }
          if(res) {
            success(res);
          } else {
            error("file not found");
          }
        }
      },
      createReader: function() {
        return {
          readEntries: function(success, error) {
            if(LingoLinq.quota_settings.prevent_directory_listing) {
              error("listing not allowed");
            } else {
              success(dir.children);
            }
          }
        };
      },
      add_child: function(child) {
        child.parent = dir;
        dir.children.push(child);
      },
      remove_child: function(child) {
        child.parent = null;
        var new_children = [];
        dir.children.forEach(function(c) {
          if(c.name != child.name) {
            new_children.push(c);
          }
        });
        dir.children = new_children;
      },
      isFile: false,
      isDirectory: true,
      name: name
    };
    dir.children = children || [];
    dir.children.forEach(function(child) { child.parent = dir; });
    return dir;
  };
  afterEach(function() {
    persistence.set('local_system', null);
  });
  beforeEach(function() {
    LingoLinq.ignore_filesystem = false;
    capabilities.cached_dirs = null;
    capabilities.root_dir_entry = null;
    persistence.sound_filename_cache = null;
    persistence.image_filename_cache = null;
    persistence.url_cache = null;
    if(window.PERSISTENT === undefined) { window.PERSISTENT = 1; }
    if(window.TEMPORARY === undefined) { window.TEMPORARY = 0; }
    LingoLinq.quota_settings = {
      allow_persistent: true,
      allow_persistent_quota: true,
      allow_temporary: true,
      allowed_quota: 1024*1024*10,
      used_quota: 1234,
      error_on_too_much_quota: false,
      allow_quota_check: true
    };
    stub(window, 'cd_request_file_system', function(type, size, success, error) {
      if(type == window.PERSISTENT && LingoLinq.quota_settings.allow_persistent) {
        if(size < LingoLinq.quota_settings.allowed_quota) {
          LingoLinq.quota_settings.root_dir = LingoLinq.quota_settings.root_dir || make_dir('root');
          success({root: LingoLinq.quota_settings.root_dir});
        } else {
          if(LingoLinq.quota_settings.error_on_too_much_quota) {
            error("too much quota");
          } else {
            LingoLinq.quota_settings.root_dir = LingoLinq.quota_settings.root_dir || make_dir('root');
            success({root: LingoLinq.quota_settings.root_dir});
          }
        }
      } else if(type == window.TEMPORARY && LingoLinq.quota_settings.allow_temporary) {
        LingoLinq.quota_settings.root_dir = LingoLinq.quota_settings.root_dir || make_dir('root');
        success({root: LingoLinq.quota_settings.root_dir});
      } else {
        error("storage not allowed");
      }
    });
    stub(window, 'cd_persistent_storage', {
      queryUsageAndQuota: function(success, error) {
        if(LingoLinq.quota_settings.allow_quota_check) {
          success(LingoLinq.quota_settings.used_quota, LingoLinq.quota_settings.allowed_quota);
        } else {
          error("quota check not allowed");
        }
      },
      requestQuota: function(size, success, error) {
        LingoLinq.quota_settings.requested_size = size;
        if(LingoLinq.quota_settings.allow_persistent_quota) {
          if(size < LingoLinq.quota_settings.allowed_quota) {
            success(size);
          } else {
            if(LingoLinq.quota_settings.error_on_too_much_quota) {
              error("too much quota");
            } else {
              success(LingoLinq.quota_settings.allowed_quota);
            }
          }
        } else {
          error("persistent storage not allowed");
        }
      }
    });
  });
  describe("storage", function() {
    describe("status", function() {
      it("should show default status", function() {
        var result = null;
        capabilities.storage.status().then(function(res) { result = res; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual({available: true, requires_confirmation: false});
        });
      });

      it("should require confirmation if nothing allotted", function() {
        LingoLinq.quota_settings.allowed_quota = 0;
        var result = null;
        capabilities.storage.status().then(function(res) { result = res; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual({available: true, requires_confirmation: true});
        });
      });

      it("should error gracefully if quota check not allowed", function() {
        LingoLinq.quota_settings.allow_quota_check = false;
        var result = null;
        capabilities.storage.status().then(function(res) { result = res; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual({available: false});
        });
      });

      it("should error gracefully if temporary storage not allowed (implies incognito mode)", function() {
        LingoLinq.quota_settings.allow_temporary = false;
        var result = null;
        capabilities.storage.status().then(function(res) { result = res; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual({available: false});
        });
      });

      it("should error gracefully if needed settings not available", function() {
        stub(window, 'cd_request_file_system', null);
        var result = null;
        capabilities.storage.status().then(function(res) { result = res; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual({available: false});
        });
      });

      it("should succeed if extension installed", function() {
        stub(window, 'cd_request_file_system', null);
        stub(window, 'resolveLocalFileSystemURL', function() {
        });
        stub(window, 'cordova', {
          file: {
            dataDirectory: "bacon"
          }
        });
        var result = null;
        capabilities.storage.status().then(function(res) { result = res; });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual({available: true, requires_confirmation: false});
        });
      });
    });

    describe("assert_directory", function() {
      it("should return a cached version if there is one", function() {
        capabilities.cached_dirs = {
          'bacon': 'asdf',
          'bacon/toas': 'jkl'
        };
        var res1 = null, res2 = null;
        capabilities.storage.assert_directory('bacon').then(function(res) { res1 = res; });
        capabilities.storage.assert_directory('bacon', 'toast.png').then(function(res) { res2 = res; });
        waitsFor(function() { return res1; });
        runs(function() {
          expect(res1).toEqual('asdf');
        });
        waitsFor(function() { return res2; });
        runs(function() {
          expect(res2).toEqual('jkl');
        });
      });

      it("should create the directory if not already there", function() {
        stub(capabilities.storage, 'root_entry', function() {
          var promise = capabilities.mini_promise();
          promise.resolve(make_dir("root"));
          return promise;
        });
        var result = null;
        capabilities.storage.assert_directory('bacon').then(function(res) {
          result = res;
        }, function(err) {
        });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result.name).toEqual('bacon');
          expect(result.parent).toNotEqual(null);
          expect(result.parent.name).toEqual('root');
        });
      });

      it("should find the directory if it exists", function() {
        var dir = null;
        stub(capabilities.storage, 'root_entry', function() {
          var promise = capabilities.mini_promise();
          var root = make_dir('root');
          dir = make_dir('bacon');
          root.add_child(dir);
          promise.resolve(root);
          return promise;
        });
        var result = null;
        capabilities.storage.assert_directory('bacon').then(function(res) {
          result = res;
        }, function(err) {
        });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual(dir);
        });
      });

      it("should cache the directory once found", function() {
        stub(capabilities.storage, 'root_entry', function() {
          var promise = capabilities.mini_promise();
          promise.resolve(make_dir("root"));
          return promise;
        });
        var result = null;
        capabilities.storage.assert_directory('bacon').then(function(res) {
          result = res;
        }, function(err) {
        });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result.name).toEqual('bacon');
          expect(result.parent).toNotEqual(null);
          expect(result.parent.name).toEqual('root');
          expect(capabilities.cached_dirs['bacon']).toEqual(result);
        });
      });

      it("should reject on errors", function() {
        LingoLinq.quota_settings.prevent_directory_creation = true;
        stub(capabilities.storage, 'root_entry', function() {
          var promise = capabilities.mini_promise();
          promise.resolve(make_dir("root"));
          return promise;
        });
        var error1 = null;
        capabilities.storage.assert_directory('bacon').then(function(res) {
        }, function(err) {
          error1 = err;
        });
        waitsFor(function() { return error1; });
        runs(function() {
          expect(error1).toEqual('creation not allowed');
        });

        LingoLinq.quota_settings.prevent_directory_search = true;
        var error2 = null;
        capabilities.storage.assert_directory('bacon').then(function(res) {
        }, function(err) {
          error1 = err;
        });
        waitsFor(function() { return error1; });
        runs(function() {
          expect(error1).toEqual('lookup not allowed');
        });
      });
    });


    describe("list_files", function() {
      it("should list all files in the folder, including subdirectories", function() {
        var f1 = make_file('bob.txt');
        var f2 = make_file('susan.png');
        var sub2 = make_dir('down1', [f2]);
        var sub = make_dir('image', [f1, sub2]);
        var root = make_dir('root', [sub]);

        stub(capabilities.storage, 'root_entry', function() {
          var promise = capabilities.mini_promise();
          promise.resolve(root);
          return promise;
        });
        var files = null;
        capabilities.storage.list_files('image').then(function(list) {
          files = list;
        }, function(e) { });
        waitsFor(function() { return files; });
        runs(function() {
          expect(files.length).toEqual(2);
          expect(files[0]).toEqual('bob.txt');
          expect(files[1]).toEqual('susan.png');
        });
      });

      it("should not go more than one level deep", function() {
        var f1 = make_file('bob.txt');
        var f2 = make_file('susan.png');
        var f3 = make_file('fido.mp3');
        var sub3 = make_dir('down2', [f3]);
        var sub2 = make_dir('down1', [f2, sub3]);
        var sub = make_dir('image', [f1, sub2]);
        var root = make_dir('root', [sub]);

        stub(capabilities.storage, 'root_entry', function() {
          var promise = capabilities.mini_promise();
          promise.resolve(root);
          return promise;
        });
        var files = null;
        capabilities.storage.list_files('image').then(function(list) {
          files = list;
        }, function(e) { });
        waitsFor(function() { return files; });
        runs(function() {
          expect(files.length).toEqual(2);
          expect(files[0]).toEqual('bob.txt');
          expect(files[1]).toEqual('susan.png');
        });
      });

      it("should reject on error", function() {
        LingoLinq.quota_settings.prevent_directory_listing = true;
        var f1 = make_file('bob.txt');
        var f2 = make_file('susan.png');
        var sub2 = make_dir('down1', [f2]);
        var sub = make_dir('image', [f1, sub2]);
        var root = make_dir('root', [sub]);

        stub(capabilities.storage, 'root_entry', function() {
          var promise = capabilities.mini_promise();
          promise.resolve(root);
          return promise;
        });
        var error = null;
        capabilities.storage.list_files('image').then(function(list) {
        }, function(e) { error = e; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(error).toEqual('listing not allowed');
        });
      });
    });

    describe('fix_url', function() {
      it("should return the url if file plugin not installed", function() {
        stub(window, 'resolveLocalFileSystemURL', null);
        expect(capabilities.storage.fix_url("http://www.example.com/pic.png")).toEqual("http://www.example.com/pic.png");
        stub(window, 'cordova', {file: {dataDirectory: "http://www.example.com/Application/qwerty/"}});
        expect(capabilities.storage.fix_url("http://www.example.com/Application/abcdefg/pic.png")).toEqual("http://www.example.com/Application/abcdefg/pic.png");
      });

      it("should update the url if matches the directory structure", function() {
        stub(window, 'resolveLocalFileSystemURL', true);
        stub(window, 'cordova', {file: {dataDirectory: "http://www.example.com/Application/qwerty/"}});
        expect(capabilities.storage.fix_url("http://www.example.com/pic.png")).toEqual("http://www.example.com/pic.png");
        expect(capabilities.storage.fix_url("http://www.example.com/Application/abcdefg/pic.png")).toEqual("http://www.example.com/Application/qwerty/pic.png");
        expect(capabilities.storage.fix_url("http://www.example.com/Application/qwerty/pic.png")).toEqual("http://www.example.com/Application/qwerty/pic.png");
      });

      it("should correctly convert to localhost or current path structure", function() {
        expect('test').toEqual('todo');
      })
    });

    describe("get_file_url", function() {
      it("should reject when getFile fails", function() {
        LingoLinq.quota_settings.prevent_file_search = true;
        var sub = make_dir('sub');
        var root = make_dir('root', [sub]);
        stub(capabilities.storage, 'root_entry', function() {
          var promise = capabilities.mini_promise();
          promise.resolve(root);
          return promise;
        });
        var error = null;
        capabilities.storage.get_file_url('sub', 'jaclyn.mid').then(function(r) {
        }, function(e) { error = e; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(error).toEqual('file lookup not allowed');
        });
      });

      it("should reject when file not found", function() {
        var sub = make_dir('sub');
        var root = make_dir('root', [sub]);
        stub(capabilities.storage, 'root_entry', function() {
          var promise = capabilities.mini_promise();
          promise.resolve(root);
          return promise;
        });
        var error = null;
        capabilities.storage.get_file_url('sub', 'jaclyn.mid').then(function(r) {
        }, function(e) { error = e; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(error).toEqual('file not found');
        });
      });

      it("should return the file url when found", function() {
        var file = make_file('jaclyn.mid');
        var sub2 = make_dir('jacl', [file]);
        var sub = make_dir('sub', [sub2]);
        var root = make_dir('root', [sub]);
        stub(capabilities.storage, 'root_entry', function() {
          var promise = capabilities.mini_promise();
          promise.resolve(root);
          return promise;
        });
        var result = null;
        capabilities.storage.get_file_url('sub', 'jaclyn.mid').then(function(r) {
          result = r;
        }, function(e) { });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual("http://www.example.com/jaclyn.mid");
          expect(file.name).toEqual('jaclyn.mid');
          expect(file.parent).toEqual(sub2);
          expect(sub2.parent).toEqual(sub);
          expect(sub.parent).toEqual(root);
        });
      });
    });

    describe("write_file", function() {
      it("should write to file", function() {
        var root = make_dir("root");
        stub(capabilities.storage, 'root_entry', function() {
          var promise = capabilities.mini_promise();
          promise.resolve(root);
          return promise;
        });

        var blob = {a: 1};
        var result = null;
        capabilities.storage.write_file('image', 'wonderful.png', blob).then(function(res) {
          result = res;
        }, function(err) { });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual('http://www.example.com/wonderful.png');
          expect(root.children.length).toEqual(1);
          expect(root.children[0].name).toEqual('image');
          expect(root.children[0].children.length).toEqual(1);
          expect(root.children[0].children[0].name).toEqual('wond');
          expect(root.children[0].children[0].children.length).toEqual(1);
          expect(root.children[0].children[0].children[0].name).toEqual('wonderful.png');
          expect(root.children[0].children[0].children[0].blob).toEqual(blob);
        });
      });

      it("should reject on write error", function() {
        LingoLinq.quota_settings.error_on_write = true;
        var root = make_dir("root");
        stub(capabilities.storage, 'root_entry', function() {
          var promise = capabilities.mini_promise();
          promise.resolve(root);
          return promise;
        });

        var blob = {a: 1};
        var error = null;
        capabilities.storage.write_file('image', 'wonderful.png', blob).then(function(res) {
        }, function(err) { error = err; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(error).toEqual('write failed');
        });
      });

      it("should reject on createWriter error", function() {
        LingoLinq.quota_settings.prevent_writer = true;
        var root = make_dir("root");
        stub(capabilities.storage, 'root_entry', function() {
          var promise = capabilities.mini_promise();
          promise.resolve(root);
          return promise;
        });

        var blob = {a: 1};
        var error = null;
        capabilities.storage.write_file('image', 'wonderful.png', blob).then(function(res) {
        }, function(err) { error = err; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(error).toEqual('writer not allowed');
        });
      });
    });

    describe("remove_file", function() {
      it("should remove the matching file", function() {
        var file = make_file("chicken.gif");
        var sub2 = make_dir('chic', [file]);
        var sub = make_dir('image', [sub2]);
        var root = make_dir('root', [sub]);
        stub(capabilities.storage, 'root_entry', function() {
          var promise = capabilities.mini_promise();
          promise.resolve(root);
          return promise;
        });

        var result = null;
        capabilities.storage.remove_file('image', 'chicken.gif').then(function(res) {
          result = res;
        }, function(err) { });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual('http://www.example.com/chicken.gif');
          expect(file.parent).toEqual(null);
          expect(sub2.children.length).toEqual(0);
        });
      });

      it("should reject if no matching file found", function() {
        var file = make_file("chicken.gif");
        var sub = make_dir('image', [file]);
        var root = make_dir('root', [sub]);
        stub(capabilities.storage, 'root_entry', function() {
          var promise = capabilities.mini_promise();
          promise.resolve(root);
          return promise;
        });

        var error = null;
        capabilities.storage.remove_file('image', 'chicken.gif').then(function(res) {
        }, function(err) { error = err; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(error).toEqual('file not found');
        });
      });

      it("should reject if removal fails", function() {
        LingoLinq.quota_settings.prevent_remove = true;
        var file = make_file("chicken.gif");
        var sub2 = make_dir('chic', [file]);
        var sub = make_dir('image', [sub2]);
        var root = make_dir('root', [sub]);
        stub(capabilities.storage, 'root_entry', function() {
          var promise = capabilities.mini_promise();
          promise.resolve(root);
          return promise;
        });

        var error = null;
        capabilities.storage.remove_file('image', 'chicken.gif').then(function(res) {
        }, function(err) { error = err; });
        waitsFor(function() { return error; });
        runs(function() {
          expect(error).toEqual('remove not allowed');
        });
      });
    });

    describe("root_entry", function() {
      it("should use cached root entry if cordova plugin installed and cache defined", function() {
        stub(window, 'resolveLocalFileSystemURL', function() {
        });
        stub(window, 'cordova', {
          file: {
            dataDirectory: "bacon"
          }
        });
        capabilities.root_dir_entry = {a: 1};

        var result = null;
        capabilities.storage.root_entry().then(function(res) {
          result = res;
        }, function(err) { });
        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual({a: 1});
        });
      });

      it("should resolve and cache the file system if plugin installed", function() {
        var allow = false;
        stub(window, 'resolveLocalFileSystemURL', function(key, success, error) {
          expect(key).toEqual('bacon');
          if(allow) {
            success({a: 1});
          } else {
            error("not allowed");
          }
        });
        stub(window, 'cordova', {
          file: {
            dataDirectory: "bacon"
          }
        });

        var result = null;
        var error = null;
        capabilities.storage.root_entry().then(function(res) {
        }, function(err) { error = err; });

        allow = true;
        capabilities.storage.root_entry().then(function(res) {
          result = res;
        }, function(err) { });

        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual({a: 1});
        });
        waitsFor(function() { return error; });
        runs(function() {
          expect(error).toEqual('not allowed');
        });
      });

      it("should reject if neither the plugin nor native support is available", function() {
        stub(window, 'cd_request_file_system', null);

        var error = null;
        capabilities.storage.root_entry().then(function(res) {
        }, function(err) { error = err; });

        waitsFor(function() { return error; });
        runs(function() {
          expect(error.error).toEqual('not enabled');
        });
      });

      it("should check quota if native support is available", function() {
        LingoLinq.quota_settings.allow_quota_check = false;
        var error = null;
        capabilities.storage.root_entry().then(function(res) {
        }, function(err) { error = err; });

        waitsFor(function() { return error; });
        runs(function() {
          expect(error).toEqual('quota check not allowed');
        });
      });

      it("should request more quota if not enough available with native support", function() {
        LingoLinq.quota_settings.allow_persistent_quota = false;
        var error = null;
        capabilities.storage.root_entry().then(function(res) {
        }, function(err) { error = err; });

        waitsFor(function() { return error; });
        runs(function() {
          expect(error).toEqual('persistent storage not allowed');
          expect(LingoLinq.quota_settings.requested_size).toEqual(1024*1024*100);
        });
      });

      it("should request more quota if not enough available with native support", function() {
        LingoLinq.quota_settings.allowed_quota = 0;
        var error = null;
        capabilities.storage.root_entry().then(function(res) {
        }, function(err) { error = err; });

        waitsFor(function() { return error; });
        runs(function() {
          expect(error).toEqual({error: "rejected"});
          expect(LingoLinq.quota_settings.requested_size).toEqual(1024*1024*100);
        });
      });

      it("should use the cached dir if sufficient quota and defined with native support", function() {
        LingoLinq.quota_settings.allowed_quota = 1024*1024*150;
        capabilities.root_dir_entry = {a: 1};

        var result = null;
        capabilities.storage.root_entry().then(function(res) {
          result = res;
        }, function(err) {});

        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual({a: 1});
        });
      });

      it("should request the file system with native support and sufficient quota", function() {
        LingoLinq.quota_settings.allowed_quota = 1024*1024*150;
        LingoLinq.quota_settings.allow_persistent = false;

        var error = null;
        capabilities.storage.root_entry().then(function(res) {
        }, function(err) { error = err; });

        waitsFor(function() { return error; });
        runs(function() {
          expect(error).toEqual("storage not allowed");
        });
      });

      it("should reject on failure requesting file system", function() {
        LingoLinq.quota_settings.allowed_quota = 1024*1024*150;
        LingoLinq.quota_settings.allow_persistent = false;

        var error = null;
        capabilities.storage.root_entry().then(function(res) {
        }, function(err) { error = err; });

        waitsFor(function() { return error; });
        runs(function() {
          expect(error).toEqual("storage not allowed");
        });
      });

      it("should resolve with the root directory when successfully requesting file system", function() {
        LingoLinq.quota_settings.allowed_quota = 1024*1024*150;

        var result = null;
        capabilities.storage.root_entry().then(function(res) {
          result = res;
        }, function(err) { });

        waitsFor(function() { return result; });
        runs(function() {
          expect(result).toEqual(LingoLinq.quota_settings.root_dir);
        });
      });
    });
  });

  describe("persistence.store_url", function() {
    it("should store a data_uri into the file system if enabled", function() {
      persistence.set('local_system', {
        available: true,
        allowed: true
      });
      stub(lingoLinqExtras, 'ready', true);
      stashes.set('auth_settings', {});
      persistence.url_cache = {
        'http://opensymbols.s3.amazonaws.com/remote/picture.png': 'http://opensymbols.s3.amazonaws.com/remote/picture.png'
      };
      stub(persistence, 'find', function(key, id) {
        if(key == 'dataCache' && id == 'http://opensymbols.s3.amazonaws.com/remote/picture.png') {
          return RSVP.resolve({
            url: 'http://opensymbols.s3.amazonaws.com/remote/picture.png',
            content_type: 'image/png',
            data_uri: 'data:image/png;base64,abcdefg'
          });
        } else {
          return RSVP.reject();
        }
      });
      var url = 'http://opensymbols.s3.amazonaws.com/remote/picture.png';
      var result = null;
      persistence.store_url(url, 'image', true, false).then(function(res) {
        result = res;
      }, function(err) { });
      waitsFor(function() { return result; });
      runs(function() {
        expect(result).toEqual({
          data_uri: null,
          persisted: true,
          content_type: 'image/png',
          local_filename: '52920000.picture.png.5292.png',
          local_url: 'http://www.example.com/52920000.picture.png.5292.png',
          url: 'http://opensymbols.s3.amazonaws.com/remote/picture.png'
        });
        var images = LingoLinq.quota_settings.root_dir.children[0];
        expect(images.name).toEqual('image');
        expect(images.children.length).toEqual(1);
        expect(images.children[0].name).toEqual('5292');
        expect(images.children[0].children.length).toEqual(1);
        expect(images.children[0].children[0].name).toEqual('52920000.picture.png.5292.png');
      });
    });

    it("should use the existing filename if defined", function() {
      persistence.set('local_system', {
        available: true,
        allowed: true
      });
      stub(lingoLinqExtras, 'ready', true);
      stashes.set('auth_settings', {});
      persistence.url_cache = {
        'http://opensymbols.s3.amazonaws.com/remote/picture.png': 'http://opensymbols.s3.amazonaws.com/remote/picture.png'
      };
      stub(persistence, 'find', function(key, id) {
        if(key == 'dataCache' && id == 'http://opensymbols.s3.amazonaws.com/remote/picture.png') {
          return RSVP.resolve({
            url: 'http://opensymbols.s3.amazonaws.com/remote/picture.png',
            content_type: 'image/png',
            local_filename: 'whatever.png',
            data_uri: 'data:image/png;base64,abcdefg'
          });
        } else {
          return RSVP.reject();
        }
      });
      var url = 'http://opensymbols.s3.amazonaws.com/remote/picture.png';
      var result = null;
      persistence.store_url(url, 'image', true, false).then(function(res) {
        result = res;
      }, function(err) { });
      waitsFor(function() { return result; });
      runs(function() {
        expect(result).toEqual({
          data_uri: null,
          persisted: true,
          content_type: 'image/png',
          local_filename: 'whatever.png',
          local_url: 'http://www.example.com/whatever.png',
          url: 'http://opensymbols.s3.amazonaws.com/remote/picture.png'
        });
        var images = LingoLinq.quota_settings.root_dir.children[0];
        expect(images.name).toEqual('image');
        expect(images.children.length).toEqual(1);
        expect(images.children[0].name).toEqual('what');
        expect(images.children[0].children.length).toEqual(1);
        expect(images.children[0].children[0].name).toEqual('whatever.png');
      });
    });

    it("should not re-save if missing data_uri", function() {
      persistence.set('local_system', {
        available: true,
        allowed: true
      });
      stub(lingoLinqExtras, 'ready', true);
      stashes.set('auth_settings', {});
      persistence.url_cache = {
        'http://opensymbols.s3.amazonaws.com/remote/picture.png': 'http://opensymbols.s3.amazonaws.com/remote/picture.png'
      };
      stub(persistence, 'find', function(key, id) {
        if(key == 'dataCache' && id == 'http://opensymbols.s3.amazonaws.com/remote/picture.png') {
          return RSVP.resolve({
            url: 'http://opensymbols.s3.amazonaws.com/remote/picture.png',
            content_type: 'image/png'
          });
        } else {
          return RSVP.reject();
        }
      });
      var url = 'http://opensymbols.s3.amazonaws.com/remote/picture.png';
      var result = null;
      persistence.store_url(url, 'image', true, false).then(function(res) {
        result = res;
      }, function(err) { });
      waitsFor(function() { return result; });
      runs(function() {
        expect(result).toEqual({
          content_type: 'image/png',
          url: 'http://opensymbols.s3.amazonaws.com/remote/picture.png'
        });
      });
    });

    it("should reject on write error", function() {
      LingoLinq.quota_settings.error_on_write = true;
      persistence.set('local_system', {
        available: true,
        allowed: true
      });
      stub(lingoLinqExtras, 'ready', true);
      stashes.set('auth_settings', {});
      persistence.url_cache = {
        'http://opensymbols.s3.amazonaws.com/remote/picture.png': 'http://opensymbols.s3.amazonaws.com/remote/picture.png'
      };
      stub(persistence, 'find', function(key, id) {
        if(key == 'dataCache' && id == 'http://opensymbols.s3.amazonaws.com/remote/picture.png') {
          return RSVP.resolve({
            url: 'http://opensymbols.s3.amazonaws.com/remote/picture.png',
            content_type: 'image/png',
            data_uri: 'data:image/png;base64,abcdefg'
          });
        } else {
          return RSVP.reject();
        }
      });
      var url = 'http://opensymbols.s3.amazonaws.com/remote/picture.png';
      var error = null;
      persistence.store_url(url, 'image', true, false).then(function(res) {
      }, function(err) { error = err; });
      waitsFor(function() { return error; });
      runs(function() {
        expect(error.error).toEqual('saving to data cache failed');
      });
    });
  });

  describe("persistence.prime_caches", function() {
    it("should reject if no user", function() {
      stashes.set('auth_settings', null);
      var error = null;
      persistence.prime_caches().then(function(res) {
      }, function(err) { error = err; });
      waitsFor(function() { return error; });
      runs(function() {
        expect(error.error).toEqual('not enabled or no user set');
      });
    });

    it("should check caches, ignoring the file system if specified", function() {
      persistence.set('local_system', {
        available: true,
        allowed: true
      });
      stashes.set('auth_settings', {});
      var file1 = make_file('whatever.mp3');
      var file2 = make_file('chicken.png');
      var file3 = make_file('chicadee.gif');
      var file4 = make_file('water.wav');
      var sub2 = make_dir('what', [file1]);
      var sub1 = make_dir('chic', [file2, file3]);
      var sounds = make_dir('sound', [sub2, file4]);
      var images = make_dir('image', [sub1]);
      var root = make_dir('root', [images, sounds]);
      LingoLinq.quota_settings.root_dir = root;
      stub(lingoLinqExtras.storage, 'find_all', function(key) {
        if(key == 'dataCache') {
          return RSVP.resolve([
            {data: {raw: {url: "http://www.example.com/remote/a.png", type: 'image', local_filename: 'chicken.png', local_url: 'http://www.example.com/local/a.png'}}},
            {data: {raw: {url: "http://www.example.com/remote/b.png", type: 'image', local_filename: 'chicadee.gif'}}},
            {data: {raw: {url: "http://www.example.com/remote/c.mp3", type: 'sound', local_filename: 'water.wav', local_url: 'http://www.example.com/local/c.mp3'}}},
            {data: {raw: {url: "http://www.example.com/remote/d.mp3", type: 'sound', local_filename: 'whatever.mp3'}}}
          ]);
        } else {
          return RSVP.reject();
        }
      });

      var result = null;
      persistence.prime_caches(false).then(function(res) {
        result = res;
      }, function(err) { });
      waitsFor(function() { return result; });
      runs(function() {
        expect(persistence.image_filename_cache).toEqual({});
        expect(persistence.sound_filename_cache).toEqual({});
        expect(persistence.url_cache).toEqual({
          "http://www.example.com/remote/a.png": 'http://www.example.com/local/a.png',
          "http://www.example.com/remote/b.png": undefined,
          "http://www.example.com/remote/c.mp3": 'http://www.example.com/local/c.mp3',
          "http://www.example.com/remote/d.mp3": undefined,
        });
      });
    });

    it("should check caches, considering the file system if specified", function() {
      persistence.set('local_system', {
        available: true,
        allowed: true
      });
      stashes.set('auth_settings', {});
      var file1 = make_file('whatever.mp3');
      var file2 = make_file('chicken.png');
      var file3 = make_file('chicadee.gif');
      var file4 = make_file('water.wav');
      var sub2 = make_dir('what', [file1]);
      var sub1 = make_dir('chic', [file2, file3]);
      var sounds = make_dir('sound', [sub2, file4]);
      var images = make_dir('image', [sub1]);
      var root = make_dir('root', [images, sounds]);
      LingoLinq.quota_settings.root_dir = root;
      stub(lingoLinqExtras.storage, 'find_all', function(key) {
        if(key == 'dataCache') {
          return RSVP.resolve([
            {data: {raw: {url: "http://www.example.com/remote/a.png", type: 'image', local_filename: 'chicken.png', local_url: 'http://www.example.com/local/a.png'}}},
            {data: {raw: {url: "http://www.example.com/remote/b.png", type: 'image', local_filename: 'chicadee.gif'}}},
            {data: {raw: {url: "http://www.example.com/remote/c.mp3", type: 'sound', local_filename: 'water.wav', local_url: 'http://www.example.com/local/c.mp3'}}},
            {data: {raw: {url: "http://www.example.com/remote/d.mp3", type: 'sound', local_filename: 'whatever.mp3'}}}
          ]);
        } else {
          return RSVP.reject();
        }
      });

      var result = null;
      persistence.prime_caches(true).then(function(res) {
        result = res;
      }, function(err) { });
      waitsFor(function() { return result; });
      runs(function() {
        expect(persistence.image_filename_cache).toEqual({
          'chicadee.gif': true,
          'chicken.png': true
        });
        expect(persistence.sound_filename_cache).toEqual({
          'whatever.mp3': true,
          'water.wav': true
        });
        expect(persistence.url_cache).toEqual({
          "http://www.example.com/remote/a.png": 'http://www.example.com/local/a.png',
          "http://www.example.com/remote/b.png": 'http://www.example.com/chicadee.gif',
          "http://www.example.com/remote/c.mp3": 'http://www.example.com/local/c.mp3',
          "http://www.example.com/remote/d.mp3": 'http://www.example.com/whatever.mp3',
        });
      });
    });
  });

  describe("persistence.find_url", function() {
    it("should return the url in the cache if set", function() {
      persistence.url_cache = {
        'http://www.example.com/remote/pic.png': 'http://www.example.com/local/pic.png'
      };
      var result = null;
      persistence.find_url('http://www.example.com/remote/pic.png').then(function(res) {
        result = res;
      }, function(err) { });
      waitsFor(function() { return result; });
      runs(function() {
        expect(result).toEqual('http://www.example.com/local/pic.png');
      });
    });

    it("should use the store url if the file is still in storage", function() {
      persistence.image_filename_cache = {
        'bacon.png': true
      };
      persistence.sound_filename_cache = {
        'water.mp3': true
      };
      persistence.url_uncache = {
        'http://www.example.com/remote/pic.png': true,
        'http://www.example.com/remote/water.mp3': true
      };
      stub(persistence, 'find', function(key, id) {
        if(key == 'dataCache' && id == 'http://www.example.com/remote/pic.png') {
          return RSVP.resolve({
            local_url: 'http://www.example.com/local/pic.png',
            local_filename: 'bacon.png'
          });
        } else if(key == 'dataCache' && id == 'http://www.example.com/remote/water.mp3') {
          return RSVP.resolve({
            local_url: 'http://www.example.com/local/water.mp3',
            local_filename: 'water.mp3'
          });
        } else {
          return RSVP.reject();
        }
      });
      var result1 = null, result2 = null;
      persistence.find_url('http://www.example.com/remote/pic.png', 'image').then(function(res) {
        result1 = res;
      }, function(err) { });
      persistence.find_url('http://www.example.com/remote/water.mp3', 'sound').then(function(res) {
        result2 = res;
      }, function(err) { });
      waitsFor(function() { return result1 && result2; });
      runs(function() {
        expect(result1).toEqual('http://www.example.com/local/pic.png');
        expect(result2).toEqual('http://www.example.com/local/water.mp3');
      });
    });

    it("should lookup the url if the file is not confirmed as in storage", function() {
      var file1 = make_file('picture.png');
      var file2 = make_file('water.mp3');
      var sub2 = make_dir('wate', [file2]);
      var sub1 = make_dir('pict', [file1]);
      var sounds = make_dir('sound', [sub2]);
      var images = make_dir('image', [sub1]);
      var root = make_dir('root', [images, sounds]);
      LingoLinq.quota_settings.root_dir = root;

      stub(persistence, 'find', function(key, id) {
        if(key == 'dataCache' && id == 'http://www.example.com/remote/picture.png') {
          return RSVP.resolve({
            local_url: 'http://www.example.com/local/picture.png',
            local_filename: 'picture.png'
          });
        } else if(key == 'dataCache' && id == 'http://www.example.com/remote/water.mp3') {
          return RSVP.resolve({
            local_url: 'http://www.example.com/local/water.mp3',
            local_filename: 'water.mp3'
          });
        } else {
          return RSVP.reject();
        }
      });
      var result1 = null, result2 = null;
      persistence.url_uncache = {
        'http://www.example.com/remote/picture.png': true,
        'http://www.example.com/remote/water.mp3': true
      };
      persistence.find_url('http://www.example.com/remote/picture.png', 'image').then(function(res) {
        result1 = res;
      }, function(err) { });
      persistence.find_url('http://www.example.com/remote/water.mp3', 'sound').then(function(res) {
        result2 = res;
      }, function(err) { });
      waitsFor(function() { return result1 && result2; });
      runs(function() {
        expect(result1).toEqual('http://www.example.com/local/picture.png'); //example.com/picture.png');
        expect(result2).toEqual('http://www.example.com/local/water.mp3'); //example.com/water.mp3');
      });
    });

    it("should return a data uri if not in storage and data URI defined", function() {
      var file2 = make_file('water.mp3');
      var sub2 = make_dir('wate', [file2]);
      var sounds = make_dir('sound', [sub2]);
      var images = make_dir('image');
      var root = make_dir('root', [images, sounds]);
      LingoLinq.quota_settings.root_dir = root;

      stub(persistence, 'find', function(key, id) {
        if(key == 'dataCache' && id == 'http://www.example.com/remote/picture.png') {
          return RSVP.resolve({
//            local_url: 'http://www.example.com/local/picture.png',
            local_filename: 'picture.png',
            data_uri: 'abcdefg'
          });
        } else if(key == 'dataCache' && id == 'http://www.example.com/remote/water.mp3') {
          return RSVP.resolve({
            local_url: 'http://www.example.com/local/water.mp3',
            local_filename: 'water.mp3'
          });
        } else {
          return RSVP.reject();
        }
      });
      var result1 = null, result2 = null;
      persistence.url_uncache = {
        'http://www.example.com/remote/picture.png': true,
        'http://www.example.com/remote/water.mp3': true
      };
      persistence.find_url('http://www.example.com/remote/picture.png', 'image').then(function(res) {
        result1 = res;
      }, function(err) {});
      persistence.find_url('http://www.example.com/remote/water.mp3', 'sound').then(function(res) {
        result2 = res;
      }, function(err) { });
      waitsFor(function() { return result1 && result2; });
      runs(function() {
        expect(result1).toEqual('abcdefg');
        expect(result2).toEqual('http://www.example.com/local/water.mp3'); //example.com/water.mp3');
      });
    });
  });

  describe("persistence.setup", function() {
    it("should initialize correctly when enabled", function() {
      var app = {
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
      stub(LingoLinq, 'ignore_filesystem', false);
      stub(capabilities.storage, 'status', function() {
        var promise = capabilities.mini_promise();
        promise.resolve({available: true, requires_confirmation: true});
        return promise;
      });

      var primed = false;
      stub(persistence, 'prime_caches', function() {
        primed = true;
        return RSVP.resolve();
      });
      var timeout = null;
      stub(emberRun, 'later', function(callback, t) {
        if(t == 100) {
          callback();
          timeout = t;
        }
      });
      persistence.setup(app);
      expect(persistence.get('local_system')).toEqual({
        available: true,
        requires_confirmation: true
      });
      expect(timeout).toEqual(100);
      expect(primed).toEqual(true);
    });

    it("should set allowed if no quota request necessary", function() {
      var app = {
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
      stub(LingoLinq, 'ignore_filesystem', false);
      stub(capabilities.storage, 'status', function() {
        var promise = capabilities.mini_promise();
        promise.resolve({available: true, requires_confirmation: false});
        return promise;
      });

      var primed = false;
      stub(persistence, 'prime_caches', function() {
        primed = true;
        return RSVP.resolve();
      });
      var timeout = null;
      stub(emberRun, 'later', function(callback, t) {
        if(t == 100) {
          callback();
          timeout = t;
        }
      });
      persistence.setup(app);
      expect(persistence.get('local_system')).toEqual({
        available: true,
        allowed: true,
        requires_confirmation: false
      });
      expect(timeout).toEqual(100);
      expect(primed).toEqual(true);
    });
  });
});
