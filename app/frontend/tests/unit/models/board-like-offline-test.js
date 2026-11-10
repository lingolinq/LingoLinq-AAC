import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import RSVP from 'rsvp';
import { settled } from '@ember/test-helpers';
import { stubPersistenceAjax } from '../../helpers/persistence-stub';
import modal from 'frontend/utils/modal';

// Liking a board keeps it on the device for offline use (#1221: the offline sync takes liked boards). Hover
// text never shows on an iPad, so liking says so.
module('Unit | Model | board like keeps it offline', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    var _this = this;
    this.answer = { starred: true, stars: 1 };
    this._restoreAjax = stubPersistenceAjax(function() { return RSVP.resolve(_this.answer); });
    this.messages = [];
    this._origSuccess = modal.success;
    modal.success = function(text) { _this.messages.push(text); };
    this.warnings = [];
    this._origWarning = modal.warning;
    modal.warning = function(text) { _this.warnings.push(text); };
  });

  hooks.afterEach(function() {
    modal.success = this._origSuccess;
    modal.warning = this._origWarning;
    if(this._restoreAjax) { this._restoreAjax(); }
  });

  test('liking a board says it will be kept on this device for offline use', async function(assert) {
    const board = this.owner.lookup('service:store').push({ data: { type: 'board', id: '1221_like', attributes: { key: 'me/like' } } });
    board.star();
    await settled();
    assert.true(board.get('starred'));
    assert.strictEqual(this.messages.length, 1);
    assert.true(/kept on this device for offline use/.test(this.messages[0]));
  });

  // THE LIMIT (Traci, 2026-11-10). Only the first 50 liked boards are kept on the device (the server lists
  // that many: User::LIKED_BOARD_REFS_LIMIT, app/models/user.rb). A like past the limit is still a like, but the
  // board is not kept offline, so the "kept on this device" message would be false. The like answer says whether
  // this board is kept (its place in the liked list), with the count and the limit, and the message says which it is.
  test('the like that reaches the limit is kept, and says the limit is reached', async function(assert) {
    this.answer = { starred: true, stars: 1, liked_boards: 50, liked_limit: 50, kept_offline: true };
    const board = this.owner.lookup('service:store').push({ data: { type: 'board', id: '1221_fifty', attributes: { key: 'me/fifty' } } });
    board.star();
    await settled();
    assert.strictEqual(this.messages.length, 1);
    assert.true(/kept on this device/.test(this.messages[0]), 'kept');
    assert.true(/limit of 50/.test(this.messages[0]), 'and the limit is named');
    assert.deepEqual(this.warnings, []);
  });

  test('a like past the limit says the board is not kept on this device', async function(assert) {
    this.answer = { starred: true, stars: 1, liked_boards: 51, liked_limit: 50, kept_offline: false };
    const board = this.owner.lookup('service:store').push({ data: { type: 'board', id: '1221_fiftyone', attributes: { key: 'me/fiftyone' } } });
    board.star();
    await settled();
    assert.true(board.get('starred'), 'still liked');
    assert.deepEqual(this.messages, [], 'no "kept on this device" message');
    assert.strictEqual(this.warnings.length, 1);
    assert.true(/limit of 50/.test(this.warnings[0]), this.warnings[0]);
    assert.true(/not kept on this device/.test(this.warnings[0]), 'says it is not kept');
  });

  test('an answer without the count (an older server) keeps the plain message', async function(assert) {
    const board = this.owner.lookup('service:store').push({ data: { type: 'board', id: '1221_old', attributes: { key: 'me/old' } } });
    board.star();
    await settled();
    assert.strictEqual(this.messages.length, 1);
    assert.deepEqual(this.warnings, []);
  });

  test('unliking a board says nothing', async function(assert) {
    this.answer = { starred: false, stars: 0 };
    const board = this.owner.lookup('service:store').push({ data: { type: 'board', id: '1221_unlike', attributes: { key: 'me/unlike' } } });
    board.unstar();
    await settled();
    assert.deepEqual(this.messages, []);
  });
});
