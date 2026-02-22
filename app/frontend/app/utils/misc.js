import RSVP from 'rsvp';
import $ from 'jquery';
import capabilities from './capabilities';
import scanner from './scanner';
import i18n from './i18n';
import persistence from './persistence';
import LingoLinq from '../app';
import stashes from './_stashes';
import app_state from './app_state';
import lingoLinqExtras from './extras';

RSVP.resolutions = function(list) {
  return new RSVP.Promise(function(resolve, reject) {
    var count = 0;
    var result = [];
    if(list.length === 0) { resolve(result); }
    list.forEach(function(promise) {
      promise.then(function(item) {
        count++;
        result.push(item);
        if(count == list.length) {
          resolve(result);
        }
      }, function() {
        count++;
        if(count == list.length) {
          resolve(result);
        }
      });
    });
  });
};
var Utils = {};
Utils.uniq = function(list, compare) {
  var key = {};
  var result = [];
  list.forEach(function(item) {
    var value = item[compare.toString()];
    if(typeof(compare) != 'string') {
      value = compare(item);
    }
    if(value && !key[value]) {
      result.push(item);
      key[value] = true;
    }
  });
  return result;
};
Utils.max_appearance = function(list) {
  var counts = {};
  list.forEach(function(item) {
    counts[item] = counts[item] || 0;
    counts[item]++;
  });
  var max = 0;
  for(var idx in counts) {
    max = Math.max(max, counts[idx]);
  }
  return max;
};

Utils.all_pages = function(type, initial_opts, partial_callback) {
  return new RSVP.Promise(function(resolve, reject) {
    var all_results = [];
    var result_type = initial_opts.result_type;
    delete initial_opts['result_type'];
    var find_next = function(type, opts) {
      if(type.match(/\/api\//)) {
        var persistenceService = Utils.get_persistence();
        persistenceService.ajax(type, opts).then(function(list) {
          if(result_type) {
            all_results = all_results.concat(list[result_type]);
          } else {
            all_results.push(list);
          }
          if(partial_callback) {
            partial_callback(all_results);
          }
          if(list.meta && list.meta.next_url) {
            find_next(list.meta.next_url, {result_type: result_type});
          } else {
            resolve(all_results);
          }
        }, function(err) {
          reject(err);
        });
      } else {
        var args = $.extend({}, opts);
        var persistenceService = Utils.get_persistence();
        var meta_check = persistenceService.meta;
        LingoLinq.store.query(type, opts).then(function(list) {
          var meta = meta_check(type, list);
          all_results = all_results.concat(list.map(function(i) { return i; }));
          if(partial_callback) {
            partial_callback(all_results);
          }
          if(meta && meta.more) {
            args.per_page = meta.per_page;
            args.offset = meta.next_offset;
            find_next(type, args);
          } else {
            resolve(all_results);
          }
        }, function(err) {
          reject(err);
        });
      }
    };
    find_next(type, initial_opts);
  });
};

RSVP.all_wait = function(promises) {
  return new RSVP.Promise(function(resolve, reject) {
    if(promises.length === 0) { return resolve(); }
    var failures = [];
    var resolutions = [];
    var count = promises.length;
    var done = function() {
      var really_done = !LingoLinq.testing && failures.length > 0;
      really_done = really_done || (!LingoLinq.all_wait && failures.length > 0);
      really_done = really_done || (failures.length + resolutions.length == count);
      if(really_done) {
        if(failures.length > 0) {
          reject(failures[0]);
        } else {
          resolve();
        }
      }
    };
    promises.forEach(function(promise) {
      promise.then(function(res) {
        resolutions.push(res);
        done();
      }, function(err) {
        failures.push(err);
        done();
      });
    });
  });
};

// This was kind of a cool idea, but not needed where I thought I'd want it.
// RSVP.PromiseWithProgress = function(callback) {
//   var defer = RSVP.defer();
//   var notice_callbacks = []
//   defer.notice = function(callback) {
//     notice_callbacks.push(callback);
//   };
//   var progress = {
//     current: 0
//     sub_progresses: []
//   };
//   var notify_callbacks = function() {
//     notice_callbacks.each(function(callback) {
//       callback(progress.current);
//     });
//   };
//   progress.add_subprogress = function(promise, percent) {
//     var idx = progress.sub_progresses.push([0, percent]);
//     promise.notice(function(sub_percent) {
//       progress.sub_progresses[idx][0] = Math.max(1.0, sub_percent);
//       progress.compute_current();
//     }).then(function() {
//       progress.sub_progresses[idx][0] = 1.0;
//       progress.compute_current();
//       return RSVP.resolve.apply(null, arguments);
//     }, function() {
//       progress.sub_progresses[idx][0] = 1.0;
//       progress.compute_current();
//       return RSVP.reject.apply(null, arguments);
//     };
//   };
//   progress.add = function(percent) {
//     if(progress.sub_progresses.length > 0) { return; }
//     progress.current = Math.max(progress.current + percent);
//     notify_callbacks();
//   };
//   progress.set = function(percent) {
//     if(progress.sub_progresses.length > 0) { return; }
//     progress.current = Math.max(1.0, percent);
//     notify_callbacks();
//   };
//   progress.compute_current = function() {
//     var total = 0.0;
//     var max = 0.0
//     progress.sub_progresses.forEach(function(p) {
//       total = total + (p[0] * p[1]);
//       max = max + p[1];
//     });
//     total = total / max;
//     progress.current = total;
//     notify_callbacks();
//   };
//   callback(defer.resolve, defer.reject, progress);
//   return defer.promise;
// };

// Static service registry for persistence
Utils._services = {
  persistence: null
};
Utils.register_services = function(persistenceService) {
  if(persistenceService) { Utils._services.persistence = persistenceService; }
};
Utils.get_persistence = function() {
  return Utils._services.persistence || persistence;
};

// TODO: code smell
export default Utils;
