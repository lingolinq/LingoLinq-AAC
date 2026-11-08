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
  });

  hooks.afterEach(function() {
    modal.success = this._origSuccess;
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

  test('unliking a board says nothing', async function(assert) {
    this.answer = { starred: false, stars: 0 };
    const board = this.owner.lookup('service:store').push({ data: { type: 'board', id: '1221_unlike', attributes: { key: 'me/unlike' } } });
    board.unstar();
    await settled();
    assert.deepEqual(this.messages, []);
  });
});
