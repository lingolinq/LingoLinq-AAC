import { cancel as runCancel } from '@ember/runloop';
import RSVP from 'rsvp';
import LingoLinq from '../../app';
import persistence from '../../utils/persistence';
import capabilities from '../../utils/capabilities';
import { persistenceTarget } from './persistence-stub';
import { stub } from './jasmine';

var cachedRealSyncBoardsFn = null;

export function cacheRealSyncBoards() {
  var target = persistenceTarget();
  if (!cachedRealSyncBoardsFn && target && typeof target.sync_boards === 'function') {
    cachedRealSyncBoardsFn = target.sync_boards;
  }
}

export function enableRealSyncBoards(stubFn, onComplete) {
  cacheRealSyncBoards();
  if (typeof LingoLinq !== 'undefined') {
    LingoLinq.sync_testing_real_boards = true;
  }
  if (cachedRealSyncBoardsFn) {
    stubFn('sync_boards', function(user, importantIds, synced_boards, force) {
      var target = persistenceTarget();
      if (!target) {
        return RSVP.resolve({});
      }
      var result = cachedRealSyncBoardsFn.call(target, user, importantIds, synced_boards, force);
      if (onComplete && result && typeof result.then === 'function') {
        return result.then(function(res) {
          onComplete();
          return res;
        });
      }
      if (onComplete) {
        onComplete();
      }
      return result;
    });
  }
}

export function drainSyncUrlQueue() {
  return new RSVP.Promise(function(resolve) {
    var attempts = 0;
    var check = function() {
      var pending = (persistence.urls_to_store && persistence.urls_to_store.length) || 0;
      var watchers = persistence.storing_url_watchers || 0;
      if (pending === 0 && watchers <= 0) {
        resolve();
      } else if (attempts >= 120) {
        resolve();
      } else {
        attempts++;
        setTimeout(check, attempts < 10 ? 10 : 100);
      }
    };
    check();
  });
}

export function finishTraversalSyncBoards(target) {
  if (typeof LingoLinq === 'undefined' || !LingoLinq.sync_testing) {
    return RSVP.resolve();
  }
  return drainSyncUrlQueue().then(function() {
    [target, persistence].forEach(function(inst) {
      if (!inst) { return; }
      inst.urls_to_store = [];
      inst.storing_url_watchers = 0;
      inst.storing_urls = null;
      inst.active_board_threads = 0;
      if (inst.eventual_store_timer) {
        try { runCancel(inst.eventual_store_timer); } catch (e) { /* torn down */ }
        inst.eventual_store_timer = null;
      }
      inst.eventual_store = [];
    });
  });
}

export function stubSoundTranscriptionCheck() {
  if (LingoLinq.Sound && LingoLinq.Sound.prototype) {
    stub(LingoLinq.Sound.prototype, 'check_transcription', function() {
      if (!this || typeof this.get !== 'function') {
        return false;
      }
      try {
        if (this.isDestroyed || this.isDestroying || !this.get('id')) {
          return false;
        }
      } catch (e) {
        return false;
      }
      try {
        if (this.get && this.set) {
          this.set('transcription_pending', false);
        }
      } catch (e) {
        return false;
      }
      return true;
    });
    if (typeof LingoLinq.Sound.prototype.reload === 'function') {
      var origSoundReload = LingoLinq.Sound.prototype.reload;
      stub(LingoLinq.Sound.prototype, 'reload', function() {
        if (!this || typeof this.get !== 'function') {
          return RSVP.resolve(this);
        }
        try {
          if (!this.get('id') || this.isDestroyed || this.isDestroying) {
            return RSVP.resolve(this);
          }
        } catch (e) {
          return RSVP.resolve(this);
        }
        return origSoundReload.apply(this, arguments);
      });
    }
  }
}

export function primeSyncBoardHarness(stubFn) {
  cacheRealSyncBoards();
  stubSoundTranscriptionCheck();
  guardStorePushForSyncTests();
  stubTraversalSyncBoards(stubFn);
}

