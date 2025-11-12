/**
Copyright 2021, OpenAAC
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
**/

import capabilities from './capabilities';

var stores = {
  board: {key: 'board', key_path: 'id', indexes: ['key', 'tmp_key', 'changed']},
  image: {key: 'image', key_path: 'id', indexes: ['changed']},
  video: {key: 'video', key_path: 'id'},
  buttonset: {key: 'buttonset', key_path: 'id', indexes: []},
  tag: {key: 'tag', key_path: 'id', indexes: ['tag_id']},
  sound: {key: 'sound', key_path: 'id', indexes: ['changed']},
  user: {key: 'user', key_path: 'id', indexes: ['key', 'changed']},
  settings: {key: 'settings', key_path: 'storageId', indexes: ['changed']},
  dataCache: {key: 'dataCache', key_path: 'id', indexes: []},
  deletion: {key: 'deletion', key_path: 'storageId', indexes: []},
};

var console_debug = function(str) {
  if(console.debug) {
    console.debug(str);
  } else {
    console.log(str);
  }
};
var log_timing = function() {
  var start = (new Date()).getTime();
  var args = [];
  for(var idx = 0; idx < arguments.length; idx++) { args.push(arguments[idx]); }
  if(capabilities.log_events) {
    console.log.apply(null, args);
  }
  var done = function() {
    var end = (new Date()).getTime();
    args.unshift(end - start);
    if(capabilities.log_events) {
      console.debug.apply(null, args);
    }
  };
  return done;
};

