import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import RSVP from 'rsvp';

// Regression for issue #293: a board first materialized from a #tree/#bulk
// lite prefetch (server-side as_lite, PR #294) omits parent_board_id,
// copies/copy, and the edit-gated shared_users. The share modal then renders
// a genuinely-shared board with no "Shared with" list (an editor misreads
// it as "shared with nobody"), and board-details drops the "Copied From"
// link. Both modals call board.reload_if_lite() on open to refetch.
//
// Detector keys on parent_board_id === undefined: full /show always
// serializes that field (value may be null), regardless of permission or
// shallow_clone state. shared_users is edit-gated; copies is skipped for
// shallow clones; neither is a clean lite signal.
module('Unit | Model | board#reload_if_lite (issue #293)', function(hooks) {
  setupTest(hooks);

  test('refetches a lite-sourced board and toggles reloading_detail across the reload', async function(assert) {
    const store = this.owner.lookup('service:store');
    const board = store.push({ data: { type: 'board', id: '293_lite', attributes: {
      key: 'me/lite', permissions: { edit: true, share: true }
    } } });

    // Lite payload omitted parent_board_id entirely (vs full /show, which
    // always serializes it possibly as null), so it reads as undefined here.
    assert.strictEqual(board.get('parent_board_id'), undefined, 'parent_board_id starts undefined (lite)');
    assert.strictEqual(board.get('shared_users'), undefined, 'shared_users starts undefined (lite)');

    let reload_count = 0;
    const originalReload = board.reload;
    board.reload = function() {
      reload_count++;
      // Mirror what a full /show fills in for an edit-permitted, shared board.
      board.set('parent_board_id', null);
      board.set('copies', 2);
      board.set('shared_users', [{ user_name: 'sup', name: 'Sup', allow_editing: true }]);
      return RSVP.resolve(board);
    };

    try {
      const promise = board.reload_if_lite();
      // Synchronous side effects: flag set + reload dispatched, BEFORE the
      // promise settles. The modal template reads reloading_detail to show
      // a "Loading..." hint in place of an empty share list.
      assert.strictEqual(board.get('reloading_detail'), true, 'reloading_detail set synchronously');
      assert.strictEqual(reload_count, 1, 'reload() called exactly once');
      await promise;
      assert.strictEqual(board.get('reloading_detail'), false, 'reloading_detail cleared after resolve');
      assert.strictEqual(board.get('shared_users.length'), 1, 'shared_users populated by reload');
      assert.strictEqual(board.get('parent_board_id'), null, 'parent_board_id present (null) after reload');
    } finally {
      board.reload = originalReload;
    }
  });

  test('does not refetch a fully-serialized board (parent_board_id present, even when null)', async function(assert) {
    const store = this.owner.lookup('service:store');
    const board = store.push({ data: { type: 'board', id: '293_full', attributes: {
      key: 'me/full', parent_board_id: null, copies: 0, permissions: { edit: true, share: true }
    } } });

    let reload_count = 0;
    const originalReload = board.reload;
    board.reload = function() { reload_count++; return RSVP.resolve(board); };

    try {
      await board.reload_if_lite();
      assert.strictEqual(reload_count, 0, 'reload() not called for a full record');
      assert.strictEqual(board.get('reloading_detail'), undefined, 'reloading_detail untouched');
    } finally {
      board.reload = originalReload;
    }
  });

  test('does not refetch an unsaved (new) board', function(assert) {
    const store = this.owner.lookup('service:store');
    const board = store.createRecord('board', {});

    let reload_count = 0;
    const originalReload = board.reload;
    board.reload = function() { reload_count++; return RSVP.resolve(board); };

    try {
      board.reload_if_lite();
      assert.strictEqual(reload_count, 0, 'reload() not called for an unsaved record');
    } finally {
      board.reload = originalReload;
    }
  });

  test('does not re-dispatch reload while a prior reload is still in flight', async function(assert) {
    const store = this.owner.lookup('service:store');
    const board = store.push({ data: { type: 'board', id: '293_inflight', attributes: {
      key: 'me/inflight', permissions: { edit: true, share: true }
    } } });

    let reload_count = 0;
    let resolveReload;
    const originalReload = board.reload;
    board.reload = function() {
      reload_count++;
      return new RSVP.Promise(function(resolve) {
        resolveReload = function() {
          board.set('parent_board_id', null);
          resolve(board);
        };
      });
    };

    try {
      const first = board.reload_if_lite();
      const second = board.reload_if_lite();
      assert.strictEqual(reload_count, 1, 'second open during in-flight reload does not re-dispatch');
      resolveReload();
      await RSVP.all([first, second]);
      assert.strictEqual(board.get('reloading_detail'), false, 'flag cleared after the single reload resolves');
    } finally {
      board.reload = originalReload;
    }
  });

  test('a rejected reload resolves (does not throw into the modal) and clears the flag', async function(assert) {
    const store = this.owner.lookup('service:store');
    const board = store.push({ data: { type: 'board', id: '293_reject', attributes: {
      key: 'me/reject', permissions: { edit: true, share: true }
    } } });

    const originalReload = board.reload;
    board.reload = function() { return RSVP.reject(new Error('boom')); };

    try {
      // reload_if_lite swallows the rejection (board.js:931-933) so the modal
      // degrades to the lite view rather than surfacing an unhandled error.
      const result = await board.reload_if_lite();
      assert.strictEqual(result, board, 'resolves with the record, not a rejection');
      assert.strictEqual(board.get('reloading_detail'), false, 'flag cleared even on failure');
    } finally {
      board.reload = originalReload;
    }
  });

  test('re-dispatches reload on a later open after a failed reload', async function(assert) {
    const store = this.owner.lookup('service:store');
    const board = store.push({ data: { type: 'board', id: '293_retry', attributes: {
      key: 'me/retry', permissions: { edit: true, share: true }
    } } });

    let reload_count = 0;
    const originalReload = board.reload;
    // First open: reload fails, leaving parent_board_id undefined.
    board.reload = function() { reload_count++; return RSVP.reject(new Error('boom')); };

    try {
      await board.reload_if_lite();
      assert.strictEqual(reload_count, 1, 'first open dispatched a reload');
      assert.strictEqual(board.get('parent_board_id'), undefined, 'still lite after a failed reload');

      // Second open: because the detector still sees undefined, it retries.
      board.reload = function() {
        reload_count++;
        board.set('parent_board_id', null);
        return RSVP.resolve(board);
      };
      await board.reload_if_lite();
      assert.strictEqual(reload_count, 2, 'a later open re-dispatches after the earlier failure');
      assert.strictEqual(board.get('parent_board_id'), null, 'second reload populated the record');
    } finally {
      board.reload = originalReload;
    }
  });

  test('reload does not clobber a pending local sharing_key edit (mid-flight edit survival)', async function(assert) {
    const store = this.owner.lookup('service:store');
    const board = store.push({ data: { type: 'board', id: '293_dirty', attributes: {
      key: 'me/dirty', permissions: { edit: true, share: true }
    } } });

    let resolveReload;
    const originalReload = board.reload;
    board.reload = function() {
      return new RSVP.Promise(function(resolve) {
        // Mirror a real /show response: it repopulates parent_board_id and
        // shared_users but never echoes the write-only sharing_key command.
        resolveReload = function() {
          board.set('parent_board_id', null);
          board.set('shared_users', [{ user_name: 'sup', name: 'Sup' }]);
          resolve(board);
        };
      });
    };

    try {
      const promise = board.reload_if_lite();
      // Editor sets a sharing command while the refetch is still in flight.
      board.set('sharing_key', 'add_edit_shallow-someuser');
      resolveReload();
      await promise;
      assert.strictEqual(board.get('sharing_key'), 'add_edit_shallow-someuser', 'pending sharing_key survived the reload');
      assert.strictEqual(board.get('shared_users.length'), 1, 'reload still applied its own fields');
    } finally {
      board.reload = originalReload;
    }
  });
});