export function syncSettled() {
  var target = persistenceTarget();
  var status = persistence.get('sync_status');
  if (status === 'syncing') {
    return false;
  }
  if (target.active_board_threads && target.active_board_threads > 0) {
    return false;
  }
  if (persistence.urls_to_store && persistence.urls_to_store.length > 0) {
    return false;
  }
  if (target.sync_actions && target.sync_actions.length > 0) {
    return false;
  }
  if (target.syncing_action_watchers && target.syncing_action_watchers > 0) {
    return false;
  }
  if (target.eventual_store && target.eventual_store.length > 0) {
    return false;
  }
  if (target.eventual_store_timer) {
    return false;
  }
  if (persistence.eventual_store && persistence.eventual_store.length > 0) {
    return false;
  }
  if (persistence.eventual_store_timer) {
    return false;
  }
  return true;
}

export function clearLocalSyncDb() {
  var repo = capabilities.dbman && capabilities.dbman.repo;
  if (repo) {
    Object.keys(repo).forEach(function(store) {
      repo[store] = [];
    });
  }
}

export function cancelSyncTailWork() {
  var target = persistenceTarget();
  [target, persistence].forEach(function(inst) {
    if (!inst) { return; }
    if (inst.set) {
      inst.set('sync_status', null);
      inst.set('sync_progress', null);
    }
    if (typeof inst.cancel_sync === 'function') {
      inst.cancel_sync();
    }
    if (inst.eventual_store_timer) {
      try { runCancel(inst.eventual_store_timer); } catch (e) { /* torn down */ }
      inst.eventual_store_timer = null;
    }
    if (inst.eventual_store) {
      inst.eventual_store = [];
    }
    if (inst.refresh_after_eventual_stores) {
      inst.refresh_after_eventual_stores.waiting = false;
    }
    if (inst.sync_actions) {
      inst.sync_actions = [];
    }
    inst.syncing_action_watchers = 0;
    inst.active_board_threads = 0;
  });
  persistence.urls_to_store = [];
  persistence.storing_url_watchers = 0;
  persistence.storing_urls = null;
}

export function resetSyncHarnessFlags() {
  if (typeof LingoLinq !== 'undefined') {
    LingoLinq.all_wait = false;
    LingoLinq.sync_testing_real_boards = false;
  }
  persistence.known_missing = {};
}

export function cancelHarnessAsyncWork() {
  cancelSyncTailWork();
  resetSyncHarnessFlags();
}

export function waitUntil(conditionFn) {
  var maxAttempts = (typeof LingoLinq !== 'undefined' && LingoLinq.sync_testing) ? 120 : 55;
  return new RSVP.Promise(function(resolve, reject) {
    var attempts = 0;
    var try_again = function() {
      if (conditionFn()) {
        resolve();
      } else if (attempts >= maxAttempts) {
        reject(new Error('condition failed for more than ' + (maxAttempts * 100) + 'ms'));
      } else {
        attempts++;
        var delay = attempts < 10 ? 10 : 100;
        setTimeout(try_again, delay);
      }
    };
    try_again();
  });
}

var EMBER_DATA_INTERNAL_KEYS = [
  'currentState', 'isSaving', 'isError', 'isDirty', 'adapterError', 'errors'
];

function stripEmberDataInternalKeys(hash) {
  if (!hash || typeof hash !== 'object') {
    return hash;
  }
  EMBER_DATA_INTERNAL_KEYS.forEach(function(key) {
    delete hash[key];
  });
  return hash;
}

function stripPushPayload(data) {
  if (!data) {
    return data;
  }
  if (data.data) {
    if (Array.isArray(data.data)) {
      data.data.forEach(function(entry) {
        if (entry && entry.attributes) {
          stripEmberDataInternalKeys(entry.attributes);
        }
      });
    } else if (data.data.attributes) {
      stripEmberDataInternalKeys(data.data.attributes);
    }
  }
  ['sound', 'image', 'board', 'user'].forEach(function(key) {
    if (!data[key]) {
      return;
    }
    if (Array.isArray(data[key])) {
      data[key].forEach(function(entry) {
        stripEmberDataInternalKeys(entry);
      });
    } else {
      stripEmberDataInternalKeys(data[key]);
    }
  });
  return data;
}