var dbman = {
  dbversion: 4,
  not_ready: function(method, options, promise) {
    if(capabilities.db === undefined) {
      capabilities.queued_db_actions.push([method, options, promise]);
      return true;
    } else if(capabilities.db === false) {
      promise.reject({error: "db not initialized"});
      return true;
    }
    return false;
  },
  success: function(record) {
//    console.log(record);
  },
  error: function(err) {
    console.error(err);
  },
  find: function(store, key, success, error) {
    success = success || capabilities.dbman.success;
    error = error || capabilities.dbman.error;

    var other_index = null;
    if(store == 'board' && key && key.match(/\//)) {
      other_index = key.match(/^tmp_/) ? 'tmp_key' : 'key';
    } else if(store == 'user' && key && !key.match(/^\d+_\d+$/)) {
      other_index = 'key';
    } else if(store == 'tag' && key && !key.match(/^\d+_\d+_/)) {
      other_index = 'tag_id';
    }
    if(other_index) {
      return capabilities.dbman.find_all(store, other_index, key, function(list) {
        var oldest = null;
        list.forEach(function(item) {
          if(item.data && (!oldest || oldest.persisted < item.data.persisted)) {
            oldest = item.data;
          }
        });
        if(oldest) {
          success(oldest);
        } else {
          error({error: "no record found for " + store + ":" + key});
        }
      }, error);
    }

    return capabilities.dbman.find_one(store, key, success, error);
  },
  uniqify_key: function(key, store, index) {
    var keys = [key];
    if(key && key.forEach) { keys = key; }
    var res = [];
    keys.forEach(function(k) {
      if(index == 'id' || index == 'storageId') {
        k = store + "::" + k;
      }
      res.push(k);
    });
    if(key && key.forEach) {
      return res;
    } else {
      return res[0];
    }
  },
  normalize_record: function(record, store) {
    if(record.raw) {
      record.raw = record.raw && capabilities.decrypt(record.raw);
    }
    if(record.id) {
      record.id = record.id.replace(new RegExp("^" + store + "::"), '');
    }
    if(record.storageId) {
      record.storageId = record.storageId.replace(new RegExp("^" + store + "::"), '');
    }
    return record;
  },
  find_one: function(store, key, success, error) {
    key = capabilities.dbman.uniqify_key(key, store, 'id');
    var normalize = capabilities.dbman.normalize_record;
    capabilities.dbman.find_one_internal(store, key, function(record) {
      success(normalize(record, store));
    }, error);
  },
  store: function(store, record, success, error) {
    success = success || capabilities.dbman.success;
    error = error || capabilities.dbman.error;
    if(record.id) {
      record.id = capabilities.dbman.uniqify_key(record.id, store, 'id');
    }
    if(record.storageId) {
      record.storageId = capabilities.dbman.uniqify_key(record.storageId, store, 'id');
    }
    record.persisted = record.persisted || (new Date()).getTime();
    record.raw = capabilities.encrypt(record.raw);
    record.changed = record.changed || false;

    var normalize = capabilities.dbman.normalize_record;
    capabilities.dbman.store_internal(store, record, function(new_record) {
      success(normalize(record, store));
    }, error);
  },
  remove: function(store, key, success, error) {
    success = success || capabilities.dbman.success;
    error = error || capabilities.dbman.error;
    capabilities.dbman.find(store, key, function(res) {
      var id = capabilities.dbman.uniqify_key(res.id, store, 'id');
      capabilities.dbman.remove_internal(store, id, function() {
        success({id: key});
      }, error);
    }, function() {
      success({id: key});
    });
  },
  clear: function(store, success, error) {
    success = success || capabilities.dbman.success;
    error = error || capabilities.dbman.error;

    capabilities.dbman.clear_internal(store, success, error);
  },
  find_all: function(store, index, key, success, error) {
    success = success || capabilities.dbman.success;
    error = error || capabilities.dbman.error;
    key = capabilities.dbman.uniqify_key(key, store, index);
    var normalize = capabilities.dbman.normalize_record;
    capabilities.dbman.find_all_internal(store, index, key, function(list) {
      var new_list = [];
      list.forEach(function(record) {
        var new_result = {
          store: record.store,
          data: normalize(record.data, store)
        };
        new_list.push(new_result);
      });
      success(new_list);
    }, error);
  },
  // Stuff under here exposes internals
  find_one_internal: function(store, key, success, error) {
    var done = log_timing('find_one', store, key);
    success = success || capabilities.dbman.success;
    error = error || capabilities.dbman.error;

    if(dbman.db_type == 'indexeddb') {
      // TODO: this is raising some kind of error mobile safari 8
      var transaction = null;
      try {
        transaction = capabilities.db.transaction([store], 'readonly');
      } catch(e) {
        capabilities.db_error = {
          message: e.message || e.getMessage(),
          store: store,
          key: key
        };
          error({error: "db transaction error for " + store + ", " + key + ": " + (e.message || e.getMessage())});
        return;
      }
      var getter = transaction.objectStore(store);
      var res = getter.get(key);
      res.onsuccess = function(event) {
        var record = event.target.result;
        if(record) {
          done();
          setTimeout(function() {
            success(record);
          }, 0);
        } else {
          done();
          error({error: "no record found for " + store + ":" + key});
        }
      };
      res.onerror = function() {
        done();
        error({error: "error retrieving record from db"});
      };
    } else if(dbman.db_type == 'sqlite_plugin') {
      var store_name = null;
      if(stores[store]) { store_name = store; }
      dbman.db.executeSql('SELECT * FROM ' + store + ' WHERE ref_id = ?', [key], function(result_set) {
        var row = null;
        if(result_set.rows && result_set.rows.length > 0) {
          row = result_set.rows.item(0);
        }
        var result = null;
        if(row && row.data) {
          try {
            result = JSON.parse(row.data);
          } catch(e) { }
        }
        if(result) {
          done();
          setTimeout(function() {
            success(result);
          }, 0);
        } else {
          done();
          error({error: "no record found for " + store + ":" + key});
        }
      }, function(err) {
        done();
        error({error: err.message});
      });
    } else {
      done();
      error({error: "unrecognized db_type, " + dbman.db_type});
    }
  },
  find_all_internal: function(store, index, key, success, error) {
    var done = log_timing('find_all', store, index, key);
    var keys = {};
    if(key && key.forEach) {
      key.forEach(function(k) { keys[k] = true; });
    } else if(key) {
      keys[key] = true;
      key = [key];
    }
    if(dbman.db_type == 'indexeddb') {
      var transaction = capabilities.db.transaction([store], 'readonly');
      var list = [];

      var s = transaction.objectStore(store);
      var res = s.openCursor();
      res.onsuccess = function(event) {
        var cursor = event.target.result;
        if(cursor) {
          if(!index || keys[cursor.value[index]]) {
            var data = cursor.value;
            list.push({
              store: store,
              data: data
            });
          }
          cursor.continue();
        } else {
          done();
          setTimeout(function() {
            success(list);
          }, 0);
        }
      };
      res.onerror = function() {
        done();
        error({error: "error retrieving records from db for " + store});
      };
    } else if(dbman.db_type == 'sqlite_plugin') {
      var handle_rows = function(rows) {
        var list = [];
        rows.forEach(function(row) {
          var data = null;
          try {
            data = JSON.parse(row.data);
          } catch(e) { }
          if(data) {
            if(!index || keys[data[index]]) {
              list.push({
                store: store,
                data: data
              });
            }
          }
        });
        done();
        setTimeout(function() {
          success(list);
        }, 0);
      };
      var store_name = null;
      if(stores[store]) { store_name = store; }
      var query = 'SELECT * FROM ' + store_name;
      var args = [];
      if(index == 'id' && key && key.forEach) {
        query = query + ' WHERE ref_id IN (';
        key.forEach(function(k, idx) {
          query = query + '?';
          args.push(k);
          if(idx < key.length - 1) {
            query = query + ',';
          }
        });
        query = query + ')';
      } else if(index == 'key' && store_name == 'board' && key && key.forEach) {
        query = query + ' WHERE key_id IN (';
        key.forEach(function(k, idx) {
          query = query + '?';
          args.push(k);
          if(idx < key.length - 1) {
            query = query + ',';
          }
        });
        query = query + ')';
      }
      dbman.db.executeSql(query, args, function(result_set) {
        // process and return the resulting list
        var list = [];
        if(result_set.rows && result_set.rows.length) {
          for(var idx = 0; idx < result_set.rows.length; idx++) {
            var row = result_set.rows.item(idx);
            list.push(row);
          }
        }
        handle_rows(list);
      }, function(err) {
        done();
        error({error: err.message});
      });
    } else {
      done();
      error({error: "unrecognized db_type, " + dbman.db_type});
    }
  },
  store_internal: function(store, record, success, error) {
    var done = log_timing('store', store, record);
    if(dbman.db_type == 'indexeddb') {
      var transaction = capabilities.db.transaction([store], 'readwrite');
      try {
        var res = transaction.objectStore(store).put(record);
        res.onsuccess = function(event) {
          done();
          setTimeout(function() {
            success(record);
          }, 0);
        };
        res.onerror = function(event) {
          done();
          error({error: "error storing record in db"});
        };
      } catch(e) { debugger; }
    } else if(dbman.db_type == 'sqlite_plugin') {
      var store_name = null;
      if(stores[store]) { store_name = store; }
      var ref_id = record.storageId || record.id;
      dbman.db.executeSql('SELECT * FROM ' + store_name + ' WHERE ref_id=?', [ref_id], function(result_set) {
        var exists = result_set.rows && result_set.rows.length > 0;
        var args = [JSON.stringify(record)];
        var sql = exists ? 'UPDATE ' + store_name + ' SET data = ? ' : 'INSERT INTO ' + store_name + ' (data, ';
        var keys = ['?', '?'];
        if(store_name == 'board') {
          sql = sql + (exists ? ', key_id = ? ' : 'key_id, ');
          args.push(record.key);
          keys.push('?');
        }
        sql = sql + (exists ? 'WHERE ref_id=?' : 'ref_id) VALUES (' + keys.join(', ') + ')');
        args.push(ref_id);
        dbman.db.executeSql(sql, args, function() {
          done();
          setTimeout(function() {
            success(record);
          }, 0);
        }, function(err) {
          console.log(err);
          done();
          error({error: err.message});
        });
      }, function(err) {
        done();
        error({error: err.message});
      });
    } else {
      done();
      error({error: "unrecognized db_type, " + dbman.db_type});
    }
  },
  remove_internal: function(store, id, success, error) {
    var done = log_timing('remove', store, id);
    if(dbman.db_type == 'indexeddb') {
      var transaction = capabilities.db.transaction([store], 'readwrite');
      try {
        var res = transaction.objectStore(store).delete(id);
        res.onsuccess = function(event) {
          if(capabilities.dbman.deletes) {
            capabilities.dbman.deletes.push({id: id});
          }
          done();
          setTimeout(function() {
            success({id: id});
          }, 0);
        };
        res.onerror = function(event) {
          done();
          error({error: "error removing record in db"});
        };
      } catch(e) { debugger; }
    } else if(dbman.db_type == 'sqlite_plugin') {
      var store_name = null;
      if(stores[store]) { store_name = store; }
      dbman.db.executeSql('DELETE FROM ' + store_name + ' WHERE ref_id=?', [id], function() {
        done();
        setTimeout(function() {
          success({id: id});
        }, 0);
      }, function(err) {
        done();
        error({error: err.message});
        console.log(err);
      });
    } else {
      done();
      error({error: "unrecognized db_type, " + dbman.db_type});
    }
  },
  clear_internal: function(store, success, error) {
    var done = log_timing('clear', store);
    if(dbman.db_type == 'indexeddb') {
      var transaction = capabilities.db.transaction([store], 'readwrite');
      var res = transaction.objectStore(store).clear();
      res.onsuccess = function(event) {
        done();
        setTimeout(function() {
          success({store: store});
        }, 0);
      };
      res.onerror = function() {
        done();
        error({error: "error clearing store"});
      };
    } else if(dbman.db_type == 'sqlite_plugin') {
      dbman.db.transaction(function(tx) {
        var store_name = null;
        if(stores[store]) { store_name = store; }
        tx.executeSql('DELETE FROM ' + store_name, []);
      }, function(err) {
        done();
        console.log(err);
        error({error: err.message});
      }, function() {
        done();
        setTimeout(function() {
          success({store: store});
        }, 0);
      });
    } else {
      done();
      error({error: "unrecognized db_type, " + dbman.db_type});
    }
  },
  delete_database: function(db_name) {
    var promise = capabilities.mini_promise();

    if(dbman.db_type == 'indexeddb') {
      try {
        capabilities.idb.deleteDatabase(db_name);
      } catch(e) {
        promise.reject({error: 'unexpected error deleting database'});
      }
      if(capabilities.db_name == db_name) {
        capabilities.db = false;
        capabilities.db_name = null;
      }
      promise.resolve(db_name);
    } else if(dbman.db_type == 'sqlite_plugin') {
      // https://github.com/litehelpers/Cordova-sqlite-storage
      if(dbman.sqlite && dbman.sqlite) {
        dbman.sqlite.deleteDatabase({name: db_name, location: 'default'}, function() {
          if(capabilities.db_name == db_name) {
            capabilities.db = false;
            capabilities.db_name = null;
          }
          promise.resolve(db_name);
        }, function(err) {
          promise.reject(err);
        });
      } else {
        promise.reject({error: "can't delete websql databases :-/"});
      }
    } else {
      promise.reject({error: "unrecognized db_type, " + dbman.db_type});
    }

    return promise;
  },
  setup_database: function(key, version, promise) {
    promise = promise || capabilities.mini_promise();

    dbman.db_type = 'indexeddb';
    if(window.sqlitePlugin) {
      dbman.sqlite = window.sqlitePlugin || window;
      dbman.db_type = 'sqlite_plugin';
    }

    if(dbman.db_type == 'indexeddb') {
      var request = {};
      var errored = false;
      try {
        request = capabilities.idb.open(key, version);
      } catch(e) {
        console.error("LINGOLINQ: unexpected db throw");
        console.log(e);
        errored = true;
      }
      request = request || {};
      request.onerror = function(event) {
        if(!dbman.setup_database.already_tried) {
          console.log('LINGOLINQ: db failed once, trying again');
          dbman.setup_database.already_tried = true;
          setTimeout(function() {
            dbman.setup_database(key, version, promise);
          }, 1000);
        } else {
          console.log(event);
          if(!dbman.setup_database.already_tried_deleting) {
            console.error("LINGOLINQ: db failed to initialize, deleting database..");
            dbman.delete_database(key);
            dbman.setup_database.already_tried_deleting = true;
            setTimeout(function() {
              dbman.setup_database(key, version, promise);
            }, 500);
          } else {
            if(!dbman.setup_database.already_tried_deleting_all) {
              console.error("LINGOLINQ: db failed to initialize even after deleting, deleting other databases");
              dbman.setup_database.already_tried_deleting_all = true;
              if(capabilities.idb.webkitGetDatabaseNames) {
                capabilities.idb.webkitGetDatabaseNames().onsuccess = function(res) {
                  if(res && res.target && res.target.result) {
                    var count = res.target.result.length;
                    for(var idx = 0; idx < count; idx++) {
                      var str = res.target.result[idx];
                      if(str && str.match(/^coughDropStorage/)) {
                        dbman.delete_database(str);
                      }
                    }
                    if(count > 0) {
                      setTimeout(function() {
                        dbman.setup_database(key, version, promise);
                      }, 500);
                    } else {
                      console.error("LINGOLINQ: db failed to initialize after repeated attempts");
                      promise.reject("db failed after repeated attempts");
                    }
                  }
                };
              } else {
                console.error("LINGOLINQ: db failed to initialize after repeated attempts");
                promise.reject("db failed after repeated attempts");
              }
            } else {
              console.error("LINGOLINQ: db failed to initialize after repeated attempts");
              promise.reject("db failed after repeated attempts");
            }
          }
          dbman.db_error_event = event;
          dbman.db = false;
          capabilities.db = false;
        }
      };
      request.onsuccess = function(event) {
        console.log("LINGOLINQ: db succeeded");
        dbman.db = request.result;
        capabilities.db = request.result;
        setTimeout(function() {
          dbman.use_database(dbman.db, promise);
        }, 10);
      };

      request.onupgradeneeded = function(event) {
        var db = event.target.result;
        db.request = request;
        dbman.upgrade_database(db, event.oldVersion, version, promise);
      };

      request.onblocked = function(event) {
        // If some other tab is loaded with the database, then it needs to be closed
        // before we can proceed.
        alert("Please close all other tabs with this site open!");
      };

      if(errored) {
        request.onerror();
      }
    } else if(dbman.db_type == 'sqlite_plugin') {
      var open_success = function(db) {
        if(open_success.called) { return; }
        open_success.called = true;
        window.db = db;
        var needs_upgrade = false;
        var current_version = null;
        db.transaction(function(tx) {
          tx.executeSql('CREATE TABLE IF NOT EXISTS version (version TEXT)');
          tx.executeSql('SELECT * FROM version', [], function(tx, result_set) {
            var row = null;
            if(result_set.rows && result_set.rows.length > 0) {
              row = result_set.rows.item(0);
            }
            current_version = row && row.version;
            if(!current_version || current_version != version) {
              needs_upgrade = true;
            }
          });
        }, function(err) {
          console.log(err);
          promise.reject({error: err.message});
        }, function() {
          if(needs_upgrade) {
            dbman.upgrade_database(db, current_version, version, promise);
          } else {
            dbman.use_database(db, promise);
          }
        });
      };
      var open_error = function(err) {
        debugger
        promise.reject(err);
      };
      var open_args = [{name: key, location: 'default'}, open_success, open_error];
      if(capabilities.system == 'Android') {
        open_args[0].androidDatabaseProvider = 'system';
      }
      if(!window.sqlitePlugin) {
        open_args = ["sqlitex:" + key, '1.0', "LingoLinq db " + key, 10*1024*1024];
      }
      var db_res = dbman.sqlite.openDatabase.apply(null, open_args);
      setTimeout(function() {
        if(db_res && !open_success.called) {
          open_success(db_res);
        }
      }, 10);
    } else {
      promise.reject({error: "unrecognized db_type, " + dbman.db_type});
    }
    return promise;
  },
  upgrade_database: function(db, old_version, new_version, promise) {
    if(dbman.db_type == 'indexeddb') {
      var indexes_allowed = capabilities.system && capabilities.system != 'iOS';
      var done_after_upgrade = capabilities.system && capabilities.system == 'iOS';
      console.log("LINGOLINQ: db upgrade needed from " + (old_version || 0));

      var always_check = true;
      if(old_version < 1 || old_version > 99999 || always_check) {
        try {
          var store_names = db.objectStoreNames || [];
          var index_names;
          var keys = [];
          for(var key in stores) { keys.push(key); }
          keys.forEach(function(key) {
            var store = stores[key];
            if(!store_names.contains(store.key)) {
              var object_store = db.createObjectStore(store.key, { keyPath: store.key_path });
              var index_names = object_store.indexNames || [];
              (store.indexes || []).forEach(function(index) {
                if(!index_names.contains(index) && indexes_allowed) {
                  object_store.createIndex(index, index, {unique: false});
                }
              });
            }
          });
          setTimeout(function() {
            if(dbman.db) {
              var transaction = db.transaction(['settings'], 'readwrite');
              try {
                var res = transaction.objectStore('settings').delete('lastSync');
              } catch(e) { debugger; }
            }
          }, 2000);
        } catch(e) {
          console.error("LINGOLINQ: db migrations failed");
          console.error(e);
          db.request.onerror();
          db = null;
        }
        if(db && done_after_upgrade) {
          setTimeout(function() {
            if(!dbman.db) {
              dbman.db = db;
              capabilities.db = db;
              console.log("LINGOLINQ: db succeeded through onupgradeneeded");
              dbman.use_database(dbman.db, promise);
            }
          }, 100);
        }
      }
    } else if(dbman.db_type == 'sqlite_plugin') {
      console.log("LINGOLINQ: db upgrade needed from " + (old_version || 0));
      db.transaction(function(tx) {
        tx.executeSql('CREATE TABLE IF NOT EXISTS version (version VARCHAR)');
        var keys = [];
        for(var key in stores) { keys.push(key); }
        keys.forEach(function(key) {
          var store = stores[key];
          tx.executeSql('CREATE TABLE IF NOT EXISTS ' + store.key + ' (id INTEGER PRIMARY KEY ASC, ref_id TEXT, data TEXT)', []);
          tx.executeSql('CREATE INDEX IF NOT EXISTS ' + (store.key + '_id') + ' ON ' + store.key + ' (ref_id)', []);
          if(!old_version || old_version <= 3) {
            if(store.key == 'board') {
              try {
                tx.executeSql('ALTER TABLE ' + store.key + ' ADD key_id TEXT');
              } catch(e) { 
                console.error('error on key_id value', e);
              }
            }
          }
          if(store.key == 'board') {
            tx.executeSql('CREATE INDEX IF NOT EXISTS ' + (store.key + '_key_id') + ' ON ' + store.key + ' (key_id)', []);
          }
        });
        tx.executeSql('DELETE FROM version');
        tx.executeSql('INSERT INTO version (version) VALUES (?)', [new_version]);
        tx.executeSql("DELETE FROM settings WHERE ref_id='lastSync'");
      }, function(err) {
        console.log(err);
        promise.reject({error: err.message});
      }, function() {
        console.log("LINGOLINQ: db succeeded through upgrade check");
        dbman.use_database(db, promise);
      });
      // for each index (include 'id'), make sure there's a string column <key>_index
      // check for the existence of all stores, and necessary columns
    } else {
      promise.reject({error: "unrecognized db_type, " + dbman.db_type});
    }
  },
  use_database: function(db, promise) {
    if(dbman.db_type == 'indexeddb') {
      console_debug("LINGOLINQ: using indexedDB for offline sync"); // - " + capabilities.db_name);
      if(capabilities.mobile && capabilities.installed_app) {
        console.error("should be using sqlite but using indexeddb instead");
      }
      db.onerror = function(event) {
        // Generic error handler for all errors targeted at this database's
        // requests!
        var error = event.target && event.target.errorCode;
        error = error || (event.target && event.target.error && event.target.error.message);
        error = error || (event.target && event.target.__versionTransaction && event.target.__versionTransaction.error && event.target.__versionTransaction.error.message);
        error = error || "unknown error";
        console.log(event.target.error);
        if(event.target.error) {
          console.log(event.target.error.constructor && event.target.error.constructor.name);
        }
        console.log(event.target);
        console.error("Database error: " + error);
        promise.reject(error);
        // capabilities.db = false;
      };

      db.onversionchange = function(event) {
        db.close();
        alert("A new version of this page is ready. Please reload!");
        dbman.db = false;
        capabilities.db = false;
      };

      promise.resolve({database: db});
      // https://developer.mozilla.org/en-US/docs/IndexedDB/Using_IndexedDB
    } else if(dbman.db_type == 'sqlite_plugin') {
      capabilities.db = db;
      dbman.db = db;
      console_debug("LINGOLINQ: using sqlite plugin for offline sync");
      setTimeout(function() {
        promise.resolve({database: db});
      });
    } else {
      promise.reject({error: "unrecognized db_type, " + dbman.db_type});
    }
  }
};

export default dbman;
