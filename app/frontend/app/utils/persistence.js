import Ember from 'ember';
import EmberObject from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import {
  later as runLater,
  cancel as runCancel,
  run
} from '@ember/runloop';
import $ from 'jquery';
import RSVP from 'rsvp';
import LingoLinqAAC from '../app';
import lingoLinqAACExtras from './extras';
import stashes from './_stashes';
import speecher from './speecher';
import i18n from './i18n';
import contentGrabbers from './content_grabbers';
import Utils from './misc';
import modal from './modal';
import capabilities from './capabilities';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

var valid_stores = ['user', 'board', 'image', 'sound', 'settings', 'dataCache', 'buttonset'];
var loaded = (new Date()).getTime() / 1000;
var persistence = EmberObject.extend({
  setup: function(application) {
    application.register('cough_drop:persistence', persistence, { instantiate: false, singleton: true });
    $.each(['model', 'controller', 'view', 'route'], function(i, component) {
      application.inject(component, 'persistence', 'cough_drop:persistence');
    });
    persistence.find('settings', 'lastSync').then(function(res) {
      persistence.set('last_sync_at', res.last_sync);
      persistence.set('sync_stamps', res.stamps);
    }, function() { });
    lingoLinqAACExtras.addObserver('ready', function() {
      persistence.find('settings', 'lastSync').then(function(res) {
        persistence.set('last_sync_at', res.last_sync);
        persistence.set('sync_stamps', res.stamps);
      }, function() {
        persistence.set('last_sync_at', 1);
      });
    });
    var ignore_big_log_change = false;
    stashes.addObserver('big_logs', function() {
      if(lingoLinqAACExtras && lingoLinqAACExtras.ready && !ignore_big_log_change) {
        var rnd_key = (new Date()).getTime() + "_" + Math.random();
        persistence.find('settings', 'bigLogs').then(null, function(err) {
          return RSVP.resvole({});
        }).then(function(res) {
          res = res || {};
          res.logs = res.logs || [];
          var big_logs = (stashes.get('big_logs') || []);
          big_logs.forEach(function(log) {
            res.logs.push(log);
          });
          ignore_big_log_change = rnd_key;
          stashes.set('big_logs', []);
          runLater(function() { if(ignore_big_log_change == rnd_key) { ignore_big_log_change = null; } }, 100);
          persistence.store('settings', res, 'bigLogs').then(function(res) {
          }, function() {
            rnd_key = rnd_key + "2";
            var logs = (stashes.get('big_logs') || []).concat(big_logs);
            ignore_big_log_change = rnd_key;
            stashes.set('big_logs', logs);
            runLater(function() { if(ignore_big_log_change == rnd_key) { ignore_big_log_change = null; } }, 100);
          });
        });
      }
    });
    if(stashes.get('allow_local_filesystem_request') == false) {
      capabilities.storage.already_limited_size = true;      
    }
    if(stashes.get_object('just_logged_in', false) && stashes.get('auth_settings') && !Ember.testing) {
      stashes.persist_object('just_logged_in', null, false);
      runLater(function() {
        persistence.check_for_needs_sync(true);
      }, 10 * 1000);
    }
    lingoLinqAACExtras.advance.watch('device', function() {
      if(!LingoLinqAAC.ignore_filesystem) {
        capabilities.storage.status().then(function(res) {
          if(res.available && !res.requires_confirmation) {
            res.allowed = true;
          }
          persistence.set('local_system', res);
        });
        runLater(function() {
          persistence.prime_caches().then(null, function() { });
        }, 100);
        runLater(function() {
          if(persistence.get('local_system.allowed')) {
            persistence.prime_caches(true).then(null, function() { });
          }
        }, 2000);
      }
    });
  },
  test: function(method, args) {
    method.apply(this, args).then(function(res) {
      console.log(res);
    }, function() {
      console.error(arguments);
    });
  },
  push_records: function(store, keys) {
    var hash = {};
    var res = {};
    // Any non-found records will remain marked as missing
    keys.forEach(function(key) { hash[key] = true; });
    // Look in the in-memory store for matching records, mark them
    // as not missing if found
    LingoLinqAAC.store.peekAll(store).map(function(i) { return i; }).forEach(function(item) {
      if(item) {
        var record = item;
        if(record && hash[record.get('id')]) {
          if(store == 'board' && record.get('permissions') === undefined) {
            // locally-cached board found from a list request doesn't count
          } else {
            hash[record.get('id')] = false;
            res[record.get('id')] = record;
          }
        }
      }
    });
    var any_missing = false;
    keys.forEach(function(key) { if(hash[key] === true) { any_missing = true; } });
    if(any_missing) {
      return new RSVP.Promise(function(resolve, reject) {
        return lingoLinqAACExtras.storage.find_all(store, keys).then(function(list) {
          list.forEach(function(item) {
            if(item.data && item.data.id && hash[item.data.id]) {
              hash[item.data.id] = false;
              // Only push to the memory cache if it's not already in
              // there, otherwise it might get overwritten if there
              // is a pending persistence.
              if(LingoLinqAAC.store) {
                var existing = LingoLinqAAC.store.peekRecord(store, item.data.raw.id);
                persistence.validate_board(existing, item.data.raw);
                var json_api = { data: {
                  id: item.data.raw.id,
                  type: store,
                  attributes: item.data.raw
                }};
                if(existing) {
                  res[item.data.id] = existing;
                } else {
                  res[item.data.id] = LingoLinqAAC.store.push(json_api);
                }
              }
            }
          });
          for(var idx in hash) {
            if(hash[idx] === true) {
              persistence.known_missing = persistence.known_missing || {};
              persistence.known_missing[store] = persistence.known_missing[store] || {};
              persistence.known_missing[store][idx] = true;
            }
          }
          resolve(res);
        }, function(err) {
          reject(err);
        });
      });
    } else {
      return RSVP.resolve(res);
    }
  },
  get_important_ids: function() {
    if(persistence.important_ids) {
      return RSVP.resolve(persistence.important_ids);
    } else {
      return lingoLinqAACExtras.storage.find('settings', 'importantIds').then(function(res) {
        persistence.important_ids = res.raw.ids || [];
        return persistence.important_ids;
      });
    }
  },
  find: function(store, key, wrapped, already_waited) {
    if(!window.lingoLinqExtras || !window.lingoLinqExtras.ready) {
      if(already_waited) {
        return RSVP.reject({error: "extras not ready"});
      } else {
        return new RSVP.Promise(function(resolve, reject) {
          lingoLinqAACExtras.advance.watch('all', function() {
            resolve(persistence.find(store, key, wrapped, true));
          });
        });
      }
    }
    if(!key) { /*debugger;*/ }
    var res = new RSVP.Promise(function(resolve, reject) {
      setTimeout(function() {
        if(valid_stores.indexOf(store) == -1) {
          reject({error: "invalid type: " + store});
          return;
        }
        if(persistence.known_missing && persistence.known_missing[store] && persistence.known_missing[store][key]) {
  //         console.error('found a known missing!');
          reject({error: 'record known missing: ' + store + ' ' + key});
          return;
        }
        var id = RSVP.resolve(key);
        if(store == 'user' && key == 'self') {
          id = lingoLinqAACExtras.storage.find('settings', 'selfUserId').then(function(res) {
            return res.raw.id;
          });
        }
        var lookup = id.then(function(id) {
          return lingoLinqAACExtras.storage.find(store, id).then(function(record) {
            return persistence.get_important_ids().then(function(ids) {
              return RSVP.resolve({record: record, importantIds: ids});
            }, function(err) {
              // if we've never synced then this will be empty, and that's ok
              if(err && err.error && err.error.match(/no record found/)) {
                return RSVP.resolve({record: record, importantIds: []});
              } else {
                return RSVP.reject({error: "failed to find settings result when querying " + store + ":" + key});
              }
            });
          }, function(err) {
            return RSVP.reject(err);
          });
        });
        lookup.then(function(res) {
          var record = res.record;
          var importantIds = res.importantIds;
          var ago = (new Date()).getTime() - (7 * 24 * 60 * 60 * 1000); // >1 week old is out of date
          // TODO: garbage collection for db??? maybe as part of sync..
          if(record && record.raw) {
            record.raw.important = !!importantIds.find(function(i) { return i == (store + "_" + key); });
          }
          // if we have the opportunity to get it from an online source and it's out of date,
          // we should use the online source
          if(record && record.raw && !record.important && record.persisted < ago) {
            record.raw.outdated = true;
          }

          if(store == 'dataCache' && capabilities.system == 'iOS' && record.raw && record.raw.local_url && record.raw.local_filename && record.raw.local_filename.match(/\%/)) {
            // Only on iOS:
            // URLs are stored unecoded, so they need to be encoded
            // before being used, and consistently encoded at least
            // on iOS or they won't be properly double-escaped
            // if the original filename had escaped characters
            record.raw.local_url = encodeURI(record.raw.local_url);
          }

          if(record) {
            var result = {};
            if(wrapped) {
              result[store] = record.raw;
            } else {
              result = record.raw;
            }
            resolve(result);
          } else {
            persistence.known_missing = persistence.known_missing || {};
            persistence.known_missing[store] = persistence.known_missing[store] || {};
            persistence.known_missing[store][key] = true;
            reject({error: "record not found: " + store + ' ' + key});
          }
        }, function(err) {
          persistence.known_missing = persistence.known_missing || {};
          persistence.known_missing[store] = persistence.known_missing[store] || {};
          persistence.known_missing[store][key] = true;
          reject(err);
        });
      }, 0);
    });
    return res;
  },
  remember_access: function(lookup, store, id) {
    try {
      if(lookup == 'find' && store == 'board') {
        var recent_boards = stashes.get('recent_boards') || [];
        recent_boards.unshift({id: id});
        var old_list = Utils.uniq(recent_boards.slice(0, 100), function(b) { return !b.id.toString().match(/^tmp_/) ? b.id : null; });
        var key = {};
        var list = [];
        old_list.forEach(function(b) {
          if(!key[b.id]) {
            list.push(b);
          }
        });
        stashes.persist('recent_boards', list);
      }
    } catch(e) { }
  },
  find_recent: function(store) {
    return new RSVP.Promise(function(resolve, reject) {
      if(store == 'board') {
        var promises = [];
        var board_ids = [];
        stashes.get('recent_boards').forEach(function(board) {
          board_ids.push(board.id);
        });

        var find_local = lingoLinqAACExtras.storage.find_all(store, board_ids).then(function(list) {
          var res = [];
          list.forEach(function(item) {
            if(item.data && item.data.id) {
              // Only push to the memory cache if it's not already in
              // there, otherwise it might get overwritten if there
              // is a pending persistence.
              if(LingoLinqAAC.store) {
                var existing = LingoLinqAAC.store.peekRecord('board', item.data.raw.id);
                if(!existing) {
                  var json_api = { data: {
                    id: item.data.raw.id,
                    type: 'board',
                    attributes: item.data.raw
                  }};
                  res.push(LingoLinqAAC.store.push(json_api));
                } else {
                  res.push(existing);
                }
                persistence.validate_board(existing, item.data.raw);
              }
            }
          });
          return RSVP.resolve(res);
        });
        find_local.then(function(list) {
          resolve(list);
        }, function(err) {
          reject({error: 'find_all failed for ' + store});
        });
      } else {
        reject({error: 'unsupported type: ' + store});
      }
    });
  },
  validate_board: function(board, raw_board) {
    // If the revision hash doesn't match, that means that the model
    // in memory doesn't match what's in the local db.
    // If the model is newer, then there should be a pending storage
    // event persisting it, otherwise something is busted.
    if(board && raw_board) {
      if(board.get('current_revision') != raw_board.current_revision) {
        if(board.get('updated') > raw_board.updated) {
          var eventuals = persistence.eventual_store || [];
          var found_persist = false;
          for(var idx = 0; idx < eventuals.length; idx++) {
            if(eventuals[idx] && eventuals[idx][1] && eventuals[idx][1].id == raw_board.id) {
              found_persist = true;
            }
          }
          if(!found_persist) {
            console.error('lost persistence task for', raw_board.id);
            console.log(board.get('current_revision'), raw_board.current_revision);
          }
        }
      }
    }
  },
  find_changed: function() {
    if(!window.lingoLinqExtras || !window.lingoLinqExtras.ready) {
      return RSVP.resolve([]);
    }
    return lingoLinqAACExtras.storage.find_changed();
  },
  find_boards: function(str) {
    var re = new RegExp("\\b" + str, 'i');
    var get_important_ids =  lingoLinqAACExtras.storage.find('settings', 'importantIds').then(function(res) {
      return RSVP.resolve(res.raw.ids);
    });

    var get_board_ids = get_important_ids.then(function(ids) {
      var board_ids = [];
      ids.forEach(function(id) {
        if(id.match(/^board_/)) {
          board_ids.push(id.replace(/^board_/, ''));
        }
      });
      return board_ids;
    });

    var get_boards = get_board_ids.then(function(ids) {
      var promises = [];
      var boards = [];
      var loaded_boards = LingoLinqAAC.store.peekAll('board');
      ids.forEach(function(id) {
        var loaded_board = loaded_boards.findBy('id', id);
        if(loaded_board) {
          boards.push(loaded_board);
        } else {
          promises.push(persistence.find('board', id).then(function(res) {
            var json_api = { data: {
              id: res.id,
              type: 'board',
              attributes: res
            }};
            var obj = LingoLinqAAC.store.push(json_api);
            boards.push(obj);
            return true;
          }));
        }
      });
      var res = RSVP.all(promises).then(function() {
        return boards;
      });
      promises.forEach(function(p) { p.then(null, function() { }); });
      return res;
    });

    var search_boards = get_boards.then(function(boards) {
      var matching_boards = [];
      boards.forEach(function(board) {
        var str = board.get('key') + " " + board.get('name') + " " + board.get('description');
        (board.get('buttons') || []).forEach(function(button) {
          str = str + " " + (button.label || button.vocalization);
        });
        if(str.match(re)) {
          matching_boards.push(board);
        }
      });
      return matching_boards;
    });

    return search_boards;
  },
  remove: function(store, obj, key, log_removal) {
    var _this = this;
    this.removals = this.removals || [];
    if(window.lingoLinqAACExtras && window.lingoLinqAACExtras.ready) {
      runLater(function() {
        var record = obj[store] || obj;
        record.id = record.id || key;
        var result = lingoLinqAACExtras.storage.remove(store, record.id).then(function() {
          return RSVP.resolve(obj);
        }, function(error) {
          return RSVP.reject(error);
        });

        if(log_removal) {
          result = result.then(function() {
            return lingoLinqAACExtras.storage.store('deletion', {store: store, id: record.id, storageId: (store + "_" + record.id)});
          });
        }

        result.then(function() {
          persistence.log = persistence.log || [];
          persistence.log.push({message: "Successfully removed object", object: obj, key: key});
          _this.removals.push({id: record.id});
        }, function(error) {
          persistence.errors = persistence.errors || [];
          persistence.errors.push({error: error, message: "Failed to remove object", object: obj, key: key});
        });
      }, 30);
    }

    return RSVP.resolve(obj);
  },
  store_eventually: function(store, obj, key) {
    persistence.eventual_store = persistence.eventual_store || [];
    persistence.eventual_store.push([store, obj, key, true]);
    if(!persistence.eventual_store_timer) {
      persistence.eventual_store_timer = runLater(persistence, persistence.next_eventual_store, 100);
    }
    return RSVP.resolve(obj);
  },
  refresh_after_eventual_stores: function() {
    if(persistence.eventual_store && persistence.eventual_store.length > 0) {
      persistence.refresh_after_eventual_stores.waiting = true;
    } else {
      // TODO: I can't figure out a reliable way to know for sure
      // when all the records can be looked up in the local store,
      // so I'm using timers for now. Luckily these lookups shouldn't
      // be very involved, especially once the record has been found.
      if(LingoLinqAAC.Board) {
        runLater(LingoLinqAAC.Board.refresh_data_urls, 2000);
      }
    }
  },
  next_eventual_store: function() {
    if(persistence.eventual_store_timer) {
      runCancel(persistence.eventual_store_timer);
    }
    try {
      var args = (persistence.eventual_store || []).shift();
      if(args) {
        persistence.store.apply(persistence, args);
      } else if(persistence.refresh_after_eventual_stores.waiting) {
        persistence.refresh_after_eventual_stores.waiting = false;
        if(LingoLinqAAC.Board) {
          LingoLinqAAC.Board.refresh_data_urls();
        }
      }
    } catch(e) { }
    persistence.eventual_store_timer = runLater(persistence, persistence.next_eventual_store, 200);
  },
  store: function(store, obj, key, eventually) {
    // TODO: more nuanced wipe of known_missing would be more efficient
    persistence.known_missing = persistence.known_missing || {};
    persistence.known_missing[store] = {};

    var _this = this;

    return new RSVP.Promise(function(resolve, reject) {
      if(lingoLinqExtras && lingoLinqExtras.ready) {
        persistence.stores = persistence.stores || [];
        var promises = [];
        var store_method = eventually ? persistence.store_eventually : persistence.store;
        if(valid_stores.indexOf(store) != -1) {
          var record = {raw: (obj[store] || obj)};
          if(store == 'settings') {
            record.storageId = key;
          }
          if(store == 'user') {
            record.raw.key = record.raw.user_name;
          }
          record.id = record.raw.id || key;
          record.key = record.raw.key;
          record.tmp_key = record.raw.tmp_key;
          record.changed = !!record.raw.changed;


          var store_promise = lingoLinqExtras.storage.store(store, record, key).then(function() {
            if(store == 'user' && key == 'self') {
              return store_method('settings', {id: record.id}, 'selfUserId').then(function() {
                return RSVP.resolve(record.raw);
              }, function() {
                return RSVP.reject({error: "selfUserId not persisted"});
              });
            } else {
              return RSVP.resolve(record.raw);
            }
          });
          store_promise.then(null, function() { });
          promises.push(store_promise);
        }
        if(store == 'board' && obj.images) {
          obj.images.forEach(function(img) {
            // TODO: I don't think we need these anymore
            promises.push(store_method('image', img, null));
          });
        }
        if(store == 'board' && obj.sounds) {
          obj.sounds.forEach(function(snd) {
            // TODO: I don't think we need these anymore
            promises.push(store_method('sound', snd, null));
          });
        }
        RSVP.all(promises).then(function() {
          // Completely clear known_missing for the store when a new
          // record is persisted
          persistence.known_missing = persistence.known_missing || {};
          persistence.known_missing[store] = {};
          persistence.stores.push({object: obj});
          persistence.log = persistence.log || [];
          persistence.log.push({message: "Successfully stored object", object: obj, store: store, key: key});
        }, function(error) {
          persistence.errors = persistence.errors || [];
          persistence.errors.push({error: error, message: "Failed to store object", object: obj, store: store, key: key});
        });
        promises.forEach(function(p) { p.then(null, function() { }); });
      }

      resolve(obj);
    });
  },
  normalize_url: function(url) {
    if(url && url.match(/\%2520/)) {
      // TODO: did this bust everyone?
      // url = url.replace(/\%2520/g, '%20');
    }
    if(url && url.match(/user_token=[\w-]+$/)) {
      return url.replace(/[\?\&]user_token=[\w-]+$/, '');
    } else {
      return url;
    }
  },
  decrypt_json: function(str, encryption_settings) {
    if(str.match(/^aes256-/)) {
      var te = new TextEncoder();
      str = str.replace(/^aes256-/, '');
      return window.crypto.subtle.importKey(
          "raw",
          te.encode(encryption_settings.key),
          { name: "AES-GCM", }, false, ["encrypt", "decrypt"]
      ).then(function(key) { 
        var bytes = Uint8Array.from(atob(str), c => c.charCodeAt(0));
        var iv_arr = Uint8Array.from(atob(encryption_settings.iv), c => c.charCodeAt(0));
        return window.crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: iv_arr,
            additionalData: te.encode(encryption_settings.hash),
            tagLength: 128
          },
          key,
          bytes
        ).then(function(res) {
          var buff = new Uint8Array(res);
          var str = buff.reduce((acc, i) => acc += String.fromCharCode.apply(null, [i]), '')
          try {
            return persistence.bg_parse_json(str);
          } catch(e) {
            return RSVP.reject({error: 'JSON parse failed on decrypted content', err: e});
          }
        });
      });
    } else {
      try {
        return persistence.bg_parse_json(str);
      } catch(e) {
        return RSVP.reject({error: 'JSON parse failed', err: e});
      }
    }
  },
  remote_json: function(url, encryption_settings) {
    var _this = this;
    return _this.find_json(url).then(null, function() {
      return persistence.ajax(url, {type: 'GET', dataType: 'text'}).then(function(data) {
        return persistence.decrypt_json(data.text, encryption_settings);
      });
    });
  },
  bg_parse_json: function(str) {
    if(!window.Worker) {
      try {
        return RSVP.resolve(JSON.parse(str))
      } catch(e) { 
        return RSVP.reject({error: "error parsing JSON without web worker"})
      }
    }
    if(!persistence.bg_parser) {
      persistence.bg_parser = {callbacks: {}};
      var blob = new Blob([
        'this.onmessage = function(message) {\n' +
          'try {\n' + 
            'postMessage({id: message.data.id, data: JSON.parse(message.data.str)});\n' +
          '} catch(e) { postMessage({id: message.data.id, error: true}); }\n' + 
        '};'
        ], { type: "text/javascript" });
      var workerUrl = window.URL.createObjectURL(blob);
  
      try {
        var w = new Worker(workerUrl/*"worker.js"*/);
        w.onmessage = function(message) {
          var cb = persistence.bg_parser.callbacks[message.data.id];
          if(cb) {
            if(message.data.error) {
              cb.reject({error: 'error parsing JSON on web worker'});
            } else {
              cb.resolve(message.data.data);
            }  
          }
        };
        // TODO: can't create workers this way on local server (installed app)
        persistence.bg_parser.worker = w;
      } catch(e) { }
    }
    var defer = RSVP.defer();
    var message_id = Math.random() + "." + (new Date()).getTime();
    persistence.bg_parser.callbacks[message_id] = defer;
    if(persistence.bg_parser.worker && persistence.bg_parser.worker.postMessage) {
      persistence.bg_parser.worker.postMessage({id: message_id, str: str});
      return defer.promise;  
    } else {
      try {
        var json = JSON.parse(str);
        return RSVP.resolve(json)
      } catch(e) {
        return RSVP.reject(e);
      }
    }
  },
  find_json: function(url) {
    // TODO: replace JSON.parse with webworker if too big:
    // https://stackoverflow.com/questions/10494285/is-delegating-json-parse-to-web-worker-worthwile-in-chrome-extension-ff-addon
    var _this = this;
    return new RSVP.Promise(function(resolve, reject) {
      _this.find_url(url, 'json').then(function(uri) {
        if(typeof(uri) == 'string' && uri.match(/^data:/)) {
          try {
            persistence.bg_parse_json(atob(uri.split(/,/)[1])).then(function(json) {
              resolve(json);
            }, function(err) {
              LingoLinqAAC.track_error("No JSON dataURI");
              reject({error: "No JSON dataURI result"});  
            });
          } catch(e) {
            LingoLinqAAC.track_error("error parsing JSON data URI", e);
            reject({error: "Error parsing JSON dataURI"});
          }
        } else if(typeof(uri) == 'string' && uri.match(/^filesystem/) && capabilities.browser == 'Chrome') {
          var filename = uri.split(/\//).pop();
          capabilities.storage.get_file_url('json', filename, true).then(function(data_uri) {
            try {
              persistence.bg_parse_json(atob(data_uri.split(/,/)[1])).then(function(result) {
                resolve(result || []);
              });
            } catch(e) {
              console.error("json storage", e);
              reject({error: "Error parsing JSON dataURI storage"});
            }
          }, function(err) {
            reject(err);
          });
        } else if(typeof(uri) == 'string') {
          var res = _this.ajax(uri + "?cr=" + Math.random(), {type: 'GET', dataType: 'text'});
          res.then(function(res) {
            persistence.bg_parse_json(res.text).then(function(json) { 
              resolve(json);
            }, function(err) {
              reject(err);
            });
          }, function(err) {
            if(err && err.message == 'error' && err.fakeXHR && err.fakeXHR.status == 0) {
              persistence.remove('dataCache', url);
              persistence.url_cache[url] = null;
            }
            LingoLinqAAC.track_error("JSON data retrieval error", (err || {}).error || err);
            reject(err);
          });
        } else {
          resolve(uri);
        }
      }, function(err) {
        LingoLinqAAC.track_error("JSON DATA find_url error", (err || {}).error || err);
        reject(err);
      });
    });
  },
  store_json: function(url, json, encryption_settings) {
    var _this = this;
    if(json && url.match(/^cache:/)) {
      persistence.json_cache = persistence.json_cache || {};
      persistence.json_cache[url] = json;
    }
    return _this.store_url(url, 'json', encryption_settings).then(function(storage) {
      var data_uri = storage.data_uri || storage;
      var result = undefined;
      var parse_uri = function(data_uri) {
        try {
          return persistence.bg_parse_json(atob(data_uri.split(/,/)[1])).then(function(result) {
            return result || [];
          });
        } catch(e) {
          console.error("json storage", e);
          return RSVP.reject({error: "Error parsing JSON dataURI storage"});
        }
      };
      if(typeof(data_uri) == 'string' && data_uri.match(/^data:/)) {
        return parse_uri(data_uri);
      } else if(!json && storage && storage.local_url) {
        // Guaranteed to be a local URL, retrieve via AJAX if available
        if(storage.local_filename && capabilities.browser == 'Chrome') {
          return new RSVP.Promise(function(uri_resolve, uri_reject) {
            capabilities.storage.get_file_url('json', storage.local_filename, true).then(function(data_uri) {
              parse_uri(data_uri).then(function(res) {
                uri_resolve(res);
              }, function(err) {
                uri_reject(err);
              });
            }, function(err) {
              uri_reject(err);
            })  
          });
        } else {
          return persistence.ajax(storage.local_url, {type: 'GET', dataType: 'text'}).then(function(res) {
            return persistence.bg_parse_json(res.text);
          }, function(err) {
            if(err && err.message == 'error' && err.fakeXHR && err.fakeXHR.status == 0) {
              persistence.remove('dataCache', storage.local_url);
              persistence.url_cache[storage.local_url] = null;
            }
            return RSVP.reject(err);
          });  
        }
      } else {
        if(data_uri || result !== undefined) {
          return result || json;
        } else {
          console.error("nothing", url, json);
          return RSVP.reject({error: "No JSON dataURI storage result"});
        }  
      }
    });
  },
  find_url: function(url, type) {
    if(!this.primed) {
      var _this = this;
      return new RSVP.Promise(function(res, rej) {
        runLater(function() {
          _this.find_url(url, type).then(function(r) { res(r); }, function(e) { rej(e); });
        }, 500);
      });
    }
    url = this.normalize_url(url);
    // Looks like we changed all our images to the CDN without updating
    // the button sets. We should fix that on the backend, but this
    // should also help mitigate
    var alt_url = null;
    if(url && url.match(/^https\:\/\/s3\.amazonaws\.com\/opensymbols\//)) {
      alt_url = url.replace(/^https\:\/\/s3\.amazonaws\.com\/opensymbols\//, "https://d18vdu4p71yql0.cloudfront.net/");
    } else if(url && url.match(/^https\:\/\/opensymbols\.s3\.amazonaws\.com\//)) {
      alt_url = url.replace(/^https\:\/\/opensymbols\.s3\.amazonaws\.com\//, "https://d18vdu4p71yql0.cloudfront.net/");
    }
    // url_cache is a cache of all images that already have a data-uri loaded
    // url_uncache is all images that are known to not have a data-uri loaded
    if(this.url_cache && this.url_cache[url]) {
      return RSVP.resolve(this.url_cache[url]);
    } else if(this.url_cache && alt_url && this.url_cache[alt_url]) {
      return RSVP.resolve(this.url_cache[alt_url]);
    } else if(this.url_uncache && this.url_uncache[url]) {
      var _this = this;
      var find = this.find('dataCache', url);
      return find.then(function(data) {
        _this.url_cache = _this.url_cache || {};
        var file_missing = _this.url_cache[url] === false;
        if(data.local_url) {
          if(data.local_filename) {
            if(type == 'image' && _this.image_filename_cache && _this.image_filename_cache[data.local_filename]) {
              _this.url_cache[url] = capabilities.storage.fix_url(data.local_url, true);
              return _this.url_cache[url];
            } else if(type == 'sound' && _this.sound_filename_cache && _this.sound_filename_cache[data.local_filename]) {
              _this.url_cache[url] = capabilities.storage.fix_url(data.local_url);
              return _this.url_cache[url];
            } else {
              // confirm that the file is where it's supposed to be before returning
              return new RSVP.Promise(function(file_url_resolve, file_url_reject) {
                // apparently file system calls are really slow on ios
                if(data.local_url) {
                  var local_url = capabilities.storage.fix_url(data.local_url, type == 'image');
                  _this.url_cache[url] = local_url;
                  file_url_resolve(local_url);
                } else {
                  if(file_missing) {
                    capabilities.storage.get_file_url(type, data.local_filename).then(function(local_url) {
                      var local_url = capabilities.storage.fix_url(local_url, type == 'image');
                      _this.url_cache[url] = local_url;
                      file_url_resolve(local_url);
                    }, function() {
                      if(data.data_uri) {
                        file_url_resolve(data.data_uri);
                      } else {
                        file_url_reject({error: "missing local file"});
                      }
                    });
                  } else {
                    var local_url = capabilities.storage.fix_url(data.local_filename, type == 'image');
                    _this.url_cache[url] = local_url;
                    file_url_resolve(local_url);
                  }
                }
              });
            }
          }
          data.local_url = capabilities.storage.fix_url(data.local_url, type == 'image');
          _this.url_cache[url] = data.local_url;
          return data.local_url || data.data_uri;
        } else if(data.data_uri) {
          // methinks caching data URIs would fill up memory mighty quick, so let's not cache
          return data.data_uri;
        } else {
          return RSVP.reject({error: "no data URI or filename found for cached URL"});
        }
      });
    } else {
      return RSVP.reject({error: 'url not in storage'});
    }
  },
  prime_caches: function(check_file_system) {
    var now = (new Date()).getTime();
    console.log("LINGOLINQ-AAC: priming caches", check_file_system);
    var _this = this;
    _this.url_cache = _this.url_cache || {};
    _this.url_uncache = _this.url_uncache || {};
    _this.image_filename_cache = _this.image_filename_cache || {};
    _this.sound_filename_cache = _this.sound_filename_cache || {};
    var fn_cache = {};
    window.fn_cache = fn_cache;
    var prime_promises = [];
    if(_this.get('local_system.available') && _this.get('local_system.allowed') && stashes.get('auth_settings')) {
    } else {
      _this.primed = true;
      console.log("LINGOLINQ-AAC: done priming caches", check_file_system, (new Date()).getTime() - now);
      return RSVP.reject({error: 'not enabled or no user set'});
    }
    runLater(function() {
      if(!_this.primed) { _this.primed = true; }
    }, 10000);

    prime_promises.push(new RSVP.Promise(function(res, rej) {
      // apparently file system calls are really slow on ios
      if(!check_file_system) { return res([]); }
      capabilities.storage.list_files('image').then(function(images) {
        images.forEach(function(image) {
          _this.image_filename_cache[image] = true;
        });
        res(images);
      }, function(err) { rej(err); });
    }));
    prime_promises.push(new RSVP.Promise(function(res, rej) {
      // apparently file system calls are really slow on ios
      if(!check_file_system) { return res([]); }
      capabilities.storage.list_files('sound').then(function(sounds) {
        sounds.forEach(function(sound) {
          _this.sound_filename_cache[sound] = true;
        });
        res(sounds);
      }, function(err) { rej(err); });
    }));
    var res = RSVP.all_wait(prime_promises).then(function() {
      return lingoLinqExtras.storage.find_all('dataCache').then(function(list) {
        var promises = [];
        list.forEach(function(item) {
          if(item.data && item.data.raw && item.data.raw.url && item.data.raw.type && item.data.raw.local_filename) {
            if(capabilities.system == 'iOS' && item.data.raw.local_filename.match(/\%/)) {
              // Only on iOS, if the filename has escaped characters, they
              // need to be double-escaped in the URL
              item.data.raw.local_url = encodeURI(item.data.raw.local_url);
            }
            _this.url_cache[item.data.raw.url] = null;
            _this.url_uncache[item.data.raw.url] = null;
            // if the image is found in the local directory listing, it's good
            if(item.data.raw.type == 'image' && item.data.raw.local_url && _this.image_filename_cache && _this.image_filename_cache[item.data.raw.local_filename]) {
              _this.url_cache[item.data.raw.url] = capabilities.storage.fix_url(item.data.raw.local_url, true);
              fn_cache[_this.url_cache[item.data.raw.url]] = item.data.raw.local_filename;
            // if the sound is found in the local directory listing, it's good
            } else if(item.data.raw.type == 'sound' && item.data.raw.local_url && _this.sound_filename_cache && _this.sound_filename_cache[item.data.raw.local_filename]) {
              _this.url_cache[item.data.raw.url] = capabilities.storage.fix_url(item.data.raw.local_url);
            } else {
              // apparently file system calls are really slow on ios (and android), so we skip for the first go-round
              // (fix_url compensates for directory structures changing on ios with updates)
              if(!check_file_system) {
                _this.url_cache[item.data.raw.url] = capabilities.storage.fix_url(item.data.raw.local_url);
              } else {
                promises.push(new RSVP.Promise(function(res, rej) {
                  // see if it's available as a file_url since it wasn't in the directory listing
                  capabilities.storage.get_file_url(item.data.raw.type, item.data.raw.local_filename).then(function(local_url) {
                    local_url = capabilities.storage.fix_url(local_url, item.data.raw.type == 'image');
                    _this.url_cache[item.data.raw.url] = local_url;
                    res(local_url);
                  }, function(err) {
                    _this.url_cache[item.data.raw.url] = false;
                    rej(err);
                  });
                }));
              }
            }
          // if no local_filename defined, then it's known to not be cached
          } else if(item.data && item.data.raw && item.data.raw.url) {
            _this.url_uncache[item.data.raw.url] = true;
          }
        });
        return RSVP.all_wait(promises).then(function() {
          return list;
        });
      });
    });
//     if(!_this.primed && capabilities.mobile && false) {
//       // css preload of all images on mobile
//       var style = document.createElement('style');
//       style.type = 'text/css';
//       var head = document.getElementsByTagName('head')[0];
//       var rules = [];
//       for(var idx in _this.url_cache) {
//         rules.push("url(\"" + _this.url_cache[idx] + "\")");
//       }
//       style.innerHTML = 'body::after { content: ' + (rules.join(' ')) + '; height: 0; position: absolute; left: -1000;}';
//       if(head) {
//         head.appendChild(style);
//       }
//     }
    res.then(function() { 
      if(!_this.primed && capabilities.mobile && capabilities.installed_app && location.host.match(/^localhost/)) {
        _this.primed = true; 
        // When being served by a local file server, when you open a board
        // the images cascade into visibility unless you prefetch them,
        // so we try to do this while still letting other requests slip in.
        runLater(function() {
          // TODO: I think this maybe isn't necessary anymore
          var urls = [];
          for(var key in _this.url_cache) {
            urls.push(_this.url_cache[key]);
          }
          var next = function() {
            var url = urls.shift();
            if(url) {
              var img = new Image();
              img.onerror = function() { 
                var img2 = new Image();
                img2.onload = function() {
                  _this.url_cache[key] = img2.src;
                  runLater(next, 10); 
                }
                img2.onerror = function() {
                  setTimeout(function() {
                    var img3 = new Image();
                    img3.onload = function() {
                      _this.url_cache[key] = img3.src;
                      if(_this.url_uncache) {
                        delete _this.url_uncache[key];
                      }
                    }
                    // Sometimes the server returns a blank
                    // response for a valid resource, so we
                    // look it up again to make sure it's
                    // not actually missing
                    img3.src = capabilities.storage.fix_url(url, false) + "?cr=" + Math.random();
                    runLater(next, 20); 
                  }, 50);

                }
                // Some URLs are legacy-broken unless encoded
                img2.src = encodeURI(url);
              }
              img.onload = function() { runLater(next, 10); }
              img.src = url;
            } else {
              console.log("SWEETSUITE: done prefetching images", (new Date()).getTime() - now);
            }
          };
          var img_cache_threads = 2;
          for(var idx = 0; idx < img_cache_threads; idx++) {
            next();
          }
        });
      }
      console.log("LINGOLINQ-AAC: done priming caches", check_file_system, (new Date()).getTime() - now);
    }, function() { 
      console.log("LINGOLINQ-AAC: done priming caches", check_file_system, (new Date()).getTime() - now);
      _this.primed = true; 
    });
    return res;
  },
  url_cache: {},
  store_url_quick_check: function(url, type) {
    var _this = this;
    if(type == 'image' || type == 'sound') {
      return (_this.url_cache && _this.url_cache[url] && (!_this.url_uncache || !_this.url_uncache[url]));
    }
    return false;

  },
  store_url: function store_url(url, type, keep_big, force_reload, sync_id) {
    persistence.urls_to_store = persistence.urls_to_store || [];
    var defer = RSVP.defer();
    var opts = {
      url: url,
      type: type,
      keep_big: keep_big,
      force_reload: force_reload,
      sync_id: sync_id,
      defer: defer
    };
    persistence.urls_to_store.push(opts);
    if(!persistence.storing_urls) {
      persistence.storing_url_watchers = 0;
      persistence.storing_urls = function() {
        if(persistence.urls_to_store && persistence.urls_to_store.length > 0) {
          var opts = persistence.urls_to_store.shift();
          var part_of_canceled = opts.sync_id && (!persistence.get('sync_progress') || persistence.get('sync_progress.canceled'));
          if(!part_of_canceled) {
            persistence.store_url_now(opts.url, opts.type, opts.keep_big, opts.force_reload).then(function(res) {
              opts.defer.resolve(res);
              if(persistence.storing_urls) { persistence.storing_urls(); }
            }, function(err) {
              opts.defer.reject(err);
              if(persistence.storing_urls) { persistence.storing_urls(); }
            });
          } else {
            opts.defer.reject({error: 'sync canceled'});
          }
        } else {
          persistence.storing_url_watchers--;
        }
      };
    }
    var max_watchers = 3;
    if(capabilities.mobile) {
      max_watchers = 2;
      if(capabilities.system == 'Android') {
        max_watchers = 1;
      }
    }
    if(persistence.storing_url_watchers < max_watchers) {
      persistence.storing_url_watchers++;
      persistence.storing_urls();
    }
    return defer.promise;
  },
  store_url_now: function(url, type, keep_big, force_reload) {
    var encryption_settings = null;
    if(keep_big && keep_big.iv) {
      encryption_settings = keep_big;
      keep_big = false;
    }
    if(!type) { return RSVP.reject('type required for storing'); }
    if(!url) { console.error('url not provided'); return RSVP.reject('url required for storing'); }
    if(!window.sweetSuiteExtras || !window.sweetSuiteExtras.ready || url.match(/^data:/) || url.match(/^file:/) || url.match(/localhost:/) || url.match(/http:\/\/localhost/)) {
      return RSVP.resolve({
        url: url,
        type: type
      });
    }

    var url_id = persistence.normalize_url(url);
    var _this = persistence;
    return new RSVP.Promise(function(resolve, reject) {
      var lookup = RSVP.reject();

      if(url && url.match(/^cache:/) && persistence.json_cache && persistence.json_cache[url]) {
        lookup = RSVP.resolve({
          url: url,
          type: type,
          content_type: 'text/json',
          data_uri: "data:text/json;base64," + btoa(JSON.stringify(persistence.json_cache[url])),
          local_filename: persistence.json_cache[url].filename
        });
      }

      var trusted_not_to_change = url.match(/opensymbols\.s3\.amazonaws\.com/) || url.match(/s3\.amazonaws\.com\/opensymbols/) ||
                  url.match(/coughdrop-usercontent\.s3\.amazonaws\.com/) || url.match(/s3\.amazonaws\.com\/coughdrop-usercontent/) ||
                  url.match(/d18vdu4p71yql0.cloudfront.net/) || url.match(/dc5pvf6xvgi7y.cloudfront.net/);
      var cors_match = trusted_not_to_change || url.match(/api\/v\d+\/users\/.+\/protected_image/) || url.match(/api\/v\d+\/lang/);
      if(trusted_not_to_change && url.match(/usercontent/) && url.match(/\/extras\//)) {
        trusted_not_to_change = false;
      }
      var check_for_local = !!trusted_not_to_change;

      if(capabilities.installed_app) { check_for_local = true; }
      if(check_for_local) {
        // skip the remote request if it's stored locally from a location we
        // know won't ever modify static assets
        lookup = lookup.then(null, function() {
          return persistence.find('dataCache', url_id).then(function(data) {
            // if it's a manual sync, always re-download untrusted resources
            if(force_reload && !trusted_not_to_change) {
              return RSVP.reject();
            // if we think it's stored locally but it's not in the cache, it needs to be repaired
            } else if(_this.url_cache && _this.url_cache[url] && (!_this.url_uncache || !_this.url_uncache[url])) {
              return RSVP.resolve(data);
            } else {
              return RSVP.reject();
            }
          });
        });
      }

      if(cors_match && window.FormData) {
        // try avoiding the proxy if we know the resource is CORS-enabled. Have to fall
        // back to plain xhr in order to get blob response
        lookup = lookup.then(null, function() {
          return new RSVP.Promise(function(xhr_resolve, xhr_reject) {
            var xhr = new XMLHttpRequest();
            xhr.addEventListener('load', function(r) {
              if(xhr.status == 200) {
                contentGrabbers.read_file(xhr.response).then(function(s) {
                  xhr_resolve({
                    url: url,
                    type: type,
                    content_type: xhr.getResponseHeader('Content-Type'),
                    data_uri: s.target.result
                  });
                }, function() {
                  xhr_reject({cors: true, error: 'URL processing failed'});
                });
              } else {
                console.log("SWEETSUITE: CORS request probably failed");
                xhr_reject({cors: true, error: 'URL lookup failed with ' + xhr.status});
              }
            });
            xhr.addEventListener('error', function(e) {
              xhr_reject({e:e, cors: true, error: 'URL lookup error'});
            });
            xhr.addEventListener('abort', function() { xhr_reject({cors: true, error: 'URL lookup aborted'}); });
//            console.log("trying CORS request for " + url);
            // Adding the query parameter because I suspect that if a URL has already
            // been retrieved by the browser, it's not sending CORS headers on the
            // follow-up request, maybe?
            xhr.url = url;
            // TODO: xhr.open('GET', encodeURI(url) + (url.match(/\?/) ? '&' : '?') + "cr=1");
            xhr.open('GET', url + (url.match(/\?/) ? '&' : '?') + "cr=1");
            xhr.responseType = 'blob';
            xhr.send(null);
          });
        });
      }

      var fallback = lookup.then(null, function(res) {
        if(res && res.error && res.cors) {
          console.error("CORS request error: " + res.error);
        }
        var external_proxy = RSVP.reject();
        if(window.symbol_proxy_key) {
          external_proxy = persistence.ajax('https://www.opensymbols.org/api/v1/symbols/proxy?url=' + encodeURIComponent(url) + '&access_token=' + window.symbol_proxy_key, {type: 'GET'}).then(function(data) {
            var object = {
              url: url,
              type: type,
              content_type: data.content_type,
              data_uri: data.data
            };
            return RSVP.resolve(object);
          });
        }
        return external_proxy.then(null, function() {
          return persistence.ajax('/api/v1/search/proxy?url=' + encodeURIComponent(url), {type: 'GET'}).then(function(data) {
            var object = {
              url: url,
              type: type,
              content_type: data.content_type,
              data_uri: data.data
            };
            return RSVP.resolve(object);
          }, function(xhr) {
            reject({error: "URL lookup failed during proxy for " + url});
          });
        });
      });

      var decrypt = fallback.then(function(object) {
        if(encryption_settings && object.content_type.match(/json/)) {
          var str = object.data_uri.match(/,/) && atob(object.data_uri.split(/,/)[1]);
          if(str && str.match(/^aes256-/)) {
            // if it's encrypted, try decrypting it and generating a
            // new data-uri before continuing
            return persistence.decrypt_json(str, encryption_settings).then(function(res) {
              var json_str = JSON.stringify(res);
              object.data_uri = "data:application/json," + btoa(json_str);
              return object;
            });
          } else {
            return object;
          }
        } else {
          return object;
        }
      });

      var size_image = decrypt.then(function(object) {
        // don't resize already-saved images, non-images, or required-to-be-big images
        if(object.persisted || type != 'image' || capabilities.system != "Android" || keep_big) {
          return object;
        } else {
          return contentGrabbers.pictureGrabber.size_image(object.url, 50).then(function(res) {
            if(res.url && res.url.match(/^data/)) {
              object.data_uri = res.url;
              object.content_type = (res.url.split(/:/)[1] || "").split(/;/)[0] || "image/png";
            }
            return object;
          }, function() {
            return RSVP.resolve(object);
          });
        }
      });

      size_image.then(function(object) {
        // remember: persisted objects will not have a data_uri attribute, so this will be skipped for them
        if(persistence.get('local_system.available') && persistence.get('local_system.allowed') && stashes.get('auth_settings')) {
          if(object.data_uri) {
            var local_system_filename = object.local_filename;
            if(!local_system_filename) {
              var file_code = 0;
              for(var idx = 0; idx < url.length; idx++) { file_code = file_code + url.charCodeAt(idx); }
              var pieces = url.split(/\?/)[0].split(/\//);
              var extension = contentGrabbers.file_type_extensions[object.content_type];
              if(!extension) {
                if(object.content_type.match(/^image\//) || object.content_type.match(/^audio\//)) {
                  extension = "." + object.content_type.split(/\//)[1].split(/\+/)[0];
                }
              }
              var url_extension = pieces[pieces.length - 1].split(/\./).pop();
              if(!extension && url_extension) {
                extension = "." + url_extension;
              }
              // Strip escape characters before saving
              var url_piece = decodeURIComponent(pieces.pop());
              if(url_piece.length > 20) {
                url_piece = url_piece.substring(0, 20);
              }
              extension = extension || ".png";
              local_system_filename = (file_code % 10000).toString() + "0000." + url_piece + "." + file_code.toString() + extension;
            }
            var svg = null;
            if(object.data_uri.match(/svg/)) {
              try {
                svg = atob(object.data_uri.split(/,/)[1]);
                if((svg.match(/<svg/) || []).length > 1) { console.error('data_uri had double-content'); }
              } catch(e) { }
            }
            return new RSVP.Promise(function(write_resolve, write_reject) {
              var blob = contentGrabbers.data_uri_to_blob(object.data_uri);
              if(svg && blob.size > svg.length) { console.error('blob generation caused double-content'); }
              // For some reason, writing to an existing file that is larger than what
              // is to be written doesn't properly end the file at the shorter point. Maybe I'm doing something wrong?
              var then_write = function() {
                // We remove escapable characters (i.e. %20) from the filename before saving to prevent iOS issues
                capabilities.storage.write_file(type, local_system_filename, blob).then(function(res) {
                  object.data_uri = null;
                  object.local_filename = local_system_filename;
                  object.local_url = res;
                  object.persisted = true;
                  object.url = url_id;
                  write_resolve(persistence.store('dataCache', object, object.url));
                }, function(err) { write_reject(err); });
              };
              // this is a promise-lite, to it can't handle reframing rejects into resolves
              capabilities.storage.remove_file(type, local_system_filename).then(then_write, then_write);
            });
          } else {
            return object;
          }
        } else {
          if(!object.persisted) {
            object.persisted = true;
            object.url = url_id;
            return persistence.store('dataCache', object, object.url);
          } else {
            return object;
          }
        }
      }).then(function(object) {
        persistence.url_cache = persistence.url_cache || {};
        persistence.url_uncache = persistence.url_uncache || {};
        if(object.local_url) {
          var local_url = capabilities.storage.fix_url(object.local_url, type == 'image');
          persistence.url_cache[url_id] = local_url;
          persistence.url_uncache[url_id] = false;
          resolve(object);
        } else {
          persistence.url_uncache[url_id] = true;
          resolve(object);
        }
      }, function(err) {
        persistence.url_uncache = persistence.url_uncache || {};
        persistence.url_uncache[url_id] = true;
        var error = {error: "saving to data cache failed for " + url_id};
        if(err && err.name == "QuotaExceededError") {
          capabilities.storage.already_limited_size = true;
          stashes.persist('allow_local_filesystem_request', false);
          persistence.url_cache = persistence.url_cache || {};
          persistence.url_cache[url_id] = null;
          error.quota_maxed = true;
          persistence.set('local_system.allowed', false);
        } else if(err.error == 'rejected' || err.error == 'already_rejected') {
          capabilities.storage.already_limited_size = true;
          stashes.persist('allow_local_filesystem_request', false);
          persistence.url_cache = persistence.url_cache || {};
          persistence.url_cache[url_id] = null;
          error.quota_maxed = true;
          persistence.set('local_system.allowed', false);
        }
        reject(error);
      });
    });
  },
  enable_wakelock: observer('syncing', function() {
    if(this.get('syncing')) {
      capabilities.wakelock('sync', true);
    } else {
      capabilities.wakelock('sync', false);
    }
  }),
  syncing: computed('sync_status', function() {
    return this.get('sync_status') == 'syncing';
  }),
  sync_failed: computed('sync_status', function() {
    return this.get('sync_status') == 'failed';
  }),
  sync_succeeded: computed('sync_status', function() {
    return this.get('sync_status') == 'succeeded';
  }),
  sync_finished: computed('sync_status', function() {
    return this.get('sync_status') == 'finished';
  }),
  update_sync_progress: function() {
    var progresses = (persistence.get('sync_progress') || {}).progress_for || {};
    var visited = 0;
    var to_visit = 0;
    var errors = [];
    for(var idx in progresses) {
      visited = visited + progresses[idx].visited;
      to_visit = to_visit + progresses[idx].to_visit;
      errors = errors.concat(progresses[idx].board_errors || []);
    }
    if(persistence.get('sync_progress')) {
      persistence.set('sync_progress.visited', visited);
      persistence.set('sync_progress.to_visit', to_visit);
      persistence.set('sync_progress.total', to_visit + visited);
      persistence.set('sync_progress.errored', errors.length);
      persistence.set('sync_progress.errors', errors);
    }
  },
  cancel_sync: function() {
    if(persistence.get('sync_progress')) {
      persistence.set('sync_progress.canceled', true);
    }
  },
  time_promise: function(promise, msg, ms) {
    var promise = new RSVP.Promise(function(resolve, reject) {
      ms = ms || 30000;
      var done = false;
      promise.then(function(res) {
        done = true;
        resolve(res);
      }, function(err) {
        done = true;
        reject(err);
      });
      setTimeout(function() {
        if(!done) {
          LingoLinqAAC.track_error("sync promise took too long:" + msg);
          reject({error: 'promise timed out:' + msg});
        }
      }, ms);  
    });
    promise.promise_name = msg;
    return promise;
  },
  sync: function(user_id, force, ignore_supervisees, sync_reason) {
    if(!window.lingoLinqExtras || !window.lingoLinqExtras.ready) {
      return new RSVP.Promise(function(wait_resolve, wait_reject) {
        lingoLinqExtras.advance.watch('all', function() {
          wait_resolve(persistence.sync(user_id, force, ignore_supervisees, sync_reason));
        });
      });
    }

    sync_reason = sync_reason || 'manual_sync';
    if(sync_reason == 'manual_sync') {
      // When manual sync is triggered, assume a file storage
      // permission check is allowed
      capabilities.storage.already_limited_size = false;
      stashes.persist('allow_local_filesystem_request', true);
    }

    console.log('syncing for ' + user_id);
    var user_name = user_id;
    var eventuallies = [];
    if(this.get('online') && !ignore_supervisees && !sync_reason.match(/supervisee/)) {
      eventuallies.push(function() {
        stashes.push_log();
      });
      eventuallies.push(function() {
        stashes.track_daily_use();
      });
    }
    var sync_id = persistence.get('sync_progress.sync_id');
    if(!ignore_supervisees || !sync_id || persistence.get('sync_status.canceled')) {
      sync_id = "sync_for::" + user_name + "::" + (new Date()).getTime() + "::" + Math.random();
    }
    persistence.set('last_sync_event_at', (new Date()).getTime());

    this.set('sync_status', 'syncing');
    var synced_boards = [];
    // TODO: this could move to bg.js, that way it can run in the background
    // even if the app itself isn't running. whaaaat?! yeah.

    var sync_promise = new RSVP.Promise(function(sync_resolve, sync_reject) {
      if(!persistence.get('sync_progress.root_user')) {
        persistence.set('sync_progress', {
          root_user: user_id,
          sync_id: sync_id,
          progress_for: {
          }
        });
      }

      if(!user_id) {
        sync_reject({error: "failed to retrieve user, missing id"});
      }


      var check_first = function(callback) {
        if(!persistence.get('sync_progress') || persistence.get('sync_progress.canceled') || persistence.get('sync_progress.sync_id') != sync_id) {
          return function() {
            return RSVP.reject({error: 'canceled'});
          };
        } else {
          return callback;
        }
      };

      var check_db = RSVP.resolve();
      if(capabilities.dbman.db_type == 'sqlite_plugin' && !sync_reason.match(/supervisee/)) {
        // Test if the local storage connection is live and, if not, reset
        check_db = new RSVP.Promise(function(res, rej) {
          var sql_caught_up = false;
          capabilities.dbman.db.executeSql("SELECT * FROM board LIMIT 1", function(r) { 
            res();
            sql_caught_up = true;
          }, function(e) { 
            res();
            sql_caught_up = true;
          });
          setTimeout(function() {
            if(!sql_caught_up) {
              console.log("Local DB Transactions Flushed");
              capabilities.dbman.db.abortAllPendingTransactions()
            }
            res();
          }, 1000);  
        });
      }

      // Prime the caches again, only do a hard prime if manually-triggered
      var prime_caches = check_db;
      if(!ignore_supervisees && !sync_reason.match(/supervisee/)) {
        prime_caches = check_db.then(check_first(function() {
          return persistence.time_promise(persistence.prime_caches(sync_reason == 'manual_sync').then(null, function() { return RSVP.resolve(); }), "priming caches");
        }));
      }


      var find_user = prime_caches.then(check_first(function() {
        return LingoLinqAAC.store.findRecord('user', user_id).then(function(user) {
          if(sync_reason.match(/supervisee/)) {
            // already reloaded in sync_supervisees
            return user;
          } else {
            return persistence.time_promise(user.reload(), 'reloading root user', 5000).then(null, function() {
              sync_reject({error: "failed to retrieve user details"});
            });
          }
        }, function() {
          sync_reject({error: "failed to retrieve user details"});
        });
      }));

      // cache images used for keyboard spelling to work offline
      if(!ignore_supervisees && (!LingoLinqAAC.testing || LingoLinqAAC.sync_testing)) {
        eventuallies.push(function() {
          persistence.store_url('https://opensymbols.s3.amazonaws.com/libraries/mulberry/pencil%20and%20paper%202.svg', 'image', false, false).then(null, function() { });
          persistence.store_url('https://opensymbols.s3.amazonaws.com/libraries/mulberry/paper.svg', 'image', false, false).then(null, function() { });
          persistence.store_url('https://opensymbols.s3.amazonaws.com/libraries/arasaac/board_3.png', 'image', false, false).then(null, function() { });
          persistence.store_url('https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/274c.svg', 'image', false, false).then(null, function() { });
          persistence.store_url('https://opensymbols.s3.amazonaws.com/libraries/noun-project/Home-c167425c69.svg', 'image', false, false).then(null, function() { });
        });
      }

      if(window.app_state && !ignore_supervisees) {
        eventuallies.push(function() {
          window.app_state.check_free_space().then(function(res) {
            if(res && res.too_little) {
              modal.error(i18n.t('too_little_free_space', "Your device is almost out of free space, you may need to delete some data to make room for LingoLinqAAC"));
            }
          }, function() { });
        });
      }

      var next_eventually = function() {
        check_first(function() {
          var eventually = eventuallies.shift();
          if(eventually) {
            eventually();
            runLater(function() {
              next_eventually();
            }, 5000);
          }
        })();
      };
      next_eventually();

      var confirm_quota_for_user = persistence.time_promise(find_user.then(check_first(function(user) {
        if(user && !ignore_supervisees) {
          persistence.set('online', true);
          if(user.get('preferences.skip_supervisee_sync')) {
            ignore_supervisees = true;
          }
          user_name = user.get('user_name') || user_id;
          if(persistence.get('local_system.available') && user.get('preferences.home_board') &&
                    !persistence.get('local_system.allowed') && persistence.get('local_system.requires_confirmation') &&
                    stashes.get('allow_local_filesystem_request')) {
            return new RSVP.Promise(function(check_resolve, check_reject) {
              capabilities.storage.root_entry().then(function() {
                persistence.set('local_system.allowed', true);
                check_resolve(user);
              }, function() {
                persistence.set('local_system.available', false);
                persistence.set('local_system.allowed', false);
                check_resolve(user);
              });
            });
          }
        }
        return user;
      })), "confirming quota");

      // Ensure the image filename cache is up-to-date
      var prime_image_cache = persistence.time_promise(confirm_quota_for_user.then(check_first(function(user) {
        if(!ignore_supervisees) {
          return capabilities.storage.list_files('image').then(function(images) {
            persistence.image_filename_cache = {};
            images.forEach(function(image) {
              persistence.image_filename_cache[image] = true;
            });
            return user;
          });
        } else {
          return user;
        }
      })), "re-priming image cache");

      prime_image_cache.then(check_first(function(user) {
        if(user) {
          var old_user_id = user_id;
          user_id = user.get('id');
          if(!persistence.get('sync_progress.root_user') || persistence.get('sync_progress.root_user') == old_user_id) {
            persistence.set('sync_progress', {
              root_user: user.get('id'),
              sync_id: persistence.get('sync_progress.sync_id'),
              progress_for: {
              }
            });
          }
        }
        // TODO: also download all the user's personally-created boards

        var sync_log = [];

        var sync_promises = [];

        // Step 0: If extras isn't ready then there's nothing else to do
        if(!window.lingoLinqExtras || !window.lingoLinqExtras.ready) {
          sync_promises.push(RSVP.reject({error: "extras not ready"}));
        }
        if(!capabilities.db) {
          sync_promises.push(RSVP.reject({error: "db not initialized"}));
        }

        // Step 0.5: Check for an invalidated token
        if(LingoLinqAAC.session && !LingoLinqAAC.session.get('invalid_token')) {
          if(persistence.get('sync_progress.root_user') == user_id) {
            LingoLinqAAC.session.check_token(false);
            if(user.get('single_org.image_url')) {
              // Store org image url for header rendering
              persistence.store_url(user.get('single_org.image_url'), 'image', false, false).then(function() {
              }, function() {
              });
            }
          }
        }

        var spread_out = function(callback, name) {
          spread_out.delay = (spread_out.delay || 0) + 1500;
          var delay = spread_out.delay;
          var promise = new RSVP.Promise(function(resolve, reject) {
            runLater(function() {
              var p = callback();
              promise.promise_name = (p.promise_name || promise.promise_name || 'unnamed') + " for " + user.get('user_name');
              p.then(function(res) {
                resolve(res);
              }, function(err) {
                reject(err);
              })
            }, delay);
          });
          promise.promise_name = name + " for " + user.get('user_name');
          sync_promises.push(promise);
        };

        // Step 1: If online
        // if there are any pending transactions, save them one by one
        // (needs to also support s3 uploading for locally-saved images/sounds)
        // (needs to be smart about handling conflicts)
        // http://www.cs.tufts.edu/~nr/pubs/sync.pdf
        if(persistence.get('sync_progress.root_user') == user_id) {
          spread_out(function() {
            return persistence.time_promise(persistence.sync_changed(), "syncing changed");
          }, "syncing changed");
        }

        var importantIds = [];

        // Step 2: If online
        // get the latest user profile information and settings
        spread_out(function() {
          // Timed promised cannot call store_url() which gets queued
          // so it calls store_url_now instead
          return persistence.time_promise(persistence.sync_user(user, importantIds), "sync user data");
        }, "sync user data");

        // Step 3: If online
        // check if the board set has changed at all, and if so
        // (or force == true) pull it all down locally
        // (add to settings.importantIds list)
        // (also download through proxy any image data URIs needed for board set)
        // (this takes the longest, so start it right away - no spread_out)
        var get_local_revisions = persistence.find('settings', 'synced_full_set_revisions').then(function(res) {
          if(persistence.get('sync_progress') && !persistence.get('sync_progress.full_set_revisions')) {
            persistence.set('sync_progress.full_set_revisions', res);
          }
          return persistence.sync_boards(user, importantIds, synced_boards, force);
        }, function() {
          return persistence.sync_boards(user, importantIds, synced_boards, force);
        });
        get_local_revisions.promise_name = "syncing boards for " + user.get('user_name');
        sync_promises.push(get_local_revisions);
          

        // Step 4: If user has any supervisees, sync them as well
        if(user && user.get('supervisees') && !ignore_supervisees) {
          spread_out(function() {
            var res = persistence.sync_supervisees(user, force);
            res.promise_name = "syncing supervisees";
            return res;
          }, "syncing supervisees");
        }

        // Step 5: Cache needed sound files
        if(!ignore_supervisees) {
          spread_out(function() {
            return persistence.time_promise(speecher.load_beep().then(null, function(err) {
              modal.warning(i18n.t('sound_sync_failed', "Sound effects failed to sync"));
              console.error("sound sync error", err);
              return RSVP.resolve();
            }), "syncing beep sounds");
          }, "syncing beep sounds");
        }

        // Step 6: Push stored logs
        if(!ignore_supervisees) {
          spread_out(function() {
            return persistence.time_promise(persistence.sync_logs(user), "pushing logs");
          }, "pushing logs");
        }

        // Step 7: Sync user tags
        spread_out(function() {
          return persistence.time_promise(persistence.sync_tags(user), "syncing tags");
        }, "syncing tags");

        // Step 8: Sync contacts
        spread_out(function() {
          return persistence.time_promise(persistence.sync_contacts(user), "syncing contacts", 2 * 60 * 1000);
        }, "syncing contacts");

        // reject on any errors
        var check_again = function() {
          if(!check_again.done) {
            sync_promises.forEach(function(p, idx) { p.promise_name = p.promise_name || ("unnamed " + idx + " for " + user.get('user_name')); });
            var pending = sync_promises.filter(function(p) {
              return p._state != 1 && p._state != 2;
            }).map(function(p) { return p.promise_name });
            console.log("Sync waiting on", pending);
            runLater(check_again, 5000);
          }
        };
        RSVP.all_wait(sync_promises).then(function() {
          check_again.done = true;
          // Step 4: If online
          // store the list ids to settings.importantIds so they don't get expired
          // even after being offline for a long time. Also store lastSync somewhere
          // that's easy to get to (localStorage much?) for use in the interface.
          persistence.important_ids = importantIds.uniq();
          persistence.store('settings', {ids: persistence.important_ids}, 'importantIds').then(function(r) {
            persistence.refresh_after_eventual_stores();
            sync_resolve(sync_log);
          }, function() {
            persistence.refresh_after_eventual_stores();
            sync_reject(arguments);
          });
        }, function() {
          check_again.done = true;
          persistence.refresh_after_eventual_stores();
          sync_reject.apply(null, arguments);
        });
        runLater(check_again, 5000);
      })).then(null, function() {
        persistence.refresh_after_eventual_stores();
        sync_reject(null, arguments);
      });

    }).then(function() {
      // make a list of all buttons in the set so we can figure out the button
      // sequence needed to get from A to B
      var track_buttons = persistence.sync_buttons(synced_boards);

      var complete_sync = track_buttons.then(function() {
        var last_sync = (new Date()).getTime() / 1000;
        if(persistence.get('sync_progress.root_user') == user_id) {
          var sync_stamps = persistence.get('sync_progress.sync_stamps');
          var statuses = persistence.get('sync_progress.board_statuses') || [];
          if(persistence.get('sync_progress.last_sync_stamp')) {
            persistence.set('last_sync_stamp', persistence.get('sync_progress.last_sync_stamp'));
          }
          var errors = persistence.get('sync_progress.errors') || [];
          errors.forEach(function(error) {
            if(error.board_key || error.board_id) {
              var status = statuses.find(function(s) { return (s.key && s.key == error.board_key); });
              if(status) {
                status.error = error.error;
              } else {
                statuses.push({
                  id: error.board_id || error.board_key,
                  key: error.board_key || error.board_id,
                  error: error.error
                });
              }
            }
          });
          persistence.set('sync_progress', null);
          var sync_message = null;
          if(errors.length > 0) {
            persistence.set('sync_status', 'finished');
            stashes.persist('last_sync_status', 'finished');
            persistence.set('sync_errors', errors.length);
            sync_message = i18n.t('finished_with_errors', "Finished syncing %{user_id} with %{n} error(s)", {user_id: user_name, n: errors.length});
          } else {
            persistence.set('sync_status', 'succeeded');
            stashes.persist('last_sync_status', 'succeeded');
            sync_message = i18n.t('finised_without_errors', "Finished syncing %{user_id} without errors", {user_id: user_name});
          }
          console.log('synced!');
          persistence.store('settings', {last_sync: last_sync, stamps: sync_stamps}, 'lastSync').then(function(res) {
            persistence.set('last_sync_at', res.last_sync);
            persistence.set('sync_stamps', res.stamps);
            persistence.set('last_sync_event_at', (new Date()).getTime());
          }, function() {
            debugger;
          });
          var log = [].concat(persistence.get('sync_log') || []);
          log.push({
            user_id: user_name,
            reason: sync_reason,
            manual: force,
            issues: errors.length > 0,
            finished: new Date(),
            statuses: statuses,
            summary: sync_message
          });
          persistence.set('sync_log', log);
          persistence.set('sync_log_rand', Math.random());
        }
        return RSVP.resolve(last_sync);
      });
      return complete_sync;
    }, function(err) {
      if(persistence.get('sync_progress.root_user') == user_id) {
        var statuses = persistence.get('sync_progress.board_statuses') || [];
        var stamps = persistence.get('sync_progress.sync_stamps');
        persistence.set('sync_progress', null);
        persistence.set('sync_status', 'failed');
        // if last sync attempt ended in failure and this attempt also 
        // failed, then set last_sync_at to prevent repeated attempts to sync
        if(stashes.get('last_sync_status') == 'failed') {
          var last_sync = (new Date()).getTime() / 1000;
          persistence.store('settings', {last_sync: last_sync, stamps: stamps}, 'lastSync').then(function(res) {
            persistence.set('last_sync_at', res.last_sync);
            persistence.set('sync_stamps', stamps);
          }, function() { });
        }
        stashes.persist('last_sync_status', 'failed');
        persistence.set('sync_status_error', null);
        if(err.board_unauthorized) {
          persistence.set('sync_status_error', i18n.t('board_unauthorized', "One or more boards are private"));
        } else if(!persistence.get('online')) {
          persistence.set('sync_status_error', i18n.t('online_required_to_sync', "Must be online to sync"));
        }
        var message = (err && err.error) || "unspecified sync error";
        var statuses = statuses.uniq(function(s) { return s.id; });
        var log = [].concat(persistence.get('sync_log') || []);
        log.push({
          user_id: user_name,
          manual: force,
          errored: true,
          finished: new Date(),
          statuses: statuses,
          summary: i18n.t('error_syncing_user', "Error syncing %{user_id}: ", {user_id: user_name}) + message
        });
        persistence.set('last_sync_event_at', (new Date()).getTime());
        persistence.set('sync_log', log);
        if(err && err.error) {
          modal.error(err.error);
        }
        console.log(err);
      }
      return RSVP.reject(err);
    });
    this.set('sync_promise', sync_promise);
    return sync_promise;
  },
  sync_tags: function(user) {
    var store_image_promises = [];
    var queue_tags = new RSVP.Promise(function(resolve, reject) {
      var tag_ids = user.get('preferences.tag_ids') || [];
      var next_tag = function() {
        var tag_id = tag_ids.pop();
        if(tag_id) {
          LingoLinqAAC.store.findRecord('tag', tag_id).then(function(tag) {
            if(tag.get('button.image_url')) {
              store_image_promises.push(persistence.store_url(tag.get('button.image_url'), 'image', false, false));
              runLater(next_tag, 500);
            } else {
              runLater(next_tag, 500);
            }
          }, function(err) {
            runLater(next_tag, 500);
            // TODO: handle tag storage errors as warnings, not failures
          });
        } else {
          resolve();
        }
      };
      runLater(next_tag, 500);
    });
    return persistence.time_promise(queue_tags, "sync tags for " + user.get('user_name')).then(function() {
      return RSVP.all_wait(store_image_promises).then(null, function(err) {
        return RSVP.resolve([]);
      });
    });
  },
  sync_contacts: function(user) {
    var wait = RSVP.resolve();
    if(user.get('all_connections_promise')) {
      wait = persistence.time_promise(user.get('all_connections_promise'), "waiting for connections for " + user.get('user_name'));
    }
    var retrieve_list = wait.then(null, function() { return RSVP.resolve(); }).then(function() {
      var all_store_images = [];
      (user.get('supervisors') || []).forEach(function(sup) {
        if(LingoLinqAAC.remote_url(sup.avatar_url) && !persistence.store_url_quick_check(sup.avatar_url, 'image')) {
          all_store_images.push(persistence.store_url_now(sup.avatar_url, 'image'));
        }
      });
      (user.get('contacts') || []).forEach(function(contact) {
        if(LingoLinqAAC.remote_url(contact.image_url) && !persistence.store_url_quick_check(contact.image_url, 'image')) {
          all_store_images.push(persistence.store_url_now(contact.image_url, 'image'));
        }
      });
      return all_store_images;
    });
    return persistence.time_promise(retrieve_list, 'syncing contacts').then(function(list) {
      return RSVP.all_wait(list);
    });
  },
  sync_logs: function(user) {
    return persistence.time_promise(persistence.find('settings', 'bigLogs').then(function(res) {
      res = res || {};
      var fails = [];
      var log_promises = [];
      (res.logs || []).forEach(function(data) {
        var log = LingoLinqAAC.store.createRecord('log', {
          events: data
        });
        log.cleanup();
        log_promises.push(log.save().then(null, function(err) {
          fails.push(data);
          return RSVP.reject({error: 'log failed to save'});
        }));
      });
      return RSVP.all_wait(log_promises).then(function() {
        return persistence.store('settings', {logs: []}, 'bigLogs');
      }, function(err) {
        return persistence.store('settings', {logs: fails}, 'bigLogs');
      });
    }, function(err) {
      return RSVP.resolve([]);
    }), "syncing logs");
  },
  sync_buttons: function(synced_boards) {
    return RSVP.resolve();
//     return new RSVP.Promise(function(buttons_resolve, buttons_reject) {
//       var buttons_in_sequence = [];
//       synced_boards.forEach(function(board) {
//         var images = board.get('local_images_with_license');
//         // TODO: add them in "proper" order, whatever that means
//         board.get('buttons').forEach(function(button) {
//           button.board_id = board.get('id');
//           if(button.load_board) {
//             button.load_board_id = button.load_board.id;
//           }
//           var image = images.find(function(i) { return i.get('id') == button.image_id; });
//           if(image) {
//             button.image = image.get('url');
//           }
//           // TODO: include the image here, if it makes things easier. Sync
//           // can be a more expensive process than find_button should be..
//           buttons_in_sequence.push(button);
//         });
//       });
//       persistence.store('settings', {list: buttons_in_sequence}, 'syncedButtons').then(function(res) {
//         buttons_resolve();
//       }, function() {
//         buttons_reject();
//       });
//     });
  },
  sync_supervisees: function(user, force) {
    var sync_id = persistence.get('sync_progress.sync_id');
    return new RSVP.Promise(function(resolve, reject) {
      var supervisee_promises = [];
      user.get('supervisees').forEach(function(supervisee) {
        var find_supervisee = persistence.queue_sync_action('find_supervisee', sync_id, function() {
          return LingoLinqAAC.store.findRecord('user', supervisee.id);
        });
        var reload_supervisee = find_supervisee.then(function(record) {
          if(!record.get('fresh') || force) {
            return persistence.time_promise(record.reload(), 'reload supervisor', 5000);
          } else {
            return record;
          }
        });

        var sync_supervisee = reload_supervisee.then(function(supervisee_user) {
          if(supervisee_user.get('permissions.supervise')) {
            var stamp = (persistence.get('sync_stamps') || {})[supervisee_user.get('id')];
            if(persistence.get('sync_progress')) {
              var stamps = persistence.get('sync_progress.sync_stamps') || {};
              stamps[supervisee_user.get('id')] = supervisee_user.get('sync_stamp');
              persistence.set('sync_progress.sync_stamps', stamps);
            }

            if(stamp >= supervisee_user.get('sync_stamp')) {
              console.log('supervisee already synced to current: ' + supervisee.user_name + " " + supervisee.id);
              return persistence.sync(supervisee.id, false, true, 'supervisee-synced');  
            } else {
              console.log('syncing supervisee: ' + supervisee.user_name + " " + supervisee.id);
              return persistence.sync(supervisee.id, force, true, 'supervisee');  
            }
            
          } else {
            return RSVP.reject({error: "supervise permission missing"});
          }
        });
        var complete = sync_supervisee.then(null, function(err) {
          console.log(err);
          console.error("supervisee sync failed");
          modal.warning(i18n.t('supervisee_sync_failed', "Couldn't sync boards for supervisee \"" + supervisee.user_name + "\""));
          return RSVP.resolve({});
        });
        supervisee_promises.push(complete);
      });
      RSVP.all_wait(supervisee_promises).then(function() {
        resolve(user.get('supervisees'));
      }, function() {
        reject.apply(null, arguments);
      });
    });
  },
  fetch_inbox: function(user, force) {
    return new RSVP.Promise(function(resolve, reject) {
      var url = '/api/v1/users/' + user.get('id') + '/alerts';
      var parse_before_resolve = function(object) {
        (object.clears || []).forEach(function(id) {
          var ref = object.alert.find(function(a) { return a.id == id; });
          if(ref && !ref.cleared) { emberSet(ref, 'cleared', true); }
        });
        (object.alerts || []).forEach(function(id) {
          var ref = object.alert.find(function(a) { return a.id == id; });
          if(ref && ref.unread) { emberSet(ref, 'unread', false); }
        });
        resolve(object);
      };
      var fallback = function() {
        persistence.find('dataCache', url).then(function(data) {
          data.object.url = data.url;
          parse_before_resolve(data.object);
        }, function(err) {
          reject(err);
        });
      };
      if(force && force.persist) {
        var object = {
          url: url,
          type: 'json',
          content_type: 'json/object',
          object: force.persist
        };
        persistence.find('dataCache', url).then(null, function() { RSVP.resolve({object: {}}); }).then(function(data) {
          if(data && data.object && data.object.clears) {
            object.object.clears = (object.object.clears || []).concat(data.object.clears || []).uniq();
          }
          if(data && data.object && data.object.alerts) {
            object.object.alerts = (object.object.alerts || []).concat(data.object.alerts || []).uniq();
          }
          persistence.store('dataCache', object, object.url).then(function() {
            parse_before_resolve(object.object);
          }, function(err) { reject(err); });
        });
        return;
      }
      if(persistence.get('online') || force) {
        persistence.ajax(url, {type: 'GET'}).then(function(res) {
          var object = {
            url: url,
            type: 'json',
            content_type: 'json/object',
            object: res
          };
          persistence.find('dataCache', url).then(null, function() { RSVP.resolve({object: {}}); }).then(function(data) {
            if(data && data.object && data.object.clears) {
              object.object.clears = (object.object.clears || []).concat(data.object.clears || []).uniq();
            }
            if(data && data.object && data.object.alerts) {
              object.object.alerts = (object.object.alerts || []).concat(data.object.alerts || []).uniq();
            }
            persistence.store('dataCache', object, object.url).then(function() {
              parse_before_resolve(object.object);
            }, function(err) { reject(err); });
          });
        }, function(err) {
          if(force) {
            reject(err);
          } else {
            fallback();
          }
        });
      } else {
        fallback();
      }
    });
  },
  board_lookup: function(id, safely_cached_boards, fresh_board_revisions, sync_id, allow_any_cached) {
    if(!persistence.get('sync_progress') || persistence.get('sync_progress.canceled') || (sync_id && sync_id !== true && sync_id != persistence.get('sync_progress.sync_id'))) {
      return RSVP.reject({error: 'canceled'});
    }
    var lookups = persistence.get('sync_progress.key_lookups');
    var board_statuses = persistence.get('sync_progress.board_statuses');
    if(!lookups) {
      lookups = {};
      if(persistence.get('sync_progress')) {
        persistence.set('sync_progress.key_lookups', lookups);
      }
    }
    if(!board_statuses) {
      board_statuses = [];
      if(persistence.get('sync_progress')) {
        persistence.set('sync_progress.board_statuses', board_statuses);
      }
    }
    var lookup_id = id;
    if(lookups[id] && !lookups[id].then) { lookup_id = lookups[id].get('id'); }

    var peeked = LingoLinqAAC.store.peekRecord('board', lookup_id);
    var key_for_id = lookup_id.match(/\//);
    var partial_load = peeked && (!peeked.get('permissions') || !peeked.get('image_urls'));
    if(peeked && (!peeked.get('permissions') || !peeked.get('image_urls'))) { peeked = null; }
    var find_board = null;
    // because of async, it's possible that two threads will try
    // to look up the same board independently, especially with supervisees
    if(lookups[id] && lookups[id].then) {
      find_board = lookups[id];
    } else {
      find_board = LingoLinqAAC.store.findRecord('board', lookup_id);
      find_board = find_board.then(function(record) {
        var cache_mismatch = fresh_board_revisions && fresh_board_revisions[id] && fresh_board_revisions[id] != record.get('current_revision');
        var fresh = record.get('fresh') && !cache_mismatch;
        if(!fresh || key_for_id || partial_load) {
          local_full_set_revision = record.get('full_set_revision');
          // If the board is in the list of already-up-to-date, don't call reload
          if(record.get('permissions') && record.get('image_urls') && safely_cached_boards[id] && !cache_mismatch) {
            board_statuses.push({id: id, key: record.get('key'), status: 'cached'});
            return record;
          } else if(record.get('permissions') && fresh_board_revisions && fresh_board_revisions[id] && fresh_board_revisions[id] == record.get('current_revision')) {
            board_statuses.push({id: id, key: record.get('key'), status: 'cached'});
            return record;
          } else if(record.get('permissions') && allow_any_cached) {
            board_statuses.push({id: id, key: record.get('key'), status: 'cached'});
            return record;
          } else {
            board_statuses.push({id: id, key: record.get('key'), status: 're-downloaded'});
            record.set('button_set_needs_reload', true);
            return persistence.time_promise(record.reload(), "reload board", 5000);
          }
        } else {
          board_statuses.push({id: id, key: record.get('key'), status: 'downloaded'});
          record.set('button_set_needs_reload', true);
          return record;
        }
      });
      if(!lookups[id]) {
        lookups[id] = find_board;
      }
    }

    var local_full_set_revision = null;

    return find_board.then(function(board) {
      lookups[id] = RSVP.resolve(board);
      board.set('local_full_set_revision', local_full_set_revision);
      return board;
    });
  },
  queue_sync_action: function(action, sync_id, method) {
    if(!persistence.get('sync_progress') || persistence.get('sync_progress.canceled') || (sync_id && sync_id !== true && sync_id != persistence.get('sync_progress.sync_id'))) {
      return RSVP.reject({error: 'canceled'});
    }
    var defer = RSVP.defer();
    defer.callback = method;
    defer.descriptor = action;
    defer.id = (new Date()).getTime() + '-' + Math.random();
    persistence.sync_actions = persistence.sync_actions || [];
    if(capabilities.log_events) {
      console.warn("queueing sync action", defer.descriptor, defer.id);
    }
    persistence.sync_actions.push(defer);
    var threads = capabilities.mobile ? 1 : 4;

    persistence.syncing_action_watchers = persistence.syncing_action_watchers || 0;
    if(persistence.syncing_action_watchers < threads) {
      persistence.syncing_action_watchers++;
      persistence.next_sync_action();
    }
    return defer.promise;
  },
  next_sync_action: function() {
    persistence.sync_actions = persistence.sync_actions || [];
    var action = persistence.sync_actions.shift();
    var next = function() {
      runLater(function() { persistence.next_sync_action(); });
    };
    if(action && action.callback) {
      var start = (new Date()).getTime();
      if(capabilities.log_events) {
        console.warn("executing sync action", action.descriptor, action.id);
      }
      try {
        action.callback().then(function(r) {
          if(capabilities.log_events) {
            var end = (new Date()).getTime();
            console.warn(end - start, "done executing sync action", action.descriptor, action.id);
          }
          action.resolve(r);
          next();
        }, function(e) {
          action.reject(e);
          next();
        });
      } catch(e) {
        action.reject(e);
        next();
      }
    } else {
      if(persistence.syncing_action_watchers) {
        persistence.syncing_action_watchers--;
      }
    }
  },
  sync_boards: function(user, importantIds, synced_boards, force) {
    var sync_id = persistence.get('sync_progress.sync_id') || true;
    var full_set_revisions = {};
    var fresh_revisions = {};
    var board_errors = [];
    if(persistence.get('sync_progress.full_set_revisions')) {
      full_set_revisions = persistence.get('sync_progress.full_set_revisions');
    }
    var all_image_urls = persistence.get('sync_progress.all_image_urls') || {};
    if(persistence.get('sync_progress')) {
      persistence.set('sync_progress.all_image_urls', all_image_urls);
    }
    var all_sound_urls = persistence.get('sync_progress.all_sound_urls') || {};
    if(persistence.get('sync_progress')) {
      persistence.set('sync_progress.all_sound_urls', all_sound_urls);
    }
    var lookups = persistence.get('sync_progress.key_lookups');
    if(!lookups) {
      lookups = {};
      if(persistence.get('sync_progress')) {
        persistence.set('sync_progress.key_lookups', lookups);
      }
    }
    var board_statuses = persistence.get('sync_progress.board_statuses');
    if(!board_statuses) {
      board_statuses = [];
      if(persistence.get('sync_progress')) {
        persistence.set('sync_progress.board_statuses', board_statuses);
      }
    }

    var allow_any_cached = false;
    var get_remote_revisions = RSVP.resolve({});
    if(user) {
      get_remote_revisions = persistence.ajax('/api/v1/users/' + user.get('id') + '/board_revisions', {type: 'GET'}).then(function(res) {
        fresh_revisions = res;
        // Check for any missing or out-of-date boards here
        // instead of at request time, and make a batch request
        // for all of their record results at once (this should
        // result in much fewer http requests)
        return sweetSuiteExtras.storage.find_all('board').then(function(list) {
          var need_fresh_ids = [];
          var missing_ids = {};
          for(var key_or_id in fresh_revisions) {
            // Only check board ids, not boad keys
            if(key_or_id && !key_or_id.match(/\//) && key_or_id.match(/_/)) {
              missing_ids[key_or_id] = true;              
            }
          }
          // Check these revisions against the local copies and
          // batch-request updated records for any that
          // are out of date
          list.forEach(function(brd) {
            if(brd && brd.data && brd.data.id && fresh_revisions[brd.data.id]) {
              delete missing_ids[brd.data.id];
              if(brd.data.raw.current_revision == fresh_revisions[brd.data.id]) {
                if(!LingoLinqAAC.store.peekRecord('board', brd.data.id)) {
                  // push already-cached record to the store
                  var json_api = { data: {
                    id: brd.data.raw.id,
                    type: 'board',
                    attributes: brd.data.raw
                  }};
                  var board_record = LingoLinqAAC.store.push(json_api);
                  lookups[brd.data.raw.id] = RSVP.resolve(board_record);
                  lookups[brd.data.raw.key] = lookups[brd.data.raw.id]
                  board_statuses.push({id: brd.data.raw.id, key: brd.data.raw.key, status: 'cached'});
                }
              } else {
                // add it to the list of boards that need to be retrieved
                need_fresh_ids.push(brd.data.id);
              }
            }
          });
      
          Object.keys(missing_ids).forEach(function(id) {
            if(missing_ids[id]) {
              need_fresh_ids.push(id);
            }
          });
          // Try to download in chunks instead of as individual records, if possible
          if(need_fresh_ids.length > 0 && need_fresh_ids.length < 100) {
            if(persistence.get('sync_progress')) {
              persistence.set('sync_progress.pre_total', need_fresh_ids.length);
              persistence.set('sync_progress.pre_visited', 0);
            }
            var ids_left = [].concat(need_fresh_ids);
            return new RSVP.Promise(function(batch_resolve, batch_reject) {
              var next_batch = function() {
                if(ids_left.length > 0) {
                  var ids = ids_left.slice(0, 25);
                  ids_left = ids_left.slice(25);
                  persistence.ajax("/api/v1/users/" + user.get('id') + "/boards?ids=" + ids.join(','), {type: 'GET'}).then(function(list) {
                    if(persistence.get('sync_progress')) {
                      persistence.set('sync_progress.pre_visited', need_fresh_ids.length - ids_left.length);
                    }
                    list.forEach(function(board_json) {
                      var json_api = { data: {
                        id: board_json.id,
                        type: 'board',
                        attributes: board_json
                      }};
                      var board_record = LingoLinqAAC.store.push(json_api);
                      board_statuses.push({id: board_json.id, key: board_json.key, status: 'downloaded'});
                      lookups[board_json.id] = RSVP.resolve(board_record);
                      lookups[board_json.key] = lookups[board_json.id]
                      persistence.store('board', board_json, board_json.key).then(function(str) {
                        next_batch();
                      }, function(err) {
                        next_batch();
                      });
                    });
                  }, function(err) {
                    // On error, just stop trying to pre-batch and
                    // fall back to the old way
                    batch_resolve(res);
                  });  
                } else {
                  batch_resolve(res);
                }  
              };
              next_batch();
            });
          } else {
            return res;
          }
        });
      }, function() {
        if(!persistence.get('online')) {
          return RSVP.reject({error: 'could not retrieve board revisions'})
        }
        if(persistence.get('sync_progress.root_user') != user.get('id')) {
          var stamps = persistence.get('sync_stamps') || {};
          if(stamps[user.get('id')] && stamps[user.get('id')] >= user.get('sync_stamp')) {
            // If the req errors for a supervisee, and the sync_stamp
            // is up-to-date from the last sync, don't try to reload boards
            allow_any_cached = true;
          }
        }
        return RSVP.resolve({});
      });
    }

    // all_image_urls is a hash of base urls, not skinned urls
    var get_images = get_remote_revisions.then(function() {
      return persistence.queue_sync_action('find_all_image_urls', sync_id, function() {
        if(Object.keys(all_image_urls).length == 0) {
          return sweetSuiteExtras.storage.find_all('image').then(function(list) {
            list.forEach(function(img) {
              if(img.data && img.data.id && img.data.raw && img.data.raw.url) {
                all_image_urls[img.data.id] = img.data.raw.url;
              }
            });
          });
        } else {
          return RSVP.resolve();
        }
      });
    });

    var all_sound_urls = {};
    var get_sounds = get_images.then(function() {
      return persistence.queue_sync_action('find_all_sound_urls', sync_id, function() {
        if(Object.keys(all_sound_urls).length == 0) {
          return sweetSuiteExtras.storage.find_all('sound').then(function(list) {
            list.forEach(function(snd) {
              if(snd.data && snd.data.id && snd.data.raw && snd.data.raw.url) {
                all_sound_urls[snd.data.id] = snd.data.raw.url;
              }
            });
          });
        } else {
          return RSVP.resolve();
        }
      });
    });

    var sync_all_boards = get_sounds.then(function() {
      return new RSVP.Promise(function(resolve, reject) {
        var to_visit_boards = [];
        if(user.get('preferences.home_board.id')) {
          var board = user.get('preferences.home_board');
          board.depth = 0;
          board.visit_source = "home board";
          to_visit_boards.push(board);
        }
        if(user.get('preferences.sidebar_boards')) {
          user.get('preferences.sidebar_boards').forEach(function(b) {
            if(b.key) {
              to_visit_boards.push({key: b.key, depth: 1, image: b.image, visit_source: "sidebar board"});
            }
          });
        }
        // A user without a home board should also sync starred boards, by default
        if(user.get('preferences.sync_starred_boards') === true || (!user.get('preferences.home_board.id') && user.get('preferences.sync_starred_boards') !== false)) {
          var sync_all = user.get('preferences.sync_starred_boards') === true;
          user.get('stats.starred_board_refs').forEach(function(ref) {
            if(sync_all || !ref.suggested) {
              if(ref.style && ref.style.options) {
                ref.style.options.forEach(function(opt) {
                  to_visit_boards.push({key: opt.key, depth: 1, image: opt.url || ref.image_url, visit_source: "suggested board"});
                })
              } else {
                to_visit_boards.push({key: ref.key, depth: 1, image: ref.image_url, visit_source: ref.suggested ? "suggested board" : "starred board"});
              }
            }
          });
        }
        var safely_cached_boards = {};
        var checked_linked_boards = {};

        var visited_boards = [];
        if(!persistence.get('sync_progress.progress_for')) {
          persistence.set('sync_progress.progress_for', {});
          persistence.get('sync_progress.progress_for')[user.get('id')] = {
            visited: visited_boards.length,
            to_visit: to_visit_boards.length,
            board_errors: board_errors
          };
          persistence.update_sync_progress();
        }
        var board_load_promises = [];
        var dead_thread = false;
        function nextBoard(defer) {
          if(dead_thread) { defer.reject({error: "someone else failed"}); return; }
          if(!persistence.get('sync_progress') || persistence.get('sync_progress.canceled')) {
            defer.reject({error: 'canceled'});
            return;
          }
          var p_for = persistence.get('sync_progress.progress_for');
          if(p_for) {
            p_for[user.get('id')] = {
              visited: visited_boards.length,
              to_visit: to_visit_boards.length,
              board_errors: board_errors
            };
          }
          persistence.update_sync_progress();
          var next = to_visit_boards.shift();
          var id = next && (next.id || next.key);
          var key = next && next.key;
          var source = next && next.visit_source;
          if(next && next.depth < 20 && id && !visited_boards.find(function(i) { return i == id; })) {
            var local_full_set_revision = null;

            // check if there's a local copy that's already been loaded
            
            var find_board = persistence.time_promise(persistence.board_lookup(id, safely_cached_boards, fresh_revisions, sync_id, allow_any_cached), 'syncing board:' + id);

            find_board.then(function(board) {
              local_full_set_revision = board.get('local_full_set_revision');
              importantIds.push('board_' + id);
              var visited_board_promises = [];
              var content_promises = 0;
              var safely_cached = !!safely_cached_boards[board.id];
              // force a reload of the buttonset if the board changed
              if((next.depth == 0 && next.visit_source == 'home board') || (next.depth == 1 && next.visit_source == 'sidebar board') || (next.depth == 0 && next.visit_source == 'starred board')) {
                // Confirm if the button set is stored locally
                persistence.find('buttonset', board.get('id')).then(function(bs) {
                  if(bs.full_set_revision != local_full_set_revision && !bs.buttons && !safely_cached) {
                    board.load_button_set(!safely_cached);
                  }
                }, function(err) {
                  board.load_button_set(!safely_cached);
                })
              }
              // If the retrieved board's revision matches the synced cache's revision,
              // then this board and all its children should be already in the db.
              var cache_mismatch = fresh_revisions && fresh_revisions[board.get('id')] && fresh_revisions[board.get('id')] != board.get('current_revision');
              // If the synced revision code matches the current copy, and there's nothing fresher that's been downloaded since, then it should be safely cached
              safely_cached = safely_cached || (full_set_revisions[board.get('id')] && board.get('full_set_revision') == full_set_revisions[board.get('id')] && !cache_mismatch);
              // If the board has been loaded locally but not via sync, then this check will return true even though the content hasn't
              // been saved for offline use. That would be wrong, and mildly offensive.
//               safely_cached = safely_cached || (fresh_revisions[board.get('id')] && board.get('current_revision') == fresh_revisions[board.get('id')]);
              if(force == 'all_reload') { safely_cached = false; }
              if(safely_cached) {
                console.log("this board (" + board.get('key') + ") has already been cached locally");
              }
              synced_boards.push(board);
              visited_boards.push(id);

              if(LingoLinqAAC.remote_url(board.get('icon_url_with_fallback')) && !persistence.store_url_quick_check(board.get('icon_url_with_fallback'), 'image')) {
                // store_url already has a queue, we don't need to fill the sync queue with these
                content_promises++;
                visited_board_promises.push(persistence.store_url(board.get('icon_url_with_fallback'), 'image', false, force, sync_id).then(null, function() {
                  console.log("icon url failed to sync, " + board.get('icon_url_with_fallback'));
                  return RSVP.resolve();
                }));
                importantIds.push("dataCache_" + board.get('icon_url_with_fallback'));
              }
              if(LingoLinqAAC.remote_url(board.get('background.image')) && !persistence.store_url_quick_check(board.get('background.image'), 'image')) {
                content_promises++;
                visited_board_promises.push(persistence.store_url(board.get('background.image'), 'image', true, force, sync_id).then(null, function() {
                  console.log("bg url failed to sync, " + board.get('background.image'));
                  return RSVP.resolve();
                }));
                importantIds.push("dataCache_" + board.get('background.image'));
              }
              if(LingoLinqAAC.remote_url(board.get('background.prompt.sound')) && !persistence.store_url_quick_check(board.get('background.prompt.sound'), 'sound')) {
                content_promises++;
                visited_board_promises.push(persistence.store_url(board.get('background.prompt.sound'), 'sound', true, force, sync_id).then(null, function() {
                  console.log("bg sound url failed to sync, " + board.get('background.prompt.sound'));
                  return RSVP.resolve();
                }));
                importantIds.push("dataCache_" + board.get('background.prompt.sound'));
              }

              if(next.image && !persistence.store_url_quick_check(next.image, 'image')) {
                content_promises++;
                visited_board_promises.push(//persistence.queue_sync_action('store_sidebar_image', sync_id, function() {
                  /*return*/ persistence.store_url(next.image, 'image', false, force, sync_id).then(null, function() {
                    return RSVP.reject({error: "sidebar icon url failed to sync, " + next.image});
                  })
               /*})*/);
                importantIds.push("dataCache_" + next.image);
              }

              // TODO: at this point we need to know all the syncing
              // users so we can store for all of their skin preferences
              var all_skins = ['default', user.get('preferences.skin') || 'default'];
              var symbol_sets = [user.get('preferences.preferred_symbols') || 'original'];
              if(!user.get('preferences.skip_supervisee_sync') && user.get('supervisees')) {
                user.get('supervisees').forEach(function(sup) {
                  all_skins.push(sup.skin || 'default');
                  symbol_sets.push(sup.symbols || 'original');
                })
              }
    
              var image_map = board.map_image_urls(all_image_urls, all_skins.uniq(), symbol_sets.uniq());
              image_map.forEach(function(image) {
                importantIds.push("image_" + image.id);
                var keep_big = !!(board.get('grid.rows') < 3 || board.get('grid.columns') < 6);
                if(LingoLinqAAC.remote_url(image.url)) {
                  // TODO: should this be app_state.currentUser instead of the currently-syncing user?
                  var personalized = image.url;
                  if(LingoLinqAAC.Image && LingoLinqAAC.Image.personalize_url) {
                    personalized = LingoLinqAAC.Image.personalize_url(image.url, user.get('user_token'), user.get('preferences.skin'));
                  }

                  if(!persistence.store_url_quick_check(personalized, 'image')) {
                    content_promises++;
                    visited_board_promises.push(//persistence.queue_sync_action('store_button_image', sync_id, function() {
                      /*return*/ persistence.store_url(personalized, 'image', keep_big, force, sync_id).then(null, function() {
                        return RSVP.reject({error: "button image failed to sync, " + image.url});
                      })
                  /*})*/);
                    importantIds.push("dataCache_" + image.url);
                  }
                } else {
                  // If the device thinks the image is stored locally but
                  // it isn't, then go ahead and re-download it
                  var image_filename = image.url && image.url.split(/\/|\\/).pop();
                  if(!persistence.image_filename_cache[image_filename]) {
                    content_promises++;
                    visited_board_promises.push(
                      persistence.store_url(image.url, 'image', keep_big, force, sync_id).then(null, function() {
                        return RSVP.reject({error: "missing button image failed to sync, " + image.url});
                      })
                   );
                  }
                }
              });
              if(board.get('image_urls')) {
                // Includes just the default URLs
                var urls = board.get('image_urls'); //(user.get('preferences.skin'));
                for(var image_id in urls) {
                  all_image_urls[image_id] = urls[image_id];
                }
              }
              board.map_sound_urls(all_sound_urls).forEach(function(sound) {
//               board.get('local_sounds_with_license').forEach(function(sound) {
                importantIds.push("sound_" + sound.id);
                if(LingoLinqAAC.remote_url(sound.url) && !persistence.store_url_quick_check(sound.url, 'sound')) {
                  visited_board_promises.push(//persistence.queue_sync_action('store_button_sound', sync_id, function() {
                     /*return*/ persistence.store_url(sound.url, 'sound', false, force, sync_id).then(null, function() {
                      return RSVP.reject({error: "button sound failed to sync, " + sound.url});
                     })
                  /*})*/);
                  importantIds.push("dataCache_" + sound.url);
                }
              });
              var prior_board = board;
              board.get('linked_boards').forEach(function(board) {
                // don't re-visit if we've already grabbed it for this sync
                var already_visited = visited_boards.find(function(i) { return i == board.id || i == board.key; });
                // don't add to the list if already planning to visit (and either
                // the planned visit doesn't have link_disabled flag or the
                // two entries match for the link_disabled flag)
                var already_going_to_visit = to_visit_boards.find(function(b) { return (b.id == board.id || b.key == board.key) && (!board.link_disabled || board.link_disabled == b.link_disabled); });

                // if we've already confirmed the sub-board from a different board, you can
                // skip the check this time
                if(safely_cached_boards[board.id]) {// || checked_linked_boards[board.id]) {
                  return;
                }

                if(!already_visited && !already_going_to_visit) {
                  to_visit_boards.push({id: board.id, key: board.key, depth: next.depth + 1, link_disabled: board.link_disabled, visit_source: (emberGet(prior_board, 'key') || emberGet(prior_board, 'id'))});
                }
                var force_cache_check = true;
                if(safely_cached || force_cache_check) {
                  // (this check is here because it's possible to lose some data via leakage,
                  // since if a board is safely cached it's sub-boards should be as well,
                  // but unfortunately sometimes they're not)
                  var find = persistence.queue_sync_action('find_board', sync_id, function() {
                    return persistence.find('board', board.id);
                  });
                  // for every linked board, check all the board's buttons. If all the images
                  // and sounds are already in the cache then mark the board as safely cached.
                  visited_board_promises.push(
                    find.then(function(b) {
                      var necessary_finds = [];
                      // this is probably a protective thing, but I have no idea why anymore,
                      // it may not even be necessary anymore
                      var tmp_board = LingoLinqAAC.store.createRecord('board', $.extend({}, b, {id: null}));
                      var missing_image_ids = [];
                      var missing_sound_ids = [];
                      // TODO: does this need to be just for the current user, or the whole map?
                      var local_image_map = tmp_board.variant_image_urls(user.get('preferences.skin')) || {};
                      var local_sound_map = tmp_board.get('sound_urls') || {};
                      tmp_board.get('used_buttons').forEach(function(button) {
                        if(button.image_id) {
                          var valid = false;
                          var mapped_url = local_image_map[button.image_id]; // || all_image_urls[button.image_id];
                          if(mapped_url) {
                            if((persistence.url_cache && persistence.url_cache[mapped_url]) && (!persistence.url_uncache || !persistence.url_uncache[mapped_url])) {
                              valid = true;
                            }
                          } else if(all_image_urls[button.image_id]) {
                            // If there is at least a default image, you can use that
                            mapped_url = all_image_urls[button.image_id];
                            if((persistence.url_cache && persistence.url_cache[mapped_url]) && (!persistence.url_uncache || !persistence.url_uncache[mapped_url])) {
                              valid = true;
                            }
                          }
                          if(!valid && !button.image_id.match(/^tmp_/)) {
                            missing_image_ids.push(button.image_id);
                          }
                        }
                        if(button.sound_id) {
                          var valid = false;
                          var mapped_url = all_sound_urls[button.sound_id] || local_sound_map[button.sound_id];
                          if(mapped_url) {
                            if((persistence.url_cache && persistence.url_cache[mapped_url]) && (!persistence.url_uncache || !persistence.url_uncache[mapped_url])) {
                              valid = true;
                            }
                          }
                          if(!valid && !button.sound_id.match(/^tmp_/)) {
                            missing_sound_ids.push(button.sound_id);
                          }
                        }
                      });
                      necessary_finds.push(new RSVP.Promise(function(res, rej) {
                        if(missing_image_ids.length > 0) {
                          rej({error: 'missing image ids', ids: missing_image_ids});
                        } else if(missing_sound_ids.length > 0) {
                          rej({error: 'missing sound ids', ids: missing_sound_ids});
                        } else {
                          res();
                        }
                      }));
                      return RSVP.all_wait(necessary_finds).then(function() {
                        var cache_mismatch = fresh_revisions && fresh_revisions[board.id] && fresh_revisions[board.id] != b.current_revision;
                        if(!cache_mismatch) {
                          safely_cached_boards[board.id] = true;
                        }
                        checked_linked_boards[board.id] = true;
                      }, function(error) {
                        if(safely_cached) {
                          console.log(error);
                          console.log("should have been safely cached, but board content wasn't in db:" + board.id);
                        }
                        checked_linked_boards[board.id] = true;
                        return RSVP.resolve();
                      });
                    }, function(error) {
                      if(safely_cached) {
                        console.log(error);
                        console.log("should have been safely cached, but board wasn't in db:" + board.id);
                      }
                      checked_linked_boards[board.id] = true;
                      return RSVP.resolve();
                    })
                  );
                }
              });

              if(safely_cached && content_promises > 0) {
                console.log("EXPECTED NO BOARD CONTENT SAVES BUT THERE WERE " + content_promises);
              }
              RSVP.all_wait(visited_board_promises).then(function() {
                full_set_revisions[board.get('id')] = board.get('full_set_revision');
                if(safely_cached && visited_board_promises.length == 0) {
                  nextBoard(defer);
                } else {
                  runLater(function() {
                    nextBoard(defer);
                  }, 75);  
                }
              }, function(err) {
                var msg = "board " + (key || id) + " failed to sync completely";
                if(typeof err == 'string') {
                  msg = msg + ": " + err;
                } else if(err && err.error) {
                  msg = msg + ": " + err.error;
                }
                if(source) {
                   msg = msg + ", linked from " + source;
                }
                board_errors.push({error: msg, board_id: id, board_key: key});
                runLater(function() {
                  nextBoard(defer);
                }, 75);
              });
            }, function(err) {
              var board_unauthorized = (err && err.error == "Not authorized");
              if(next.link_disabled && board_unauthorized) {
                // TODO: if a link is disabled, can we get away with ignoring an unauthorized board?
                // Prolly, since they won't be using that board anyway without an edit.
                runLater(function() {
                  nextBoard(defer);
                }, 75);
              } else {
                // TODO: if a board has been deleted
                if(err.error && err.error.error) {
                  err = err.error;
                }
                if(err && err.error == "Record not found" && err.deleted) {
                  board_errors.push({error: "board " + (key || id) + " has been deleted, linked from " + source, board_unauthorized: board_unauthorized, board_id: id, board_key: key});
                } else {
                  board_errors.push({error: "board " + (key || id) + " failed retrieval for syncing, linked from " + source, board_unauthorized: board_unauthorized, board_id: id, board_key: key});
                }
                runLater(function() {
                  nextBoard(defer);
                }, 75);
              }
            });
          } else if(!next) {
            // TODO: mark this defer's promise as waiting (needs to be unmarked at each
            // nextBoard call), then set a longer timeout before calling nextBoard,
            // and only resolve when *all* the promises are waiting.
            defer.resolve();
          } else {
            runLater(function() {
              nextBoard(defer);
            }, 50);
          }
        }
        // Threaded lookups with a global limit to prevent
        // people with lots of supervisees from getting bogged down
        var n_threads = capabilities.mobile ? 6 : 10;
        var add_thread = function(defer) {
          defer = defer || RSVP.defer();
          if(persistence.active_board_threads > n_threads) {
            runLater(function() {
              add_thread(defer);
            }, 1000);
          } else {
            persistence.active_board_threads = (persistence.active_board_threads || 0) + 1;
            nextBoard(defer);
            defer.promise.then(function() {
              persistence.active_board_threads--;
            }, function() {
              persistence.active_board_threads--;
            });  
          }
          if(!defer.added) {
            defer.added = true;
            board_load_promises.push(defer.promise);
          }
        };
        for(var threads = 0; threads < n_threads; threads++) {
          add_thread();
        }
        RSVP.all_wait(board_load_promises).then(function() {
          resolve(full_set_revisions);
        }, function(err) {
          dead_thread = true;
          reject.apply(null, arguments);
        });
      });
    });

    return sync_all_boards.then(function(full_set_revisions) {
      return persistence.store('settings', full_set_revisions, 'synced_full_set_revisions');
    });
  },
  sync_user: function(user, importantIds) {
    return new RSVP.Promise(function(resolve, reject) {
      importantIds.push('user_' + user.get('id'));
      var lookup = persistence.time_promise(user.get('fresh') ? RSVP.resolve(user) : user.reload(), "getting latest user details", 5000);
      var find_user = lookup.then(function(u) {
        if(persistence.get('sync_progress.root_user') == u.get('id')) {
          persistence.set('sync_progress.last_sync_stamp', u.get('sync_stamp'));
        }
        if(persistence.get('sync_progress')) {
          var stamps = persistence.get('sync_progress.sync_stamps') || {};
          stamps[u.get('id')] = u.get('sync_stamp');
          persistence.set('sync_progress.sync_stamps', stamps);             
        }

        return RSVP.resolve(u);
      }, function() {
        reject({error: "failed to retrieve latest user details"});
      });

      // also download the latest avatar as a data uri
      var save_avatar = find_user.then(function(user) {
        // is this also a user object? does user = u work??
        if(persistence.get('sync_progress.root_user') == user.get('id')) {
          if(user.get('preferences.device') && !user.get('preferences.device.ever_synced') && user.save) {
            user.set('preferences.device.ever_synced', true);
            user.save();
          }
        }
        var url = user.get('avatar_url');
        if(url && !persistence.store_url_quick_check(url, 'image')) {
          return persistence.store_url_now(url, 'image');
        } else {
          return RSVP.resolve({});
        }
      });

      save_avatar.then(function(object) {
        if(object.url) {
          importantIds.push("dataCache_" + object.url);
        }
        resolve();
      }, function(err) {
        if(err && err.quota_maxed) {
          reject({error: "failed to save user avatar, storage is full"});
        } else {
          reject({error: "failed to save user avatar"});
        }
      });
    });
  },
  sync_changed: function() {
    var sync_id = persistence.get('sync_progress.sync_id');
    return new RSVP.Promise(function(resolve, reject) {
      var changed = persistence.find_changed().then(null, function() {
        reject({error: "failed to retrieve list of changed records"});
      });

      changed.then(function(list) {
        var update_promises = [];
        var tmp_id_map = {};
        var re_updates = [];
        // TODO: need to better handle errors with updates and deletes
        list.forEach(function(item) {
          if(item.store == 'deletion') {
            var promise = persistence.queue_sync_action('find_deletion', sync_id, function() {
              return LingoLinqAAC.store.findRecord(item.data.store, item.data.id).then(function(res) {
                res.deleteRecord();
                return res.save().then(function() {
                  return persistence.remove(item.store, item.data);
                }, function() { debugger; });
              }, function() {
                // if it's already deleted, there's nothing for us to do
                return RSVP.resolve();
              });
            });
            update_promises.push(promise);
          } else if(item.store == 'board' || item.store == 'image' || item.store == 'sound' || item.store == 'user') {
            var find_record = null;
            var object = item.data.raw[item.store] || item.data.raw;
            var object_id = object.id;
            var tmp_id = null;
            if(object.id && object.id.match(/^tmp_/)) {
              tmp_id = object.id;
              object.id = null;
              find_record = RSVP.resolve(LingoLinqAAC.store.createRecord(item.store, object));
            } else {
              find_record = persistence.queue_sync_action('find_changed_record', sync_id, function() {
                return LingoLinqAAC.store.findRecord(item.store, object.id).then(null, function() {
                  return RSVP.reject({error: "failed to retrieve " + item.store + " " + object.id + "for updating"});
                });
              });
            }
            var save_item = find_record.then(function(record) {
              // TODO: check for conflicts before saving...
              record.setProperties(object);
              if(!record.get('id') && (item.store == 'image' || item.store == 'sound')) {
                record.set('data_url', object.data_url);
                return contentGrabbers.save_record(record).then(function() {
                  return persistence.time_promise(record.reload(), "reload changed record", 10000);
                });
              } else {
                return record.save();
              }
            });

            var result = save_item.then(function(record) {
              if(item.store == 'board' && JSON.stringify(object).match(/tmp_/)) { // TODO: if item has temporary pointers
                re_updates.push([item, record]);
              }
              if(tmp_id) {
                tmp_id_map[tmp_id] = record;
                return persistence.remove(item.store, {}, tmp_id);
              }
              return RSVP.resolve();
            }, function() {
              return RSVP.reject({error: "failed to save offline record, " + item.store + " " + object_id});
            });

            update_promises.push(result);
          }
        });
        RSVP.all_wait(update_promises).then(function() {
          if(re_updates.length > 0) {
            var re_update_promises = [];
            re_updates.forEach(function(update) {
              var item = update[0];
              var record = update[1];
              if(item.store == 'board') {
                var buttons = record.get('buttons');
                if(buttons) {
                  for(var idx = 0; idx < buttons.length; idx++) {
                    var button = buttons[idx];
                    if(tmp_id_map[button.image_id]) {
                      button.image_id = tmp_id_map[button.image_id].get('id');
                    }
                    if(tmp_id_map[button.sound_id]) {
                      button.sound_id = tmp_id_map[button.sound_id].get('id');
                    }
                    if(button.load_board && tmp_id_map[button.load_board.id]) {
                      var board = tmp_id_map[button.load_board.id];
                      button.load_board = {
                        id: board.get('id'),
                        key: board.get('key')
                      };
                    }
                    buttons[idx] = button;
                  }
                }
                record.set('buttons', buttons);
              } else {
                debugger;
              }
              // TODO: update any tmp_ids from item in record using tmp_id_map
              re_update_promises.push(record.save());
            });
            RSVP.all_wait(re_update_promises).then(function() {
              resolve();
            }, function(err) {
              reject(err);
            });
          } else {
            resolve();
          }
        }, function(err) {
          reject(err);
        });
      });
    });
  },
  temporary_id: function() {
    return "tmp_" + Math.random().toString() + (new Date()).getTime().toString();
  },
  convert_model_to_json: function(store, modelName, record) {
    var type = store.modelFor(modelName);
    var data = {};
    var serializer = store.serializerFor(type.modelName);

    var snapshot = record; //._createSnapshot();
    serializer.serializeIntoHash(data, type, snapshot, { includeId: true });

    // TODO: mimic any server-side changes that need to happen to make the record usable
    if(!data[type.modelName].id) {
      data[type.modelName].id = persistence.temporary_id();
    }
    if(type.mimic_server_processing) {
      data = type.mimic_server_processing(snapshot.record, data);
    }

    return data;
  },
  offline_reject: function() {
    return RSVP.reject({offline: true, error: "not online"});
  },
  meta: function(store, obj) {
    if(obj && obj.get('meta')) {
      return obj.get('meta');
    } else if(obj && obj.get('id')) {
      var res = sweetSuiteExtras.meta('GET', store, obj.get('id'));
      res = res || sweetSuiteExtras.meta('PUT', store, obj.get('id'));
      res = res || sweetSuiteExtras.meta('GET', store, obj.get('user_name') || obj.get('key'));
      return res;
    } else if(!obj) {
      return sweetSuiteExtras.meta('POST', store, null);
    }
    return null;
  },
  safe_parse_json: function(text, contentType) {
    // Check if the response is actually JSON before parsing
    if(contentType && !contentType.match(/application\/json|text\/json/i)) {
      // If AWS returned HTML error page (e.g., 500/503), reject gracefully
      if(contentType.match(/text\/html/i) && text && text.match(/^<html|^<!DOCTYPE/i)) {
        return RSVP.reject({error: 'Server error: HTML response received', statusCode: 500});
      }
      return RSVP.reject({error: 'Invalid content type: ' + contentType});
    }
    try {
      return RSVP.resolve(JSON.parse(text));
    } catch(e) {
      return RSVP.reject({error: 'JSON parse failed', parseError: e.message});
    }
  },
  with_timeout: function(promise, timeoutMs, errorMsg) {
    // Wrap a promise with a timeout to prevent hanging on slow/unavailable servers
    timeoutMs = timeoutMs || 30000; // Default 30 second timeout
    errorMsg = errorMsg || 'Request timeout: resource took too long to load';

    var timeoutPromise = new RSVP.Promise(function(resolve, reject) {
      runLater(function() {
        reject({error: errorMsg, timeout: true, code: 'ETIMEDOUT'});
      }, timeoutMs);
    });

    return RSVP.race([promise, timeoutPromise]);
  },
  ajax: function() {
    var ajax_args = arguments;
    var local_request = ajax_args && ajax_args[0] && ajax_args[0].match && (ajax_args[0].match(/^file:\/\//) || ajax_args[0].match(/^http:\/\/localhost/));
    if(this.get('online') || local_request) {
      // TODO: is this wrapper necessary? what's it for? maybe can just listen on
      // global ajax for errors instead...
      return new RSVP.Promise(function(resolve, reject) {
        $.ajax.apply(null, ajax_args).then(function(data, message, xhr) {
          run(function() {
            if(data) {
              data.xhr = xhr;
            }
            // Validate content-type if JSON is expected and we got HTML error
            if(data && typeof data === 'string' && data.match(/^<html|^<!DOCTYPE/i)) {
              reject({error: 'Server returned HTML error page', statusCode: xhr.status, responseText: data});
              return;
            }
            resolve(data);
          });
        }, function(xhr) {
          // TODO: for some reason, safari returns the promise instead of the promise's
          // result to this handler. I'm sure it's something I'm doing wrong, but I haven't
          // been able to figure it out yet. This is a band-aid.
          if(xhr.then) { console.log("received the promise instead of the promise's result.."); }
          var promise = xhr.then ? xhr : RSVP.reject(xhr);
          promise.then(null, function(xhr) {
            var allow_offline_error = false;
            if(allow_offline_error) { // TODO: check for offline error in xhr
              reject(xhr, {offline: true, error: "not online"});
            } else {
              reject(xhr);
            }
          });
        });
      });
    } else {
      return RSVP.reject({offline: true, error: "not online", short_circuit: true});
    }
  },
  on_connect: observer('online', function() {
    stashes.set('online', this.get('online'));
    if(this.get('online') && (!LingoLinqAAC.testing || LingoLinqAAC.sync_testing)) {
      var _this = this;
      runLater(function() {
        // TODO: maybe do a quick xhr to a static asset to make sure we're for reals online?
        if(stashes.get('auth_settings')) {
          _this.check_for_needs_sync(true);
        }
        _this.tokens = {};
        if(LingoLinqAAC.session) {
          LingoLinqAAC.session.restore(!persistence.get('browserToken'));
        }
      }, 500);
    }
  }),
  check_for_needs_sync: observer('refresh_stamp', 'last_sync_at', function(ref) {
    var force = (ref === true);
    var _this = this;

    if(stashes.get('auth_settings') && window.sweetSuiteExtras && window.sweetSuiteExtras.ready) {
      // if last 2 sync attempts failed, last_sync_at should be set to prevent repeated attempts
      var synced = _this.get('last_sync_at') || 0;
      var syncable = persistence.get('online') && !Ember.testing && !persistence.get('syncing');
      // default to checking every 5 minutes
      var interval = persistence.get('last_sync_stamp_interval') || (5 * 60 * 1000);
      interval = interval + (0.2 * interval * Math.random()); // jitter
      if(_this.get('last_sync_event_at')) {
        // don't background sync too often
        syncable = syncable && (_this.get('last_sync_event_at') < ((new Date()).getTime() - interval));
      }
      var now = (new Date()).getTime() / 1000;
      if(!Ember.testing && capabilities.mobile && !force && loaded && (now - loaded) < (30) && synced > 1) {
        // on mobile, don't auto-sync until 30 seconds after bootup, unless it's never been synced
        // NOTE: the db is keyed to the user, so you'll always have a user-specific last_sync_at
        return false;
      } else if(persistence.get('auto_sync') === false || persistence.get('auto_sync') == null) {
        // on browsers, don't auto-sync until the user has manually synced at least once
        return false;
      } else if(synced > 0 && (now - synced) > (48 * 60 * 60) && syncable) {
        // if we haven't synced in 48 hours and we're online, do a background sync
        console.debug('syncing because it has been more than 48 hours');
        persistence.sync('self', null, null, 'long_time_since_sync:' + synced + ":" + now).then(null, function() { });
        return true;
      } else if(force || (syncable && _this.get('last_sync_stamp'))) {
        // don't check sync_stamp more than once every interval
        var last_check = persistence.get('last_sync_stamp_check');
        if(force || !last_check || (last_check < (new Date()).getTime() - interval)) {
          persistence.set('last_sync_stamp_check', (new Date()).getTime());
          persistence.ajax('/api/v1/users/self/sync_stamp', {type: 'GET'}).then(function(res) {
            persistence.set('last_sync_stamp_check', (new Date()).getTime());
            if(!persistence.get('last_sync_stamp') || res.sync_stamp != persistence.get('last_sync_stamp')) {
              var not_still_changing = false;
              var cutoff = window.moment && window.moment(res.sync_stamp).add(5, 'minutes');
              var now = window.moment && window.moment();
              if(now && now.toISOString().substring(0, 10) != res.sync_stamp.substring(0, 10)) {
                // if the sync_stamp is more than a day off, it
                // should run even if changes have been happening receently
                not_still_changing = true;
              } else if(cutoff) {
                // updated sync_stamp was more than 5 minutes ago,
                // (prevents repeat syncs while mid-edit)
                not_still_changing = cutoff < window.moment();
              } else {
                not_still_changing = true;
              }
              if(not_still_changing) {
                console.debug('syncing because sync_stamp has changed');
                persistence.sync('self', null, null, 'sync_stamp_changed:' + res.sync_stamp + ":" + _this.get('last_sync_stamp')).then(null, function() { });
              }
            }
            if(window.app_state && window.app_state.get('currentUser')) {
              window.app_state.set('currentUser.last_sync_stamp_check', (new Date()).getTime());
              if(res.unread_messages != null) {
                window.app_state.set('currentUser.unread_messages', res.unread_messages);
              }
              if(res.unread_alerts != null) {
                window.app_state.set('currentUser.unread_alerts', res.unread_alerts);
              }
            }
          }, function(err) {
            persistence.set('last_sync_stamp_check', (new Date()).getTime());
            // TODO: if error implies no connection, consider marking as offline and checking for stamp more frequently
            if(err && err.result && err.result.invalid_token) {
              if(stashes.get('auth_settings') && !Ember.testing) {
                if(LingoLinqAAC.session && !LingoLinqAAC.session.get('invalid_token')) {
                  LingoLinqAAC.session.check_token(false);
                }
              }
            }
          });
          return true;
        }
      }
    }
    return false;
  }),
  check_for_sync_reminder: observer('refresh_stamp', 'last_sync_at', function() {
    var _this = this;
    if(stashes.get('auth_settings') && window.sweetSuiteExtras && window.sweetSuiteExtras.ready) {
      var synced = _this.get('last_sync_at') || 0;
      var now = (new Date()).getTime() / 1000;
      // if we haven't synced in 14 days, remind to sync
      if(synced > 0 && (now - synced) > (14 * 24 * 60 * 60) && !Ember.testing) {
        persistence.set('sync_reminder', true);
      } else {
        persistence.set('sync_reminder', false);
      }
    } else {
      persistence.set('sync_reminder', false);
    }
  }),
  check_for_new_version: observer('refresh_stamp', function() {
    if(window.LingoLinqAAC && window.LingoLinqAAC.update_version) {
      persistence.set('app_needs_update', true);
    }
  })
}).create({online: (navigator.onLine)});
stashes.set('online', navigator.onLine);

window.addEventListener('online', function() {
  persistence.set('online', true);
});
window.addEventListener('offline', function() {
  persistence.set('online', false);
});
// Cordova notifies on the document object
document.addEventListener('online', function() {
  persistence.set('online', true);
});
document.addEventListener('offline', function() {
  persistence.set('online', false);
});
setInterval(function() {
  var online = navigator.online_override || navigator.onLine;
  if(online === true && persistence.get('online') === false) {
    persistence.set('online', true);
  } else if(online === false && persistence.get('online') === true) {
    persistence.set('online', false);
  } else if(persistence.get('online') === false) {
    // making an AJAX call when offline should have very little overhead
    LingoLinqAAC.session.check_token(false).then(function(res) {
      if(res && res.success === false) {
      } else {
        persistence.set('online', true);
      }
    }, function() { });
  }
}, 30000);

persistence.DSExtend = {
  grabRecord: function(type, id, opts) {
    // 1. Try to peek for the record
    //    - If peeked but no permissions defined, ignore it
    //    - Otherwise return peeked result
    // 2. Next try local persistence lookup
    //    - If found, push the record and return it
    // 3. Last try calling findRecord as before
    // opts:
    //    - any: allow peeked result even if incomplete
    //    - local: fail instead of trying remote call
    //    - remote: do a .reload unless it's a remote result
  },
  findRecord: function(store, type, id) {
    var _this = this;
    var _super = this._super;
    return new RSVP.Promise(function(find_resolve, find_reject) {
      var after_data = function(local_data) {
        // first, try looking up the record locally
        var start_with_local = true; 
        var skip_db = false;
        // persistence.find(type.modelName, id, true);
        // original_find.then(function(data) { original_find.data = data; });
        // var find = original_find;

        var full_id = type.modelName + "_" + id;
        // force_reload should always hit the server, though it can return local data if there's a token error (i.e. session expired)
        if(persistence.force_reload == full_id && persistence.get('online')) { start_with_local = false; } //find.then(null, function() { }); find = RSVP.reject(); }
        // private browsing mode gets really messed up when you try to query local db, so just don't.
        else if(!stashes.get('enabled')) { skip_db = true; } //find.then(null, function() { }); find = RSVP.reject(); original_find = RSVP.reject(); }

        // this method will be called if a local result is found, or a force reload
        // is called but there wasn't a result available from the remote system
        var local_processed = function(data) {
          data.meta = data.meta || {};
          data.meta.local_result = true;
          if(data[type.modelName] && data.meta && data.meta.local_result) {
            data[type.modelName].local_result = true;
          }
          sweetSuiteExtras.meta_push({
            method: 'GET',
            model: type.modelName,
            id: id,
            meta: data.meta
          });
          find_resolve(data);
          // return RSVP.resolve(data);
        };

        var check_remote = function() {
          // if nothing found locally and system is online (and it's not a local-only id), make a remote request
          if(persistence.get('online') && !id.match(/^tmp[_\/]/) && !id.match(/^tmpimg_/)) {
            if(!persistence.get('syncing')) {
              persistence.remember_access('find', type.modelName, id);
            }
            var error = function(err) {
              var local_fallback = false;
              if(err && (err.invalid_token || (err.result && err.result.invalid_token))) {
                // for expired tokens, allow local results as a fallback
                local_fallback = true;
              } else if(err && err.errors && err.errors[0] && err.errors[0].status && err.errors[0].status.toString().substring(0, 1) == '5') {
                // for server errors, allow local results as a fallback
                local_fallback = true;
              } else if(err && err.fakeXHR && err.fakeXHR.status === 0) {
                // for connection errors, allow local results as a fallback
                local_fallback = true;
              } else if(err && err.fakeXHR && err.fakeXHR.status && err.fakeXHR.status.toString().substring(0, 1) == '5') {
                // for other 500 errors, allow local results as a fallback
                local_fallback = true;
              } else {
                // any other exceptions?
              }
              if(err && !err.error && err.errors) {
                err.error = err.errors[0];
              }
              if(local_fallback) {
                if(skip_db) {
                  find_reject(err);
                } else {
                  if(local_data) {
                    return local_processed(local_data)
                  } else {
                    return find_reject(err);
                  }
                }
              } else {
                return find_reject(err);
              }
            };
            runLater(function() {
              // TODO: maybe just shorter timeout, check if persistence.offline and error then
              // it looks like these super calls is where it's getting eaten...
              if(error.skip) { return; }
              error.skip = true;
              error({error: 'timeout'});
            }, 15000);
            var id_or_key = id;
            if(persistence.force_reload == full_id && type.modelName == 'board' && local_data && local_data.board && local_data.board.key) {
              id_or_key = local_data.board.key;
            }
            return _super.call(_this, store, type, id_or_key).then(function(record) {
              // DEBUGGER HERE, when wifi is off this still gets
              // called a couple times, but eats the promise for some reason
              // TODO: maybe check if it's a problem in persistence.ajax
              if(error.skip) { return; }
              error.skip = true;
              // mark the retrieved timestamp for freshness checks
              if(record[type.modelName]) {
                delete record[type.modelName].local_result;
                var now = (new Date()).getTime();
                record[type.modelName].retrieved = now;
                if(record.images) {
                  record.images.forEach(function(i) { i.retrieved = now; });
                }
                if(record.sounds) {
                  record.sounds.forEach(function(i) { i.retrieved = now; });
                }
              }
              var ref_id = null;
              if(type.modelName == 'user' && id == 'self') {
                ref_id = 'self';
              }
              // store the result locally for future offline access
              return persistence.store_eventually(type.modelName, record, ref_id).then(function() {
                find_resolve(record);
                // return RSVP.resolve(record);
              }, function() {
                find_reject({error: "failed to delayed-persist to local db"});
              });
            }, function(err) {
              if(error.skip) { return; }
              error.skip = true;
              error(err);
            });
          } else {
            if(skip_db) {
              return find_reject(persistence.offline_reject());
            } else {
              if(local_data) {
                return local_processed(local_data)
              } else {
                return find_reject(persistence.offline_reject());
              }
            }
          }
        };

        if(start_with_local && !skip_db) {
          if(local_data) {
            return local_processed(local_data);
          } else {
            skip_db = true; // already checked db
            return check_remote();
          }
        } else {
          return check_remote();
        }
      };

      persistence.find(type.modelName, id, true).then(function(data) {
        after_data(data);
      }, function(err) {
        after_data(null);
      })
    });
  },
  createRecord: function(store, type, obj) {
    var _this = this;
    if(persistence.get('online')) {
      return new RSVP.Promise(function(create_resolve, create_reject) {
        var tmp_id = null, tmp_key = null;
  //       if(obj.id && obj.id.match(/^tmp[_\/]/)) {
  //         tmp_id = obj.id;
  //         tmp_key = obj.attr('key');
  //         var record = obj.record;
  //         record.set('id', null);
  //         obj = record._createSnapshot();
  //       }
        _this._super(store, type, obj).then(function(record) {
          if(obj.record && obj.record.tmp_key) {
            record[type.modelName].tmp_key = obj.record.tmp_key;
          }
          persistence.store(type.modelName, record).then(function() {
            if(tmp_id) {
              persistence.remove('board', {}, tmp_id).then(function() {
                create_resolve(record);
              }, function() {
                create_reject({error: "failed to remove temporary record"});
              });
            } else {
              create_resolve(record);
            }
          }, function() {
            if(capabilities.installed_app || persistence.get('auto_sync')) {
              create_reject({error: "failed to create in local db"});
            } else {
              create_resolve(record);
            }
          });
        }, function(err) {
          create_reject(err);
        });
      });
    } else {
      var record = persistence.convert_model_to_json(store, type.modelName, obj);
      record[type.modelName].changed = true;
      if(record[type.modelName].key && record[type.modelName].key.match(/^tmp_/)) {
        record[type.modelName].tmp_key = record[type.modelName].key;
      }
      if(record[type.modelName].id.match(/^tmp/) && ['board', 'image', 'sound'].indexOf(type.modelName) == -1) {
        // only certain record types can be created offline
        return persistence.offline_reject();
      }
      return persistence.store(type.modelName, record).then(function() {
        return RSVP.resolve(record);
      }, function() {
        return persistence.offline_reject();
      });
    }
  },
  updateRecord: function(store, type, obj) {
    var _this = this;
    return new RSVP.Promise(function(update_resolve, update_reject) {
      if(persistence.get('online')) {      
        if(obj.id.match(/^tmp[_\/]/)) {
          _this.createRecord(store, type, obj).then(function(res) {
            update_resolve(res);
          }, function(err) {
            update_reject(err);
          });
        } else {
          _this._super(store, type, obj).then(function(record) {
            persistence.store(type.modelName, record).then(function() {
              update_resolve(record);
            }, function() {
              update_reject({error: "failed to update to local db"});
            });
          }, function(err) {
            update_reject(err);
          });
        }  
      } else {
        var record = persistence.convert_model_to_json(store, type.modelName, obj);
        record[type.modelName].changed = true;
        persistence.store(type.modelName, record).then(function() {
          update_resolve(record);
        }, function() {
          update_reject({offline: true, error: "not online"});
        });
      }
    });
  },
  deleteRecord: function(store, type, obj) {
    // need raw object
    var _this = this;
    return new RSVP.Promise(function(delete_resolve, delete_reject) {
      if(persistence.get('online')) {
        _this._super(store, type, obj).then(function(record) {
          persistence.remove(type.modelName, record).then(function() {
            delete_resolve(record);
          }, function() {
            delete_reject({error: "failed to delete in local db"});
          });
        }, function(err) {
          delete_reject(err);
        });
      } else {
        var record = persistence.convert_model_to_json(store, type.modelName, obj);
        persistence.remove(type.modelName, record, null, true).then(function() {
          delete_resolve(record);
        }, function(err) {
          delete_reject(err);
        });
      }
    });
  },
  findAll: function(store, type, id) {
    debugger;
  },
  query: function(store, type, query) {
    if(persistence.get('online')) {
      var res = this._super(store, type, query);
      return res;
    } else {
      return persistence.offline_reject();
    }
  }
};
window.persistence = persistence;

export default persistence;
