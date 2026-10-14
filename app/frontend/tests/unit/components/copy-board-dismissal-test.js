import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { destroy } from '@ember/destroyable';
import { setupTest } from '../../helpers';
import modal from 'frontend/utils/modal';
import { is_copy_decision } from 'frontend/utils/copy_decision';

/* DISMISSING "MAKE A COPY" NEVER COPIES (2026-10-02). With keyboard focus outside the dialog, Escape
 * is handled by the document-level listener, which closes the open modal with no argument
 * (utils/raw_events.js:606); utils/modal.js:397 resolves that as a success with `undefined`. The
 * board preview's `copy` then filled in action "nothing" and opened the copying window
 * (components/board-preview.js), so a dismissed dialog copied the board. A modal opened over it
 * resolves `{replaced: true}`, the same way. Only the dialog's own buttons produce a decision.
 */
module('Unit | copy-board dismissal', function(hooks) {
  setupTest(hooks);

  test('only a payload with an action is a decision', function(assert) {
    assert.expect(10);
    assert.true(is_copy_decision({action: 'links_copy'}), 'a copy button');
    assert.true(is_copy_decision({action: 'keep_links', board_name: 'x'}), 'any action literal');
    [undefined, null, true, 'links_copy', {}, {replaced: true}, {action: ''}, {action: 3}].forEach(function(r) {
      assert.false(is_copy_decision(r), JSON.stringify(r) + ' is a dismissal');
    });
  });

  function copy_from_preview(owner, result) {
    var opened = [];
    var realOpen = modal.open;
    var realClosePreview = modal.close_board_preview;
    modal.open = function(template) {
      opened.push(template);
      return template === 'copy-board' ? RSVP.resolve(result) : RSVP.resolve();
    };
    modal.close_board_preview = function() {};
    var c = owner.factoryFor('component:board-preview').create();
    c.set('model', EmberObject.create({id: '1_2', key: 'example/core'}));
    var done = c.send('copy');
    return RSVP.resolve(done).then(function() {
      return new RSVP.Promise(function(resolve) { setTimeout(resolve, 0); });
    }).then(function() {
      return opened;
    }).finally(function() {
      modal.open = realOpen;
      modal.close_board_preview = realClosePreview;
      destroy(c);
    });
  }

  test('the board preview does not copy when the dialog is dismissed', async function(assert) {
    assert.deepEqual(await copy_from_preview(this.owner, undefined), ['copy-board'], 'Escape with focus outside the dialog');
    assert.deepEqual(await copy_from_preview(this.owner, {replaced: true}), ['copy-board'], 'another modal opened over it');
  });

  test('the board preview still copies on a decision', async function(assert) {
    assert.deepEqual(await copy_from_preview(this.owner, {action: 'links_copy'}), ['copy-board', 'copying-board']);
  });
});
