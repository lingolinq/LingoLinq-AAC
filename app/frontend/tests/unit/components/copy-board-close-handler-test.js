import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import modal from 'frontend/utils/modal';

/* DISMISSING "MAKE A COPY" BY CLICKING OUTSIDE IT IS A CANCEL (2026-10-02). <ModalDialog> reads
 * @action on its FIRST render; copy-board assigned `onClose` in didInsertElement, after that render,
 * so @action stayed undefined and modal-dialog fell back to utils/modal.close() -- a SUCCESS with no
 * decision. Seen in the browser: board preview -> "Copy For..." -> click the backdrop -> the
 * "Copy Board" copying window opened anyway (components/board-preview.js `copy` treats a missing
 * decision as "copy for me"). The handlers now exist from init, as components/copying-board.js
 * already does, so a backdrop click runs this component's own close: utils modal.close(false), a cancel.
 */
module('Unit | Component | copy-board close handler', function(hooks) {
  setupTest(hooks);

  test('onClose exists before the first render and closes as a cancel', function(assert) {
    assert.expect(3);
    var closes = [];
    var original = modal.close;
    modal.close = function(success) { closes.push(success); };
    try {
      var c = this.owner.factoryFor('component:copy-board').create();
      assert.strictEqual(typeof c.onClose, 'function', 'bound from init, so <ModalDialog> gets it');
      assert.strictEqual(typeof c.onOpening, 'function', 'opening too');
      c.onClose();
      assert.deepEqual(closes, [false], 'a cancel through utils/modal, which also clears its open-modal record');
    } finally {
      modal.close = original;
    }
  });
});
