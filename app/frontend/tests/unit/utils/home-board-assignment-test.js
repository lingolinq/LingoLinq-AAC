import { module, test } from 'qunit';
import RSVP from 'rsvp';
import LingoLinq from 'frontend/app';
import persistence from 'frontend/utils/persistence';
import { findExistingUserCopy } from 'frontend/utils/board-copy';
import { saveHomeBoard } from 'frontend/utils/home_board';

/* Regression cover for the two defects behind "Quick Assign didn't copy":
   1. the owned-copy lookup answered from the offline cache, so a board deleted
      server-side still looked like an existing copy and the copy was skipped;
   2. the home-board save reported success on a 200 the server had discarded. */

// Minimal stand-ins: the real records only need `.get` and (for the user)
// `.set`/`.save` here, and building real Ember Data records would drag the whole
// store + adapter into a unit test whose subject is neither.
function fake_board(attrs) {
  return {
    get: function(key) { return attrs[key]; }
  };
}

function fake_user(user_name, save_result) {
  var record = {
    preferences: {},
    get: function(key) {
      if(key === 'user_name') { return user_name; }
      if(key === 'preferences') { return this.preferences; }
      if(key === 'preferences.home_board') { return this.preferences.home_board; }
      return null;
    },
    set: function(key, value) {
      if(key === 'preferences.home_board') { this.preferences.home_board = value; }
      return value;
    },
    save: function() {
      // The adapter applies the SERVER's payload to the record on save, so the
      // test writes the server's answer over the optimistic local value.
      this.preferences.home_board = save_result;
      return RSVP.resolve(this);
    }
  };
  return record;
}

module('Unit | Utility | home board assignment', function(hooks) {
  var original_find, original_force_reload, created_store;

  hooks.beforeEach(function() {
    /* `LingoLinq.store` is assigned when the application boots, which a unit test
       does not do — so stand one up when it is absent, and put things back
       exactly as they were either way. board-copy.js reads `LingoLinq.store` at
       call time, so this is the seam. */
    created_store = !LingoLinq.store;
    if(created_store) { LingoLinq.store = {}; }
    original_find = LingoLinq.store.findRecord;
    original_force_reload = persistence.force_reload;
  });

  hooks.afterEach(function() {
    if(created_store) {
      delete LingoLinq.store;
    } else {
      LingoLinq.store.findRecord = original_find;
    }
    persistence.force_reload = original_force_reload;
  });

  test('findExistingUserCopy forces the lookup past the offline cache', function(assert) {
    assert.expect(5);
    var done = assert.async();
    var seen_force_reload = null;
    LingoLinq.store.findRecord = function(type, id) {
      // Captured AT CALL TIME: this is the flag the app's adapter override reads
      // before deciding whether it may answer from the local db.
      seen_force_reload = persistence.force_reload;
      assert.strictEqual(type, 'board', 'looks up a board');
      assert.strictEqual(id, 'aiden/vocal-flair-84', 'under the user namespace');
      return RSVP.resolve(fake_board({
        id: '1_99', key: 'aiden/vocal-flair-84', parent_board_id: '1_1'
      }));
    };

    findExistingUserCopy(
      fake_board({id: '1_1', key: 'lingolinq/vocal-flair-84'}),
      fake_user('aiden')
    ).then(function(found) {
      assert.strictEqual(seen_force_reload, 'board_aiden/vocal-flair-84',
        'force_reload was set for this exact record, so the adapter must hit the server');
      assert.ok(found, 'a confirmed copy is still returned');
      assert.strictEqual(persistence.force_reload, original_force_reload,
        'and the flag is restored afterwards');
      done();
    });
  });

  test('findExistingUserCopy resolves null when the server no longer has the copy', function(assert) {
    assert.expect(2);
    var done = assert.async();
    LingoLinq.store.findRecord = function() {
      return RSVP.reject({status: 404});
    };

    findExistingUserCopy(
      fake_board({id: '1_1', key: 'lingolinq/vocal-flair-84'}),
      fake_user('aiden')
    ).then(function(found) {
      assert.strictEqual(found, null, 'no phantom copy — the caller will copy afresh');
      assert.strictEqual(persistence.force_reload, original_force_reload,
        'the flag is restored on the failure path too');
      done();
    });
  });

  test('saveHomeBoard resolves when the server kept the assignment', function(assert) {
    assert.expect(1);
    var done = assert.async();
    var board = fake_board({id: '1_99', key: 'aiden/vocal-flair-84'});
    var user = fake_user('aiden', {id: '1_99', key: 'aiden/vocal-flair-84', locale: 'en'});

    saveHomeBoard(user, board, 'en').then(function() {
      assert.ok(true, 'resolved');
      done();
    }, function() {
      assert.ok(false, 'should not reject when the server echoed our board');
      done();
    });
  });

  test('saveHomeBoard rejects when the server discarded the assignment', function(assert) {
    assert.expect(2);
    var done = assert.async();
    var board = fake_board({id: '1_99', key: 'aiden/vocal-flair-84'});
    // What the server actually returns for a board it cannot resolve: a 200
    // whose payload carries no home board at all.
    var user = fake_user('aiden', null);

    saveHomeBoard(user, board, 'en').then(function() {
      assert.ok(false, 'a discarded write must not report success');
      done();
    }, function(err) {
      assert.strictEqual(err.error, 'home_board_not_saved', 'rejects so the caller can surface it');
      assert.strictEqual(err.expected_id, '1_99');
      done();
    });
  });

  test('saveHomeBoard rejects when the server stored a DIFFERENT board', function(assert) {
    assert.expect(1);
    var done = assert.async();
    var board = fake_board({id: '1_99', key: 'aiden/vocal-flair-84'});
    var user = fake_user('aiden', {id: '1_5', key: 'aiden/something-else', locale: 'en'});

    saveHomeBoard(user, board, 'en').then(function() {
      assert.ok(false, 'the wrong board is not success');
      done();
    }, function(err) {
      assert.strictEqual(err.error, 'home_board_not_saved');
      done();
    });
  });
});