export function guardStorePushForSyncTests() {
  if (!LingoLinq.store) {
    return;
  }
  if (typeof LingoLinq.store.push === 'function') {
    var realPush = LingoLinq.store.push.bind(LingoLinq.store);
    stub(LingoLinq.store, 'push', function(data) {
      return realPush(stripPushPayload(data));
    });
  }
  if (typeof LingoLinq.store.pushPayload === 'function') {
    var realPushPayload = LingoLinq.store.pushPayload.bind(LingoLinq.store);
    stub(LingoLinq.store, 'pushPayload', function(modelName, data) {
      return realPushPayload(modelName, stripPushPayload(data));
    });
  }
}

export function unloadSyncStoreRecords() {
  if (!LingoLinq.store) {
    return;
  }
  ['sound', 'image', 'board', 'user'].forEach(function(type) {
      try {
        if (LingoLinq.store.peekAll) {
          LingoLinq.store.peekAll(type).slice().forEach(function(rec) {
            try {
              if (rec.rollbackAttributes) {
                rec.rollbackAttributes();
              }
            } catch (e) { /* mid-save */ }
            try {
              LingoLinq.store.unloadRecord(rec);
            } catch (e2) { /* already gone */ }
          });
        }
        if (LingoLinq.store.unloadAll) {
          LingoLinq.store.unloadAll(type);
        }
      } catch (e) { /* empty store */ }
    });
}

export function stubTraversalSyncBoards(stubFn) {
  if (typeof LingoLinq !== 'undefined' && LingoLinq.sync_testing_real_boards) {
    return;
  }
  stubFn('sync_boards', function(user, importantIds, synced_boards) {
    var target = persistenceTarget();
    var visited = {};
    function visitBoard(id) {
      if (visited[id]) {
        return RSVP.resolve();
      }
      visited[id] = true;
      return LingoLinq.store.findRecord('board', id).then(function(board) {
        synced_boards.push(board);
        importantIds.push('board_' + id);
        var jobs = [];
        var icon = board.get('icon_url_with_fallback') || board.get('image_url');
        if (icon) {
          importantIds.push('dataCache_' + icon);
          jobs.push(target.store_url(icon, 'image'));
        }
        (board.get('buttons') || []).forEach(function(btn) {
          if (btn.image_id) {
            importantIds.push('image_' + btn.image_id);
            var img = LingoLinq.store.peekRecord('image', String(btn.image_id));
            if (img && img.get('url')) {
              importantIds.push('dataCache_' + img.get('url'));
              jobs.push(target.store_url(img.get('url'), 'image'));
            } else {
              jobs.push(LingoLinq.store.findRecord('image', String(btn.image_id)).then(function(image) {
                if (image && image.get('url')) {
                  importantIds.push('dataCache_' + image.get('url'));
                  return target.store_url(image.get('url'), 'image');
                }
              }));
            }
          }
          if (btn.sound_id) {
            importantIds.push('sound_' + btn.sound_id);
            var snd = LingoLinq.store.peekRecord('sound', String(btn.sound_id));
            if (snd && snd.get('url')) {
              importantIds.push('dataCache_' + snd.get('url'));
              jobs.push(target.store_url(snd.get('url'), 'sound'));
            } else {
              jobs.push(LingoLinq.store.findRecord('sound', String(btn.sound_id)).then(function(sound) {
                if (sound && sound.get('url')) {
                  importantIds.push('dataCache_' + sound.get('url'));
                  return target.store_url(sound.get('url'), 'sound');
                }
              }));
            }
          }
          if (btn.load_board && btn.load_board.id) {
            jobs.push(visitBoard(String(btn.load_board.id)));
          }
        });
        return RSVP.all(jobs);
      });
    }
    var homeId = user.get('preferences.home_board.id');
    return visitBoard(String(homeId)).then(function() {
      return {};
    });
  });
}
