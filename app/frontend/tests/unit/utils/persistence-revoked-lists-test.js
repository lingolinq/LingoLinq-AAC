import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import LingoLinq from 'frontend/app';
import lingoLinqExtras from 'frontend/utils/extras';
import modal from 'frontend/utils/modal';
import utilPersistence from 'frontend/utils/persistence';
import PersistenceService from 'frontend/services/persistence';
import boardRevocation from 'frontend/utils/board_revocation';

/* In the app, sync and these lookups run on services/persistence.js: the utils/persistence.js
 * export is a Proxy that forwards any property window.persistence (the service) has
 * (utils/persistence.js, persistenceProxy). The utils copies run only when the service is not on
 * window.persistence (early boot, teardown), so each hook for offline copies of boards no synced
 * user can view (utils/board_revocation.js) is still checked in both:
 * find_recent and find_boards leave marked boards out, and a failed supervisee sync is
 * recorded so the sync cannot mark anything.
 */
module('Unit | Utility | persistence revoked board hooks', function(hooks) {
  hooks.beforeEach(function() {
    var db = { board: {}, settings: {} };
    this.db = db;
    var storage = lingoLinqExtras.storage;
    this.realStorage = { find: storage.find, find_all: storage.find_all, store: storage.store };
    storage.find = function(store, key) {
      var rec = db[store] && db[store][key];
      return rec ? RSVP.resolve(JSON.parse(JSON.stringify(rec))) : RSVP.reject({error: 'no record found'});
    };
    storage.find_all = function(store, ids) {
      var keys = ids || Object.keys(db[store] || {});
      return RSVP.resolve(keys.filter(function(k) { return db[store][k]; }).map(function(k) {
        return {store: store, data: JSON.parse(JSON.stringify(db[store][k]))};
      }));
    };
    storage.store = function(store, record) {
      db[store][record.id || record.storageId] = JSON.parse(JSON.stringify(record));
      return RSVP.resolve(record);
    };
    this.realStore = LingoLinq.store;
    this.realAppState = LingoLinq.appState;
    this.realWindowPersistence = window.persistence;
    this.realWindowStashes = window.stashes;
    this.realWarning = modal.warning;
    modal.warning = function() { };
    LingoLinq.appState = EmberObject.create({speak_mode: false});
    var loaded = [];
    this.loaded = loaded;
    LingoLinq.store = {
      peekRecord: function() { return null; },
      peekAll: function() { return loaded; },
      push: function(json) { return EmberObject.create({id: json.data.id}); }
    };
    boardRevocation.reset_for_tests();
    ['1_1', '1_2'].forEach(function(id) {
      db.board[id] = {id: id, key: 'owner/' + id, raw: {id: id, key: 'owner/' + id, name: 'Board ' + id}};
      loaded.push(EmberObject.create({id: id, key: 'owner/' + id, name: 'Board ' + id, description: '', buttons: []}));
    });
    db.settings.importantIds = {storageId: 'importantIds', id: 'importantIds', raw: {ids: ['board_1_1', 'board_1_2']}};
  });

  hooks.afterEach(function() {
    var storage = lingoLinqExtras.storage;
    storage.find = this.realStorage.find;
    storage.find_all = this.realStorage.find_all;
    storage.store = this.realStorage.store;
    LingoLinq.store = this.realStore;
    LingoLinq.appState = this.realAppState;
    window.persistence = this.realWindowPersistence;
    window.stashes = this.realWindowStashes;
    modal.warning = this.realWarning;
    boardRevocation.reset_for_tests();
  });

  var stashes = { get: function(key) { return key === 'recent_boards' ? [{id: '1_1'}, {id: '1_2'}] : null; } };

  // utils/persistence.js forwards to window.persistence when the service is there; a
  // stand-in without these methods makes it run its own.
  function utilsImpl() {
    window.persistence = EmberObject.create({sync_progress: null});
    window.stashes = stashes;
    return utilPersistence;
  }

  function serviceImpl() {
    var proto = PersistenceService.proto();
    var self = EmberObject.create({stashes: stashes, validate_board: function() { }});
    return {
      find_recent: function(store) { return proto.find_recent.call(self, store); },
      find_boards: function(str) { return proto.find_boards.call(self, str); }
    };
  }

  [['utils', utilsImpl], ['service', serviceImpl]].forEach(function(pair) {
    var name = pair[0];
    var impl = pair[1];

    test(name + ': find_recent and find_boards leave out a marked board', async function(assert) {
      var p = impl();
      var before = await p.find_recent('board');
      assert.deepEqual(before.map(function(b) { return b.get('id'); }).sort(), ['1_1', '1_2'], 'control: both listed');
      await boardRevocation.apply_revocations(['1_2']);
      var recent = await p.find_recent('board');
      assert.deepEqual(recent.map(function(b) { return b.get('id'); }), ['1_1']);
      var found = await p.find_boards('Board');
      assert.deepEqual(found.map(function(b) { return b.get('id'); }), ['1_1']);
      assert.ok(this.db.board['1_2'], 'the local copy is still there');
    });

    test(name + ': a failed supervisee sync is recorded', async function(assert) {
      var progress = {root_user: 'u1', canceled: true};
      var fake = EmberObject.create({
        sync_progress: progress,
        queue_sync_action: function() { return RSVP.resolve(); },
        time_promise: function(p) { return p; }
      });
      var user = EmberObject.create({id: 'u1', supervisees: [{id: 'u2', user_name: 'sam'}]});
      if(name === 'utils') {
        impl();
        window.persistence = fake;
        await utilPersistence.sync_supervisees(user);
      } else {
        await PersistenceService.proto().sync_supervisees.call(fake, user);
      }
      assert.true(!!(progress.revocation && progress.revocation.failed), 'sync cannot mark anything');
    });
  });
});
